<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ChevronUp,
  EyeOff,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from '@lucide/vue'
import { shuffleTracks } from '../lib/shuffle'
import type { RadioIntro, RadioTrack } from '../lib/types'

const props = withDefaults(
  defineProps<{
    tracks: readonly RadioTrack[]
    stationName?: string
    storageKey?: string
    initialVolume?: number
    theme?: 'light' | 'dark'
    intro?: RadioIntro
  }>(),
  {
    stationName: 'Sub2API Radio',
    storageKey: 'sub2api-radio',
    initialVolume: 48,
    theme: 'light',
  },
)

const audioRef = ref<HTMLAudioElement | null>(null)
const playlist = ref<RadioTrack[]>(shuffleTracks(props.tracks))
const currentIndex = ref(0)
const isPlaying = ref(false)
const isOpen = ref(false)
const controlsHidden = ref(false)
const showIntro = ref(false)
const volume = ref(clampVolume(props.initialVolume))
const previousVolume = ref(clampVolume(props.initialVolume) || 48)
const currentTime = ref(0)
const mediaDuration = ref(0)
const playbackError = ref('')

const currentTrack = computed(() => playlist.value[currentIndex.value] ?? playlist.value[0])
const duration = computed(() => mediaDuration.value || currentTrack.value?.duration || 0)
const progressPercent = computed(() => {
  if (!duration.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})
const isMuted = computed(() => volume.value === 0)
const statusText = computed(() => {
  if (playbackError.value) return playbackError.value
  if (!currentTrack.value) return '暂无可播放曲目'
  if (isPlaying.value) return `正在播放「${currentTrack.value.title}」`
  return `已选择「${currentTrack.value.title}」`
})

function clampVolume(value: number) {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 48)))
}

function introStorageKey() {
  return `${props.storageKey}:intro`
}

function shouldShowIntro() {
  if (!props.intro) return false

  try {
    return sessionStorage.getItem(introStorageKey()) !== 'seen'
  } catch {
    return true
  }
}

function markIntroSeen() {
  showIntro.value = false
  try {
    sessionStorage.setItem(introStorageKey(), 'seen')
  } catch {
    // The player remains usable when session storage is disabled.
  }
}

function enterWithMusic() {
  markIntroSeen()
  void nextTick(() => {
    syncVolume()
    void playCurrent()
  })
}

function enterSilently() {
  markIntroSeen()
  audioRef.value?.pause()
}

function readPreferences() {
  if (typeof window === 'undefined') return

  try {
    const saved = JSON.parse(localStorage.getItem(props.storageKey) || '{}') as {
      volume?: number
      controlsHidden?: boolean
    }

    if (Number.isFinite(saved.volume)) {
      volume.value = clampVolume(Number(saved.volume))
    } else {
      volume.value = clampVolume(props.initialVolume)
    }
    if (volume.value > 0) previousVolume.value = volume.value
    controlsHidden.value = saved.controlsHidden === true
  } catch {
    localStorage.removeItem(props.storageKey)
  }
}

