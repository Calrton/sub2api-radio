import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const baseUrl = process.env.RADIO_DEMO_URL || 'http://127.0.0.1:15200/'
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const executablePath = executableCandidates.find((candidate) => existsSync(candidate))

const browser = await chromium.launch({
  executablePath,
  headless: true,
})

const shots = [
  {
    name: 'demo-intro-light.png',
    viewport: { width: 1440, height: 900 },
  },
  {
    name: 'demo-intro-mobile.png',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  {
    name: 'demo-intro-dark.png',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  },
  {
    name: 'demo-intro-forced-colors.png',
    viewport: { width: 1440, height: 900 },
    forcedColors: 'active',
  },
]

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    isMobile: shot.isMobile ?? false,
    colorScheme: shot.colorScheme ?? 'light',
    forcedColors: shot.forcedColors ?? 'none',
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('radio-intro').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await page.screenshot({
    path: `docs/images/${shot.name}`,
    fullPage: false,
  })

  const metrics = await page.evaluate(() => {
    const card = document.querySelector('.radio-intro-card')
    const primary = document.querySelector('[data-testid="radio-intro-play"]')
    const secondary = document.querySelector('[data-testid="radio-intro-silent"]')
    return {
      card: card?.getBoundingClientRect().toJSON(),
      primary: primary?.getBoundingClientRect().toJSON(),
      secondary: secondary?.getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
    }
  })

  console.log(shot.name, JSON.stringify(metrics))
  await context.close()
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()
await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.getByTestId('radio-intro-play').click()
await page.waitForFunction(() => {
  const audio = document.querySelector('audio')
  return audio instanceof HTMLAudioElement && !audio.paused
})
await page.getByTestId('radio-open').click()
await page.getByTestId('radio-panel').waitFor({ state: 'visible' })
await page.screenshot({
  path: 'docs/images/demo-console.png',
  fullPage: false,
})
await page.getByTestId('radio-hide').click()
await page.getByTestId('radio-restore').waitFor({ state: 'visible' })
await page.getByTestId('radio-restore').click()
await page.getByTestId('radio-toggle').waitFor({ state: 'visible' })

console.log(
  'interaction-check',
  JSON.stringify({
    introDismissed:
      (await page.getByTestId('radio-intro').count()) === 0,
    sessionChoice: await page.evaluate(() =>
      sessionStorage.getItem('sub2api-radio-demo:intro'),
    ),
    playing: await page.locator('audio').evaluate((audio) => !audio.paused),
    controlsRestored: await page.getByTestId('radio-toggle').isVisible(),
  }),
)

await context.close()
await browser.close()
