/**
 * A remote-controlled iPadOS Safari (iOS Simulator) for novice usability testing by touch.
 *
 * Same contract as `remote-browser.mjs`: the tester sees only screenshots and acts only through touch (one finger),
 * the page's visible text and, when a field has focus, typed text. Screenshots are the page only, scaled so ONE PIXEL
 * IS ONE CSS PIXEL: the x/y you read off a screenshot is the x/y you tap.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/remote-ipad.mjs \
 *     --port 9311 --origin http://127.0.0.1:5232 --out /tmp/ipad-session [--fresh] [--udid <booted iPad>]
 *
 * POST JSON to http://127.0.0.1:<port>/ :
 *   {"do":"screenshot"}                       also {"do":"device"} for the whole screen with Safari's bars (not to scale)
 *   {"do":"tap","x":100,"y":200}              optional "holdMs": a long press
 *   {"do":"doubleTap","x":100,"y":200}
 *   {"do":"drag","points":[[100,200],[300,200]],"stepMs":60}   optional "holdBefore": ms before moving
 *   {"do":"type","text":"Rocket"}             into the focused field (WebKit automation may drop it; the page text tells)
 *   {"do":"wait","ms":1500}
 *   {"do":"text"}                             the page's visible text
 *   {"do":"measure","what":"robots"|"document"|"stage"}   verdict only: logged as MEASURE
 *   {"do":"quit"}
 * Rules learned on this simulator (docs/qa/robotics-cp3/touch/README.md): one finger only; never drag over a list that
 * scrolls natively (it can hang Safari); a double tap is two taps.
 */
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { localOrigin } from './lib/env.mjs'
import { PROJECT_KEY } from './lib/ui.mjs'
import { SafariSimulator, bootedDevice, ensureSafariDriver } from './lib/safari-ios.mjs'

const run = promisify(execFile)
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : true]] : pairs), []))
const port = Number(args.port ?? 9311)
const origin = localOrigin('UI_ORIGIN', args.origin ?? 'http://127.0.0.1:5232', 'a novice session may clear the guest project')
const out = String(args.out ?? `/tmp/remote-ipad-${port}`)
await mkdir(out, { recursive: true })

const driverPort = Number(args.driver ?? 4471)
const driver = await ensureSafariDriver(driverPort)
const device = await bootedDevice(args.udid)
const safari = await SafariSimulator.open({ port: driverPort, udid: device.udid ?? device })
await safari.navigate(`${origin}/build`)
if (args.fresh) {
  await safari.exec((key) => { window.localStorage.clear?.(); window.localStorage.removeItem(key) }, PROJECT_KEY)
  await safari.navigate(`${origin}/build`)
}
await new Promise((resolve) => setTimeout(resolve, 3000))

let count = 0
const log = (entry) => appendFile(path.join(out, 'transcript.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
async function snap(label = '') {
  count += 1
  const file = path.join(out, `${String(count).padStart(3, '0')}${label ? `-${label.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}` : ''}.png`)
  const [width, height] = await safari.exec(() => [window.innerWidth, window.innerHeight])
  const raw = `${file}.raw.png`
  await safari.pageScreenshot(raw)
  // Scale device pixels to CSS pixels so a coordinate read off the image is a coordinate to tap.
  await run('sips', ['-z', String(height), String(width), raw, '--out', file])
  await unlink(raw)
  return file
}

async function act(body) {
  switch (body.do) {
    case 'screenshot': break
    case 'device': {
      count += 1
      const file = path.join(out, `${String(count).padStart(3, '0')}-device.jpg`)
      await safari.deviceScreenshot(file, { maxSide: 1180 })
      await log({ do: 'device', screenshot: file })
      return { screenshot: file }
    }
    case 'tap': await safari.tap(body.x, body.y, { hold: body.holdMs ?? 60 }); break
    case 'doubleTap': await safari.doubleTap(body.x, body.y); break
    case 'drag': await safari.drag(body.points.map(([x, y]) => ({ x, y })), { stepMs: body.stepMs ?? 60, holdBefore: body.holdBefore ?? 0 }); break
    case 'type': await safari.typeText(String(body.text ?? '')); break
    case 'wait': await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, body.ms ?? 500))); break
    case 'text': {
      const text = await safari.exec(() => document.body.innerText)
      await log({ do: 'text' })
      return { text }
    }
    case 'measure': {
      const what = body.what ?? 'robots'
      const value = await safari.exec((w) => {
        const hook = window.__robotics
        if (!hook) return { error: 'no dev hook' }
        if (w === 'document') return JSON.parse(JSON.stringify(hook.brickStore.getState().getDocumentSnapshot()))
        if (w === 'stage') return hook.stageStore?.getState().stageObservation ?? null
        return hook.roboticsStore.getState().model.creations.map((c) => ({ name: c.name, kind: c.kind, bricks: c.brickIds.length, drivePair: Boolean(c.drivePair), motors: c.motors.map((m) => ({ name: m.name, axle: Boolean(m.axleId), wheels: m.wheelIds.length, plugged: m.plugged })) }))
      }, what)
      await log({ do: 'MEASURE', what })
      return { measure: value }
    }
    case 'quit':
      await log({ do: 'quit' })
      setTimeout(async () => { try { await safari.close() } catch { /* already gone */ } driver?.kill(); process.exit(0) }, 50)
      return { ok: true }
    default:
      return { error: `unknown action ${body.do}` }
  }
  await new Promise((resolve) => setTimeout(resolve, body.settleMs ?? 450))
  const screenshot = await snap(body.do)
  await log({ ...body, screenshot })
  return { screenshot }
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
  console.log(`remote iPad on http://127.0.0.1:${port} (screenshots in ${out}, 1 px = 1 CSS px); first screenshot ${first}`)
})
