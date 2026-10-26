import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n, { initI18n } from './i18n'
import { useAppStore } from '@/stores/app'
import { updateFavicon } from '@/utils/branding'
import { isIOSDevice } from '@/utils/device'
import { applySiteTheme, loadStoredSiteTheme } from '@/utils/siteTheme'
import './style.css'

function initIOSViewportZoomFix() {
  // iOS Safari 在输入框字号小于 16px 时聚焦会自动放大页面，且失焦后不会恢复。
  // 限制 maximum-scale 可阻止该行为；iOS 10+ 用户仍可双指手动缩放，不影响可访问性。
  // 仅在 iOS 设备上注入，避免影响 Android Chrome 的手动缩放能力。
  if (!isIOSDevice()) return

  const viewport = document.querySelector('meta[name="viewport"]')
  if (!viewport) return

  const content = viewport.getAttribute('content') || ''
  if (/maximum-scale/i.test(content)) return
  viewport.setAttribute('content', `${content}, maximum-scale=1.0`)
}

function initThemeClass() {
  const savedTheme = localStorage.getItem('theme')
  const shouldUseDark =
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', shouldUseDark)
}

async function waitForPrimaryFont(): Promise<void> {
  const primaryFont = document.documentElement.dataset.siteFont
  if (primaryFont !== 'geist' || typeof document.fonts === 'undefined') return

  try {
    await Promise.all([
      document.fonts.load('400 16px Geist'),
      document.fonts.load('500 16px Geist'),
      document.fonts.load('700 16px Geist'),
    ])
  } catch {
    // Font loading must not block the application.
  }
}

async function bootstrap() {
  // Apply theme class globally before app mount to keep all routes consistent.
  initThemeClass()
  initIOSViewportZoomFix()
  const storedTheme = loadStoredSiteTheme()
  applySiteTheme(storedTheme)

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // Initialize settings from injected config BEFORE mounting (prevents flash)
  // This must happen after pinia is installed but before router and i18n
  const appStore = useAppStore()
  appStore.initFromInjectedConfig()
  applySiteTheme({
    primaryColor: appStore.sitePrimaryColor,
    darkBorderMode: appStore.siteDarkBorderMode,
    fontFamily: appStore.siteFontFamily,
    fontScale: appStore.siteFontScale,
    textColorLight: appStore.siteTextColorLight,
    textColorDark: appStore.siteTextColorDark,
  })

  // Set document title immediately after config is loaded
  if (appStore.siteName && appStore.siteName !== 'Sub2API') {
    document.title = `${appStore.siteName} - AI API Gateway`
  }
  updateFavicon(appStore.siteLogo)

  await Promise.all([initI18n(), waitForPrimaryFont()])

  app.use(router)
  app.use(i18n)

  // 等待路由器完成初始导航后再挂载，避免竞态条件导致的空白渲染
  await router.isReady()
  app.mount('#app')
}

bootstrap()
