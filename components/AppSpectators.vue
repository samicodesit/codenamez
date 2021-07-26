<template>
  <section v-if="spectators.length" class="spectators">
    <div class="spectators-box" @click="spectatorsVisible = !spectatorsVisible">
      <p class="spectators-box__count">
        <list-icon class="spectators-box__icon" />Spectators:
        {{ spectators.length }}
      </p>
    </div>

    <div v-if="spectatorsVisible" class="spectators-modal">
      <div
        class="spectators-modal__dim"
        @click="spectatorsVisible = false"
      ></div>
      <div class="spectators-modal__wrapper">
        <ul class="spectators-modal__list">
          <li
            class="spectators-modal__item"
            v-for="(player, index) in spectators"
            :key="index"
          >
            <code> {{ player.username }} </code>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script>
import ListIcon from '~/assets/icons/list.svg?inline'

export default {
  name: 'AppSpectators',
  components: {
    ListIcon,
  },
  props: ['spectators'],
  data: () => ({
    spectatorsVisible: false,
  }),
}
</script>

<style>
/* Spectators */
.spectators-box {
  position: fixed;
  bottom: 0;
  right: 0;
  z-index: 50;
}

.spectators-box__count {
  padding: 10px;
  background: var(--primary);
  color: var(--light);
  border-top-left-radius: 6px;
  display: flex;
  align-items: center;
}

.spectators-box__icon {
  width: 20px;
  height: 20px;
  margin-right: 6px;
}

.spectators-modal__wrapper {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
  min-width: 150px;
  z-index: 200;
  background: var(--secondary);
  border-radius: 6px;
  padding: 24px;
}

.spectators-modal__dim {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.spectators-modal__list {
  font-size: 18px;
  color: var(--light);
}
</style>