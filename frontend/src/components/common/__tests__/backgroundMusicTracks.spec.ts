import { describe, expect, it, vi } from 'vitest'
import { backgroundMusicTracks, shuffleTracks } from '../backgroundMusicTracks'

describe('backgroundMusicTracks', () => {
  it('shuffles without dropping or duplicating tracks', () => {
    const shuffled = shuffleTracks(backgroundMusicTracks, () => 0)

    expect(shuffled).toHaveLength(backgroundMusicTracks.length)
    expect(new Set(shuffled.map((track) => track.id))).toEqual(
      new Set(backgroundMusicTracks.map((track) => track.id)),
    )
  })

  it('does not mutate the source playlist', () => {
    const originalOrder = backgroundMusicTracks.map((track) => track.id)

    shuffleTracks(backgroundMusicTracks, () => 0.75)

    expect(backgroundMusicTracks.map((track) => track.id)).toEqual(originalOrder)
  })

  it('uses the injected random source for a deterministic order', () => {
    const random = vi.fn().mockReturnValue(0)

    expect(shuffleTracks([1, 2, 3, 4], random)).toEqual([2, 3, 4, 1])
    expect(random).toHaveBeenCalledTimes(3)
  })
})
