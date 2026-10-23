import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import Sub2ApiRadio from '../src/components/Sub2ApiRadio.vue'
import type { RadioTrack } from '../src/lib/types'

const tracks: RadioTrack[] = [
  {
    id: 'one',
    title: 'First signal',
    mood: 'Focus',
    description: 'Test track one',
    src: '/one.wav',
    duration: 24,
  },
  {
    id: 'two',
    title: 'Second signal',
    mood: 'Calm',
    description: 'Test track two',
    src: '/two.wav',
    duration: 18,
  },
]

describe('Sub2ApiRadio', () => {
  let wrapper: VueWrapper | undefined
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
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

  function mountPlayer() {
    wrapper = mount(Sub2ApiRadio, {
      attachTo: document.body,
      props: {
        tracks,
        stationName: 'Test Radio',
        storageKey: 'test-radio',
      },
    })
    return wrapper
  }

  it('keeps play, playlist, and hide controls next to each other', () => {
    mountPlayer()

    const controls = document.body.querySelector('.radio-controls')
    const buttons = Array.from(controls?.querySelectorAll('button') ?? [])

    expect(buttons).toHaveLength(3)
    expect(buttons[0]?.getAttribute('data-testid')).toBe('radio-toggle')
    expect(buttons[1]?.getAttribute('data-testid')).toBe('radio-open')
    expect(buttons[2]?.getAttribute('data-testid')).toBe('radio-hide')
  })

  it('starts playback from the adjacent play button', async () => {
    mountPlayer()

    document.body.querySelector<HTMLButtonElement>('[data-testid="radio-toggle"]')?.click()
    await flushPromises()

    expect(playSpy).toHaveBeenCalledTimes(1)
  })

  it('hides all controls and restores them from the narrow tab', async () => {
    mountPlayer()

    document.body.querySelector<HTMLButtonElement>('[data-testid="radio-hide"]')?.click()
    await flushPromises()

    const restore = document.body.querySelector<HTMLButtonElement>('[data-testid="radio-restore"]')
    expect(restore?.hidden).toBe(false)
    expect(JSON.parse(localStorage.getItem('test-radio') || '{}').controlsHidden).toBe(true)

    restore?.click()
    await flushPromises()

    expect(restore?.hidden).toBe(true)
    expect(JSON.parse(localStorage.getItem('test-radio') || '{}').controlsHidden).toBe(false)
  })

  it('moves to another track and starts it', async () => {
    mountPlayer()
    const audio = document.body.querySelector('audio') as HTMLAudioElement
    const firstSource = audio.getAttribute('src')

    document.body.querySelector<HTMLButtonElement>('[aria-label="下一首"]')?.click()
    await flushPromises()

    expect(audio.getAttribute('src')).not.toBe(firstSource)
    expect(playSpy).toHaveBeenCalled()
  })

  it('uses the dark theme class when requested', async () => {
    wrapper = mount(Sub2ApiRadio, {
      attachTo: document.body,
      props: {
        tracks,
        theme: 'dark',
      },
    })
    await flushPromises()

    expect(document.body.querySelector('.sub2api-radio')?.classList.contains('is-dark')).toBe(true)
  })

  it('opens the panel through the exposed open method', async () => {
    const player = mountPlayer()

    ;(player.vm as unknown as { open: () => void }).open()
    await flushPromises()

    expect(
      document.body.querySelector('.sub2api-radio')?.classList.contains('is-open'),
    ).toBe(true)
  })
})
