/**
 * A remote-controlled Chrome for novice usability testing.
 *
 * A tester (a person or an agent role-playing a young student) sees only screenshots and acts only through the
 * mouse, the keyboard and plain page text, exactly as a student would. No dev hooks drive decisions; the
 * `measure` call exists only for the final verdict and every use of it is logged in the transcript.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/remote-browser.mjs \
 *     --port 9301 --origin http://127.0.0.1:5232 --viewport 1366x768 --out /tmp/session [--fresh]
 *
 * Then POST JSON to http://127.0.0.1:<port>/ ; every action answers with the path of a fresh screenshot:
 *   {"do":"screenshot"}
 *   {"do":"click","x":100,"y":200}            optional "button":"right", "count":2
 *   {"do":"move","x":100,"y":200}
 *   {"do":"drag","from":[100,200],"to":[300,200],"steps":20}    optional "button":"right", "holdMs":800 (stay at the end before release)
 *   {"do":"press","key":"ArrowUp"}             Playwright key names; optional "holdMs":1500 to hold it down
 *   {"do":"type","text":"Rocket"}
 *   {"do":"wheel","x":600,"y":400,"dy":-300}
 *   {"do":"wait","ms":1500}
 *   {"do":"text"}                              the page's visible text (what a student can read)
 *   {"do":"measure","what":"robots"|"document"|"stage"}   verdict only: logged as MEASURE in the transcript
 *   {"do":"quit"}
 * A transcript of every call is written to <out>/transcript.jsonl.
 */
import http from 'node:http'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin } from './lib/env.mjs'
import { PROJECT_KEY } from './lib/ui.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : true]] : pairs), []))
const port = Number(args.port ?? 9301)
const origin = localOrigin('UI_ORIGIN', args.origin ?? 'http://127.0.0.1:5232', 'a novice session may clear the guest project')
const [width, height] = String(args.viewport ?? '1366x768').split('x').map(Number)
const out = String(args.out ?? `/tmp/remote-browser-${port}`)
await mkdir(out, { recursive: true })

const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto(`${origin}/build`)
if (args.fresh) {
  await page.evaluate((key) => window.localStorage.clear?.() ?? window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
}
await page.waitForSelector('canvas', { timeout: 30_000 })
await page.waitForTimeout(1500)

let count = 0
const log = (entry) => appendFile(path.join(out, 'transcript.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
const snap = async (label = '') => {
  count += 1
  const file = path.join(out, `${String(count).padStart(3, '0')}${label ? `-${label.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}` : ''}.png`)
  await page.screenshot({ path: file })
  return file
}

async function act(body) {
  const kind = body.do
  switch (kind) {
    case 'screenshot': break
    case 'click': await page.mouse.click(body.x, body.y, { button: body.button ?? 'left', clickCount: body.count ?? 1 }); break
    case 'move': await page.mouse.move(body.x, body.y, { steps: body.steps ?? 8 }); break
    case 'drag': {
      const [fx, fy] = body.from
      const [tx, ty] = body.to
      await page.mouse.move(fx, fy)
      await page.mouse.down({ button: body.button ?? 'left' })
      await page.mouse.move(tx, ty, { steps: body.steps ?? 20 })
      if (body.holdMs) await page.waitForTimeout(body.holdMs)
      await page.mouse.up({ button: body.button ?? 'left' })
      break
    }
    case 'press':
      if (body.holdMs) { await page.keyboard.down(body.key); await page.waitForTimeout(body.holdMs); await page.keyboard.up(body.key) } else await page.keyboard.press(body.key)
      break
    case 'type': await page.keyboard.type(String(body.text ?? ''), { delay: 30 }); break
    case 'wheel': await page.mouse.move(body.x, body.y); await page.mouse.wheel(0, body.dy ?? 0); break
    case 'wait': await page.waitForTimeout(Math.min(10_000, body.ms ?? 500)); break
    case 'text': {
      const text = await page.evaluate(() => document.body.innerText)
      await log({ do: kind })
      return { text }
    }
    case 'measure': {
      const what = body.what ?? 'robots'
      const value = await page.evaluate((w) => {
        const hook = window.__robotics
        if (!hook) return { error: 'no dev hook' }
        const r = hook.roboticsStore.getState()
        if (w === 'document') return JSON.parse(JSON.stringify(hook.brickStore.getState().getDocumentSnapshot()))
        if (w === 'stage') return hook.stageStore?.getState().stageObservation ?? null
        return r.model.creations.map((c) => ({ name: c.name, kind: c.kind, bricks: c.brickIds.length, drivePair: Boolean(c.drivePair), motors: c.motors.map((m) => ({ name: m.name, axle: Boolean(m.axleId), wheels: m.wheelIds.length, plugged: m.plugged })), wheels: c.wheels.map((w2) => ({ onAxle: w2.onAxle, note: w2.note })), lines: c.lines }))
      }, what)
      await log({ do: 'MEASURE', what })
      return { measure: value }
    }
    case 'quit':
      await log({ do: kind })
      setTimeout(async () => { await browser.close(); process.exit(0) }, 50)
      return { ok: true }
    default:
      return { error: `unknown action ${kind}` }
  }
  await page.waitForTimeout(body.settleMs ?? 350)
  const screenshot = await snap(kind)
  await log({ ...body, screenshot })
  return { screenshot, errors: errors.splice(0) }
}

http.createServer((request, response) => {
  let data = ''
  request.on('data', (chunk) => { data += chunk })
  request.on('end', async () => {
    try {
      const result = await act(data ? JSON.parse(data) : { do: 'screenshot' })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(result))
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: String(error) }))
    }
  })
}).listen(port, '127.0.0.1', async () => {
  const first = await snap('start')
  console.log(`remote browser on http://127.0.0.1:${port}  (viewport ${width}x${height}, screenshots in ${out}); first screenshot ${first}`)
})
