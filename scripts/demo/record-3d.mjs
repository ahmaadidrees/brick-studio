/**
 * Demo: building in 3D, then stepping inside. A fresh plate: stack a rainbow staircase (three 2 × 4 bricks, each
 * half on the one below, and a 2 × 2 on top), then Explore: hop up the steps, flip at the top, and swing the camera
 * round to see the build.
 *
 * Bricks go where the cursor points, so before each placement the script finds the screen point whose ghost brick
 * lands exactly on the planned spot (it probes the pointer between frames; nothing is recorded while it does).
 * Run with the app's dev server up (the store is exposed in dev builds). See lib/studio.mjs for the environment.
 */
import { Director } from './lib/studio.mjs'

const d = new Director({
  name: 'build-3d',
  fps: Number(process.env.DEMO_FPS ?? 30),
  // A refused placement's toast would be a blooper, and the control hints are for players, not viewers.
  css: '.brick-toast, .desktop-explore-hint { display: none !important; }',
  gpu: true,
})
const page = await d.open('/build')
const start = page.getByRole('button', { name: 'Start building', exact: true })
await start.waitFor({ timeout: 30000 })
await start.click()
await page.waitForTimeout(1500)
await d.start()

const state = (fn) => page.evaluate(fn)
const draft = () => state(() => window.__brickStore.getState().draft)
const bricks = () => state(() => window.__brickStore.getState().bricks.length)

/** Move the real pointer without recording (the drawn cursor is put back before the next frame). */
async function probe(x, y) {
  await page.mouse.move(x, y)
  await page.clock.runFor(34)
  return draft()
}

/** Fit screen ↔ plate on the empty plate: an affine map from (x, z) studs to screen pixels. */
async function calibrate() {
  const pts = []
  for (let sy = 320; sy <= 620; sy += 100) for (let sx = 480; sx <= 1080; sx += 150) {
    const g = await probe(sx, sy)
    if (g && g.y === 0) pts.push({ sx, sy, x: g.x, z: g.z })
  }
  // Least squares for sx = a*x + b*z + c and sy = e*x + f*z + g.
  const solve = (key) => {
    let [xx, xz, x1, zz, z1, n, xs, zs, s1] = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (const p of pts) {
      xx += p.x * p.x; xz += p.x * p.z; x1 += p.x; zz += p.z * p.z; z1 += p.z; n += 1
      xs += p.x * p[key]; zs += p.z * p[key]; s1 += p[key]
    }
    const m = [[xx, xz, x1, xs], [xz, zz, z1, zs], [x1, z1, n, s1]]
    for (let i = 0; i < 3; i++) {
      const piv = m[i][i]
      for (let j = i; j < 4; j++) m[i][j] /= piv
      for (let k = 0; k < 3; k++) if (k !== i) { const f = m[k][i]; for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j] }
    }
    return [m[0][3], m[1][3], m[2][3]]
  }
  const [a, b, c] = solve('sx')
  const [e, f, g] = solve('sy')
  return { at: (x, z) => ({ x: a * x + b * z + c, y: e * x + f * z + g }), step: (dx, dz) => ({ x: a * dx + b * dz, y: e * dx + f * dz }) }
}

/**
 * Find a screen point whose ghost brick sits at (x, y, z). Start from the plate map raised a little for the height
 * (a brick top is nearer the camera than the plate under it), then correct by the stud error each probe reports.
 */
async function aim(plate, target) {
  const p = plate.at(target.x + 0.5, target.z + 0.5)
  p.y -= target.y * 9
  // Ghosts snap by whole studs, so a full correction can hop over the spot; each overshoot halves the next step.
  const gain = { x: 0.7, z: 0.7 }
  let last = { x: 0, z: 0 }
  for (let i = 0; i < 40; i++) {
    const g = await probe(p.x, p.y)
    if (process.env.DEBUG_AIM) console.log('aim', JSON.stringify(target), Math.round(p.x), Math.round(p.y), JSON.stringify(g && { x: g.x, y: g.y, z: g.z }))
    if (g && g.x === target.x && g.y === target.y && g.z === target.z) return { ...p }
    if (!g) {
      p.y += 4
      continue
    }
    const err = { x: target.x - g.x, z: target.z - g.z }
    for (const k of ['x', 'z']) if (err[k] * last[k] < 0) gain[k] /= 2
    last = err
    const miss = plate.step(err.x * gain.x, err.z * gain.z)
    // Right cell, wrong height: the pointer is on the face below the spot, so reach higher.
    const lift = err.x === 0 && err.z === 0 ? (g.y < target.y ? -6 : 6) : 0
    p.x += miss.x
    p.y += miss.y + lift
  }
  throw new Error(`could not aim at ${JSON.stringify(target)}`)
}

const plate = await calibrate()
const drawer = page.getByRole('complementary', { name: 'Brick drawer' })
const swatch = (i) => drawer.getByRole('group', { name: 'Brush color' }).getByRole('button').nth(i)

