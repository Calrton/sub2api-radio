<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  deleteTrack,
  listAdminTracks,
  uploadTrack,
  type RadioLibraryStats,
  type RadioTrack,
} from '@/api/radio'
import Icon from '@/components/icons/Icon.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const { t } = useI18n()
const tracks = ref<RadioTrack[]>([])
const stats = ref<RadioLibraryStats>({
  tracks: 0,
  total_bytes: 0,
  max_tracks: 100,
  max_bytes: 1024 * 1024 * 1024,
  max_track_bytes: 100 * 1024 * 1024,
})
const loading = ref(true)
const uploading = ref(false)
const uploadPercent = ref(0)
const loadError = ref('')
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const previewTrack = ref<RadioTrack | null>(null)
const previewAudio = ref<HTMLAudioElement | null>(null)
const pendingDelete = ref<RadioTrack | null>(null)
const deleting = ref(false)
const deleteError = ref('')
const uploadController = ref<AbortController | null>(null)

const usagePercent = computed(() => {
  if (!stats.value.max_bytes) return 0
  return Math.min(100, Math.round((stats.value.total_bytes / stats.value.max_bytes) * 100))
})

const canUpload = computed(
  () =>
    !loading.value &&
    !uploading.value &&
    !deleting.value &&
    stats.value.tracks < stats.value.max_tracks,
)

