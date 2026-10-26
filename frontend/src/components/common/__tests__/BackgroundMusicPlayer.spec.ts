import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import BackgroundMusicPlayer from '../BackgroundMusicPlayer.vue'
import { backgroundMusicTracks } from '../backgroundMusicTracks'
import { listTracks, type RadioTrack } from '@/api/radio'

vi.mock('@/api/radio', () => ({
  listTracks: vi.fn(),
}))

const STORAGE_KEY = 'xihe-bgm-player-v1'
const mockedListTracks = vi.mocked(listTracks)

function uploadedTrack(id: string, title = `Uploaded ${id}`): RadioTrack {
  return {
    id,
    title,
    mood: '本地上传',
    description: 'audio/mpeg',
    src: `/api/v1/radio/files/${id}`,
    uploaded: true,
  }
}

describe('BackgroundMusicPlayer', () => {
  let wrapper: VueWrapper | undefined
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockedListTracks.mockReset()
    mockedListTracks.mockResolvedValue(
      backgroundMusicTracks.map((track) => ({ ...track, uploaded: false })),
    )
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  async function mountPlayer() {
    wrapper = mount(BackgroundMusicPlayer, { attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  it('keeps play/pause, playlist, and hide buttons next to each other', async () => {
    await mountPlayer()

    const controls = document.body.querySelector('.bgm-controls')
    const buttons = Array.from(controls?.querySelectorAll('button') ?? [])

    expect(buttons).toHaveLength(3)
    expect(buttons[0]?.getAttribute('data-testid')).toBe('bgm-toggle')
    expect(buttons[1]?.getAttribute('data-testid')).toBe('bgm-open')
    expect(buttons[2]?.getAttribute('data-testid')).toBe('bgm-hide')
  })

  it('starts playback from the adjacent play button', async () => {
    await mountPlayer()

    document.body.querySelector<HTMLButtonElement>('[data-testid="bgm-toggle"]')?.click()
    await flushPromises()

    expect(playSpy).toHaveBeenCalledTimes(1)
  })

  it('presents the branded intro artwork without a licensing notice', async () => {
    await mountPlayer()

    const intro = document.body.querySelector('[data-testid="bgm-intro"]')
    expect(intro).not.toBeNull()
    expect(intro?.querySelector('img')).not.toBeNull()
    expect(intro?.querySelector('img')?.getAttribute('src')).toBe(
      '/brand/xihe-radio/xihe-radio-portrait.webp?v=20261024-r90',
    )
    expect(intro?.textContent).not.toContain('曲目由站点运营方提供')
  })

  it('hides every control and restores them from the narrow music tab', async () => {
    await mountPlayer()

    document.body.querySelector<HTMLButtonElement>('[data-testid="bgm-hide"]')?.click()
    await flushPromises()

    const restore = document.body.querySelector<HTMLButtonElement>('[data-testid="bgm-restore"]')
    expect(restore?.hidden).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').controlsHidden).toBe(true)

    restore?.click()
    await flushPromises()

    expect(restore?.hidden).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').controlsHidden).toBe(false)
  })

  it('advances to the next shuffled track when the current track ends', async () => {
    await mountPlayer()
    const audio = document.body.querySelector('audio') as HTMLAudioElement
    const firstSource = audio.getAttribute('src')

    audio.dispatchEvent(new Event('ended'))
    await flushPromises()

    expect(audio.getAttribute('src')).not.toBe(firstSource)
    expect(playSpy).toHaveBeenCalled()
  })

  it('starts a fresh shuffled queue after the last track ends', async () => {
    await mountPlayer()
    const audio = document.body.querySelector('audio') as HTMLAudioElement
    const trackButtons = document.body.querySelectorAll<HTMLButtonElement>('.bgm-track')
    trackButtons[trackButtons.length - 1]?.click()
    await flushPromises()

    const lastSource = audio.getAttribute('src')
    audio.dispatchEvent(new Event('ended'))
    await flushPromises()

    expect(audio.getAttribute('src')).not.toBe(lastSource)
    expect(playSpy).toHaveBeenCalled()
  })

  it('uses a fresh random order whenever the player is mounted', async () => {
    let randomCall = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      randomCall += 1
      return randomCall <= 3 ? 0 : 0.9
    })

    const firstPlayer = await mountPlayer()
    const firstSource = document.body.querySelector('audio')?.getAttribute('src')
    firstPlayer.unmount()
    wrapper = undefined
    document.body.innerHTML = ''

    await mountPlayer()
    const secondSource = document.body.querySelector('audio')?.getAttribute('src')

    expect(secondSource).not.toBe(firstSource)
  })

  it('falls back to bundled tracks when the playlist request fails', async () => {
    mockedListTracks.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountPlayer()

    expect(document.body.querySelectorAll('.bgm-track')).toHaveLength(
      backgroundMusicTracks.length,
    )
    expect(document.body.querySelector('[data-testid="bgm-empty"]')).toBeNull()
  })

  it('shows an empty state and disables playback for an empty playlist', async () => {
    mockedListTracks.mockResolvedValue([])
    await mountPlayer()

    const playButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="bgm-toggle"]',
    )
    expect(document.body.querySelector('[data-testid="bgm-empty"]')).not.toBeNull()
    expect(playButton?.disabled).toBe(true)

    playButton?.click()
    await flushPromises()

    expect(playSpy).not.toHaveBeenCalled()
  })

  it('reloads the playlist and keeps the current track after a library update', async () => {
    await mountPlayer()
    const audio = document.body.querySelector('audio') as HTMLAudioElement
    const firstSource = audio.getAttribute('src')

    mockedListTracks.mockResolvedValueOnce([
      ...backgroundMusicTracks.map((track) => ({ ...track, uploaded: false })),
      uploadedTrack('new-track', 'New upload'),
    ])
    window.dispatchEvent(
      new CustomEvent('xihe-radio-updated', { detail: { uploaded: true } }),
    )
    await flushPromises()

    expect(mockedListTracks).toHaveBeenCalledTimes(2)
    expect(document.body.querySelectorAll('.bgm-track')).toHaveLength(
      backgroundMusicTracks.length + 1,
    )
    expect(audio.getAttribute('src')).toBe(firstSource)
  })

  it('switches to the next available track when the current track is deleted', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    mockedListTracks.mockResolvedValueOnce([
      uploadedTrack('first', 'First'),
      uploadedTrack('second', 'Second'),
    ])
    await mountPlayer()
    const audio = document.body.querySelector('audio') as HTMLAudioElement
    const firstSource = audio.getAttribute('src')

    mockedListTracks.mockResolvedValueOnce([uploadedTrack('second', 'Second')])
    window.dispatchEvent(
      new CustomEvent('xihe-radio-updated', { detail: { deletedId: 'first' } }),
    )
    await flushPromises()

    expect(audio.getAttribute('src')).not.toBe(firstSource)
    expect(audio.getAttribute('src')).toBe('/api/v1/radio/files/second')
  })

  it('keeps the current track, position, and playback state when another track is deleted', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    mockedListTracks.mockResolvedValueOnce([
      uploadedTrack('first', 'First'),
      uploadedTrack('second', 'Second'),
    ])
    await mountPlayer()
    const audio = document.body.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'paused', { configurable: true, value: false })
    audio.dispatchEvent(new Event('play'))
    audio.currentTime = 42
    await flushPromises()

    mockedListTracks.mockResolvedValueOnce([uploadedTrack('first', 'First')])
    window.dispatchEvent(
      new CustomEvent('xihe-radio-updated', { detail: { deletedId: 'second' } }),
    )
    await flushPromises()

    expect(audio.getAttribute('src')).toBe('/api/v1/radio/files/first')
    expect(audio.currentTime).toBe(42)
    expect(audio.paused).toBe(false)
    expect(playSpy).toHaveBeenCalledTimes(0)
  })

  it('pins the player and hidden tab to the viewport edge', async () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'src/components/common/BackgroundMusicPlayer.vue'),
      'utf8',
    )

    expect(styles).toMatch(
      /\.xihe-bgm-root\s*\{[^}]*--bgm-edge-gap:\s*8px;[^}]*right:\s*calc\(env\(safe-area-inset-right,\s*0px\)\s*\+\s*var\(--bgm-edge-gap\)\)/s,
    )
    expect(styles).toMatch(
      /\.bgm-restore\s*\{[^}]*right:\s*0;[^}]*width:\s*52px;[^}]*height:\s*52px;[^}]*border-right:\s*0;/s,
    )
    expect(styles).toMatch(
      /@media \(max-width: 640px\)\s*\{[\s\S]*?\.xihe-bgm-root\s*\{[^}]*--bgm-edge-gap:\s*6px;[^}]*right:\s*calc\(env\(safe-area-inset-right,\s*0px\)\s*\+\s*var\(--bgm-edge-gap\)\)/,
    )
    expect(styles).toMatch(
      /\.xihe-bgm-root\.is-hidden\s*\{[^}]*pointer-events:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.xihe-bgm-root\.is-hidden\s+\.bgm-restore\s*\{[^}]*pointer-events:\s*auto;/s,
    )
  })
})
