import { describe, expect, it, vi } from 'vitest'
import { shuffleTracks } from '../src/lib/shuffle'

describe('shuffleTracks', () => {
  it('keeps every item exactly once', () => {
    const source = ['one', 'two', 'three', 'four']
    const shuffled = shuffleTracks(source, () => 0)

    expect(shuffled).toHaveLength(source.length)
    expect(new Set(shuffled)).toEqual(new Set(source))
  })

  it('does not mutate the source array', () => {
    const source = [1, 2, 3, 4]
    shuffleTracks(source, () => 0.75)

    expect(source).toEqual([1, 2, 3, 4])
  })

  it('uses the injected random source', () => {
    const random = vi.fn().mockReturnValue(0)

    expect(shuffleTracks([1, 2, 3, 4], random)).toEqual([2, 3, 4, 1])
    expect(random).toHaveBeenCalledTimes(3)
  })
})