function savePreferences() {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(
      props.storageKey,
      JSON.stringify({
        volume: volume.value,
        controlsHidden: controlsHidden.value,
      }),
    )
  } catch {
    // Playback remains available when browser storage is disabled.
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function syncVolume() {
  const audio = audioRef.value
  if (!audio) return
  audio.volume = volume.value / 100
  audio.muted = volume.value === 0
}

async function playCurrent() {
  const audio = audioRef.value
  if (!audio) return

  playbackError.value = ''
  try {
    await audio.play()
  } catch (error) {
    playbackError.value = '音频加载失败，请稍后重试'
    console.error('Sub2API Radio playback failed:', error)
  }
}

function togglePlayback() {
  const audio = audioRef.value
  if (!audio || !currentTrack.value) return

  if (audio.paused) {
    void playCurrent()
  } else {
    audio.pause()
  }
}

function reloadCurrentTrack(shouldPlay: boolean) {
  currentTime.value = 0
  mediaDuration.value = 0

  void nextTick(() => {
    const audio = audioRef.value
    if (!audio) return
    audio.load()
    syncVolume()
    if (shouldPlay) void playCurrent()
  })
}

function moveInQueue(offset: number, shouldPlay: boolean) {
  if (!playlist.value.length) return
  currentIndex.value = (currentIndex.value + offset + playlist.value.length) % playlist.value.length
  reloadCurrentTrack(shouldPlay)
}

function reshuffleQueue(previousTrackId: string) {
  const nextPlaylist = shuffleTracks(props.tracks)
  if (nextPlaylist.length > 1 && nextPlaylist[0]?.id === previousTrackId) {
    const first = nextPlaylist[0]
    nextPlaylist[0] = nextPlaylist[1]
    nextPlaylist[1] = first
  }

  playlist.value = nextPlaylist
  currentIndex.value = 0
  reloadCurrentTrack(true)
}

function selectTrack(index: number) {
  if (index === currentIndex.value && isPlaying.value) {
    audioRef.value?.pause()
    return
  }

  currentIndex.value = index
  reloadCurrentTrack(true)
}

function handleEnded() {
  if (playlist.value.length <= 1) {
    reloadCurrentTrack(true)
    return
  }

  if (currentIndex.value >= playlist.value.length - 1) {
    reshuffleQueue(currentTrack.value?.id ?? '')
    return
  }
  moveInQueue(1, true)
}

function handleLoadedMetadata() {
  const audio = audioRef.value
  if (!audio) return
  mediaDuration.value = Number.isFinite(audio.duration)
    ? audio.duration
    : currentTrack.value?.duration || 0
  syncVolume()
}

function handleTimeUpdate() {
  currentTime.value = audioRef.value?.currentTime ?? 0
}

function handleSeek(event: Event) {
  const audio = audioRef.value
  if (!audio) return
  audio.currentTime = Number((event.target as HTMLInputElement).value)
  currentTime.value = audio.currentTime
}

function setVolume(value: number) {
  volume.value = clampVolume(value)
  if (volume.value > 0) previousVolume.value = volume.value
  syncVolume()
}

function toggleMute() {
  setVolume(isMuted.value ? previousVolume.value || 48 : 0)
}

function closePlayer() {
  isOpen.value = false
}

function hideControls() {
  isOpen.value = false
  controlsHidden.value = true
}

function restoreControls() {
  controlsHidden.value = false
}

function openPlayer() {
  controlsHidden.value = false
  isOpen.value = true
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    closePlayer()
  }
}

defineExpose({
  open: openPlayer,
  close: closePlayer,
  hide: hideControls,
})

watch([volume, controlsHidden], savePreferences)

watch(
  () => props.storageKey,
  () => {
    readPreferences()
    showIntro.value = shouldShowIntro()
    syncVolume()
  },
)

watch(
  () => props.tracks,
  (tracks) => {
    playlist.value = shuffleTracks(tracks)
    currentIndex.value = 0
    reloadCurrentTrack(false)
  },
  { deep: true },
)

