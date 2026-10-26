<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  backgroundMusicTracks,
  shuffleTracks,
  type BackgroundMusicTrack,
} from './backgroundMusicTracks'
import { listTracks, type RadioTrack } from '@/api/radio'

const STORAGE_KEY = 'xihe-bgm-player-v1'
const INTRO_STORAGE_KEY = 'xihe-bgm-intro-v1'
const introPortraitSrc = '/brand/xihe-radio/xihe-radio-portrait.webp?v=20261024-r90'

const audioRef = ref<HTMLAudioElement | null>(null)
const playlist = ref<BackgroundMusicTrack[]>(shuffleTracks(backgroundMusicTracks))
const currentIndex = ref(0)
const isPlaying = ref(false)
const isOpen = ref(false)
const controlsHidden = ref(false)
const showIntro = ref(false)
const volume = ref(48)
const previousVolume = ref(48)
const currentTime = ref(0)
const mediaDuration = ref(0)
const playbackError = ref('')
const playlistLoading = ref(true)
const playlistLoadFailed = ref(false)

const currentTrack = computed(
  () => playlist.value[currentIndex.value] ?? playlist.value[0],
)
const duration = computed(() => mediaDuration.value || currentTrack.value?.duration || 0)
const progressPercent = computed(() => {
  if (!duration.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})
const isMuted = computed(() => volume.value === 0)
const statusText = computed(() => {
  if (playbackError.value) return playbackError.value
  if (!currentTrack.value) return playlistLoading.value ? '正在加载曲库' : '曲库暂无歌曲'
  if (isPlaying.value) return `正在播放「${currentTrack.value.title}」`
  return `已选择「${currentTrack.value.title}」`
})

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as {
      volume?: number
      controlsHidden?: boolean
    }

    if (Number.isFinite(saved.volume)) {
      volume.value = Math.min(100, Math.max(0, Number(saved.volume)))
    }
    if (volume.value > 0) previousVolume.value = volume.value
    controlsHidden.value = saved.controlsHidden === true
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function shouldShowIntro() {
  try {
    return sessionStorage.getItem(INTRO_STORAGE_KEY) !== 'seen'
  } catch {
    return true
  }
}

function markIntroSeen() {
  showIntro.value = false
  try {
    sessionStorage.setItem(INTRO_STORAGE_KEY, 'seen')
  } catch {
    // The site remains usable when storage is unavailable.
  }
}

function savePreferences() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: volume.value,
        controlsHidden: controlsHidden.value,
      }),
    )
  } catch {
    // Playback still works when storage is unavailable.
  }
}

function formatTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }
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
  if (!audio || !currentTrack.value) return

  playbackError.value = ''
  try {
    await audio.play()
  } catch (error) {
    playbackError.value = '音频加载失败，请稍后重试'
    console.error('Background music playback failed:', error)
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

function togglePlayback() {
  const audio = audioRef.value
  if (!audio || !currentTrack.value) return

  if (audio.paused) {
    void playCurrent()
  } else {
    audio.pause()
  }
}

function moveInQueue(offset: number, shouldPlay: boolean) {
  if (!playlist.value.length) return
  currentIndex.value = (currentIndex.value + offset + playlist.value.length) % playlist.value.length
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

function reshuffleQueue(previousTrackId: string) {
  if (!playlist.value.length) return
  const nextPlaylist = shuffleTracks(playlist.value)
  if (nextPlaylist.length > 1 && nextPlaylist[0]?.id === previousTrackId) {
    const first = nextPlaylist[0]
    nextPlaylist[0] = nextPlaylist[1]
    nextPlaylist[1] = first
  }

  playlist.value = nextPlaylist
  currentIndex.value = 0
  currentTime.value = 0
  mediaDuration.value = 0

  void nextTick(() => {
    const audio = audioRef.value
    if (!audio) return
    audio.load()
    syncVolume()
    void playCurrent()
  })
}

function selectTrack(index: number) {
  if (index === currentIndex.value && isPlaying.value) {
    audioRef.value?.pause()
    return
  }

  currentIndex.value = index
  currentTime.value = 0
  mediaDuration.value = 0

  void nextTick(() => {
    const audio = audioRef.value
    if (!audio) return
    audio.load()
    syncVolume()
    void playCurrent()
  })
}

function handleEnded() {
  if (!playlist.value.length) return
  if (currentIndex.value >= playlist.value.length - 1) {
    reshuffleQueue(currentTrack.value?.id || '')
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
  volume.value = Math.min(100, Math.max(0, Math.round(value)))
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

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    closePlayer()
  }
}

function applyPlaylist(
  nextTracks: BackgroundMusicTrack[],
  detail: { deletedId?: string; uploaded?: boolean } = {},
) {
  const previousTrack = currentTrack.value
  const previousIndex = currentIndex.value
  const wasPlaying = isPlaying.value
  const previousId = previousTrack?.id
  const nextIndex = previousId
    ? nextTracks.findIndex((track) => track.id === previousId)
    : -1

  playlist.value = nextTracks

  if (!nextTracks.length) {
    currentIndex.value = 0
    currentTime.value = 0
    mediaDuration.value = 0
    audioRef.value?.pause()
    return
  }

  if (nextIndex >= 0) {
    currentIndex.value = nextIndex
    return
  }

  const removedCurrent =
    Boolean(previousId) &&
    Boolean(detail.deletedId) &&
    previousId === detail.deletedId
  currentIndex.value = removedCurrent
    ? Math.min(previousIndex, nextTracks.length - 1)
    : 0
  currentTime.value = 0
  mediaDuration.value = 0

  void nextTick(() => {
    const audio = audioRef.value
    if (!audio) return
    audio.load()
    syncVolume()
    if (removedCurrent && wasPlaying) {
      void playCurrent()
    }
  })
}

async function loadPlaylist(detail: { deletedId?: string; uploaded?: boolean } = {}) {
  playlistLoadFailed.value = false
  try {
    const tracks: RadioTrack[] = await listTracks()
    applyPlaylist(tracks, detail)
  } catch (error) {
    playlistLoadFailed.value = true
    if (playlistLoading.value) {
      playlist.value = shuffleTracks(backgroundMusicTracks)
      currentIndex.value = 0
    }
    console.error('Failed to load radio tracks:', error)
  } finally {
    playlistLoading.value = false
  }
}

function handleRadioUpdated(event: Event) {
  const detail = (event as CustomEvent<{ deletedId?: string; uploaded?: boolean }>).detail || {}
  void loadPlaylist(detail)
}

watch([volume, controlsHidden], savePreferences)

onMounted(() => {
  readPreferences()
  showIntro.value = shouldShowIntro()
  syncVolume()
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('xihe-radio-updated', handleRadioUpdated)
  void loadPlaylist()
})

onBeforeUnmount(() => {
  audioRef.value?.pause()
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('xihe-radio-updated', handleRadioUpdated)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="bgm-intro">
      <section
        v-if="showIntro"
        class="bgm-intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bgm-intro-title"
        data-testid="bgm-intro"
      >
        <div class="bgm-intro-card">
          <div class="bgm-intro-content">
            <div class="bgm-intro-heading">
              <span class="bgm-intro-mark" aria-hidden="true">
                <svg class="bgm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </span>
              <span class="bgm-intro-kicker">XIHE RADIO</span>
            </div>
            <h2 id="bgm-intro-title">进入羲和</h2>
            <p class="bgm-intro-copy">
              让旋律陪你进入创作。音乐会在你选择后开始，也可以安静地开始今天。
            </p>
            <div class="bgm-intro-actions">
              <button
                class="bgm-intro-primary"
                type="button"
                data-testid="bgm-intro-play"
                @click="enterWithMusic"
              >
                <svg class="bgm-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z" />
                </svg>
                开启音乐
              </button>
              <button
                class="bgm-intro-secondary"
                type="button"
                data-testid="bgm-intro-silent"
                @click="enterSilently"
              >
                静音进入
              </button>
            </div>
            <p class="bgm-intro-meta">
              <span class="bgm-intro-live" aria-hidden="true"></span>
              随机播放 · 随时可换
            </p>
          </div>
          <div class="bgm-intro-visual">
            <img
              :src="introPortraitSrc"
              alt="羲和电台品牌人物插画"
            />
            <span class="bgm-intro-on-air">ON AIR</span>
          </div>
          <div class="bgm-intro-promo">
            <span class="bgm-intro-promo-dot" aria-hidden="true"></span>
            <p class="bgm-intro-promo-text">
              <b>羲和 AI 中转</b> · Codex <b>0.045</b> 起 / Claude Kiro <b>0.08</b> 起 ·
              DeepSeek · Grok · Gemini · Kimi · GLM
              <span class="bgm-intro-promo-warn">superxihe.com 需魔法</span>
            </p>
            <a
              class="bgm-intro-promo-link"
              href="https://yingce.superxihe.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              做视频 ↗
            </a>
          </div>
        </div>
      </section>
    </Transition>

    <div
      class="xihe-bgm-root"
      :class="{
        'is-open': isOpen,
        'is-hidden': controlsHidden,
      }"
    >
      <audio
        ref="audioRef"
        :src="currentTrack?.src"
        preload="metadata"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="handleEnded"
        @timeupdate="handleTimeUpdate"
        @loadedmetadata="handleLoadedMetadata"
        @error="playbackError = '音频加载失败，请检查文件是否完整'"
      ></audio>

      <div
        class="bgm-controls"
        role="group"
        aria-label="背景音乐快捷控制"
        :aria-hidden="controlsHidden"
        :inert="controlsHidden"
      >
        <button
          class="bgm-fab bgm-quick-play"
          type="button"
          :aria-label="isPlaying ? '暂停背景音乐' : '播放背景音乐'"
          data-testid="bgm-toggle"
          :disabled="!currentTrack"
          @click="togglePlayback"
        >
          <svg
            v-if="isPlaying"
            class="bgm-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
          <svg
            v-else
            class="bgm-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z" />
          </svg>
          <span class="bgm-tooltip">{{ isPlaying ? '暂停' : '播放' }}</span>
        </button>

        <button
          class="bgm-fab"
          type="button"
          aria-label="打开背景音乐播放器"
          aria-controls="xihe-bgm-panel"
          :aria-expanded="isOpen"
          data-testid="bgm-open"
          @click="isOpen = !isOpen"
        >
          <svg
            class="bgm-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span class="bgm-tooltip">音乐</span>
        </button>

        <button
          class="bgm-fab bgm-hide"
          type="button"
          aria-label="隐藏音乐按钮"
          data-testid="bgm-hide"
          @click="hideControls"
        >
          <svg
            class="bgm-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M3 3l18 18M10.58 10.58a2 2 0 0 0 2.83 2.83M9.88 5.23A10.45 10.45 0 0 1 12 5c4.76 0 8.77 3.16 10.07 7.5a10.5 10.5 0 0 1-4.29 5.77M6.23 6.23A10.48 10.48 0 0 0 1.93 12.5 10.5 10.5 0 0 0 12 19.5c.99 0 1.95-.14 2.86-.39" />
          </svg>
          <span class="bgm-tooltip">隐藏</span>
        </button>
      </div>

      <button
        class="bgm-restore"
        type="button"
        aria-label="显示音乐按钮"
        title="显示音乐按钮"
        data-testid="bgm-restore"
        :hidden="!controlsHidden"
        @click="restoreControls"
      >
        <svg
          class="bgm-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </button>

      <section
        v-show="isOpen && !controlsHidden"
        id="xihe-bgm-panel"
        class="bgm-panel"
        aria-label="背景音乐播放器"
        data-testid="bgm-panel"
      >
        <header class="bgm-panel-head">
          <div class="bgm-station">
            <span class="bgm-station-logo">
              <svg
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </span>
            <span class="bgm-station-copy">
              <strong>羲和电台</strong>
              <small>{{ statusText }}</small>
            </span>
          </div>
          <button class="bgm-icon-button" type="button" aria-label="收起播放器" @click="closePlayer">
            <svg
              class="bgm-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </header>

        <div class="bgm-track-list" role="listbox" aria-label="背景音乐曲目">
          <div v-if="playlist.length === 0" class="bgm-empty" data-testid="bgm-empty">
            <svg
              class="bgm-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <strong>{{ playlistLoading ? '正在加载曲库' : '曲库暂无歌曲' }}</strong>
            <small v-if="playlistLoadFailed">内置曲目加载失败，请稍后重试</small>
            <small v-else-if="!playlistLoading">管理员上传歌曲后会自动出现在这里</small>
          </div>
          <button
            v-for="(track, index) in playlist"
            :key="track.id"
            class="bgm-track"
            :class="{
              'is-active': index === currentIndex,
              'is-playing': index === currentIndex && isPlaying,
            }"
            type="button"
            role="option"
            :aria-selected="index === currentIndex"
            @click="selectTrack(index)"
          >
            <span class="bgm-track-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="bgm-track-copy">
              <strong>{{ track.title }}</strong>
              <small>{{ track.mood }} · {{ track.description }}</small>
            </span>
            <span class="bgm-track-action" aria-hidden="true">
              <svg class="bgm-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z" />
              </svg>
              <span class="bgm-bars"><i></i><i></i><i></i></span>
            </span>
          </button>
        </div>

        <div class="bgm-now-playing">
          <div class="bgm-now-head">
            <span class="bgm-now-copy">
              <small>{{ currentTrack ? `${currentTrack.mood} · ${currentTrack.description}` : '羲和电台' }}</small>
              <strong>{{ currentTrack?.title || '暂无歌曲' }}</strong>
            </span>
            <span class="bgm-time">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>
          </div>

          <input
            class="bgm-progress"
            type="range"
            min="0"
            :max="duration || 1"
            step="0.1"
            :value="currentTime"
            :style="{ '--bgm-progress': `${progressPercent}%` }"
            aria-label="调整播放进度"
            :disabled="!currentTrack"
            @input="handleSeek"
          />

          <div class="bgm-transport">
            <button
              class="bgm-icon-button bgm-transport-side"
              type="button"
              aria-label="上一首"
              :disabled="!currentTrack"
              @click="moveInQueue(-1, true)"
            >
              <svg
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M19 20 9 12l10-8v16Z" />
                <path d="M5 19V5" />
              </svg>
            </button>
            <button
              class="bgm-main-play"
              type="button"
              :aria-label="isPlaying ? '暂停' : '播放'"
              :disabled="!currentTrack"
              @click="togglePlayback"
            >
              <svg
                v-if="isPlaying"
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <svg
                v-else
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z" />
              </svg>
            </button>
            <button
              class="bgm-icon-button bgm-transport-side"
              type="button"
              aria-label="下一首"
              :disabled="!currentTrack"
              @click="moveInQueue(1, true)"
            >
              <svg
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="m5 4 10 8-10 8V4Z" />
                <path d="M19 5v14" />
              </svg>
            </button>
          </div>

          <div class="bgm-volume-row" :class="{ 'is-muted': isMuted }">
            <button class="bgm-volume-button" type="button" :aria-label="isMuted ? '取消静音' : '静音'" @click="toggleMute">
              <svg
                v-if="isMuted"
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="m16 9 5 5M21 9l-5 5" />
              </svg>
              <svg
                v-else
                class="bgm-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07M18.36 5.64a9 9 0 0 1 0 12.73" />
              </svg>
            </button>
            <input
              class="bgm-volume"
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

      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.xihe-bgm-root {
  --bgm-surface: rgba(255, 255, 255, 0.96);
  --bgm-solid: #ffffff;
  --bgm-soft: #f1f7f6;
  --bgm-text: #17211f;
  --bgm-muted: #64736f;
  --bgm-line: rgba(13, 148, 136, 0.14);
  --bgm-primary: rgb(var(--primary-700, 15 118 110));
  --bgm-primary-bright: rgb(var(--primary-500, 20 184 166));
  --bgm-primary-soft: rgb(var(--primary-50, 240 253 250) / 0.72);
  --bgm-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
  --bgm-edge-gap: 8px;
  position: fixed;
  right: calc(env(safe-area-inset-right, 0px) + var(--bgm-edge-gap));
  bottom: max(20px, env(safe-area-inset-bottom));
  z-index: 80;
  color: var(--bgm-text);
  font-family: inherit;
}

:global(.dark) .xihe-bgm-root {
  --bgm-surface: rgba(15, 23, 42, 0.96);
  --bgm-solid: #111c2b;
  --bgm-soft: #0c1725;
  --bgm-text: #f3faf8;
  --bgm-muted: #9aadaa;
  --bgm-line: rgb(var(--dark-border-rgb, 203 213 225) / 0.2);
  --bgm-primary: rgb(var(--primary-400, 45 212 191));
  --bgm-primary-bright: rgb(var(--primary-300, 94 234 212));
  --bgm-primary-soft: rgb(var(--primary-500, 20 184 166) / 0.13);
  --bgm-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}

.bgm-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.bgm-intro {
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

.bgm-intro-card {
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
  grid-template-columns: minmax(0, 1.08fr) minmax(300px, 0.92fr);
}

.bgm-intro-card::before {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 1px solid rgb(255 255 255 / 0.05);
  border-radius: inherit;
  content: '';
  pointer-events: none;
}

.bgm-intro-content {
  position: relative;
  z-index: 3;
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding: 46px 34px 42px 48px;
}

.bgm-intro-heading {
  display: flex;
  align-items: center;
  gap: 13px;
}

.bgm-intro-mark {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  color: rgb(var(--primary-200, 221 214 254));
  border: 1px solid rgb(var(--primary-300, 94 234 212) / 0.3);
  border-radius: 50%;
  background: rgb(var(--primary-500, 20 184 166) / 0.13);
  box-shadow: inset 0 0 0 5px rgb(255 255 255 / 0.025);
}

.bgm-intro-kicker {
  margin: 0;
  color: rgb(var(--primary-300, 94 234 212));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
}

.bgm-intro h2 {
  max-width: 320px;
  margin: 34px 0 0;
  font-size: clamp(38px, 6vw, 58px);
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1.08;
}

.bgm-intro-copy {
  max-width: 350px;
  margin: 18px 0 0;
  color: rgb(236 231 225 / 0.72);
  font-size: 14px;
  line-height: 1.85;
}

.bgm-intro-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 31px;
}

.bgm-intro-primary,
.bgm-intro-secondary {
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

.bgm-intro-primary {
  color: rgb(22 17 12);
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgb(var(--primary-200, 221 214 254)), rgb(var(--primary-400, 45 212 191)));
  box-shadow: 0 11px 28px rgb(var(--primary-950, 4 47 46) / 0.5);
}

.bgm-intro-secondary {
  color: rgb(245 242 238 / 0.8);
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(255 255 255 / 0.035);
}

.bgm-intro-primary:hover,
.bgm-intro-secondary:hover {
  transform: translateY(-1px);
}

.bgm-intro-secondary:hover {
  color: #ffffff;
  border-color: rgb(255 255 255 / 0.28);
  background: rgb(255 255 255 / 0.08);
}

.bgm-intro-primary:focus-visible,
.bgm-intro-secondary:focus-visible {
  outline: 2px solid rgb(var(--primary-300, 94 234 212));
  outline-offset: 3px;
}

.bgm-intro-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 24px 0 0;
  color: rgb(236 231 225 / 0.48);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.bgm-intro-live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--primary-300, 94 234 212));
  box-shadow: 0 0 0 4px rgb(var(--primary-400, 45 212 191) / 0.09);
}

