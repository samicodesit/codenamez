<template>
  <main>
    <div class="loader" v-if="!cluesLoaded || !cardsLoaded">
      LOADING GAME DATA...
    </div>
    <div class="page" v-if="playersChannel" v-show="cluesLoaded && cardsLoaded">
      <!-- <button @click="testApi">test...</button> -->

      <!-- SETTINGS -->
      <app-settings :players-channel="playersChannel" :my-player="myPlayer" />

      <!-- SPECTATORS -->
      <app-spectators :spectators="spectators" />

      <!-- TEAMS -->
      <app-teams
        :teams="teams"
        :players-channel="playersChannel"
        :clues-channel="cluesChannel"
        :turn-channel="turnChannel"
        :players="players"
        :my-player="myPlayer"
        :turn="turn"
        :timer="timer"
        :timeCounter="timeCounter"
        @cluesLoaded="cluesLoaded = true"
      />

      <!-- BOARD -->
      <section class="board" :style="getBoardColor()">
        <div class="board__tint"></div>
        <span>CURRENT TURN: {{ turn }}</span>
        <div class="board__cards">
          <div
            v-for="(card, index) in cards"
            :key="index"
            :style="getCardStyle(card)"
            @click="tapCard(card)"
            class="card"
          >
            <div class="card__content">
              <p class="card__word">{{ card.word }}</p>
            </div>

            <div class="card__taps">
              <span
                v-for="(tap, tapIndex) in card.taps"
                :key="tapIndex"
                class="ball"
                :style="getBallStyle(tap)"
                >&bull;</span
              >
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script>
import Ably from 'ably'
import { generateRandomColor, postApi } from '../utils'
import { TURN_ORDER, TEAM_CONFIG, RAW_CARDS } from '../config'

import AppSettings from '~/components/AppSettings'
import AppSpectators from '~/components/AppSpectators'
import AppTeams from '~/components/AppTeams'