onMounted(() => {
  readPreferences()
  showIntro.value = shouldShowIntro()
  syncVolume()
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  audioRef.value?.pause()
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="radio-intro">
      <section
        v-if="showIntro && intro"
        class="radio-intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sub2api-radio-intro-title"
        data-testid="radio-intro"
      >
        <div class="radio-intro-card" :class="{ 'has-visual': intro.imageSrc }">
          <div class="radio-intro-content">
            <div class="radio-intro-heading">
              <span class="radio-intro-mark" aria-hidden="true">
                <Music2 :size="19" />
              </span>
              <span class="radio-intro-kicker">{{ intro.kicker || 'CONSOLE RADIO' }}</span>
            </div>
            <h2 id="sub2api-radio-intro-title">{{ intro.title }}</h2>
            <p class="radio-intro-copy">{{ intro.description }}</p>
            <div class="radio-intro-actions">
              <button
                class="radio-intro-primary"
                type="button"
                data-testid="radio-intro-play"
                @click="enterWithMusic"
              >
                <Play :size="16" fill="currentColor" aria-hidden="true" />
                {{ intro.primaryLabel || '开启音乐' }}
              </button>
              <button
                class="radio-intro-secondary"
                type="button"
                data-testid="radio-intro-silent"
                @click="enterSilently"
              >
                {{ intro.secondaryLabel || '静音进入' }}
              </button>
            </div>
            <p class="radio-intro-meta">
              <span class="radio-intro-live" aria-hidden="true"></span>
              {{ intro.meta || '随机播放 · 随时可换' }}
            </p>
          </div>
          <div v-if="intro.imageSrc" class="radio-intro-visual">
            <img :src="intro.imageSrc" :alt="intro.imageAlt || ''" />
            <span class="radio-intro-on-air">ON AIR</span>
          </div>
        </div>
      </section>
    </Transition>

    <div
      class="sub2api-radio"
      :class="{
        'is-dark': theme === 'dark',
        'is-open': isOpen,
        'is-hidden': controlsHidden,
      }"
    >
      <audio
        v-if="currentTrack"
        ref="audioRef"
        :src="currentTrack.src"
        preload="metadata"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="handleEnded"
        @timeupdate="handleTimeUpdate"
        @loadedmetadata="handleLoadedMetadata"
        @error="playbackError = '音频加载失败，请检查文件是否完整'"
      ></audio>

      <div
        class="radio-controls"
        role="group"
        aria-label="背景音乐快捷控制"
        :aria-hidden="controlsHidden"
        :inert="controlsHidden"
      >
        <button
          class="radio-fab radio-quick-play"
          type="button"
          :aria-label="isPlaying ? '暂停背景音乐' : '播放背景音乐'"
          data-testid="radio-toggle"
          @click="togglePlayback"
        >
          <Pause v-if="isPlaying" :size="21" aria-hidden="true" />
          <Play v-else :size="21" fill="currentColor" aria-hidden="true" />
          <span class="radio-tooltip">{{ isPlaying ? '暂停' : '播放' }}</span>
        </button>

        <button
          class="radio-fab"
          type="button"
          aria-label="打开背景音乐播放器"
          aria-controls="sub2api-radio-panel"
          :aria-expanded="isOpen"
          data-testid="radio-open"
          @click="isOpen = !isOpen"
        >
          <Music2 :size="21" aria-hidden="true" />
          <span class="radio-tooltip">音乐</span>
        </button>

        <button
          class="radio-fab radio-hide"
          type="button"
          aria-label="隐藏音乐按钮"
          data-testid="radio-hide"
          @click="hideControls"
        >
          <EyeOff :size="20" aria-hidden="true" />
          <span class="radio-tooltip">隐藏</span>
        </button>
      </div>

      <button
        class="radio-restore"
        type="button"
        aria-label="显示音乐按钮"
        data-testid="radio-restore"
        :hidden="!controlsHidden"
        @click="restoreControls"
      >
        <Music2 :size="15" aria-hidden="true" />
        <span>音乐</span>
      </button>

      <section
        v-show="isOpen && !controlsHidden"
        id="sub2api-radio-panel"
        class="radio-panel"
        aria-label="背景音乐播放器"
        data-testid="radio-panel"
      >
        <header class="radio-panel-head">
          <div class="radio-station">
            <span class="radio-station-logo">
              <Music2 :size="19" aria-hidden="true" />
            </span>
            <span class="radio-station-copy">
              <strong>{{ stationName }}</strong>
              <small aria-live="polite">{{ statusText }}</small>
            </span>
          </div>
          <button
            class="radio-icon-button"
            type="button"
            aria-label="收起播放器"
            @click="closePlayer"
          >
            <ChevronUp :size="19" aria-hidden="true" />
          </button>
        </header>

        <div v-if="playlist.length" class="radio-track-list" role="listbox" aria-label="背景音乐曲目">
          <button
            v-for="(track, index) in playlist"
            :key="track.id"
            class="radio-track"
            :class="{
              'is-active': index === currentIndex,
              'is-playing': index === currentIndex && isPlaying,
            }"
            type="button"
            role="option"
            :aria-selected="index === currentIndex"
            @click="selectTrack(index)"
          >
            <span class="radio-track-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="radio-track-copy">
              <strong>{{ track.title }}</strong>
              <small>{{ track.mood }} · {{ track.description }}</small>
            </span>
            <span class="radio-track-action" aria-hidden="true">
              <Play :size="13" fill="currentColor" />
              <span class="radio-bars"><i></i><i></i><i></i></span>
            </span>
          </button>
        </div>

        <div v-if="currentTrack" class="radio-now-playing">
          <div class="radio-now-head">
            <span class="radio-now-copy">
              <small>{{ currentTrack.mood }} · {{ currentTrack.description }}</small>
              <strong>{{ currentTrack.title }}</strong>
            </span>
            <span class="radio-time">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>
          </div>

          <input
            class="radio-progress"
            type="range"
            min="0"
            :max="duration || 1"
            step="0.1"
            :value="currentTime"
            :style="{ '--radio-progress': `${progressPercent}%` }"
            aria-label="调整播放进度"
            @input="handleSeek"
          />

          <div class="radio-transport">
            <button
              class="radio-icon-button radio-transport-side"
              type="button"
              aria-label="上一首"
              @click="moveInQueue(-1, true)"
            >
              <SkipBack :size="20" aria-hidden="true" />
            </button>
            <button
              class="radio-main-play"
              type="button"
              :aria-label="isPlaying ? '暂停' : '播放'"
              @click="togglePlayback"
            >
              <Pause v-if="isPlaying" :size="19" aria-hidden="true" />
              <Play v-else :size="19" fill="currentColor" aria-hidden="true" />
            </button>
            <button
              class="radio-icon-button radio-transport-side"
              type="button"
              aria-label="下一首"
              @click="moveInQueue(1, true)"
            >
              <SkipForward :size="20" aria-hidden="true" />
            </button>
          </div>

          <div class="radio-volume-row" :class="{ 'is-muted': isMuted }">
            <button
              class="radio-volume-button"
              type="button"
              :aria-label="isMuted ? '取消静音' : '静音'"
              @click="toggleMute"
            >
              <VolumeX v-if="isMuted" :size="16" aria-hidden="true" />
              <Volume2 v-else :size="16" aria-hidden="true" />
            </button>
            <input
              class="radio-volume"
              type="range"
              min="0"
              max="100"
              :value="volume"
              aria-label="音量"
              @input="setVolume(Number(($event.target as HTMLInputElement).value))"
            />
            <span>{{ volume }}</span>
          </div>
        </div>

        <p v-else class="radio-empty">在组件中传入曲目后即可播放。</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sub2api-radio {
  --radio-surface: rgba(255, 255, 255, 0.96);
  --radio-solid: #ffffff;
  --radio-soft: #f2f7f5;
  --radio-text: #18221f;
  --radio-muted: #66736f;
  --radio-line: rgba(15, 118, 110, 0.14);
  --radio-primary: #0f766e;
  --radio-primary-bright: #14b8a6;
  --radio-primary-soft: #e5f8f4;
  --radio-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
  position: fixed;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(20px, env(safe-area-inset-bottom));
  z-index: 80;
  color: var(--radio-text);
  font-family: inherit;
}

