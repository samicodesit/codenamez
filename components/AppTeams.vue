<template>
  <section class="teams">
    <!-- <button @click="joinTeam(null)">Return to spectators</button> -->

    <div
      v-for="(team, teamCode, teamIndex) in teams"
      :key="teamIndex"
      class="teams__instance"
      :style="getTeamColor(teamCode)"
    >
      <h3 class="teams__points">{{ team.points }}</h3>
      <div
        v-if="timer && timer.team && timer.team.includes(teamCode)"
        class="teams__timer"
      >
        <div class="teams__timer-wrapper">
          <timer-icon class="icon icon--small" />
          <span>{{ getTimerFromSeconds(timeCounter) }}</span>
        </div>
      </div>

      <div class="teams__spymaster">
        <button
          class="button--teams"
          v-if="!teamHasMaster(teamCode)"
          @click="joinTeam(teamCode, true)"
        >
          Become spymaster
        </button>
        <div class="spymaster" v-else>
          <span
            class="ball"
            :style="
              getBallStyle(team.players.find((player) => player.spymaster).ball)
            "
            @click="updateBallColor()"
            >&bull;</span
          >
          <span class="spymaster__username">{{
            team.players.find((player) => player.spymaster).username
          }}</span>
        </div>
      </div>
      <hr />

      <div class="teams__operatives">
        <button
          v-if="showJoinTeam(teamCode)"
          class="button--teams"
          @click="joinTeam(teamCode)"
        >
          Join team
        </button>
        <ul class="teams__players">
          <li
            v-for="member in teams[teamCode].players.filter(
              (player) => !player.spymaster
            )"
            :key="member.clientId"
            class="operative"
          >
            <span
              class="ball"
              :style="getBallStyle(member.ball)"
              @click="updateBallColor"
              >&bull;</span
            >
            <span class="operative__username">{{ member.username }}</span>
          </li>
        </ul>
      </div>

      <div class="clues">
        <h4>Clues</h4>
        <p
          class="clues__placeholder"
          v-if="
            clues &&
            clues[teamCode] &&
            !clues[teamCode].length &&
            !myPlayer.spymaster
          "
        >
          Wait for your spymaster
        </p>

        <form
          class="clues__form"
          v-if="showClueInput(teamCode)"
          @submit.prevent="submitClue"
        >
          <input class="clues__input" v-model="clueInput" type="text" />
          <button class="clues__button" type="submit">+</button>
        </form>
        <ul :key="renderKey">
          <li v-for="(clue, clueIndex) in clues[teamCode]" :key="clueIndex">
            {{ clue }}
          </li>
        </ul>
      </div>

      <div class="teams__end-turn end-turn">
        <button
          v-if="turn === teamCode && !myPlayer.spymaster"
          class="button--teams end-turn__button"
          @click="tapEndTurn"
        >
          End turn
        </button>
        <ul class="end-turn__balls" :key="`end_${endRenderKey}`">
          <li
            class="end-turn__ball"
            v-for="(tap, tapIndex) in endTurnCount[teamCode]"
            :key="tapIndex"
          >
            <span class="ball" :style="getBallStyle(tap)">&bull;</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script>
import { postApi, getTimerFromSeconds } from '../utils'
import { TURN_ORDER } from '../config'

import TimerIcon from '~/assets/icons/timer.svg?inline'