.bgm-intro-visual {
  position: relative;
  min-height: 100%;
  overflow: hidden;
}

.bgm-intro-visual::before {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 2;
  width: 42%;
  background: linear-gradient(90deg, rgb(20 17 14) 0%, rgb(20 17 14 / 0.76) 22%, transparent 100%);
  content: '';
  pointer-events: none;
}

.bgm-intro-visual::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgb(15 12 10 / 0.08) 45%, rgb(15 12 10 / 0.58) 100%),
    linear-gradient(90deg, transparent 70%, rgb(15 12 10 / 0.25));
  content: '';
  pointer-events: none;
}

.bgm-intro-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 42%;
  filter: saturate(0.92) contrast(1.03);
}

.bgm-intro-on-air {
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

.bgm-intro-promo {
  display: flex;
  align-items: center;
  gap: 10px;
  grid-column: 1 / -1;
  padding: 12px 46px;
  color: rgb(248 250 252 / 0.7);
  border-top: 1px solid rgb(255 255 255 / 0.08);
  background: linear-gradient(
    90deg,
    rgb(var(--primary-500, 20 184 166) / 0.12),
    transparent 62%
  );
  font-size: 11px;
  line-height: 1.55;
}

.bgm-intro-promo-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: rgb(var(--primary-300, 94 234 212));
}

