export interface BackgroundMusicTrack {
  id: string
  title: string
  mood: string
  description: string
  src: string
  duration?: number
  size?: number
  format?: string
  uploaded?: boolean
  created_at?: string
}

// 曲目由站点运营方提供；替换或新增歌曲时同步更新此清单。
export const backgroundMusicTracks: readonly BackgroundMusicTrack[] = [
  {
    id: 'bu-shao-xin',
    title: '不烧心',
    mood: '短剧氛围',
    description: '阿米toofu',
    src: '/audio/xihe-radio/bgm-01.mp3',
  },
  {
    id: 'qiu-long',
    title: '囚笼',
    mood: '短剧氛围',
    description: '马嘉义',
    src: '/audio/xihe-radio/bgm-02.mp3',
  },
  {
    id: 'amazon',
    title: 'Amazon',
    mood: '节奏氛围',
    description: 'KKK',
    src: '/audio/xihe-radio/bgm-03.mp3',
  },
  {
    id: 'huan-zhou-4',
    title: '幻昼 4.0',
    mood: '情绪氛围',
    description: '渡川',
    src: '/audio/xihe-radio/bgm-04.mp3',
  },
  {
    id: 'life-struggle',
    title: 'Life struggle · 宿命',
    mood: '剧情推进',
    description: 'Mz',
    src: '/audio/xihe-radio/bgm-05.mp3',
  },
  {
    id: 'jing-shen-chuang-shang',
    title: '精神创伤',
    mood: '短剧氛围',
    description: '完整版',
    src: '/audio/xihe-radio/bgm-06.mp3',
  },
  {
    id: 'ban-shou-ren',
    title: '半兽人',
    mood: '热门二创',
    description: '节奏氛围',
    src: '/audio/xihe-radio/bgm-07.mp3',
  },
]

export function shuffleTracks<T>(tracks: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...tracks]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}
