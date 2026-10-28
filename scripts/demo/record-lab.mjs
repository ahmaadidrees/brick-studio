/**
 * Records the code lab's five "I want to…" examples (/2d/lab), one short video each, frame by frame with the demo
 * studio (lib/studio.mjs): the page's clock is frozen and stepped, so the game runs exactly as it would live.
 *
 *   DEMO_OUT=demo-out node scripts/demo/record-lab.mjs            # all five
 *   DEMO_OUT=demo-out node scripts/demo/record-lab.mjs car rocket # some
 *
 * Needs the dev site (DEMO_ORIGIN, default http://127.0.0.1:5199), Playwright (PLAYWRIGHT_MODULE) and ffmpeg. Writes
 * <OUT>/lab-<n>-<name>.mp4 and a poster .jpg for each. Key timings come from the lab's own simulation
 * (src/platformer/lab), which the recording replays exactly: a key press lands on a frame (2 game ticks at 30 fps).
 */
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { Director, OUT, VIDEO, VIDEO_TAGS, ffmpeg } from './lib/studio.mjs'

const FPS = 30
const FRESH = `try { if (!sessionStorage.getItem('lab-demo')) { localStorage.removeItem('brick-studio.2d.lab.v1'); sessionStorage.setItem('lab-demo', '1') } } catch {}`

async function session(name, story) {
  const d = new Director({ name, width: 1440, height: 900, scale: 1, fps: FPS })
  const page = await d.open('/2d/lab', { prepare: FRESH })
  await page.waitForSelector('.lab-stage canvas')
  await page.waitForSelector('.blocklySvg')
  await d.start()
  await d.wait(700)
  let poster = 0
  await story({ d, page, mark: () => (poster = d.frame) })
  await d.wait(400)
  await d.browser.close()
  const base = path.join(OUT, name)
  ffmpeg(['-framerate', String(FPS), '-i', path.join(d.dir, 'f%05d.jpg'), '-vf', `scale=1280:-2,${VIDEO}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', ...VIDEO_TAGS, '-movflags', '+faststart', '-an', `${base}.mp4`], name)
  await copyFile(path.join(d.dir, `f${String(poster).padStart(5, '0')}.jpg`), `${base}.jpg`)
  console.log(`[${name}] ${d.frame} frames (${(d.frame / FPS).toFixed(1)} s) → ${base}.mp4, poster frame ${poster}`)
}

const button = (page, name, n = 0) => page.getByRole('button', { name, exact: false }).nth(n)
const tap = async (page, key) => {
  await page.keyboard.down(key)
  await page.keyboard.up(key)
}

/** Glide to a button and click it. */
async function press(d, locator, ms = 450) {
  await d.moveTo(locator, ms)
  await d.click()
}

async function play(d, page) {
  await press(d, button(page, 'Click here to play'))
  await d.cursor(false)
}

/** "Start again": the level as built, Walkers back on their ledges; the stage keeps the keys. */
async function startAgain(d, page) {
  await d.cursor(true)
  await press(d, button(page, 'Start again'))
  await d.cursor(false)
}

async function recipe(d, page, index) {
  await d.cursor(true)
  await press(d, button(page, 'I want to'))
  await d.wait(500)
  await press(d, button(page, 'Show me', index))
  await d.cursor(false)
  await d.wait(900)
}

const STORIES = {
  // Run at the lava gap and jump: too far. Code a double jump (the recipe), run again: across.
  'double-jump': async ({ d, page, mark }) => {
    await play(d, page)
    await page.keyboard.down('ArrowLeft')
    await page.keyboard.down('KeyX')
    await d.wait(233)
    await page.keyboard.down('Space')
    await d.wait(700)
    await page.keyboard.up('Space')
    // Let go before the lava sends you back, so the next run starts from the start, not against the curb.
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowLeft')
    await d.wait(2000)
    await recipe(d, page, 0)
    // The middle of the window the simulation finds: first jump 16 ticks into the run, the second 34 ticks later.
    await page.keyboard.down('ArrowLeft')
    await page.keyboard.down('KeyX')
    await d.wait(267)
    await page.keyboard.down('Space')
    await d.wait(567)
    await page.keyboard.up('Space')
    await page.keyboard.down('Space')
    await d.wait(166)
    mark()
    await d.wait(500)
    await page.keyboard.up('Space')
    await d.wait(900)
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowLeft')
    await d.wait(1200)
  },

  // Z throws a ball from your hand the way you face; it bounces; a cooldown between throws.
  throw: async ({ d, page, mark }) => {
    await play(d, page)
    await recipe(d, page, 1)
    await startAgain(d, page)
    await tap(page, 'KeyZ')
    await d.wait(500)
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('KeyX')
    await d.wait(1300)
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowRight')
    await tap(page, 'KeyZ')
    await d.wait(300)
    mark()
    await d.wait(300)
    await tap(page, 'KeyZ')
    await d.wait(900)
    await tap(page, 'KeyZ')
    await d.wait(700)
    await page.keyboard.down('ArrowLeft')
    await d.wait(150)
    await page.keyboard.up('ArrowLeft')
    await tap(page, 'KeyZ')
    await d.wait(1500)
  },

  // A car next to you: walk in, ↑ to get in, → to drive (it knocks out Walkers), ↓ to get out.
  car: async ({ d, page, mark }) => {
    await play(d, page)
    await recipe(d, page, 2)
    await page.keyboard.down('ArrowRight')
    await d.wait(500)
    await page.keyboard.up('ArrowRight')
    await tap(page, 'ArrowUp')
    await d.wait(500)
    await page.keyboard.down('ArrowRight')
    await d.wait(1500)
    mark()
    await d.wait(2000)
    await page.keyboard.up('ArrowRight')
    await d.wait(800)
    await tap(page, 'ArrowDown')
    await d.wait(1200)
  },

  // A rocket next to you: ↑ to get on, hold space to thrust (fuel runs down), steer onto the ledge, fuel refills.
  rocket: async ({ d, page, mark }) => {
    await play(d, page)
    await recipe(d, page, 3)
    await page.keyboard.down('ArrowRight')
    await d.wait(433)
    await page.keyboard.up('ArrowRight')
    await tap(page, 'ArrowUp')
    await d.wait(200)
    await page.keyboard.down('Space')
    await d.wait(333)
    await page.keyboard.down('ArrowRight')
    await d.wait(400)
    mark()
    await d.wait(267)
    await page.keyboard.up('Space')
    await d.wait(833)
    await page.keyboard.up('ArrowRight')
    await d.wait(2500)
  },

  // The built-in Walker walks off its ledge. Change it (the recipe edits the built-in), start again: it turns back.
  'ledge-walker': async ({ d, page, mark }) => {
    await play(d, page)
    await d.cursor(true)
    await press(d, page.locator('.lab-thing', { hasText: 'Walker' }))
    await startAgain(d, page)
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('KeyX')
    await d.wait(1600)
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowRight')
    await d.wait(2200)
    await recipe(d, page, 4)
    await startAgain(d, page)
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('KeyX')
    await d.wait(1600)
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowRight')
    await d.wait(1300)
    mark()
    await d.wait(2500)
  },
}

const NAMES = Object.keys(STORIES)
const pick = process.argv.slice(2)
for (const [i, name] of NAMES.entries()) {
  if (pick.length && !pick.includes(name)) continue
  await session(`lab-${i + 1}-${name}`, STORIES[name])
}