function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return '0 MB'
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Number((bytes / (1024 * 1024 * 1024)).toFixed(2))} GB`
  }
  return `${Number((bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1))} MB`
}

function apiError(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return message
  }
  return fallback
}

function stopPreview() {
  previewAudio.value?.pause()
  if (previewAudio.value) {
    previewAudio.value.currentTime = 0
  }
  previewTrack.value = null
}

async function loadLibrary() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await listAdminTracks()
    tracks.value = response.tracks
    stats.value = response.stats
  } catch (error) {
    loadError.value = apiError(error, t('admin.settings.radioLibrary.loadFailed'))
  } finally {
    loading.value = false
  }
}

function openFilePicker() {
  if (!canUpload.value) return
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploadError.value = ''
  if (file.size > stats.value.max_track_bytes) {
    uploadError.value = t('admin.settings.radioLibrary.trackTooLarge', {
      size: formatBytes(stats.value.max_track_bytes),
    })
    return
  }
  if (stats.value.tracks >= stats.value.max_tracks) {
    uploadError.value = t('admin.settings.radioLibrary.trackLimit', {
      count: stats.value.max_tracks,
    })
    return
  }
  if (stats.value.total_bytes + file.size > stats.value.max_bytes) {
    uploadError.value = t('admin.settings.radioLibrary.libraryLimit', {
      size: formatBytes(stats.value.max_bytes),
    })
    return
  }

  uploading.value = true
  uploadPercent.value = 0
  uploadController.value = new AbortController()
  try {
    await uploadTrack(file, {
      signal: uploadController.value.signal,
      onUploadProgress: (percent) => {
        uploadPercent.value = percent
      },
    })
    await loadLibrary()
    window.dispatchEvent(
      new CustomEvent('xihe-radio-updated', {
        detail: { uploaded: true },
      }),
    )
  } catch (error) {
    uploadError.value = apiError(error, t('admin.settings.radioLibrary.uploadFailed'))
  } finally {
    uploading.value = false
    uploadController.value = null
  }
}

function requestDelete(track: RadioTrack) {
  stopPreview()
  deleteError.value = ''
  pendingDelete.value = track
}

async function confirmDelete() {
  const track = pendingDelete.value
  if (!track || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteTrack(track.id)
    pendingDelete.value = null
    await loadLibrary()
    window.dispatchEvent(
      new CustomEvent('xihe-radio-updated', {
        detail: { deletedId: track.id },
      }),
    )
  } catch (error) {
    deleteError.value = apiError(error, t('admin.settings.radioLibrary.deleteFailed'))
  } finally {
    deleting.value = false
  }
}

function togglePreview(track: RadioTrack) {
  if (previewTrack.value?.id === track.id) {
    stopPreview()
    return
  }
  stopPreview()
  previewTrack.value = track
  void nextTick(() => {
    previewAudio.value?.play().catch(() => {
      stopPreview()
    })
  })
}

onMounted(() => {
  void loadLibrary()
})

onBeforeUnmount(() => {
  uploadController.value?.abort()
  stopPreview()
})
</script>

<template>
  <section class="card overflow-hidden" data-testid="radio-library">
    <header class="border-b border-gray-100 px-6 py-5 dark:border-dark-700">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
          >
            <Icon name="music" size="md" />
          </span>
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('admin.settings.radioLibrary.title') }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.settings.radioLibrary.description') }}
            </p>
          </div>
        </div>
        <button
          class="btn btn-primary"
          type="button"
          data-testid="radio-upload"
          :disabled="!canUpload"
          @click="openFilePicker"
        >
          <Icon name="upload" size="sm" />
          {{ uploading ? t('admin.settings.radioLibrary.uploading') : t('admin.settings.radioLibrary.upload') }}
        </button>
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept=".mp3,.ogg,.wav,.m4a,audio/mpeg,audio/ogg,audio/wav,audio/mp4"
          data-testid="radio-file-input"
          @change="handleFileChange"
        />
      </div>
    </header>

    <div class="space-y-5 p-6">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-dark-700">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
            {{ t('admin.settings.radioLibrary.trackCount') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
            {{ stats.tracks }} / {{ stats.max_tracks }}
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-dark-700">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
            {{ t('admin.settings.radioLibrary.storageUsed') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
            {{ formatBytes(stats.total_bytes) }} / {{ formatBytes(stats.max_bytes) }}
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-dark-700">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
            {{ t('admin.settings.radioLibrary.trackLimitLabel') }}
          </p>
          <p class="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
            {{ formatBytes(stats.max_track_bytes) }}
          </p>
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{{ t('admin.settings.radioLibrary.storageUsage') }}</span>
          <span>{{ usagePercent }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
          <div
            class="h-full rounded-full bg-primary-500 transition-all"
            :style="{ width: `${usagePercent}%` }"
          ></div>
        </div>
      </div>

      <div
        v-if="uploading"
        class="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 dark:border-primary-800 dark:bg-primary-900/20"
      >
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-primary-700 dark:text-primary-300">
            {{ t('admin.settings.radioLibrary.uploading') }}
          </span>
          <span class="font-semibold text-primary-700 dark:text-primary-300">{{ uploadPercent }}%</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900/50">
          <div class="h-full bg-primary-500 transition-all" :style="{ width: `${uploadPercent}%` }"></div>
        </div>
      </div>

      <div
        v-if="loadError"
        class="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        role="alert"
      >
        <span>{{ loadError }}</span>
        <button class="font-semibold underline" type="button" @click="loadLibrary">
          {{ t('admin.settings.radioLibrary.retry') }}
        </button>
      </div>
      <p
        v-if="uploadError"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        role="alert"
      >
        {{ uploadError }}
      </p>

      <div v-if="loading" class="grid gap-3" aria-busy="true">
        <div v-for="index in 3" :key="index" class="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-700"></div>
      </div>

      <div
        v-else-if="tracks.length === 0"
        class="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center dark:border-dark-600"
      >
        <Icon name="music" size="xl" class="mx-auto text-gray-300 dark:text-dark-500" />
        <p class="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('admin.settings.radioLibrary.empty') }}
        </p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {{ t('admin.settings.radioLibrary.emptyHint') }}
        </p>
      </div>

      <div v-else class="overflow-hidden rounded-lg border border-gray-200 dark:border-dark-700">
        <div
          v-for="(track, index) in tracks"
          :key="track.id"
          class="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-dark-700"
          data-testid="radio-track-row"
        >
          <span class="w-7 shrink-0 text-xs font-semibold text-gray-400">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">{{ track.title }}</p>
              <span
                v-if="track.uploaded"
                class="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
              >
                {{ t('admin.settings.radioLibrary.uploadedBadge') }}
              </span>
            </div>
            <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {{ track.mood }} · {{ track.description }}
              <span v-if="track.size"> · {{ formatBytes(track.size) }}</span>
            </p>
          </div>
          <audio v-if="previewTrack?.id === track.id" ref="previewAudio" :src="track.src" preload="metadata"></audio>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            :aria-label="previewTrack?.id === track.id ? t('admin.settings.radioLibrary.stopPreview') : t('admin.settings.radioLibrary.preview')"
            @click="togglePreview(track)"
          >
            <Icon :name="previewTrack?.id === track.id ? 'pause' : 'play'" size="xs" />
            <span class="hidden sm:inline">
              {{ previewTrack?.id === track.id ? t('admin.settings.radioLibrary.stopPreview') : t('admin.settings.radioLibrary.preview') }}
            </span>
          </button>
          <button
            class="btn btn-secondary btn-sm text-red-600 dark:text-red-400"
            type="button"
            :aria-label="t('admin.settings.radioLibrary.delete')"
            data-testid="radio-delete"
            :disabled="deleting"
            @click="requestDelete(track)"
          >
            <Icon name="trash" size="xs" />
            <span class="hidden sm:inline">{{ t('admin.settings.radioLibrary.delete') }}</span>
          </button>
        </div>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ t('admin.settings.radioLibrary.formats') }}
      </p>
      <p
        v-if="deleteError"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        role="alert"
      >
        {{ deleteError }}
      </p>
    </div>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      :title="t('admin.settings.radioLibrary.deleteTitle')"
      :message="t('admin.settings.radioLibrary.deleteConfirm', { name: pendingDelete?.title || '' })"
      :confirm-text="t('admin.settings.radioLibrary.delete')"
      danger
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </section>
</template>