.sub2api-radio.is-dark {
  --radio-surface: rgba(13, 25, 24, 0.96);
  --radio-solid: #101f1d;
  --radio-soft: #0c1917;
  --radio-text: #f2faf8;
  --radio-muted: #9aada9;
  --radio-line: rgba(94, 234, 212, 0.16);
  --radio-primary: #2dd4bf;
  --radio-primary-bright: #5eead4;
  --radio-primary-soft: rgba(20, 184, 166, 0.13);
  --radio-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}

.radio-intro {
  --radio-primary: #0f766e;
  --radio-primary-bright: #14b8a6;
  --radio-primary-soft: #e5f8f4;
  --radio-line: rgba(15, 118, 110, 0.14);
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  padding: 24px;
  place-items: center;
  background:
    linear-gradient(125deg, rgb(5 8 12 / 0.9), rgb(9 12 17 / 0.78)),
    rgba(8, 15, 24, 0.72);
  backdrop-filter: blur(14px);
}

.radio-intro-card {
  position: relative;
  display: grid;
  width: min(780px, 100%);
  min-height: 450px;
  align-items: stretch;
  overflow: hidden;
  color: #f8fafc;
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: 22px;
  background:
    linear-gradient(118deg, rgb(20 17 14 / 0.99) 0%, rgb(24 20 16 / 0.98) 58%, rgb(37 27 19 / 0.96) 100%);
  box-shadow: 0 32px 100px rgb(0 0 0 / 0.56);
  grid-template-columns: minmax(0, 1fr);
}

