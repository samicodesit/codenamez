<template>
  <section>
    <h2>Teams</h2>
    <button @click="joinTeam(null)">Return to spectators</button>

    <div v-for="(team, teamCode, teamIndex) in teams" :key="teamIndex">
      <h3>{{ teamCode }} ({{ team.points }})</h3>

      <h4>Clues</h4>
      <form v-if="showClueInput(teamCode)" @submit.prevent="submitClue">
        <input v-model="clueInput" type="text" />
        <button type="submit">enter</button>
      </form>
      <ul>
        <li v-for="(clue, clueIndex) in clues[teamCode]" :key="clueIndex">
          {{ clue }}
        </li>
      </ul>

      <button @click="joinTeam(teamCode)">Join {{ teamCode }}</button>
      <button
        :disabled="teamHasMaster(teamCode)"
        @click="joinTeam(teamCode, true)"
      >
        Join {{ teamCode }} as Spymaster
      </button>
      <ul>
        <li v-for="member in teams[teamCode].players" :key="member.clientId">
          {{ member.username }}
          <span v-if="member.spymaster">(spymaster)</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script>
import { postApi } from '../utils'

export default {
  name: 'AppTeams',
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
    myPlayer: {
      type: Object,
      default: null,
    },
    turn: {
      type: String,
      default: '',
    },
  },
  data: () => ({
    TEAM_CONFIG: ['red', 'blue'],

    // CLUES
    clueInput: '',
    clues: {},
  }),
  mounted() {
    // Init team clues
    this.TEAM_CONFIG.forEach((team) => {
      this.clues[team] = []
    })

    // SUB: add
    this.cluesChannel.subscribe('add', ({ data }) => {
      const { clue, team: teamCode } = data
      this.clues[teamCode].push(clue)
    })
  },
  methods: {
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
      this.cluesChannel.publish('add', {
        clue: this.clueInput,
        team,
      })
      this.clueInput = ''

      const nextTurn = this.turn.split('_')[0]
      postApi('/server/turn/change', { turn: nextTurn })
    },
  },
}
</script>