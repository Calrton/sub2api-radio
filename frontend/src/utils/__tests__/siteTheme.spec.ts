import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SITE_FONT_FAMILY,
  DEFAULT_SITE_FONT_SCALE,
  DEFAULT_SITE_TEXT_COLOR_DARK,
  DEFAULT_SITE_TEXT_COLOR_LIGHT,
  MAX_SITE_FONT_SCALE,
  MIN_SITE_FONT_SCALE,
  applySiteTheme,
  loadStoredSiteTheme,
  normalizeSiteFontFamily,
  normalizeSiteFontScale,
  resolveSiteFontStack,
  resolveSiteTheme,
} from '../siteTheme'

describe('siteTheme', () => {
  it('normalizes supported font families and rejects unknown values', () => {
    expect(normalizeSiteFontFamily('geist')).toBe('geist')
    expect(normalizeSiteFontFamily('microsoft-yahei')).toBe('microsoft-yahei')
    expect(normalizeSiteFontFamily('unknown')).toBe(DEFAULT_SITE_FONT_FAMILY)
  })

  it('clamps font scale to the supported range', () => {
    expect(normalizeSiteFontScale(80)).toBe(MIN_SITE_FONT_SCALE)
    expect(normalizeSiteFontScale(120)).toBe(MAX_SITE_FONT_SCALE)
    expect(normalizeSiteFontScale('103.6')).toBe(104)
    expect(normalizeSiteFontScale('invalid')).toBe(DEFAULT_SITE_FONT_SCALE)
  })

  it('keeps semantic text colors separate and applies all CSS variables', () => {
    const root = document.createElement('html')
    const theme = applySiteTheme({
      primaryColor: '#B06F30',
      darkBorderMode: 'neutral',
      fontFamily: 'geist',
      fontScale: 112,
      textColorLight: '#223344',
      textColorDark: '#DDEEFF',
    }, undefined, undefined, undefined, undefined, undefined, root)

    expect(theme.textColorLight).toBe('#223344')
    expect(root.style.getPropertyValue('--site-font-family')).toContain('Geist')
    expect(root.style.getPropertyValue('--site-font-scale')).toBe('112%')
    expect(root.style.getPropertyValue('--site-text-color-light')).toBe('#223344')
    expect(root.style.getPropertyValue('--site-text-color-dark')).toBe('#DDEEFF')
    expect(root.style.getPropertyValue('--site-text-color-light-65')).toBe('#6F7A85')
    expect(root.style.getPropertyValue('--site-text-color-dark-65')).toBe('#95A3B4')
  })

  it('recomputes derived text colors when either body color changes', () => {
    const root = document.createElement('html')
    applySiteTheme({
      textColorLight: '#223344',
      textColorDark: '#DDEEFF',
    }, undefined, undefined, undefined, undefined, undefined, root)

    const light65Before = root.style.getPropertyValue('--site-text-color-light-65')
    const dark65Before = root.style.getPropertyValue('--site-text-color-dark-65')

    applySiteTheme({
      textColorLight: '#445566',
      textColorDark: '#AABBCC',
    }, undefined, undefined, undefined, undefined, undefined, root)

    expect(root.style.getPropertyValue('--site-text-color-light-65')).not.toBe(light65Before)
    expect(root.style.getPropertyValue('--site-text-color-dark-65')).not.toBe(dark65Before)
  })

  it('uses readable defaults when stored theme data is incomplete', () => {
    localStorage.setItem('xihe-site-theme-v1', JSON.stringify({
      primaryColor: '#123456',
      fontFamily: 'unsupported',
    }))

    const theme = loadStoredSiteTheme()
    expect(theme.primaryColor).toBe('#123456')
    expect(theme.fontFamily).toBe(DEFAULT_SITE_FONT_FAMILY)
    expect(theme.fontScale).toBe(DEFAULT_SITE_FONT_SCALE)
    expect(theme.textColorLight).toBe(DEFAULT_SITE_TEXT_COLOR_LIGHT)
    expect(theme.textColorDark).toBe(DEFAULT_SITE_TEXT_COLOR_DARK)
  })

  it('provides a Chinese-capable fallback stack for Geist', () => {
    const stack = resolveSiteFontStack('geist')
    expect(stack).toContain('"Geist"')
    expect(stack).toContain('"Microsoft YaHei"')
    expect(resolveSiteTheme().fontFamily).toBe(DEFAULT_SITE_FONT_FAMILY)
  })
})