.radio-intro-card.has-visual {
  grid-template-columns: minmax(0, 1.08fr) minmax(300px, 0.92fr);
}

.radio-intro-card::before {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 1px solid rgb(255 255 255 / 0.05);
  border-radius: inherit;
  content: '';
  pointer-events: none;
}

.radio-intro-content {
  position: relative;
  z-index: 3;
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding: 46px 34px 42px 48px;
}

.radio-intro-heading {
  display: flex;
  align-items: center;
  gap: 13px;
}

.radio-intro-mark {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  color: var(--radio-primary-bright);
  border: 1px solid var(--radio-line);
  border-radius: 50%;
  background: var(--radio-primary-soft);
  box-shadow: inset 0 0 0 5px rgb(255 255 255 / 0.025);
}

.radio-intro-kicker {
  margin: 0;
  color: var(--radio-primary-bright);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
}

.radio-intro h2 {
  max-width: 320px;
  margin: 34px 0 0;
  font-size: clamp(38px, 6vw, 58px);
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1.08;
}

.radio-intro-copy {
  max-width: 350px;
  margin: 18px 0 0;
  color: rgb(236 231 225 / 0.72);
  font-size: 14px;
  line-height: 1.85;
}

.radio-intro-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 31px;
}

.radio-intro-primary,
.radio-intro-secondary {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 19px;
  cursor: pointer;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 750;
  transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease;
}

.radio-intro-primary {
  color: rgb(22 17 12);
  border: 1px solid transparent;
  background: linear-gradient(135deg, var(--radio-primary-bright), var(--radio-primary));
  box-shadow: 0 11px 28px rgb(4 47 46 / 0.5);
}

.radio-intro-secondary {
  color: rgb(245 242 238 / 0.8);
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(255 255 255 / 0.035);
}

.radio-intro-primary:hover,
.radio-intro-secondary:hover {
  transform: translateY(-1px);
}

.radio-intro-secondary:hover {
  color: #ffffff;
  border-color: rgb(255 255 255 / 0.28);
  background: rgb(255 255 255 / 0.08);
}

.radio-intro-primary:focus-visible,
.radio-intro-secondary:focus-visible {
  outline: 2px solid var(--radio-primary-bright);
  outline-offset: 3px;
}

.radio-intro-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 24px 0 0;
  color: rgb(236 231 225 / 0.48);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.radio-intro-live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--radio-primary-bright);
  box-shadow: 0 0 0 4px var(--radio-primary-soft);
}

.radio-intro-visual {
  position: relative;
  min-height: 100%;
  overflow: hidden;
}