/** Pick, aim, glide there on camera, click. */
async function place(target, { color, part } = {}) {
  if (part) {
    await d.moveTo(drawer.getByRole('button', { name: part, exact: true }), 700)
    await d.click()
  }
  if (color !== undefined) {
    await d.moveTo(swatch(color), 650)
    await d.click()
  }
  const here = { ...d.mouse }
  const spot = await aim(plate, target)
  await page.mouse.move(here.x, here.y)
  await d.move(spot.x, spot.y, 750)
  await d.wait(120)
  const before = await bricks()
  await d.click({ after: 260 })
  if ((await bricks()) !== before + 1) throw new Error(`the brick at ${JSON.stringify(target)} was not placed`)
}

const explorer = () => state(() => window.__explorer ?? null)

/**
 * Walk up the steps and stop on the top brick, jumping by where the explorer is rather than by the clock (how soon
 * the explorer appears varies from run to run). `steps` are the placements, lowest first.
 */
async function climb(steps) {
  const STUD = 0.62
  const BRICK = 0.54
  const STAND = 0.39
  const face = steps.map((b) => (b.z + b.depth - 32) * STUD)
  const held = new Set()
  const key = async (k, on) => {
    if (on === held.has(k)) return
    if (on) held.add(k), await page.keyboard.down(k)
    else held.delete(k), await page.keyboard.up(k)
  }
  const tap = async () => {
    await key('Space', true)
    await d.wait(70)
    await key('Space', false)
  }
  const top = steps.length
  let pause = 0
  let still = 0
  for (let frame = 0; frame < d.fps * 12; frame++) {
    const e = await explorer()
    const level = e ? Math.round((e.y - STAND) / BRICK) : -1
    if (process.env.DEMO_PREVIEW && e?.grounded && frame % 6 === 0) console.log('climb', level, e.z.toFixed(2))
    if (e?.grounded && e.y > STAND + top * BRICK - 0.3) {
      // On the top brick (perhaps only just, on its edge): walk well onto it, then let go and come to a stop.
      if (still === 0 && e.z > face[top - 1] - 0.4) await key('ArrowUp', true)
      else {
        await key('ArrowUp', false)
        if (++still > d.fps * 0.6) return
      }
    } else if (e?.grounded && level >= 0) {
      const ahead = e.z - face[level]
      if (level < top - 1) {
        // Walk on, and jump a little before each riser.
        await key('ArrowUp', true)
        if (ahead <= 0.7) {
          await tap()
          continue
        }
      } else if (pause === 0 && ahead > 0.36) {
        // The top brick is short: walk to its foot, stop a moment, then hop up from a standstill so the landing
        // stays on it.
        await key('ArrowUp', true)
      } else if (pause < d.fps * 0.3) {
        await key('ArrowUp', false)
        pause++
      } else {
        await key('ArrowUp', true)
        await tap()
        continue
      }
    }
    await d.wait(1000 / d.fps)
  }
  throw new Error(`the explorer did not reach the top: ${JSON.stringify(await explorer())}`)
}

await d.wait(400)
// A rainbow staircase: red, yellow and green 2 × 4s, each half on the last, and a blue 2 × 2 on top.
const STEPS = [
  { x: 31, y: 0, z: 33, depth: 4, color: 0 },
  { x: 31, y: 3, z: 31, depth: 4, color: 2 },
  { x: 31, y: 6, z: 29, depth: 4, color: 3 },
  { x: 31, y: 9, z: 29, depth: 2, color: 5, part: '2 × 2 Brick' },
]
for (const { x, y, z, color, part } of STEPS) await place({ x, y, z }, { color, part })
await d.wait(300)
// Put the brush down so the ghost does not follow into Explore, then step inside.
await page.keyboard.press('Escape')
await d.moveTo(page.getByRole('radio', { name: 'Explore' }), 800)
await d.click({ after: 60 })
await d.cursor(false)
// Park the (now hidden) pointer over the scene, away from the header's buttons.
await page.mouse.move(d.width / 2, d.height * 0.6)
d.mouse = { x: d.width / 2, y: d.height * 0.6 }
// Let the explorer appear, then hop up the steps and flip at the top (a double jump).
while ((await state(() => window.__brickStore.getState().exploreSpawnStatus)) !== 'ready') await d.wait(1000 / d.fps)
await d.wait(600)
await climb(STEPS)
await d.wait(300)
await page.keyboard.down('Space')
await d.wait(70)
await page.keyboard.up('Space')
await d.wait(150)
await page.keyboard.down('Space')
await d.wait(70)
await page.keyboard.up('Space')
await d.wait(1100)
// Swing the camera round to show the staircase from the side.
await page.mouse.down()
await d.move(d.mouse.x - Number(process.env.SWING ?? 150), d.mouse.y + 12, 1700)
await page.mouse.up()
await d.wait(1500)
if (process.env.DEMO_PREVIEW) {
  console.log('bricks', await bricks(), 'explorer', JSON.stringify(await explorer()))
  await page.screenshot({ path: `${process.env.DEMO_OUT || 'demo-out'}/build-3d-preview.jpg`, type: 'jpeg', quality: 85 })
  await d.browser.close()
} else await d.finish({ squareFocusX: 0.5 })
