/**
 * Demo: the Hackable Platformer in one idea, "it couldn't reach, so I changed the game". A new project: paint a high
 * ledge with a coin on it, press Play and fall short; open Code, snap Double jump onto the Hero; Play again, jump
 * twice and take the coin. Run with the app's dev server up (the studio is exposed in dev builds); see lib/studio.mjs
 * for the environment. DEMO_PREVIEW=1 steps the storyboard without saving frames and logs where the Hero is.
 *
 *   DEMO_ORIGIN=http://localhost:5179 DEMO_OUT=demo-out node scripts/demo/record-hack.mjs
 */
import { Director } from './lib/studio.mjs'

const FRESH = `try { if (!sessionStorage.getItem('hack-demo')) { for (const k of Object.keys(localStorage)) if (k.startsWith('code-lab.')) localStorage.removeItem(k); sessionStorage.setItem('hack-demo', '1') } } catch {}`
const TILE = 16
const ROW = Number(process.env.LEDGE_ROW ?? 5)
const [C0, C1] = JSON.parse(process.env.LEDGE_COLS ?? '[9,12]')

const d = new Director({ name: 'build-hack', css: '.play-hint { display: none !important; }' })
const page = await d.open('/2d/hackable?new=1', { prepare: FRESH })
await page.waitForSelector('.stage-canvas')
await page.waitForFunction(() => !!window.__studio && !!window.__studioStage)
// The starter's first Walker paces right where the Hero lands: it moves along before filming starts...
await page.evaluate(() => {
  const s = window.__studio
  const first = s.getState().project.design.copies.find((c) => c.brickId === 'brick_walker' && c.x < 300)
  if (first) s.updateCopy(first.id, { x: 420 })
  // ...and the starter coin under where the ledge goes would look stuck in it.
  const tucked = s.getState().project.design.copies.find((c) => c.brickId === 'brick_coin' && c.x === 208 && c.y === 80)
  if (tucked) s.deleteCopy(tucked.id)
})
await page.waitForTimeout(800)
await d.start()

const drawer = page.getByRole('region', { name: 'Bricks' }).or(page.locator('.cl-drawer'))
const brick = (name) => drawer.getByRole('button', { name, exact: true }).first()
/** Screen position of a cell's centre (row 0 = the ground). */
const cell = (col, row) => page.evaluate(([x, y]) => window.__studioStage.toScreen(x, y), [col * TILE + TILE / 2, row * TILE + TILE / 2])
const log = async (label) => {
  if (!process.env.DEMO_PREVIEW) return
  const p = await page.evaluate(() => {
    const rt = window.__studio.getState().runtime
    const hero = rt?.world.targets.find((t) => !t.isStage && !t.isClone && t.brickId === 'brick_hero')
    return hero ? { x: Math.round(hero.x), y: Math.round(hero.y) } : null
  })
  console.log(label, JSON.stringify(p))
}
/** Hold keys in steps: [["R", ms], ["RJ", ms], ...] (R right arrow, J space, X run). */
const play = async (plan, label) => {
  const keyOf = { R: 'ArrowRight', J: 'Space', X: 'KeyX' }
  for (const [keys, ms] of plan) {
    const want = [...keys].map((k) => keyOf[k])
    for (const k of Object.values(keyOf)) {
      if (want.includes(k)) await page.keyboard.down(k)
      else await page.keyboard.up(k)
    }
    const steps = Math.max(1, Math.round(ms / 100))
    for (let i = 0; i < steps; i++) {
      await d.wait(ms / steps)
      await log(`${label} ${keys || '-'} +${Math.round(((i + 1) * ms) / steps)}`)
    }
  }
  for (const k of Object.values(keyOf)) await page.keyboard.up(k)
}
const mode = (name) => page.getByRole('radio', { name: new RegExp(`^${name}`) })

await d.wait(500)
// 1. Build: a high ledge, and a coin on it.
await d.moveTo(brick('Brick'), 750)
await d.click()
const a = await cell(C0, ROW)
const b = await cell(C1, ROW)
await d.move(a.x, a.y, 800)
await d.drag([a, b], 800)
await d.moveTo(brick('Coin'), 800)
await d.click()
const coin = await cell(Math.round((C0 + C1) / 2), ROW + 1)
await d.move(coin.x, coin.y, 750)
await d.click()
await d.wait(250)

// 2. Play: one jump falls short.
await d.moveTo(mode('Play'), 800)
await d.click({ after: 120 })
await d.cursor(false)
await d.wait(300)
await log('play 1')
await play(JSON.parse(process.env.PLAN1 ?? '[["R",350],["RJ",500],["R",250],["",900]]'), 'try')
await d.wait(300)

// 3. Code: snap Double jump onto the Hero.
await d.cursor(true)
await d.moveTo(mode('Code'), 800)
await d.click({ after: 700 })
await page.evaluate(() => window.__studio.selectBrick('brick_hero'))
await d.moveTo(page.getByRole('button', { name: /Power$/ }).first(), 800)
await d.click({ after: 500 })
await d.moveTo(page.locator('.cl-power-pick', { hasText: 'Double jump' }).first(), 800)
await d.click({ after: 1300 })

// 4. Play again: jump, jump again in the air, land on the ledge and take the coin.
await d.moveTo(mode('Play'), 800)
await d.click({ after: 120 })
await d.cursor(false)
await d.wait(300)
await log('play 2')
await play(JSON.parse(process.env.PLAN2 ?? '[["R",350],["RJ",380],["R",60],["RJ",450],["R",350],["",1200]]'), 'hack')
await d.wait(600)
if (process.env.DEMO_PREVIEW) {
  console.log('coins', await page.locator('.play-coins').textContent().catch(() => null))
  await d.browser.close()
} else await d.finish({ squareFocusX: 0.4 })