.radio-intro-visual::before {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 2;
  width: 42%;
  background: linear-gradient(90deg, rgb(20 17 14) 0%, rgb(20 17 14 / 0.76) 22%, transparent 100%);
  content: '';
  pointer-events: none;
}

.radio-intro-visual::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgb(15 12 10 / 0.08) 45%, rgb(15 12 10 / 0.58) 100%),
    linear-gradient(90deg, transparent 70%, rgb(15 12 10 / 0.25));
  content: '';
  pointer-events: none;
}

.radio-intro-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 42%;
  filter: saturate(0.92) contrast(1.03);
}

.radio-intro-on-air {
  position: absolute;
  top: 22px;
  right: 22px;
  z-index: 3;
  padding: 7px 9px 6px;
  color: rgb(255 248 238 / 0.78);
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 5px;
  background: rgb(14 12 10 / 0.34);
  backdrop-filter: blur(8px);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.radio-intro-enter-active,
.radio-intro-leave-active {
  transition: opacity 180ms ease;
}

.radio-intro-enter-active .radio-intro-card,
.radio-intro-leave-active .radio-intro-card {
  transition: transform 180ms ease, opacity 180ms ease;
}

.radio-intro-enter-from,
.radio-intro-leave-to {
  opacity: 0;
}

.radio-intro-enter-from .radio-intro-card,
.radio-intro-leave-to .radio-intro-card {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.radio-controls {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  transition: opacity 160ms ease, transform 160ms ease;
}

.sub2api-radio.is-hidden .radio-controls {
  pointer-events: none;
  opacity: 0;
  transform: translateY(8px);
}

.radio-fab {
  position: relative;
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 15px;
  background: linear-gradient(145deg, var(--radio-primary-bright), var(--radio-primary));
  box-shadow: 0 14px 32px rgba(15, 118, 110, 0.3);
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.radio-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 38px rgba(15, 118, 110, 0.38);
}

.radio-fab:focus-visible,
.radio-icon-button:focus-visible,
.radio-main-play:focus-visible,
.radio-restore:focus-visible,
.radio-volume-button:focus-visible,
.radio-track:focus-visible {
  outline: 2px solid var(--radio-primary-bright);
  outline-offset: 2px;
}

.radio-hide {
  color: var(--radio-muted);
  border-color: var(--radio-line);
  background: var(--radio-solid);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
}

.radio-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  width: max-content;
  padding: 6px 8px;
  color: var(--radio-text);
  border: 1px solid var(--radio-line);
  border-radius: 7px;
  background: var(--radio-solid);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 5px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.radio-fab:hover .radio-tooltip {
  opacity: 1;
  transform: translate(-50%, 0);
}

.radio-restore {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 10px 8px 8px;
  cursor: pointer;
  color: var(--radio-muted);
  border: 1px solid var(--radio-line);
  border-right: 0;
  border-radius: 9px 0 0 9px;
  background: var(--radio-solid);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.13);
  font-size: 11px;
  font-weight: 700;
  opacity: 0.75;
}

.radio-restore:hover {
  color: var(--radio-primary);
  opacity: 1;
}

.radio-restore[hidden] {
  display: none;
}

.radio-panel {
  position: absolute;
  right: 0;
  bottom: 64px;
  display: flex;
  width: 370px;
  max-height: min(690px, calc(100vh - 108px));
  flex-direction: column;
  overflow: hidden;
  color: var(--radio-text);
  border: 1px solid var(--radio-line);
  border-radius: 18px;
  background: var(--radio-surface);
  box-shadow: var(--radio-shadow);
  backdrop-filter: blur(22px);
}

.radio-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 13px;
  border-bottom: 1px solid var(--radio-line);
}

