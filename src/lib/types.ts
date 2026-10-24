export interface RadioTrack {
  id: string
  title: string
  mood: string
  description: string
  src: string
  duration?: number
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
}
