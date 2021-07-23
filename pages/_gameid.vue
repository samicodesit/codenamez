<template>
  <div v-if="playersChannel">
    <button @click="testApi">test...</button>
    <p>Timer: {{ timer.team }} ---- {{ timer.time }}</p>

    <!-- SETTINGS -->
    <app-settings :players-channel="playersChannel" :my-player="myPlayer" />

    <!-- SPECTATORS -->
    <app-spectators :spectators="spectators" />

    <!-- TEAMS -->
    <app-teams
      :teams="teams"
      :players-channel="playersChannel"
      :clues-channel="cluesChannel"
      :my-player="myPlayer"
      :turn="turn"
    />

    <hr />

    <!-- BOARD -->
    <section>
      <h2>CURRENT TURN: {{ turn }}</h2>
      <div
        v-for="(card, index) in cards"
        :key="index"
        :style="getCardStyle(card)"
        @click="tapCard(card)"
      >
        <p>{{ card }}</p>
      </div>
    </section>
  </div>
</template>

<script>
import Ably from 'ably'
import { generateRandomColor, postApi } from '../utils'

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
    TEAM_CONFIG: ['red', 'blue'],

    // CLUES
    cluesChannel: null,

    // BOARD
    rawCards: [
      { word: 'Banana', color: 'red' },
      { word: 'Apple', color: 'blue' },
      { word: 'Pear', color: 'blue' },
      { word: 'Watermelon', color: 'red' },
      { word: 'Strawberry', color: 'blue' },
      { word: 'Orange', color: 'red' },
    ],
    cards: [],
    cardsChannel: null,

    // TURN
    // TODO: change initial turn
    turn: 'red',
    turnChannel: null,
    turnOrder: {
      red_spymaster: 'red',
      red: 'blue_spymaster',
      blue_spymaster: 'blue',
      blue: 'red_spymaster',
    },
    timer: {
      time: 90,
      team: null,
      instance: null,
    },
    TIMER_DURATION: 90,
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
    'timer.time'(time) {
      if (time === 0) {
        const nextTurn = this.turnOrder[this.turn]

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
    this.cards = this.rawCards.map((card) => {
      return {
        ...card,
        opened: false,
        taps: [],
      }
    })

    // **** Clues channel ***** //
    this.cluesChannel = this.ably.channels.get('clues')

    // **** Turn Channel ***** //
    this.turnChannel = this.ably.channels.get('turn')

    // SUB: change turn
    this.turnChannel.subscribe('change', (message) => {
      // update turn
      const { turn } = message.data
      this.turn = turn
    })

    // SUB: start timer
    this.turnChannel.subscribe('start_timer', (message) => {
      const { team } = message.data
      this.startTimer(team)
    })

    // **** Cards channel ***** //
    this.cardsChannel = this.ably.channels.get('cards')

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
        cardFound.opened = true

        // wrong card opened
        if (this.turn !== cardColor) {
          const nextTurn = this.turnOrder[this.turn]
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
          (this.myPlayer && this.myPlayer.spymaster) || opened ? color : 'gray',
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

      this.timer.time = this.TIMER_DURATION
      this.timer.team = team
      this.timer.instance = setInterval(() => {
        this.timer.time--
        if (this.timer.time === 0) {
          clearInterval(this.timer.instance)
        }
      }, 1000)
    },
  },
}
</script>

<style>
/* Base */
:root {
  --primary: #343a40;
  --secondary: #7952b3;
  --accent: #ffc107;
  --light: #e1e8eb;
}

html,
body {
  margin: 0;
  padding: 0;
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
  list-style: none;
}

/* General */
button {
  cursor: pointer;
  background: none;
  outline: none;
  border: none;
}
</style>