.radio-station {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.radio-station-logo {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  color: #ffffff;
  border-radius: 10px;
  background: linear-gradient(145deg, var(--radio-primary-bright), var(--radio-primary));
}

.radio-station-copy {
  min-width: 0;
}

.radio-station-copy strong,
.radio-station-copy small {
  display: block;
}

.radio-station-copy strong {
  font-size: 14px;
}

.radio-station-copy small {
  max-width: 230px;
  margin-top: 2px;
  overflow: hidden;
  color: var(--radio-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.radio-icon-button,
.radio-volume-button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: var(--radio-muted);
  border: 0;
  border-radius: 8px;
  background: transparent;
  transition: color 150ms ease, background-color 150ms ease;
}

.radio-icon-button:hover,
.radio-volume-button:hover {
  color: var(--radio-primary);
  background: var(--radio-primary-soft);
}

.radio-track-list {
  display: grid;
  gap: 3px;
  padding: 9px;
  overflow-y: auto;
  border-bottom: 1px solid var(--radio-line);
}

.radio-track {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  color: var(--radio-text);
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  gap: 10px;
  transition: background-color 150ms ease, border-color 150ms ease;
}

.radio-track:hover {
  background: var(--radio-soft);
}

.radio-track.is-active {
  border-color: var(--radio-line);
  background: var(--radio-primary-soft);
}

.radio-track-number {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--radio-primary);
  border-radius: 8px;
  background: var(--radio-solid);
  font-size: 10px;
  font-weight: 800;
}

.radio-track-copy {
  min-width: 0;
}

.radio-track-copy strong,
.radio-track-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.radio-track-copy strong {
  font-size: 12px;
}

.radio-track-copy small {
  margin-top: 3px;
  color: var(--radio-muted);
  font-size: 10px;
}

.radio-track-action {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--radio-muted);
  border-radius: 50%;
}

.radio-track.is-active .radio-track-action {
  color: #ffffff;
  background: var(--radio-primary);
}

.radio-bars {
  display: none;
  height: 13px;
  align-items: center;
  gap: 2px;
}

.radio-bars i {
  width: 2px;
  height: 6px;
  border-radius: 99px;
  background: currentColor;
  animation: radio-bars 0.7s ease-in-out infinite alternate;
}

.radio-bars i:nth-child(2) {
  animation-delay: -0.25s;
}

.radio-bars i:nth-child(3) {
  animation-delay: -0.5s;
}

.radio-track.is-playing .radio-track-action > svg {
  display: none;
}

.radio-track.is-playing .radio-bars {
  display: flex;
}

.radio-now-playing {
  padding: 13px 16px 12px;
}

.radio-now-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.radio-now-copy {
  min-width: 0;
}

.radio-now-copy small,
.radio-now-copy strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.radio-now-copy small {
  color: var(--radio-muted);
  font-size: 9px;
}

.radio-now-copy strong {
  margin-top: 3px;
  font-size: 12px;
}

