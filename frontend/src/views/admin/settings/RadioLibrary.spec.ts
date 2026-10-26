import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import RadioLibrary from './RadioLibrary.vue'
import {
  deleteTrack,
  listAdminTracks,
  uploadTrack,
  type RadioLibraryStats,
  type RadioTrack,
} from '@/api/radio'

vi.mock('@/api/radio', () => ({
  listAdminTracks: vi.fn(),
  uploadTrack: vi.fn(),
  deleteTrack: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

const mockedListAdminTracks = vi.mocked(listAdminTracks)
const mockedUploadTrack = vi.mocked(uploadTrack)
const mockedDeleteTrack = vi.mocked(deleteTrack)

const stats: RadioLibraryStats = {
  tracks: 7,
  total_bytes: 0,
  max_tracks: 100,
  max_bytes: 1024 * 1024 * 1024,
  max_track_bytes: 100 * 1024 * 1024,
}

function track(id: string, uploaded = true): RadioTrack {
  return {
    id,
    title: `Track ${id}`,
    mood: '本地上传',
    description: 'audio/mpeg',
    src: `/api/v1/radio/files/${id}`,
    size: 2 * 1024 * 1024,
    format: 'mp3',
    uploaded,
  }
}

describe('RadioLibrary', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    mockedListAdminTracks.mockReset()
    mockedUploadTrack.mockReset()
    mockedDeleteTrack.mockReset()
    mockedListAdminTracks.mockResolvedValue({ tracks: [track('uploaded')], stats })
    mockedUploadTrack.mockResolvedValue(track('new-track'))
    mockedDeleteTrack.mockResolvedValue()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  async function mountLibrary() {
    wrapper = mount(RadioLibrary, {
      attachTo: document.body,
      global: {
        stubs: {
          ConfirmDialog: {
            props: ['show', 'title', 'message', 'confirmText'],
            emits: ['confirm', 'cancel'],
            template:
              '<div v-if="show" data-testid="confirm"><button data-testid="confirm-delete" @click="$emit(\'confirm\')">confirm</button></div>',
          },
        },
      },
    })
    await flushPromises()
    return wrapper
  }

  it('shows the configured limits and current usage', async () => {
    const mounted = await mountLibrary()

    expect(mounted.text()).toContain('7 / 100')
    expect(mounted.text()).toContain('0 MB / 1 GB')
    expect(mounted.text()).toContain('100 MB')
  })

  it('uploads a file, reports progress, refreshes, and broadcasts the update', async () => {
    const updateListener = vi.fn()
    window.addEventListener('xihe-radio-updated', updateListener)
    mockedUploadTrack.mockImplementation(async (_file, options) => {
      options.onUploadProgress?.(52)
      await Promise.resolve()
      return track('new-track')
    })
    const mounted = await mountLibrary()
    const input = mounted.get('[data-testid="radio-file-input"]')
    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' })

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    })
    await input.trigger('change')
    await flushPromises()

    expect(mockedUploadTrack).toHaveBeenCalledWith(file, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
    expect(mockedListAdminTracks).toHaveBeenCalledTimes(2)
    expect(updateListener).toHaveBeenCalledTimes(1)
    window.removeEventListener('xihe-radio-updated', updateListener)
  })

  it('rejects a file over the per-track limit before uploading', async () => {
    const mounted = await mountLibrary()
    const input = mounted.get('[data-testid="radio-file-input"]')
    const file = new File(['audio'], 'large.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 + 1 })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    })

    await input.trigger('change')

    expect(mockedUploadTrack).not.toHaveBeenCalled()
    expect(mounted.text()).toContain('trackTooLarge')
  })

  it('rejects uploads at the track limit', async () => {
    mockedListAdminTracks.mockResolvedValue({
      tracks: Array.from({ length: 100 }, (_, index) => track(`track-${index}`)),
      stats: { ...stats, tracks: 100 },
    })
    const mounted = await mountLibrary()
    const input = mounted.get('[data-testid="radio-file-input"]')
    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    })

    await input.trigger('change')

    expect(mockedUploadTrack).not.toHaveBeenCalled()
    expect(mounted.text()).toContain('trackLimit')
  })

  it('rejects uploads that would exceed total library storage', async () => {
    mockedListAdminTracks.mockResolvedValue({
      tracks: [track('uploaded')],
      stats: { ...stats, total_bytes: 1024 * 1024 * 1024 - 100 },
    })
    const mounted = await mountLibrary()
    const input = mounted.get('[data-testid="radio-file-input"]')
    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(file, 'size', { value: 101 })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    })

    await input.trigger('change')

    expect(mockedUploadTrack).not.toHaveBeenCalled()
    expect(mounted.text()).toContain('libraryLimit')
  })

  it('confirms deletion and broadcasts the deleted track id', async () => {
    const updateListener = vi.fn()
    window.addEventListener('xihe-radio-updated', updateListener)
    const mounted = await mountLibrary()

    await mounted.get('[data-testid="radio-delete"]').trigger('click')
    await mounted.get('[data-testid="confirm-delete"]').trigger('click')

    expect(mockedDeleteTrack).toHaveBeenCalledWith('uploaded')
    expect(updateListener).toHaveBeenCalledTimes(1)
    expect((updateListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      deletedId: 'uploaded',
    })
    window.removeEventListener('xihe-radio-updated', updateListener)
  })

  it('allows bundled tracks to be deleted', async () => {
    mockedListAdminTracks.mockResolvedValue({
      tracks: [track('bu-shao-xin', false)],
      stats,
    })
    const mounted = await mountLibrary()

    await mounted.get('[data-testid="radio-delete"]').trigger('click')
    await mounted.get('[data-testid="confirm-delete"]').trigger('click')

    expect(mockedDeleteTrack).toHaveBeenCalledWith('bu-shao-xin')
  })

  it('shows load, upload, and delete errors', async () => {
    mockedListAdminTracks.mockRejectedValueOnce(new Error('load failed'))
    const mounted = await mountLibrary()
    expect(mounted.text()).toContain('load failed')

    mockedListAdminTracks.mockResolvedValue({ tracks: [track('uploaded')], stats })
    await mounted.get('.font-semibold.underline').trigger('click')
    await flushPromises()

    mockedUploadTrack.mockRejectedValueOnce(new Error('upload failed'))
    const input = mounted.get('[data-testid="radio-file-input"]')
    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    })
    await input.trigger('change')
    expect(mounted.text()).toContain('upload failed')

    mockedDeleteTrack.mockRejectedValueOnce(new Error('delete failed'))
    await mounted.get('[data-testid="radio-delete"]').trigger('click')
    await mounted.get('[data-testid="confirm-delete"]').trigger('click')
    expect(mounted.text()).toContain('delete failed')
  })
})
