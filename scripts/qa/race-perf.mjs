/**
 * Hackable Racing R1 performance check (docs/qa/hackable-modes/README.md, "Performance").
 *
 * In headless Chrome, against a local Vite dev server, with the CPU slowed through DevTools (Emulation.setCPUThrottlingRate):
 * the beginner track (every painted cell a target) with the Car and two Computer racers. It measures Play start
 * (instantiate + green flag), then plays the race on animation frames as the Stage does: one `runtime.step()` every
 * other frame (30 ticks a second) and a draw every frame with the Stage's own Play renderer (renderPlayMode) into a
 * 960 x 540 canvas, the whole track in view.
 *
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH (scripts/qa/lib/env.mjs), UI_ORIGIN (default http://127.0.0.1:5196),
 * RATES (comma-separated slowdowns, default "1,4,6"), TICKS (default 900, 30 seconds of play).
 */
import { hostSnapshot, launchOptions, loadChromium, localOrigin } from './lib/env.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5196', 'the harness only reads, but it loads source modules from Vite.')
const rates = (process.env.RATES || '1,4,6').split(',').map(Number)
const ticks = Number(process.env.TICKS || 900)

const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const report = { timestamp: new Date().toISOString(), origin, ticks, hostBefore: hostSnapshot(), runs: [] }
try {
  for (const rate of rates) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(origin + '/')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    const run = await page.evaluate(async (ticks) => {
      const { play } = await import('/src/platformer/lab/core/index.ts')
      const { createBeginnerRace } = await import('/src/platformer/lab/studio/race/raceTrack.ts')
      const { renderPlayMode } = await import('/src/platformer/lab/studio/stage/renderer.ts')
      const { buildCamera } = await import('/src/platformer/lab/studio/stage/camera.ts')
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = 540
      document.body.append(canvas)
      const ctx = canvas.getContext('2d')
      const viewport = { width: 960, height: 540 }
      const stats = (xs) => {
        const s = [...xs].sort((a, b) => a - b)
        return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }
      }
      const design = createBeginnerRace()
      // A warm-up Play so the modules and costume images are ready, then the measured one.
      const warm = play(design)
      for (let i = 0; i < 60; i++) {
        warm.step()
        renderPlayMode(ctx, warm.world, { camera: buildCamera(warm.world.bounds, viewport), viewport })
      }
      await new Promise((r) => setTimeout(r, 500))
      let t = performance.now()
      const runtime = play(design)
      const startMs = performance.now() - t
      const camera = buildCamera(runtime.world.bounds, viewport)
      // Like the Stage: one tick every other animation frame (30 ticks drawn at 60 frames a second), a draw every frame.
      const step = [], draw = [], frameJs = [], intervals = []
      let frames = 0, done = 0, prev = performance.now()
      await new Promise((resolve) => {
        const frame = (now) => {
          intervals.push(now - prev)
          prev = now
          const a = performance.now()
          if (frames % 2 === 0) {
            runtime.step()
            step.push(performance.now() - a)
            done++
          }
          const b = performance.now()
          renderPlayMode(ctx, runtime.world, { camera, viewport })
          const c = performance.now()
          draw.push(c - b)
          frameJs.push(c - a)
          frames++
          if (done < ticks) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      intervals.shift()
      const results = runtime.world.stage.lists.results ?? []
      return {
        targets: runtime.world.targets.length,
        cells: runtime.world.targets.filter((x) => x.copyId?.startsWith('cell:')).length,
        startMs,
        frames,
        step: stats(step),
        draw: stats(draw),
        frameJs: stats(frameJs),
        /** Time between animation frames: 16.7 ms is a smooth 60 frames a second. */
        frameInterval: stats(intervals),
        framesOver25ms: intervals.filter((x) => x > 25).length,
        framesOver50ms: intervals.filter((x) => x > 50).length,
        results,
      }
    }, ticks)
    report.runs.push({ rate, ...run, errors })
    console.log('RUN', JSON.stringify({ rate, ...run, errors }))
    await context.close()
  }
} finally {
  report.hostAfter = hostSnapshot()
  await browser.close()
}
console.log('REPORT', JSON.stringify(report))