export default {
  name: 'AppTeams',
  components: {
    TimerIcon,
  },
  props: {
    teams: {
      type: Object,
      default: null,
    },
    playersChannel: {
      type: Object,
      default: null,
    },
    cluesChannel: {
      type: Object,
      default: null,
    },
    turnChannel: {
      type: Object,
      default: null,
    },
    players: {
      type: Array,
      default: null,
    },
    myPlayer: {
      type: Object,
      default: null,
    },
    turn: {
      type: String,
      default: '',
    },
    timer: {
      type: Object,
      default: null,
    },
    timeCounter: {
      type: Number,
      default: 0,
    },
  },
  data: () => ({
    TEAM_CONFIG: ['red', 'blue'],

    // CLUES
    clueInput: '',
    clues: {},
    renderKey: 0,

    endTurnCount: {},
    endRenderKey: 0,
  }),
  mounted() {
    // Init team clues
    this.TEAM_CONFIG.forEach((teamCode) => {
      this.clues[teamCode] = []
    })

    // Init end turn count
    this.TEAM_CONFIG.forEach((teamCode) => {
      this.endTurnCount[teamCode] = []
    })

    // SUB: add
    this.cluesChannel.subscribe('add', ({ data }) => {
      const { clue, team: teamCode } = data
      this.clues[teamCode].push(clue)
      this.renderKey++
    })

    // SUB: tap end turn
    this.turnChannel.subscribe('tap_end_turn', (message) => {
      const {
        data: { turn },
        clientId,
      } = message

      const userTapExists = this.endTurnCount[turn].find(
        (tap) => tap.clientId === clientId
      )
      if (userTapExists) {
        this.endTurnCount[turn] = this.endTurnCount[turn].filter(
          (tap) => tap.clientId !== clientId
        )

        this.endRenderKey++
        return
      }

      this.endTurnCount[turn].push({ clientId })
      this.endRenderKey++

      const currentTeam = this.teams[turn]
      const operativesCount = currentTeam.players.filter(
        (player) => !player.spymaster
      ).length

      if (this.endTurnCount[turn].length === operativesCount) {
        this.endTurn()
      }
    })

    // SUB: reset end turn taps
    this.turnChannel.subscribe('reset_end_turn_taps', () => {
      this.TEAM_CONFIG.forEach((teamCode) => {
        this.endTurnCount[teamCode] = []
      })
      this.endRenderKey++
    })
  },
  methods: {
    showJoinTeam(teamCode) {
      return (
        teamCode !== this.myPlayer.team ||
        (teamCode === this.myPlayer.team && this.myPlayer.spymaster)
      )
    },
    joinTeam(team, spymaster = false) {
      this.playersChannel.presence.update({
        ...this.myPlayer,
        team,
        spymaster,
      })
    },
    showClueInput(teamCode) {
      return (
        this.myPlayer &&
        this.myPlayer.spymaster &&
        this.turn === `${teamCode}_spymaster` &&
        this.turn.includes(this.myPlayer.team)
      )
    },
    teamHasMaster(teamCode) {
      if (this.teams) {
        return this.teams[teamCode].players.find((player) => player.spymaster)
      }
    },
    submitClue() {
      const { team } = this.myPlayer

      postApi('/server/clues/add', {
        clue: this.clueInput,
        team,
      })
      this.clueInput = ''

      const nextTurn = this.turn.split('_')[0]
      postApi('/server/turn/change', { turn: nextTurn })
    },
    endTurn() {
      const nextTurn = TURN_ORDER[this.turn]
      postApi('/server/turn/change', { turn: nextTurn })
    },
    tapEndTurn() {
      if (this.myPlayer.team !== this.turn) return

      this.turnChannel.publish('tap_end_turn', { turn: this.turn })
    },
    getTeamColor(teamCode) {
      return { backgroundColor: `var(--${teamCode})` }
    },
    getBallStyle(tap) {
      if (typeof tap === 'string' && tap.includes('#')) {
        return { color: tap }
      }

      const playerFound = this.players.find((player) => {
        return player.clientId === tap.clientId
      })
      const color = playerFound.ball

      return { color }
    },
    getTimerFromSeconds,
    updateBallColor() {
      // return
      // const newBallColor = generateRandomColor()
      // console.log(newBallColor)
      // this.playersChannel.presence.update({
      //   ...this.myPlayer,
      //   ball: newBallColor,
      // })
    },
  },
}
</script>

<style>
.teams {
  display: flex;
}

.teams__instance:not(:last-child) {
  border-right: 2px solid rgba(255, 255, 255, 0.4);
}

.teams__instance {
  padding: 12px;
  padding-bottom: 40px;
  position: relative;
  flex: 1;
}

.teams__points {
  position: absolute;
  font-size: 10rem;
  font-weight: bold;
  left: 50%;
  top: 50%;
  transform: translateX(-50%) translateY(-50%);
  opacity: 1;
  mix-blend-mode: overlay;
}

.teams__timer {
  position: absolute;
  bottom: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.4);
  padding: 6px 8px;
  border-top-left-radius: 4px;
  text-align: center;
}

.teams__timer-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.teams__players {
  margin-top: 12px;
}

.teams__end-turn {
  position: relative;
}

.end-turn__balls {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  flex-wrap: wrap;
  max-width: 33%;
}

.operative {
  display: flex;
  align-items: center;
}

.spymaster {
  display: flex;
  align-items: center;
}

.spymaster__username,
.operative__username {
  margin-left: 4px;
  font-size: 14px;
}

.clues {
  margin-top: 20px;
  margin-bottom: 12px;
}

.clues__placeholder {
  font-size: 14px;
}

.clues__form {
  display: flex;
  margin-bottom: 10px;
}

.clues__input {
  z-index: 20;
  width: 80%;
  border-radius: 4px;
}

.clues__button {
  font-weight: bold;
  font-size: 1.3rem;
  background: rgba(256, 256, 256, 0.2);
  border: 1px solid var(--white);
}
</style>