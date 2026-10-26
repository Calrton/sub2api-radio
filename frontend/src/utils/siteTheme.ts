export const DEFAULT_SITE_PRIMARY_COLOR = '#B06F30'
export const DEFAULT_DARK_BORDER_MODE: DarkBorderMode = 'accent'
export const DEFAULT_SITE_FONT_FAMILY: SiteFontFamily = 'system'
export const DEFAULT_SITE_FONT_SCALE = 100
export const DEFAULT_SITE_TEXT_COLOR_LIGHT = '#111827'
export const DEFAULT_SITE_TEXT_COLOR_DARK = '#F3F4F6'
export const MIN_SITE_FONT_SCALE = 85
export const MAX_SITE_FONT_SCALE = 115

export type DarkBorderMode = 'white' | 'neutral' | 'accent'
export type SiteFontFamily = 'system' | 'geist' | 'microsoft-yahei'

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const STORAGE_KEY = 'xihe-site-theme-v1'
const SITE_FONT_FAMILIES: ReadonlySet<string> = new Set([
  'system',
  'geist',
  'microsoft-yahei',
])

export const SITE_FONT_OPTIONS: ReadonlyArray<{
  value: SiteFontFamily
  label: string
}> = [
  { value: 'system', label: '系统 UI' },
  { value: 'geist', label: 'Geist' },
  { value: 'microsoft-yahei', label: '微软雅黑' },
]

export const DARK_BORDER_OPTIONS: ReadonlyArray<{
  value: DarkBorderMode
  label: string
}> = [
  { value: 'white', label: '原白色' },
  { value: 'neutral', label: '中性灰' },
  { value: 'accent', label: '跟随主色' },
]

export function normalizeHexColor(value: unknown, fallback = DEFAULT_SITE_PRIMARY_COLOR): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toUpperCase()
  return HEX_COLOR_PATTERN.test(normalized) ? normalized : fallback
}

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value.trim())
}

export function normalizeDarkBorderMode(
  value: unknown,
  fallback: DarkBorderMode = DEFAULT_DARK_BORDER_MODE,
): DarkBorderMode {
  return value === 'white' || value === 'neutral' || value === 'accent' ? value : fallback
}

export function normalizeSiteFontFamily(
  value: unknown,
  fallback: SiteFontFamily = DEFAULT_SITE_FONT_FAMILY,
): SiteFontFamily {
  return typeof value === 'string' && SITE_FONT_FAMILIES.has(value)
    ? value as SiteFontFamily
    : fallback
}

export function normalizeSiteFontScale(
  value: unknown,
  fallback: number = DEFAULT_SITE_FONT_SCALE,
): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(MAX_SITE_FONT_SCALE, Math.max(MIN_SITE_FONT_SCALE, Math.round(numeric)))
}

export function resolveSiteFontStack(fontFamily: SiteFontFamily): string {
  if (fontFamily === 'geist') {
    return '"Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
  }
  if (fontFamily === 'microsoft-yahei') {
    return '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", system-ui, -apple-system, sans-serif'
  }
  return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex).slice(1)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

function rgbToHex(red: number, green: number, blue: number): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase()
}

function mixHexColors(base: string, target: string, baseWeight: number): string {
  const [baseRed, baseGreen, baseBlue] = hexToRgb(base)
  const [targetRed, targetGreen, targetBlue] = hexToRgb(target)
  const weight = Math.min(100, Math.max(0, baseWeight)) / 100
  return rgbToHex(
    baseRed * weight + targetRed * (1 - weight),
    baseGreen * weight + targetGreen * (1 - weight),
    baseBlue * weight + targetBlue * (1 - weight),
  )
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0

  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
  }

  hue = Math.round(hue * 60)
  if (hue < 0) hue += 360
  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return [hue, saturation * 100, lightness * 100]
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const segment = (((hue % 360) + 360) % 360) / 60
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0

  if (segment < 1) [red, green] = [chroma, secondary]
  else if (segment < 2) [red, green] = [secondary, chroma]
  else if (segment < 3) [green, blue] = [chroma, secondary]
  else if (segment < 4) [green, blue] = [secondary, chroma]
  else if (segment < 5) [red, blue] = [secondary, chroma]
  else [red, blue] = [chroma, secondary]

  const match = l - chroma / 2
  return [(red + match) * 255, (green + match) * 255, (blue + match) * 255]
}

export function buildPrimaryPalette(hex: string): Record<string, string> {
  const [red, green, blue] = hexToRgb(hex)
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue)
  const steps: Record<string, number> = {
    50: 97,
    100: 94,
    200: 86,
    300: 76,
    400: 66,
    500: Math.min(65, Math.max(35, lightness)),
    600: Math.min(56, Math.max(29, lightness - 8)),
    700: Math.min(46, Math.max(23, lightness - 16)),
    800: Math.min(37, Math.max(18, lightness - 24)),
    900: Math.min(29, Math.max(14, lightness - 31)),
    950: Math.min(20, Math.max(9, lightness - 39)),
  }

  return Object.fromEntries(
    Object.entries(steps).map(([step, stepLightness]) => {
      const adjustedSaturation = Number(step) <= 100
        ? Math.min(saturation, 82)
        : Number(step) >= 900
          ? Math.min(saturation, 65)
          : saturation
      return [step, rgbToHex(...hslToRgb(hue, adjustedSaturation, stepLightness))]
    }),
  )
}

