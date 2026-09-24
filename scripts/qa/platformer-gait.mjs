// Local-only visual gait rehearsal. Start Vite at UI_ORIGIN, then run:
// UI_ORIGIN=http://127.0.0.1:5402 GAIT_OUTPUT=test-results/platformer-gait node scripts/qa/platformer-gait.mjs
// Captures one browser video, in-game screenshots, enlarged 16-frame diagnostics, and sampled game metadata.
import assert from 'node:assert/strict'
import { rename, writeFile } from 'node:fs/promises'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5402', 'this rehearsal uses a local guest draft and browser preferences')
const out = await outputDir('GAIT_OUTPUT', 'test-results/platformer-gait')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: out, size: { width: 1280, height: 800 } } })
const page = await context.newPage()
const video = page.video()
const results = []
const errors = []
const observations = {}
const characters = [
  { id: 'builder', name: 'Builder' },
  { id: 'bolt-bot', name: 'Bolt Bot' },
  { id: 'brick-fox', name: 'Brick Fox' },
]

page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

async function step(name, fn) {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - start })
    console.log(`ok   ${name}`)
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - start, error: String(error?.stack ?? error) })
    console.log(`FAIL ${name}: ${error?.message ?? error}`)
  }
}

const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' })
const look = () => page.evaluate(() => {
  const game = window.__game2d
  const appearance = game.lookOf(game.player)
  return { character: game.character, mode: game.mode, tick: game.timeline.tick, anim: game.player.anim,
    vx: game.player.vx, x: game.player.x, onGround: game.player.onGround, facing: appearance.facing,
    pose: appearance.pose, gait: appearance.gait, gaitPhase: appearance.gaitPhase }
})

