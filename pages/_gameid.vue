<template>
  <div v-if="playersChannel">
    <h1>Codenamez - Room: {{ $route.params.gameid }}</h1>
    <p>Timer: {{ timer.team }} ---- {{ timer.time }}</p>

    <hr />

    <!-- MY DATA -->
    <section v-if="myPlayer">
      <p>Your clientId is: {{ myPlayer.clientId }}</p>
      <p>Your username is: {{ myPlayer.username }}</p>
      <div>
        <button @click="promptUsernameChange">change username</button>
      </div>
    </section>

    <hr />

    <!-- MEMBERS -->
    <section>
      <h2>Members</h2>
      <ul>
        <li v-for="(player, index) in players" :key="index">
          <code>
            {{ player }}
          </code>
        </li>
      </ul>
    </section>

    <hr />

    <!-- TEAMS -->
    <section>
      <h2>Teams</h2>
      <button @click="joinTeam(null)">Return to spectators</button>
      <div>
        <h3>Red ({{ redTeam.points }})</h3>

        <h4>Clues</h4>
        <form
          v-if="
            myPlayer &&
            myPlayer.spymaster &&
            turn === 'red_spymaster' &&
            turn.includes(myPlayer.team)
          "
          @submit.prevent="submitClue"
        >
          <input type="text" v-model="clueInput" />
          <button type="submit">enter</button>
        </form>
        <ul>
          <li v-for="(clue, index) in redClues" :key="index">{{ clue }}</li>
        </ul>

        <button @click="joinTeam('red')">Join Red</button>
        <button @click="joinTeam('red', true)" :disabled="redHasMaster">
          Join Red as Spymaster
        </button>
        <ul>
          <li v-for="member in redTeam.players" :key="member.clientId">
            {{ member.username }}
            <span v-if="member.spymaster">(spymaster)</span>
          </li>
        </ul>
      </div>

      <hr />

      <div>
        <h3>Blue ({{ blueTeam.points }})</h3>

        <h4>Clues</h4>
        <form
          v-if="
            myPlayer &&
            myPlayer.spymaster &&
            turn === 'blue_spymaster' &&
            turn.includes(myPlayer.team)
          "
          @submit.prevent="submitClue"
        >
          <input type="text" v-model="clueInput" />
          <button type="submit">enter</button>
        </form>
        <ul>
          <li v-for="(clue, index) in blueClues" :key="index">{{ clue }}</li>
        </ul>

        <button @click="joinTeam('blue')">Join Blue</button>
        <button @click="joinTeam('blue', true)" :disabled="blueHasMaster">
          Join Blue as Spymaster
        </button>
        <ul>
          <li v-for="member in blueTeam.players" :key="member.clientId">
            {{ member.username }}
            <span v-if="member.spymaster">(spymaster)</span>
          </li>
        </ul>
      </div>
    </section>

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
import { postApi, generateRandomColor } from '../utils'

export default {
  name: 'GameInstance',
  asyncData({ env }) {
    return { ably_key: env.NUXT_ENV_ABLY_PRIVATE_KEY }
  },
  data: () => ({
    // PLAYERS
    ably: {},
    playersChannel: null,
    players: [],

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
    turn: 'red_spymaster',
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

    // CLUES
    redClues: [],
    blueClues: [],
    cluesChannel: null,
    clueInput: '',
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
    redTeam() {
      const players = this.players.filter((player) => player.team === 'red')
      const points = this.cards
        .filter((card) => card.color === 'red')
        .filter((card) => !card.opened).length

      return { players, points }
    },
    blueTeam() {
      const players = this.players.filter((player) => player.team === 'blue')
      const points = this.cards
        .filter((card) => card.color === 'blue')
        .filter((card) => !card.opened).length

      return { players, points }
    },
    redHasMaster() {
      return this.redTeam.players.find((player) => player.spymaster)
    },
    blueHasMaster() {
      return this.blueTeam.players.find((player) => player.spymaster)
    },
    gameEnded() {
      return !this.redTeam.points || !this.blueTeam.points
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

      postApi('/server/cards/remove_tap', {
        clientId: myID,
      })
    },
    'myPlayer.spymaster'() {
      const myID = this.myPlayer.clientId

      const cardWithTapExists = this.cards.find((card) =>
        card.taps.find((tap) => tap.clientId === myID)
      )
      if (!cardWithTapExists) return

      postApi('/server/cards/remove_tap', {
        clientId: myID,
      })
    },
    'timer.time'(time) {
      if (time === 0) {
        const nextTurn = this.turnOrder[this.turn]

        postApi('/server/turn/change', {
          turn: nextTurn,
        })
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

    // **** Turn Channel ***** //
    this.turnChannel = this.ably.channels.get('turn')

    // SUB: change turn
    this.turnChannel.subscribe('change', (message) => {
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

      const { team: myColor } = this.myPlayer
      const cardFound = this.cards.find((card) => card.word === word)
      const currentTeam = this.turn === 'red' ? this.redTeam : this.blueTeam

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

        // reset taps
        postApi('/server/cards/reset_taps')

        // wrong card opened
        if (myColor !== cardColor) {
          const nextTurn = this.turnOrder[this.turn]
          postApi('/server/turn/change', { turn: nextTurn })
        }
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

    // **** Clues channel ***** //
    this.cluesChannel = this.ably.channels.get('clues')
    this.cluesChannel.subscribe('add', ({ data }) => {
      const { clue, team } = data
      if (team === 'red') {
        this.redClues.push(clue)
      }
      if (team === 'blue') {
        this.blueClues.push(clue)
      }
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
    promptUsernameChange() {
      const newUsername = prompt('Enter new username')
      localStorage.setItem('cn_username', newUsername)

      this.playersChannel.presence.update({
        ...this.myPlayer,
        username: newUsername,
      })
    },
    joinTeam(team, spymaster = false) {
      this.playersChannel.presence.update({
        ...this.myPlayer,
        team,
        spymaster,
      })
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
    submitClue() {
      const { team } = this.myPlayer
      this.cluesChannel.publish('add', {
        clue: this.clueInput,
        team,
      })
      this.clueInput = ''

      const nextTurn = this.turn.split('_')[0]
      postApi('/server/turn/change', { turn: nextTurn })
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
.card {
  border: 2px solid black;
}
</style>