export default {
  name: 'GameInstance',
  components: {
    AppSettings,
    AppSpectators,
    AppTeams,
  },
  asyncData({ env }) {
    return { ably_key: env.NUXT_ENV_ABLY_PRIVATE_KEY }
  },
  data: () => ({
    // PLAYERS
    ably: {},
    playersChannel: null,
    players: [],
    TEAM_CONFIG,

    // CLUES
    cluesChannel: null,

    // BOARD
    rawCards: RAW_CARDS,
    cards: [],
    cardsChannel: null,

    // TURN
    // TODO: change initial turn
    TURN_ORDER,
    turn: 'red',
    turnChannel: null,
    timer: {
      time: 90,
      end_timestamp: null,
      team: null,
      instance: null,
    },
    timeCounter: null,
    TIMER_DURATION: 90,

    // LOADING
    cardsLoaded: false,
    cluesLoaded: false,
  }),
  computed: {
    ablyAuth() {
      return this.ably.auth
    },
    myPlayer() {
      return (
        (this.ablyAuth &&
          this.players.find(
            (player) => player.clientId === this.ablyAuth.clientId
          )) ||
        {}
      )
    },
    spectators() {
      return this.players.filter((player) => !player.team)
    },
    teams() {
      const _teams = {}
      this.TEAM_CONFIG.forEach((teamCode) => {
        const players = this.players.filter(
          (player) => player.team === teamCode
        )
        const points = this.cards
          .filter((card) => card.color === teamCode)
          .filter((card) => !card.opened).length

        const team = { players, points }
        _teams[teamCode] = team
      })

      return _teams
    },
    gameEnded() {
      return Object.values(this.teams).find((team) => !team.points)
    },
  },
  watch: {
    gameEnded(value) {
      if (value) {
        this.turn = 'end'
        clearInterval(this.timer.instance)
        this.timer.instance = null
      }
    },
    'myPlayer.team'() {
      const myID = this.myPlayer.clientId

      const cardWithTapExists = this.cards.find((card) =>
        card.taps.find((tap) => tap.clientId === myID)
      )
      if (!cardWithTapExists) return

      postApi('/server/cards/remove_tap', { clientId: myID })
    },
    'myPlayer.spymaster'() {
      const myID = this.myPlayer.clientId

      const cardWithTapExists = this.cards.find((card) =>
        card.taps.find((tap) => tap.clientId === myID)
      )
      if (!cardWithTapExists) return

      postApi('/server/cards/remove_tap', { clientId: myID })
    },
    timeCounter(time) {
      if (Math.floor(time) === 0) {
        const nextTurn = this.TURN_ORDER[this.turn]

        postApi('/server/turn/change', { turn: nextTurn })
      }
    },
  },
  mounted() {
    // Init Ably
    this.ably = Ably.Realtime({
      key: this.ably_key,
      authUrl: '/server/ably/auth',
      authMethod: 'POST',
    })

    // Init cards

    // **** Cards channel ***** //
    this.cardsChannel = this.ably.channels.get('cards:fff')
    this.initCards()

    // **** Clues channel ***** //
    this.cluesChannel = this.ably.channels.get('clues:fff')

    // **** Turn Channel ***** //
    this.turnChannel = this.ably.channels.get('turn')

    // SUB: change turn
    this.turnChannel.subscribe('change', (message) => {
      // update turn
      const { turn, timestamp } = message.data
      this.turn = turn
      this.timer.end_timestamp = timestamp + this.timer.time * 1000

      if (turn === 'end') {
        clearInterval(this.timer.instance)
        this.timer.instance = null
      }
    })

    // SUB: start timer
    this.turnChannel.subscribe('start_timer', (message) => {
      const { team } = message.data
      this.startTimer(team)
    })

    // SUB: tap
    this.cardsChannel.subscribe('tap', (message) => {
      const {
        data: { word, color: cardColor },
        clientId,
      } = message

      const cardFound = this.cards.find((card) => card.word === word)
      const currentTeam = this.teams[this.turn]

      const cardWithTapExists = this.cards.find((card) =>
        card.taps.find((tap) => tap.clientId === clientId)
      )
      if (cardWithTapExists) {
        this.removeUserTap(clientId)
      }
      cardFound.taps.push({ clientId })

      // open the card
      const operativesCount = currentTeam.players.filter(
        (player) => !player.spymaster
      ).length
      if (cardFound.taps.length === operativesCount) {
        postApi('/server/cards/open', { word: cardFound.word })
        cardFound.opened = true

        // black card opened
        if (cardColor === 'black') {
          postApi('/server/turn/change', { turn: 'end' })
          return
        }

        // wrong card opened
        if (this.turn !== cardColor) {
          const nextTurn = this.TURN_ORDER[this.turn]
          postApi('/server/turn/change', { turn: nextTurn })
          return
        }

        // reset taps
        postApi('/server/cards/reset_taps')
      }
    })

    // SUB: remove user tap
    this.cardsChannel.subscribe('remove_tap', (message) => {
      const { clientId } = message.data
      this.removeUserTap(clientId)
    })

    // SUB: reset taps
    this.cardsChannel.subscribe('reset_taps', () => {
      this.cards = this.cards.map((card) => {
        return {
          ...card,
          taps: [],
        }
      })
    })

    // **** Players channel ***** //
    this.playersChannel = this.ably.channels.get('presence-players')

    // SUB: enter
    this.playersChannel.presence.subscribe('enter', (member) => {
      const { clientId, data } = member
      this.players.push({ clientId, ...data })
    })
    // SUB: leave
    this.playersChannel.presence.subscribe('leave', (data) => {
      this.players = this.players.filter(
        (player) => player.clientId !== data.clientId
      )
      this.removeUserTap(data.clientId)
    })
    // SUB: present
    this.playersChannel.presence.subscribe('present', (member) => {
      const { clientId, data } = member
      this.players.push({ clientId, ...data })
    })
    // SUB: update
    this.playersChannel.presence.subscribe('update', ({ clientId, data }) => {
      const playerIndex = this.players.findIndex(
        (player) => player.clientId === clientId
      )

      const updatedData = { ...this.players[playerIndex], ...data }

      this.$set(this.players, playerIndex, updatedData)
    })

    // PUB: enter
    this.playersChannel.presence.enter({
      username: this.retrieveUsername(),
      team: '',
      spymaster: false,
      ball: generateRandomColor(),
    })
  },

  beforeDestroy() {
    this.playersChannel.presence.leave()
  },

  methods: {
    testApi() {},
    initCards() {
      this.cards = this.rawCards.map((card) => {
        return {
          ...card,
          opened: false,
          taps: [],
        }
      })

      this.cardsChannel.history({ limit: 1000 }, (err, historyMessages) => {
        if (err) return console.error(err)

        if (historyMessages.items) {
          this.processCardsHistory(historyMessages.items)
        }
      })
    },
    processCardsHistory(messages) {
      const cardsOpened = messages.filter((message) => message.name === 'open')
      cardsOpened.forEach((_card) => {
        const {
          data: { word },
        } = _card
        const cardIndex = this.cards.findIndex((card) => card.word === word)
        this.$set(this.cards, cardIndex, {
          ...this.cards[cardIndex],
          opened: true,
        })
      })

      this.cardsLoaded = true
    },
    retrieveUsername() {
      let username = localStorage.getItem('cn_username')
      if (!username) {
        username = prompt('Enter your name')
        localStorage.setItem('cn_username', username)
      }

      return username
    },
    getCardStyle(card) {
      const { opened, color } = card

      return {
        backgroundColor:
          (this.myPlayer && this.myPlayer.spymaster) || opened
            ? `var(--${color})`
            : 'gray',
        color: 'white',
        cursor: 'pointer',
      }
    },
    becomeSpymaster() {
      this.playersChannel.presence.update({ ...this.myPlayer, spymaster: true })
    },
    tapCard(card) {
      const { opened: cardOpened, color: cardColor, word } = card
      const { team: myColor } = this.myPlayer

      const isSpymaster = this.myPlayer.spymaster
      const noTeam = !myColor
      const notMyTurn = this.turn !== myColor

      // cannot tap
      if (isSpymaster || cardOpened || noTeam || notMyTurn || this.gameEnded)
        return

      this.cardsChannel.publish('tap', {
        word,
        color: cardColor,
      })
    },
    removeUserTap(clientId) {
      const cardWithTapExists = this.cards.find((card) =>
        card.taps.find((tap) => tap.clientId === clientId)
      )
      const cardWithTapExistsIndex = this.cards.findIndex((card) =>
        card.taps.find((tap) => tap.clientId === clientId)
      )
      if (cardWithTapExists) {
        const updatedCard = {
          ...cardWithTapExists,
          taps: cardWithTapExists.taps.filter(
            (tap) => tap.clientId !== clientId
          ),
        }

        this.$set(this.cards, cardWithTapExistsIndex, updatedCard)
      }
    },
    startTimer(team) {
      clearInterval(this.timer.instance)
      this.timer.instance = null

      this.timeCounter =
        (this.timer.end_timestamp - new Date().getTime()) / 1000 + 1
      this.timer.team = team
      this.timer.instance = setInterval(() => {
        this.timeCounter--
        if (Math.floor(this.timeCounter) === 0) {
          clearInterval(this.timer.instance)
        }
      }, 1000)
    },
    getBoardColor() {
      const turn = this.turn.split('_')[0]
      const colorMap = {
        red: 'red-lighter',
        blue: 'blue-lighter',
        green: 'green-lighter',
      }
      const color = colorMap[turn]

      return { backgroundColor: `var(--${color})` }
    },
    getBallStyle(tap) {
      const color =
        this.players &&
        this.players.find((player) => player.clientId === tap.clientId).ball
      return { color }
    },
  },
}
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');