function hexToRgbChannels(hex: string): string {
  return hexToRgb(hex).join(' ')
}

function resolveDarkBorderRgb(mode: DarkBorderMode, primaryColor: string): string {
  if (mode === 'white') return '255 255 255'
  if (mode === 'neutral') return '148 163 184'
  const [, saturation, lightness] = rgbToHsl(...hexToRgb(primaryColor))
  const [red, green, blue] = hslToRgb(
    rgbToHsl(...hexToRgb(primaryColor))[0],
    Math.min(78, Math.max(38, saturation)),
    Math.min(72, Math.max(52, lightness + 16)),
  )
  return `${red} ${green} ${blue}`
}

export interface SiteTheme {
  primaryColor: string
  darkBorderMode: DarkBorderMode
  fontFamily: SiteFontFamily
  fontScale: number
  textColorLight: string
  textColorDark: string
}

export function resolveSiteTheme(
  primaryColor?: unknown,
  darkBorderMode?: unknown,
  fontFamily?: unknown,
  fontScale?: unknown,
  textColorLight?: unknown,
  textColorDark?: unknown,
): SiteTheme {
  return {
    primaryColor: normalizeHexColor(primaryColor),
    darkBorderMode: normalizeDarkBorderMode(darkBorderMode),
    fontFamily: normalizeSiteFontFamily(fontFamily),
    fontScale: normalizeSiteFontScale(fontScale),
    textColorLight: normalizeHexColor(textColorLight, DEFAULT_SITE_TEXT_COLOR_LIGHT),
    textColorDark: normalizeHexColor(textColorDark, DEFAULT_SITE_TEXT_COLOR_DARK),
  }
}

export function applySiteTheme(
  primaryColorOrTheme?: unknown | Partial<SiteTheme>,
  darkBorderMode?: unknown,
  fontFamily?: unknown,
  fontScale?: unknown,
  textColorLight?: unknown,
  textColorDark?: unknown,
  root: HTMLElement = document.documentElement,
): SiteTheme {
  const isThemeObject = typeof primaryColorOrTheme === 'object' && primaryColorOrTheme !== null
  const theme = isThemeObject
    ? resolveSiteTheme(
        (primaryColorOrTheme as Partial<SiteTheme>).primaryColor,
        (primaryColorOrTheme as Partial<SiteTheme>).darkBorderMode,
        (primaryColorOrTheme as Partial<SiteTheme>).fontFamily,
        (primaryColorOrTheme as Partial<SiteTheme>).fontScale,
        (primaryColorOrTheme as Partial<SiteTheme>).textColorLight,
        (primaryColorOrTheme as Partial<SiteTheme>).textColorDark,
      )
    : resolveSiteTheme(
        primaryColorOrTheme,
        darkBorderMode,
        fontFamily,
        fontScale,
        textColorLight,
        textColorDark,
      )
  const palette = buildPrimaryPalette(theme.primaryColor)

  for (const [step, hex] of Object.entries(palette)) {
    root.style.setProperty(`--primary-${step}`, hexToRgbChannels(hex))
  }
  root.style.setProperty('--site-primary-color', theme.primaryColor)
  root.style.setProperty('--dark-border-rgb', resolveDarkBorderRgb(theme.darkBorderMode, theme.primaryColor))
  root.style.setProperty('--site-font-family', resolveSiteFontStack(theme.fontFamily))
  root.style.setProperty('--site-font-scale', `${theme.fontScale}%`)
  root.style.setProperty('--site-text-color-light', theme.textColorLight)
  root.style.setProperty('--site-text-color-dark', theme.textColorDark)
  root.style.setProperty(
    '--site-text-color-light-90',
    mixHexColors(theme.textColorLight, '#FFFFFF', 90),
  )
  root.style.setProperty(
    '--site-text-color-light-78',
    mixHexColors(theme.textColorLight, '#FFFFFF', 78),
  )
  root.style.setProperty(
    '--site-text-color-light-65',
    mixHexColors(theme.textColorLight, '#FFFFFF', 65),
  )
  root.style.setProperty(
    '--site-text-color-light-52',
    mixHexColors(theme.textColorLight, '#FFFFFF', 52),
  )
  root.style.setProperty(
    '--site-text-color-dark-90',
    mixHexColors(theme.textColorDark, '#0F172A', 90),
  )
  root.style.setProperty(
    '--site-text-color-dark-78',
    mixHexColors(theme.textColorDark, '#0F172A', 78),
  )
  root.style.setProperty(
    '--site-text-color-dark-65',
    mixHexColors(theme.textColorDark, '#0F172A', 65),
  )
  root.style.setProperty(
    '--site-text-color-dark-52',
    mixHexColors(theme.textColorDark, '#0F172A', 52),
  )
  root.dataset.darkBorder = theme.darkBorderMode
  root.dataset.siteFont = theme.fontFamily

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
  } catch {
    // Theme still applies when storage is unavailable.
  }

  return theme
}

export function loadStoredSiteTheme(): SiteTheme {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<SiteTheme>
    return resolveSiteTheme(
      stored.primaryColor,
      stored.darkBorderMode,
      stored.fontFamily,
      stored.fontScale,
      stored.textColorLight,
      stored.textColorDark,
    )
  } catch {
    return resolveSiteTheme()
  }
}
