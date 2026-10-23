import sampleThemeUrl from '../assets/night-signal.wav?url'
import type { RadioTrack } from '../lib/types'

export const sampleTracks: readonly RadioTrack[] = [
  {
    id: 'night-signal',
    title: '夜航信号',
    mood: '深夜专注',
    description: '原创合成氛围 · 24 秒示例',
    src: sampleThemeUrl,
    duration: 24,
  },
]
