/**
 * Demo: building a 2D world, then playing it. A fresh cartoon world: pick Brick from the drawer and paint a floating
 * row, swap one for a ? brick, drop a spring, press Play, bounce off the spring onto the row and bump the ? brick.
 * Run with the app's dev server up (the 2D session is exposed in dev builds). See lib/studio.mjs for the environment.
 */
import { Director } from './lib/studio.mjs'

const d = new Director({
  name: 'build-2d',
  // First-time hints and the dev stats stay out of the shot.
  css: '.p2d-hint, .p2d-stats { display: none !important; }',
})
const page = await d.open('/2d/build?new=1')
await page.locator('.p2d-game.p2d-building').waitFor()
await page.waitForFunction(() => !!window.__game2d)
await page.waitForTimeout(800)
await d.start()

const drawer = page.getByRole('complementary', { name: 'Brick drawer' })
const brick = (name) => drawer.getByRole('button', { name, exact: true })
/** Screen position of a tile's centre (CSS pixels). */
const tile = (tx, ty) =>
  page.evaluate(
    ([tx, ty]) => {
      const s = window.__game2d
      const r = s.renderer.canvas.getBoundingClientRect()
      return {
        x: r.left + ((tx * 16 + 8 - s.camera.x) / s.renderer.width) * r.width,
        y: r.top + ((ty * 16 + 8 - s.camera.y) / s.renderer.height) * r.height,
      }
    },
    [tx, ty],
  )
const log = async (label) => {
  if (!process.env.DEMO_PREVIEW) return
  const p = await page.evaluate(() => {
    const pl = window.__game2d.player
    return { x: +(pl.x / 256 / 16).toFixed(2), y: +(pl.y / 256 / 16).toFixed(2), coins: pl.coins }
  })
  console.log(label, JSON.stringify(p))
}

const G = Number(process.env.ROW_Y ?? 21)
await d.wait(500)
// 1. Pick Brick and paint a floating row.
await d.moveTo(brick('Brick'), 750)
await d.click()
const a = await tile(12, G)
const b = await tile(17, G)
await d.move(a.x, a.y, 800)
await d.drag([a, b], 900)
// 2. Swap the middle for a ? brick.
await d.moveTo(brick('? block'), 800)
await d.click()
const q = await tile(14, G)
await d.move(q.x, q.y, 750)
await d.click()
// 3. A spring on the ground.
await d.moveTo(brick('Spring'), 800)
await d.click()
const sp = await tile(Number(process.env.SPRING_X ?? 23), 24)
await d.move(sp.x, sp.y, 750)
await d.click()
await d.wait(250)
// 4. Play.
await d.moveTo(page.getByRole('radio', { name: 'Play' }), 800)
await d.click({ after: 120 })
await d.cursor(false)
await d.wait(200)
await log('play')
// Run, hop onto the spring (holding jump for the big bounce), land on the row, then jump up into the ? brick.
const plan = JSON.parse(process.env.PLAN ?? '[["R",1990],["RJ",250],["R",520],["RJ",1800],["R",900],["",700]]')
for (const [keys, ms] of plan) {
  const want = [...keys].map((k) => ({ R: 'ArrowRight', J: 'Space', S: 'ShiftLeft' })[k])
  for (const k of ['ArrowRight', 'Space', 'ShiftLeft']) {
    if (want.includes(k)) await page.keyboard.down(k)
    else await page.keyboard.up(k)
  }
  const steps = Math.max(1, Math.round(ms / 100))
  for (let i = 0; i < steps; i++) {
    await d.wait(ms / steps)
    await log(`${keys || '-'} +${Math.round(((i + 1) * ms) / steps)}`)
  }
}
for (const k of ['ArrowRight', 'Space', 'ShiftLeft']) await page.keyboard.up(k)
await d.wait(500)
if (process.env.DEMO_PREVIEW) await d.browser.close()
else await d.finish({ squareFocusX: 0.55 })
