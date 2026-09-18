import { chromium } from '/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
const out = '/Users/ahmaadidrees/.codex/worktrees/flows-w4/docs/flows/qa/w4'
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const viewports = [[1366, 768], [1024, 768], [390, 844]]
const shots = [
  ['student-mine', '/worlds?demo=student', null],
  ['student-class', '/worlds?demo=student', 'class'],
  ['student-share-sheet', '/worlds?demo=student', 'share'],
  ['student-empty', '/worlds?demo=empty', null],
  ['class-closed', '/worlds?demo=closed', 'class'],
  ['teacher-class', '/worlds?demo=teacher', 'class'],
]
const errors = []
for (const [width, height] of viewports) {
  for (const [name, path, step] of shots) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(`${name} ${width}: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name} ${width} console: ${m.text()}`) })
    if (name === 'student-mine') await page.addInitScript(() => localStorage.setItem('brick-studio.current-project.v1', JSON.stringify({ schemaVersion: 2, partLibraryVersion: 1, environmentId: 'toy-room', customParts: [], bricks: Array.from({ length: 34 }, (_, i) => ({ id: 'b' + i })) })))
    await page.goto(`http://localhost:5260${path}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.worlds-main')
    if (step === 'class') await page.locator('nav.worlds-rail-item, nav .worlds-rail-item').filter({ hasText: 'Room 12 Builders' }).first().click()
    if (step === 'share') await page.getByRole('article', { name: 'Treehouse village' }).getByRole('button', { name: 'Share with my class' }).click()
    await page.waitForTimeout(350)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (overflow) errors.push(`${name} ${width}x${height}: horizontal overflow`)
    await page.screenshot({ path: `${out}/${name}-${width}x${height}.png`, fullPage: false })
    await page.close()
    await context.close()
  }
}
await browser.close()
console.log(errors.length ? 'ISSUES:\n' + errors.join('\n') : 'clean')