/* Base */
:root {
  --primary: #343a40;
  --secondary: #7952b3;
  --accent: #ffc107;
  --light: #e1e8eb;

  --black: #161616;
  --red: #910003;
  --blue: #162c4d;
  --green: #0e3e18;

  --red-lighter: #ff2f33;
  --blue-lighter: rgba(88, 136, 207, 0.4);
}

#__nuxt,
#__layout {
  height: 100%;
}

main {
  height: 100%;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Roboto', sans-serif;
}

body {
  background: var(--primary);
  color: var(--light);
}

h1,
h2,
h3,
h4,
h5,
h6,
p {
  margin: 0;
}

ul {
  padding: 0;
  margin: 0;
  list-style: none;
}

/* General */
button {
  cursor: pointer;
  background: none;
  outline: none;
  border: none;
  color: var(--light);
  font-family: 'Roboto', sans-serif;
}

.button--teams {
  border: 1px solid var(--light);
  border-radius: 4px;
  padding: 6px;
  width: 100%;
  font-weight: bold;
  background: rgba(256, 256, 256, 0.2);
  position: relative;
  z-index: 20;
}

.icon--small {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}

.page {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.board {
  flex: 1;
  position: relative;
}

.board__tint {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: black;
  opacity: 0.7;
}

.board__cards {
  position: relative;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

.card {
  flex-basis: calc(16.666% - 2px);
  box-sizing: border-box;
  margin: 1px;
  padding: 2px;
  display: flex;
  text-align: center;
  border: 1px solid var(--light);
  text-transform: uppercase;
  position: relative;
  border-radius: 4px;
}

.card::before {
  content: '';
  display: block;
  padding-top: 100%;
}

.card > .card__content {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

.card__word {
  word-break: break-word;
  hyphens: auto;
  font-size: 12px;
}

.card__taps {
  position: absolute;
  top: 4px;
  display: flex;
}

.ball {
  font-size: 28px;
  height: 8px;
  width: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.loader {
  margin: 100px auto;
  font-size: 25px;
  width: 1em;
  height: 1em;
  border-radius: 50%;
  position: relative;
  text-indent: -9999em;
  -webkit-animation: load5 1.1s infinite ease;
  animation: load5 1.1s infinite ease;
  -webkit-transform: translateZ(0);
  -ms-transform: translateZ(0);
  transform: translateZ(0);
}
@-webkit-keyframes load5 {
  0%,
  100% {
    box-shadow: 0em -2.6em 0em 0em #ffffff,
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.5),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.7);
  }
  12.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.7),
      1.8em -1.8em 0 0em #ffffff, 2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.5);
  }
  25% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.5),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.7), 2.5em 0em 0 0em #ffffff,
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  37.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.5),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.7), 1.75em 1.75em 0 0em #ffffff,
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  50% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.5),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.7), 0em 2.5em 0 0em #ffffff,
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  62.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.5),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.7), -1.8em 1.8em 0 0em #ffffff,
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  75% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.5),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.7), -2.6em 0em 0 0em #ffffff,
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  87.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.5),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.7), -1.8em -1.8em 0 0em #ffffff;
  }
}
@keyframes load5 {
  0%,
  100% {
    box-shadow: 0em -2.6em 0em 0em #ffffff,
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.5),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.7);
  }
  12.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.7),
      1.8em -1.8em 0 0em #ffffff, 2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.5);
  }
  25% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.5),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.7), 2.5em 0em 0 0em #ffffff,
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  37.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.5),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.7), 1.75em 1.75em 0 0em #ffffff,
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  50% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.5),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.7), 0em 2.5em 0 0em #ffffff,
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.2),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  62.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.5),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.7), -1.8em 1.8em 0 0em #ffffff,
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  75% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.5),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.7), -2.6em 0em 0 0em #ffffff,
      -1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2);
  }
  87.5% {
    box-shadow: 0em -2.6em 0em 0em rgba(255, 255, 255, 0.2),
      1.8em -1.8em 0 0em rgba(255, 255, 255, 0.2),
      2.5em 0em 0 0em rgba(255, 255, 255, 0.2),
      1.75em 1.75em 0 0em rgba(255, 255, 255, 0.2),
      0em 2.5em 0 0em rgba(255, 255, 255, 0.2),
      -1.8em 1.8em 0 0em rgba(255, 255, 255, 0.5),
      -2.6em 0em 0 0em rgba(255, 255, 255, 0.7), -1.8em -1.8em 0 0em #ffffff;
  }
}
</style>