.bgm-intro-promo-text {
  min-width: 0;
  margin: 0;
}

.bgm-intro-promo-text b {
  color: rgb(var(--primary-200, 221 214 254));
  font-weight: 750;
}

.bgm-intro-promo-warn {
  color: #f0c98b;
}

.bgm-intro-promo-link {
  flex: none;
  margin-left: auto;
  padding: 5px 11px;
  color: #16110c;
  border-radius: 6px;
  background: linear-gradient(
    135deg,
    rgb(var(--primary-300, 94 234 212)),
    rgb(var(--primary-200, 221 214 254))
  );
  font-size: 10.5px;
  font-weight: 750;
  text-decoration: none;
  transition: filter 140ms ease;
}

.bgm-intro-promo-link:hover {
  filter: brightness(1.08);
}

.bgm-intro-enter-active,
.bgm-intro-leave-active {
  transition: opacity 180ms ease;
}

.bgm-intro-enter-active .bgm-intro-card,
.bgm-intro-leave-active .bgm-intro-card {
  transition: transform 180ms ease, opacity 180ms ease;
}

.bgm-intro-enter-from,
.bgm-intro-leave-to {
  opacity: 0;
}

.bgm-intro-enter-from .bgm-intro-card,
.bgm-intro-leave-to .bgm-intro-card {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.bgm-controls {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  transition: opacity 160ms ease, transform 160ms ease;
}

.xihe-bgm-root.is-hidden .bgm-controls {
  pointer-events: none;
  opacity: 0;
  transform: translateY(8px);
}

.xihe-bgm-root.is-hidden {
  pointer-events: none;
}

.xihe-bgm-root.is-hidden .bgm-restore {
  pointer-events: auto;
}

.bgm-fab {
  position: relative;
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: #ffffff;
  border: 1px solid rgb(var(--dark-border-rgb, 203 213 225) / 0.34);
  border-radius: 15px;
  background: linear-gradient(145deg, var(--bgm-primary-bright), var(--bgm-primary));
  box-shadow: 0 14px 32px rgb(var(--primary-700, 15 118 110) / 0.3);
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.bgm-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 38px rgb(var(--primary-700, 15 118 110) / 0.38);
}

.bgm-fab:focus-visible,
.bgm-icon-button:focus-visible,
.bgm-main-play:focus-visible,
.bgm-restore:focus-visible,
.bgm-volume-button:focus-visible,
.bgm-track:focus-visible {
  outline: 2px solid var(--bgm-primary-bright);
  outline-offset: 2px;
}

.bgm-hide {
  color: var(--bgm-muted);
  border-color: var(--bgm-line);
  background: var(--bgm-solid);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
}

.bgm-tooltip {
  position: absolute;
  right: calc(100% + 9px);
  width: max-content;
  padding: 6px 8px;
  color: var(--bgm-text);
  border: 1px solid var(--bgm-line);
  border-radius: 7px;
  background: var(--bgm-solid);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
  opacity: 0;
  transform: translateX(5px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.bgm-fab:hover .bgm-tooltip {
  opacity: 1;
  transform: translateX(0);
}

.bgm-restore {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: var(--bgm-muted);
  border: 1px solid var(--bgm-line);
  border-right: 0;
  border-radius: 10px 0 0 10px;
  background: var(--bgm-solid);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.13);
  font-size: 11px;
  font-weight: 700;
  opacity: 0.75;
}

.bgm-restore:hover {
  color: var(--bgm-primary);
  opacity: 1;
}

.bgm-restore[hidden] {
  display: none;
}

.bgm-restore .bgm-icon {
  width: 20px;
  height: 20px;
}

.bgm-panel {
  position: absolute;
  right: calc(var(--bgm-edge-gap) * -1);
  bottom: 64px;
  display: flex;
  width: 370px;
  max-height: min(690px, calc(100vh - 108px));
  flex-direction: column;
  overflow: hidden;
  color: var(--bgm-text);
  border: 1px solid var(--bgm-line);
  border-radius: 18px;
  background: var(--bgm-surface);
  box-shadow: var(--bgm-shadow);
  backdrop-filter: blur(22px);
}

.bgm-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 13px;
  border-bottom: 1px solid var(--bgm-line);
}

.bgm-station {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.bgm-station-logo {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  color: #ffffff;
  border-radius: 10px;
  background: linear-gradient(145deg, var(--bgm-primary-bright), var(--bgm-primary));
}

.bgm-station-copy {
  min-width: 0;
}

.bgm-station-copy strong,
.bgm-station-copy small {
  display: block;
}

.bgm-station-copy strong {
  font-size: 14px;
}

.bgm-station-copy small {
  max-width: 230px;
  margin-top: 2px;
  overflow: hidden;
  color: var(--bgm-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bgm-icon-button,
.bgm-volume-button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: var(--bgm-muted);
  border: 0;
  border-radius: 8px;
  background: transparent;
  transition: color 150ms ease, background-color 150ms ease;
}

.bgm-icon-button:hover,
.bgm-volume-button:hover {
  color: var(--bgm-primary);
  background: var(--bgm-primary-soft);
}

.bgm-track-list {
  display: grid;
  gap: 3px;
  padding: 9px;
  overflow-y: auto;
  border-bottom: 1px solid var(--bgm-line);
}

.bgm-empty {
  display: grid;
  min-height: 128px;
  place-items: center;
  align-content: center;
  gap: 7px;
  padding: 18px;
  color: var(--bgm-muted);
  text-align: center;
}

.bgm-empty .bgm-icon {
  width: 28px;
  height: 28px;
  margin-bottom: 2px;
}

.bgm-empty strong {
  color: var(--bgm-text);
  font-size: 12px;
}

.bgm-empty small {
  font-size: 10px;
}

.bgm-track {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  color: var(--bgm-text);
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  gap: 10px;
  transition: background-color 150ms ease, border-color 150ms ease;
}

.bgm-track:hover {
  background: var(--bgm-soft);
}

.bgm-track.is-active {
  border-color: var(--bgm-line);
  background: var(--bgm-primary-soft);
}

.bgm-track-number {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--bgm-primary);
  border-radius: 8px;
  background: var(--bgm-solid);
  font-size: 10px;
  font-weight: 800;
}

.bgm-track-copy {
  min-width: 0;
}

.bgm-track-copy strong,
.bgm-track-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bgm-track-copy strong {
  font-size: 12px;
}

.bgm-track-copy small {
  margin-top: 3px;
  color: var(--bgm-muted);
  font-size: 10px;
}

.bgm-track-action {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--bgm-muted);
  border-radius: 50%;
}

.bgm-track.is-active .bgm-track-action {
  color: #ffffff;
  background: var(--bgm-primary);
}

.bgm-track-action .bgm-icon {
  width: 13px;
  height: 13px;
}

.bgm-bars {
  display: none;
  height: 13px;
  align-items: center;
  gap: 2px;
}

.bgm-bars i {
  width: 2px;
  height: 6px;
  border-radius: 99px;
  background: currentColor;
  animation: bgm-bars 0.7s ease-in-out infinite alternate;
}

.bgm-bars i:nth-child(2) {
  animation-delay: -0.25s;
}

.bgm-bars i:nth-child(3) {
  animation-delay: -0.5s;
}

.bgm-track.is-playing .bgm-track-action .bgm-icon {
  display: none;
}

.bgm-track.is-playing .bgm-bars {
  display: flex;
}

.bgm-now-playing {
  padding: 13px 16px 12px;
}

.bgm-now-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.bgm-now-copy {
  min-width: 0;
}

.bgm-now-copy small,
.bgm-now-copy strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bgm-now-copy small {
  color: var(--bgm-muted);
  font-size: 9px;
}

.bgm-now-copy strong {
  margin-top: 3px;
  font-size: 12px;
}

.bgm-time {
  flex: 0 0 auto;
  color: var(--bgm-muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.bgm-progress,
.bgm-volume {
  height: 3px;
  cursor: pointer;
  accent-color: var(--bgm-primary);
}

.bgm-progress {
  width: 100%;
  margin: 13px 0 7px;
}

.bgm-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 23px;
}

.bgm-main-play {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  padding: 0;
  cursor: pointer;
  color: #ffffff;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--bgm-primary-bright), var(--bgm-primary));
  box-shadow: 0 9px 22px rgb(var(--primary-500, 20 184 166) / 0.28);
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.bgm-main-play:hover {
  transform: scale(1.04);
  box-shadow: 0 11px 26px rgb(var(--primary-500, 20 184 166) / 0.36);
}

.bgm-fab:disabled,
.bgm-icon-button:disabled,
.bgm-main-play:disabled,
.bgm-progress:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.bgm-volume-row {
  display: grid;
  margin-top: 12px;
  align-items: center;
  grid-template-columns: 28px minmax(0, 1fr) 24px;
  gap: 8px;
}

.bgm-volume-button {
  width: 28px;
  height: 28px;
}

.bgm-volume-button .bgm-icon {
  width: 16px;
  height: 16px;
}

.bgm-volume-row > span {
  color: var(--bgm-muted);
  font-size: 9px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@keyframes bgm-bars {
  to {
    height: 18px;
  }
}

@media (max-width: 640px) {
  .xihe-bgm-root {
    --bgm-edge-gap: 6px;
    right: calc(env(safe-area-inset-right, 0px) + var(--bgm-edge-gap));
    bottom: max(12px, env(safe-area-inset-bottom));
    left: calc(env(safe-area-inset-left, 0px) + var(--bgm-edge-gap));
  }

  .bgm-fab {
    width: 50px;
    height: 50px;
  }

  .bgm-controls {
    gap: 6px;
  }

  .bgm-panel {
    right: 0;
    bottom: 60px;
    left: 0;
    width: 100%;
    max-height: calc(100dvh - 84px);
    border-radius: 16px;
  }

  .bgm-station-copy small {
    max-width: 180px;
  }

  .bgm-intro {
    padding: 14px;
  }

  .bgm-intro-card {
    width: min(440px, 100%);
    min-height: 0;
    max-height: calc(100dvh - 28px);
    overflow-y: auto;
    grid-template-columns: minmax(0, 1fr);
  }

  .bgm-intro-visual {
    min-height: 180px;
    order: -1;
  }

  .bgm-intro-visual::before {
    display: none;
  }

  .bgm-intro-visual::after {
    background:
      linear-gradient(180deg, rgb(15 12 10 / 0.02) 58%, rgb(20 17 14 / 0.7) 100%),
      linear-gradient(90deg, transparent 72%, rgb(15 12 10 / 0.18));
  }

  .bgm-intro-visual img {
    object-position: 50% 31%;
  }

  .bgm-intro-on-air {
    top: 16px;
    right: 16px;
  }

  .bgm-intro-content {
    padding: 22px 22px 22px;
    background: rgb(20 17 14);
  }

  .bgm-intro h2 {
    margin-top: 24px;
    font-size: clamp(34px, 11vw, 46px);
  }

  .bgm-intro-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .bgm-intro-primary,
  .bgm-intro-secondary {
    width: 100%;
  }

  .bgm-intro-meta {
    margin-top: 19px;
  }

  .bgm-intro-promo {
    flex-wrap: wrap;
    padding: 11px 20px 13px;
    font-size: 10.5px;
    line-height: 1.5;
    row-gap: 8px;
  }

  .bgm-intro-promo-link {
    width: 100%;
    margin-left: 0;
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bgm-controls,
  .bgm-fab,
  .bgm-tooltip,
  .bgm-main-play,
  .bgm-track,
  .bgm-intro,
  .bgm-intro-card {
    transition-duration: 0.001ms;
  }

  .bgm-bars i {
    animation-duration: 0.001ms;
    animation-iteration-count: 1;
  }
}

@media (forced-colors: active) {
  .bgm-intro {
    background: Canvas;
  }

  .bgm-intro-card,
  .bgm-panel,
  .bgm-fab,
  .bgm-hide,
  .bgm-restore,
  .bgm-intro-primary,
  .bgm-intro-secondary,
  .bgm-main-play,
  .bgm-icon-button,
  .bgm-volume-button,
  .bgm-intro-promo-link {
    forced-color-adjust: none;
    color: ButtonText;
    border: 1px solid ButtonText;
    background: ButtonFace;
  }

  .bgm-intro-card {
    width: min(430px, 100%);
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .bgm-intro-promo {
    color: CanvasText;
    border-top: 1px solid ButtonText;
    background: Canvas;
  }

  .bgm-intro-promo-text b,
  .bgm-intro-promo-warn {
    color: CanvasText;
  }

  .bgm-intro-promo-dot {
    background: CanvasText;
  }

  .bgm-intro-live {
    display: none;
  }

  .bgm-intro-visual {
    min-height: 220px;
    order: -1;
    border-bottom: 1px solid ButtonText;
  }

  .bgm-intro-visual::before,
  .bgm-intro-visual::after {
    display: none;
  }

  .bgm-intro-visual img {
    forced-color-adjust: none;
  }

  .bgm-intro-content {
    padding: 34px;
  }

  .bgm-intro-primary,
  .bgm-main-play,
  .bgm-track.is-active .bgm-track-action {
    color: HighlightText;
    background: Highlight;
  }

  .bgm-intro-kicker,
  .bgm-intro-copy,
  .bgm-intro-meta,
  .bgm-station-copy small,
  .bgm-track-copy small,
  .bgm-now-copy small,
  .bgm-time,
  .bgm-volume-row > span {
    color: CanvasText;
  }

  .bgm-fab,
  .bgm-main-play,
  .bgm-station-logo,
  .bgm-track-number {
    forced-color-adjust: none;
    color: HighlightText;
    background: Highlight;
  }

  .bgm-tooltip,
  .bgm-track,
  .bgm-track-list,
  .bgm-now-playing,
  .bgm-panel-head {
    color: CanvasText;
    border-color: CanvasText;
    background: Canvas;
  }

  .bgm-track.is-active {
    border-color: Highlight;
    background: Canvas;
  }

  .bgm-track.is-active .bgm-track-number {
    color: HighlightText;
    background: Highlight;
  }
}
</style>
