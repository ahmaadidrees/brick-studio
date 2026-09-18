/**
 * Screenshots of /join at the three review viewports. The public class lookup
 * (`POST /classroom/auth/roster`) is stubbed in the browser so the page can be
 * captured without a worker; nothing else is intercepted.
 *
 *   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://127.0.0.1:5250 \
 *     node docs/flows/qa/w3/capture.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5250'
const output = fileURLToPath(new URL('.', import.meta.url))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')

const ROSTER = {
  name: 'Studio 5',
  canEnroll: true,
  showNames: true,
  students: [
    { username: 'ben_k', displayName: 'Ben K.' },
    { username: 'mia_t', displayName: 'Mia T.' },
    { username: 'ava_s', displayName: 'Ava S.' },
    { username: 'noah_p', displayName: 'Noah P.' },
    { username: 'lin_w', displayName: 'Lin W.' },
    { username: 'omar_h', displayName: 'Omar H.' },
  ],
}

const VIEWPORTS = [
  { id: '1366x768', width: 1366, height: 768 },
  { id: '1024x768', width: 1024, height: 768 },
  { id: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
]

const SCENES = [
  {
    id: 'join',
    url: '/join?classCode=ROOM-42',
    async prepare(page) {
      await page.getByLabel('Choose a username').fill('sky_builder')
      await page.getByLabel('Name your teacher knows').fill('Alex Rivera')
      await page.locator('#join-password').fill('brick')
      await page.getByText('Studio 5').first().waitFor()
    },
  },
  {
    id: 'signin-roster',
    url: '/join?mode=signin',
    async prepare(page) {
      await page.getByRole('button', { name: 'I have a class code' }).click()
      await page.getByLabel('Class code').fill('ROOM-42')
      await page.getByRole('button', { name: /Ben K\./ }).click()
    },
  },
  {
    id: 'teacher',
    url: '/join?mode=teacher',
    async prepare(page) {
      await page.getByRole('button', { name: 'Use email and password' }).click()
      await page.getByLabel('Email').waitFor()
    },
  },
]

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const failures = []
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: Boolean(viewport.isMobile), hasTouch: Boolean(viewport.hasTouch), deviceScaleFactor: 1 })
  await context.route('**/classroom/auth/roster', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROSTER) }))
  for (const scene of SCENES) {
    const page = await context.newPage()
    page.on('pageerror', error => failures.push(`${scene.id} ${viewport.id}: ${error.message}`))
    await page.goto(`${origin}${scene.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading').first().waitFor()
    try { await scene.prepare(page) } catch (error) { failures.push(`${scene.id} ${viewport.id}: ${error.message}`) }
    await page.waitForTimeout(400)
    const file = path.join(output, `${scene.id}-${viewport.id}.png`)
    // Viewport-sized: the page scrolls, so the review needs what actually fits on screen.
    await page.screenshot({ path: file })
    const overflow = await page.evaluate(() => { const page = document.querySelector('.join-page'); return Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, page ? page.scrollWidth - page.clientWidth : 0) })
    if (overflow > 1) failures.push(`${scene.id} ${viewport.id}: ${overflow}px of horizontal overflow`)
    console.log(`saved ${path.basename(file)}`)
    await page.close()
  }
  await context.close()
}
await browser.close()
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('ok')
