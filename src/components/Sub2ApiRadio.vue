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
import type { RadioTrack } from '../lib/types'

const props = withDefaults(
  defineProps<{
    tracks: readonly RadioTrack[]
    stationName?: string
    storageKey?: string
    initialVolume?: number
    theme?: 'light' | 'dark'
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

        <p class="radio-copyright">示例曲由程序生成；请只使用已取得授权的音频。</p>
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

.radio-copyright,
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
}

@media (prefers-reduced-motion: reduce) {
  .radio-controls,
  .radio-fab,
  .radio-tooltip,
  .radio-main-play,
  .radio-track {
    transition-duration: 0.001ms;
  }

  .radio-bars i {
    animation-duration: 0.001ms;
    animation-iteration-count: 1;
  }
}
</style>