async function selectCharacter({ id, name }) {
  await page.getByRole('button', { name: 'Character', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Character' })
  await dialog.waitFor()
  await dialog.getByRole('radio', { name: new RegExp(`^${name}(?:\\s|$)`) }).click()
  await page.waitForFunction((expected) => window.__game2d?.character === expected, id, { timeout: 5000 })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
}

async function verifySheet(id) {
  const path = `/platformer/characters/${id}-rig-v1.png`
  const asset = await page.evaluate(async (url) => {
    const image = new Image()
    const loaded = await new Promise((resolve) => {
      image.onload = () => resolve(true)
      image.onerror = () => resolve(false)
      image.src = url
    })
    return { url, loaded, width: image.naturalWidth, height: image.naturalHeight }
  }, path)
  assert(asset.loaded && asset.width >= 1024 && asset.width * 2 === asset.height * 3,
    `missing or malformed 3×2 character rig: ${JSON.stringify(asset)}`)
  return asset
}

async function startSampling() {
  await page.evaluate(() => {
    const qa = { label: 'idle', samples: [], raf: 0 }
    const sample = () => {
      const game = window.__game2d
      if (game && qa.samples.length < 4800) {
        const appearance = game.lookOf(game.player)
        qa.samples.push({ label: qa.label, tick: game.timeline.tick, anim: game.player.anim,
          vx: game.player.vx, onGround: game.player.onGround, x: game.player.x,
          facing: appearance.facing, pose: appearance.pose, gait: appearance.gait,
          gaitPhase: appearance.gaitPhase })
      }
      qa.raf = requestAnimationFrame(sample)
    }
    window.__gaitQa = qa
    sample()
  })
}

const label = (value) => page.evaluate((next) => { window.__gaitQa.label = next }, value)
const samples = () => page.evaluate(() => window.__gaitQa.samples)
const bins = (list, gait) => [...new Set(list.filter((sample) => sample.gait === gait && sample.onGround)
  .map((sample) => Math.floor(sample.gaitPhase * 8)))].sort((a, b) => a - b)

async function diagnostic(id) {
  const data = await page.evaluate(async (character) => {
    const { drawGeneratedCharacter } = await import('/src/platformer/characters/atlas.ts')
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 640
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f9f4e8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(4, 4)
    ctx.fillStyle = '#263c51'
    ctx.font = '7px sans-serif'
    const draw = () => {
      let count = 0
      for (const [row, gait] of ['walk', 'run'].entries()) {
        const baseline = row ? 148 : 77
        ctx.fillText(gait.toUpperCase(), 3, baseline - 54)
        ctx.fillStyle = '#9aabb5'
        ctx.fillRect(0, baseline, 200, 0.5)
        ctx.fillStyle = '#263c51'
        for (let phase = 0; phase < 8; phase++) {
          const top = drawGeneratedCharacter(ctx, { character, x: 13 + phase * 25, y: baseline - 1,
            facing: 1, size: 'small', pose: 'walk2', spark: false, gait, gaitPhase: phase / 8 },
          'cartoon', Math.round, 0, 0)
          if (top !== null) count++
          ctx.fillText(String(phase), 10 + phase * 25, baseline + 8)
        }
      }
      return count
    }
    let count = draw()
    // The renderer warms the rig while idle; allow a bounded load retry for a cold dev module.
    for (let attempt = 0; count < 16 && attempt < 4; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      ctx.fillStyle = '#f9f4e8'
      ctx.fillRect(0, 0, 200, 160)
      ctx.fillStyle = '#263c51'
      count = draw()
    }
    return { count, png: canvas.toDataURL('image/png') }
  }, id)
  assert.equal(data.count, 16, `${id} diagnostic could draw only ${data.count}/16 gait samples`)
  await writeFile(`${out}/${id}-gait-diagnostic.png`, Buffer.from(data.png.split(',')[1], 'base64'))
}

try {
  await step('open local new world and enter Play', async () => {
    await page.goto(`${origin}/2d/build?new=1`)
    await page.locator('.p2d-game.p2d-building').waitFor()
    await page.waitForFunction(() => !!window.__game2d)
    await page.getByRole('radio', { name: 'Play' }).click()
    await page.locator('.p2d-game.p2d-playing').waitFor()
    await page.waitForFunction(() => window.__game2d.player.onGround, null, { timeout: 5000 })
    await startSampling()
  })

  for (const character of characters) {
    const { id } = character
    await step(`${id}: UI selection, 3×2 body-part rig, walk/run and directional gait`, async () => {
      // Give each character the same runway; otherwise the third can reach the world's goal.
      if (id !== characters[0].id) {
        await page.goto(`${origin}/2d/build?new=1`)
        await page.locator('.p2d-game.p2d-building').waitFor()
        await page.getByRole('radio', { name: 'Play', exact: true }).click()
        await page.waitForFunction(() => window.__game2d?.player.onGround)
        await startSampling()
      }
      await selectCharacter(character)
      const asset = await verifySheet(id)
      await label(`${id}:walk-right`)
      await page.keyboard.down('ArrowRight')
      try {
        await page.waitForFunction(() => window.__game2d.input.held.has('right'), null, { timeout: 1000 })
        await page.waitForTimeout(3200)
        await shot(`${id}-walking-right`)
      } finally {
        await page.keyboard.up('ArrowRight')
      }

      await page.waitForFunction(() => window.__game2d.player.vx === 0 && window.__game2d.player.onGround, null, { timeout: 2000 })
      const stopped = await look()
      await page.waitForTimeout(250)
      const still = await look()
      assert.equal(stopped.anim, still.anim, `${id} animation distance advanced while stopped`)
      assert.equal(stopped.gaitPhase, still.gaitPhase, `${id} gait phase advanced while stopped`)
      assert.equal(still.gait, undefined, `${id} still player has gait metadata`)

      await label(`${id}:run-right`)
      await page.keyboard.down('Shift')
      await page.keyboard.down('ArrowRight')
      try {
        await page.waitForFunction(() => window.__game2d.input.held.has('run') && window.__game2d.input.held.has('right'), null, { timeout: 1000 })
        await page.waitForTimeout(2800)
        await shot(`${id}-running-right`)
      } finally {
        await page.keyboard.up('ArrowRight')
        await page.keyboard.up('Shift')
      }
      await page.waitForFunction(() => window.__game2d.player.vx === 0 && window.__game2d.player.onGround, null, { timeout: 2000 })

      await label(`${id}:walk-left`)
      await page.keyboard.down('ArrowLeft')
      let left
      try {
        await page.waitForTimeout(1200)
        left = await look()
      } finally {
        await page.keyboard.up('ArrowLeft')
      }
      assert.equal(left.facing, -1, `${id} did not face left`)
      assert.equal(left.gait, 'walk', `${id} did not walk left`)
      await page.waitForFunction(() => window.__game2d.player.vx === 0 && window.__game2d.player.onGround, null, { timeout: 2000 })

      await label(`${id}:jump`)
      await page.keyboard.press('Space')
      await page.waitForFunction(() => !window.__game2d.player.onGround, null, { timeout: 1500 })
      const jumping = await look()
      assert.equal(jumping.gait, undefined, `${id} jump retained walking gait`)
      await page.waitForFunction(() => window.__game2d.player.onGround, null, { timeout: 3000 })
      await label('idle')

      const all = await samples()
      const walk = all.filter((entry) => entry.label === `${id}:walk-right`)
      const run = all.filter((entry) => entry.label === `${id}:run-right`)
      const walkBins = bins(walk, 'walk')
      const runBins = bins(run, 'run')
      assert.deepEqual(walkBins, [0, 1, 2, 3, 4, 5, 6, 7], `${id} walk missed a gait phase`)
      assert.deepEqual(runBins, [0, 1, 2, 3, 4, 5, 6, 7], `${id} run missed a gait phase`)
      assert(walk.some((entry) => entry.facing === 1), `${id} walk did not face right`)
      assert(run.some((entry) => entry.facing === 1), `${id} run did not face right`)
      observations[id] = { asset, walkBins, runBins, stopped, still, left, jumping,
        walkSamples: walk, runSamples: run, leftSamples: all.filter((entry) => entry.label === `${id}:walk-left`) }
      await diagnostic(id)
    })
  }
} finally {
  await page.evaluate(() => { if (window.__gaitQa) cancelAnimationFrame(window.__gaitQa.raf) }).catch(() => {})
  await context.close()
  await browser.close()
}

let videoFile = ''
try {
  const source = await video.path()
  videoFile = `${out}/gait-all-characters.webm`
  await rename(source, videoFile)
} catch (error) {
  errors.push(`video: ${error?.message ?? error}`)
}
const failed = results.filter((result) => !result.ok)
const report = { origin, when: new Date().toISOString(), host: hostSnapshot(), results, observations, videoFile, errors }
await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed · ${errors.length} browser errors · ${out}`)
if (failed.length || errors.length) process.exitCode = 1
