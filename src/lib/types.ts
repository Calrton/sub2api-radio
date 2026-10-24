export interface RadioTrack {
  id: string
  title: string
  mood: string
  description: string
  src: string
  duration?: number
}

export interface RadioPromo {
  /** 前缀标签，通常是站点名 */
  label?: string
  /** 价格或卖点条目，渲染为「A / B / C」 */
  items?: string[]
  /** 括号内的补充说明，例如「需魔法」 */
  note?: string
  /** 右侧按钮文字 */
  linkLabel?: string
  /** 右侧按钮链接；不填则只显示文字条 */
  linkHref?: string
}

export interface RadioIntro {
  title: string
  description: string
  imageSrc?: string
  imageAlt?: string
  kicker?: string
  primaryLabel?: string
  secondaryLabel?: string
  meta?: string
  /** 可选推广条，显示在首次进入卡片底部；不传则不渲染 */
  promo?: RadioPromo
}