.radio-time {
  flex: 0 0 auto;
  color: var(--radio-muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.radio-progress,
.radio-volume {
  height: 3px;
  cursor: pointer;
  accent-color: var(--radio-primary);
}

.radio-progress {
  width: 100%;
  margin: 13px 0 7px;
}

.radio-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 23px;
}

.radio-main-play {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: #ffffff;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--radio-primary-bright), var(--radio-primary));
  box-shadow: 0 9px 22px rgba(20, 184, 166, 0.28);
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.radio-main-play:hover {
  transform: scale(1.04);
  box-shadow: 0 11px 26px rgba(20, 184, 166, 0.36);
}

.radio-volume-row {
  display: grid;
  margin-top: 12px;
  align-items: center;
  grid-template-columns: 28px minmax(0, 1fr) 24px;
  gap: 8px;
}

.radio-volume-button {
  width: 28px;
  height: 28px;
}

.radio-volume-row > span {
  color: var(--radio-muted);
  font-size: 9px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.radio-empty {
  margin: 0;
  padding: 9px 16px 12px;
  color: var(--radio-muted);
  border-top: 1px solid var(--radio-line);
  font-size: 9px;
  line-height: 1.5;
}

.radio-empty {
  padding: 18px 16px;
}

@keyframes radio-bars {
  to {
    height: 18px;
  }
}

@media (max-width: 640px) {
  .sub2api-radio {
    right: max(12px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
    left: max(12px, env(safe-area-inset-left));
  }

  .radio-fab {
    width: 50px;
    height: 50px;
  }

  .radio-controls {
    gap: 6px;
  }

  .radio-panel {
    right: 0;
    bottom: 60px;
    left: 0;
    width: 100%;
    max-height: calc(100dvh - 84px);
    border-radius: 16px;
  }

  .radio-station-copy small {
    max-width: 180px;
  }

  .radio-intro {
    padding: 14px;
  }

  .radio-intro-card,
  .radio-intro-card.has-visual {
    width: min(440px, 100%);
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .radio-intro-visual {
    min-height: 210px;
    order: -1;
  }

  .radio-intro-visual::before {
    display: none;
  }

  .radio-intro-visual::after {
    background:
      linear-gradient(180deg, rgb(15 12 10 / 0.02) 58%, rgb(20 17 14 / 0.7) 100%),
      linear-gradient(90deg, transparent 72%, rgb(15 12 10 / 0.18));
  }

  .radio-intro-visual img {
    object-position: 50% 31%;
  }

  .radio-intro-on-air {
    top: 16px;
    right: 16px;
  }

  .radio-intro-content {
    padding: 27px 24px 26px;
    background: rgb(20 17 14);
  }

  .radio-intro h2 {
    margin-top: 24px;
    font-size: clamp(34px, 11vw, 46px);
  }

  .radio-intro-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .radio-intro-primary,
  .radio-intro-secondary {
    width: 100%;
  }

  .radio-intro-meta {
    margin-top: 19px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .radio-controls,
  .radio-fab,
  .radio-tooltip,
  .radio-main-play,
  .radio-track,
  .radio-intro,
  .radio-intro-card {
    transition-duration: 0.001ms;
  }

  .radio-bars i {
    animation-duration: 0.001ms;
    animation-iteration-count: 1;
  }
}

@media (forced-colors: active) {
  .radio-intro {
    background: Canvas;
  }

  .radio-intro-card,
  .radio-panel,
  .radio-fab,
  .radio-hide,
  .radio-restore,
  .radio-intro-primary,
  .radio-intro-secondary,
  .radio-main-play,
  .radio-icon-button,
  .radio-volume-button {
    forced-color-adjust: none;
    color: ButtonText;
    border: 1px solid ButtonText;
    background: ButtonFace;
  }

  .radio-intro-card,
  .radio-intro-card.has-visual {
    width: min(430px, 100%);
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .radio-intro-visual,
  .radio-intro-live {
    display: none;
  }

  .radio-intro-content {
    padding: 34px;
  }

  .radio-intro-primary,
  .radio-main-play,
  .radio-track.is-active .radio-track-action {
    color: HighlightText;
    background: Highlight;
  }

  .radio-intro-kicker,
  .radio-intro-copy,
  .radio-intro-meta,
  .radio-station-copy small,
  .radio-track-copy small,
  .radio-now-copy small,
  .radio-time,
  .radio-volume-row > span {
    color: CanvasText;
  }

  .radio-fab,
  .radio-main-play,
  .radio-station-logo,
  .radio-track-number {
    forced-color-adjust: none;
    color: HighlightText;
    background: Highlight;
  }

  .radio-tooltip,
  .radio-track,
  .radio-track-list,
  .radio-now-playing,
  .radio-panel-head {
    color: CanvasText;
    border-color: CanvasText;
    background: Canvas;
  }

  .radio-track.is-active {
    border-color: Highlight;
    background: Canvas;
  }

  .radio-track.is-active .radio-track-number {
    color: HighlightText;
    background: Highlight;
  }
}
</style>
