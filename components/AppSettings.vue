<template>
  <section v-if="myPlayer">
    <div class="settings">
      <button @click="promptUsernameChange" class="settings__button">
        <pencil-icon />
      </button>
    </div>
  </section>
</template>

<script>
import PencilIcon from '~/assets/icons/pencil.svg?inline'

export default {
  props: ['playersChannel', 'myPlayer'],
  components: {
    PencilIcon,
  },
  name: 'AppSettings',
  methods: {
    promptUsernameChange() {
      const newUsername = prompt('Enter new username')
      if (!newUsername) return

      localStorage.setItem('cn_username', newUsername)

      this.playersChannel.presence.update({
        ...this.myPlayer,
        username: newUsername,
      })
    },
  },
}
</script>

<style>
/* Settings */
.settings {
  position: absolute;
  bottom: 0;
  right: left;
  z-index: 50;
}

.settings__button {
  background: var(--secondary);
  border-top-right-radius: 6px;
  padding: 8px;
}

.settings__button svg {
  width: 20px;
  height: 20px;
  color: var(--light);
}
</style>