/**
 * Safari on an iOS / iPadOS Simulator, driven through safaridriver's W3C WebDriver HTTP API with plain
 * `fetch` (no npm dependency). Taps and drags are W3C Actions with `pointerType: 'touch'`: WebKit's
 * automation turns them into real touch events on the simulated device, so the page sees
 * `pointerType === 'touch'`, `(pointer: coarse)` and TouchEvents exactly as it does under a finger.
 *
 * Recipe (verified 2026-09-23, Xcode 26 / iOS 26.5 runtime / Safari 26.5):
 *   1. A simulator is booted (`xcrun simctl list devices booted`).
 *   2. `safaridriver -p 4471` is running on the Mac (no `--enable` and no password were needed for the
 *      simulator; `ensureSafariDriver` starts one when nothing answers on the port).
 *   3. POST /session with `platformName: 'iOS'`, `'safari:useSimulator': true`, `'safari:deviceUDID'`.
 *      Safari opens a new automation window on the device.
 *   4. `execute/sync` for reads (dev hooks, rects, state); `actions` for input; `xcrun simctl io <udid>
 *      screenshot` for what the student sees (includes Safari's chrome and system overlays), the
 *      WebDriver screenshot for the page alone.
 *
 * Coordinates for actions are CSS pixels in the layout viewport (the same space as
 * `getBoundingClientRect` and `clientX/clientY`).
 */
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { unlink, writeFile } from 'node:fs/promises'

const run = promisify(execFile)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function driverReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(2000) })
    const body = await response.json()
    return Boolean(body?.value?.ready ?? body?.value)
  } catch {
    return false
  }
}

/** Starts `safaridriver -p <port>` unless one already answers there. Returns the child (or null) so the caller can stop it. */
export async function ensureSafariDriver(port = 4471) {
  if (await driverReady(port)) return null
  const child = spawn('safaridriver', ['-p', String(port)], { stdio: 'ignore' })
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await driverReady(port)) return child
    await sleep(250)
  }
  child.kill()
  throw new Error(`safaridriver did not come up on port ${port}`)
}

export async function bootedDevice(preferredUdid) {
  const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'])
  const devices = Object.values(JSON.parse(stdout).devices).flat().filter((device) => device.state === 'Booted')
  const device = preferredUdid ? devices.find((d) => d.udid === preferredUdid) : devices.find((d) => /iPad/.test(d.name)) ?? devices[0]
  if (!device) throw new Error(preferredUdid ? `simulator ${preferredUdid} is not booted` : 'no booted simulator')
  return device
}

export class SafariSimulator {
  constructor({ port, sessionId, udid, capabilities }) {
    this.base = `http://127.0.0.1:${port}/session/${sessionId}`
    this.sessionId = sessionId
    this.udid = udid
    this.capabilities = capabilities
  }

  static async open({ port = 4471, udid }) {
    const response = await fetch(`http://127.0.0.1:${port}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': udid } } }),
      signal: AbortSignal.timeout(120_000),
    })
    const body = await response.json()
    if (!body?.value?.sessionId) throw new Error(`safaridriver refused the session: ${JSON.stringify(body?.value ?? body)}`)
    return new SafariSimulator({ port, sessionId: body.value.sessionId, udid, capabilities: body.value.capabilities })
  }

  /** Re-uses a session that is already open (handy while exploring from a REPL). */
  static attach({ port = 4471, sessionId, udid }) {
    return new SafariSimulator({ port, sessionId, udid, capabilities: null })
  }

  async command(method, route, payload, timeout = 60_000) {
    const response = await fetch(`${this.base}${route}`, {
      method,
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    })
    const body = await response.json().catch(() => ({}))
    if (body?.value && typeof body.value === 'object' && 'error' in body.value) {
      const error = new Error(`${method} ${route}: ${body.value.error}: ${body.value.message}`)
      error.webdriver = body.value
      throw error
    }
    return body?.value
  }

  navigate(url) { return this.command('POST', '/url', { url }, 120_000) }
  close() { return this.command('DELETE', '', undefined, 20_000) }
  /** Recovery for a wedged session (see `gesture`): quits Safari on the device so a new session can pair. */
  quitSafari() { return run('xcrun', ['simctl', 'terminate', this.udid, 'com.apple.mobilesafari']) }

  /**
   * Runs `fn(...args)` in the page and returns its (JSON) result. `fn` is serialised with
   * `toString()`, so it must not close over Node variables. Promises are awaited.
   */
  exec(fn, ...args) {
    return this.command('POST', '/execute/async', {
      script: `const done = arguments[arguments.length - 1]; Promise.resolve().then(() => (${fn.toString()}).apply(null, Array.prototype.slice.call(arguments, 0, -1))).then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: String(error && error.stack || error) }))`,
      args,
    }).then((result) => {
      if (!result?.ok) throw new Error(`page script failed: ${result?.error}`)
      return result.value
    })
  }

  async waitFor(fn, { timeout = 20_000, interval = 200, args = [] } = {}) {
    const until = Date.now() + timeout
    let last
    while (Date.now() < until) {
      try { last = await this.exec(fn, ...args); if (last) return last } catch (error) { last = error }
      await sleep(interval)
    }
    throw new Error(`timed out waiting for ${fn.toString().slice(0, 120)} (last: ${last})`)
  }

  actions(actions) { return this.command('POST', '/actions', { actions }) }

  /**
   * Safari 26.5 on the simulator delivers the last touch event of an actions command (the lift) only when the next
   * pointer command arrives, so every gesture ends with a short pause on the same finger to flush it. Without it the
   * page sees `touchstart` and nothing else, and a later `DELETE /actions` delivers the lift at (0, 0) and can add a
   * phantom `touchstart`. Never call release on this driver.
   *
   * Do not drag over a natively scrolling region (an `overflow: auto` list, the page): the gesture returns, then the
   * session stops answering (every later command times out) until Safari is quit. Canvas drags (`touch-action: none`)
   * are fine. Multi-finger chains deliver only one finger.
   */
  async gesture(steps) {
    await this.actions([{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: steps }])
    await this.actions([{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: [{ type: 'pause', duration: 16 }] }])
  }

  /** One finger down and up at (x, y). `hold` is the contact time in ms. */
  async tap(x, y, { hold = 60 } = {}) {
    await this.gesture([
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(x), y: Math.round(y) },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: hold },
      { type: 'pointerUp', button: 0 },
    ])
  }

  /**
   * Two taps at (x, y) as two separate tap commands. A single actions chain holding both taps does not work on the
   * simulator: WebKit delivers one long touch (the first lift and the second press are lost). Two commands land
   * about 115 ms apart lift to lift (localhost, Safari 26.5), inside a 350 ms double-tap window; `gap` adds a wait.
   */
  async doubleTap(x, y, { hold = 40, gap = 0 } = {}) {
    await this.tap(x, y, { hold })
    if (gap) await sleep(gap)
    await this.tap(x, y, { hold })
  }

  /** A one-finger drag through `points` ([{x, y}]), `stepMs` per segment. */
  async drag(points, { stepMs = 60, holdBefore = 0 } = {}) {
    const [first, ...rest] = points
    await this.gesture([
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(first.x), y: Math.round(first.y) },
      { type: 'pointerDown', button: 0 },
      ...(holdBefore ? [{ type: 'pause', duration: holdBefore }] : []),
      ...rest.map((p) => ({ type: 'pointerMove', duration: stepMs, origin: 'viewport', x: Math.round(p.x), y: Math.round(p.y) })),
      { type: 'pointerUp', button: 0 },
    ])
  }

  /** Types text into the focused element through the keyboard action source (the on-screen keyboard is bypassed). */
  async typeText(text) {
    const keys = [...text].flatMap((ch) => [{ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch }])
    await this.actions([{ type: 'key', id: 'keyboard', actions: keys }])
  }

  /** WebDriver element reference for a CSS selector (for Element Send Keys / Clear; taps stay touch actions). */
  async findElement(css) {
    const value = await this.command('POST', '/element', { using: 'css selector', value: css })
    return Object.values(value)[0]
  }

  /** Element Send Keys: WebKit types the text into the element as keyboard input (input events fire per character). */
  sendKeys(elementId, text) { return this.command('POST', `/element/${elementId}/value`, { text }) }

  /**
   * The page (WebDriver screenshot, device pixels). On iPadOS 26 Safari this is the WHOLE web view, which reaches up
   * under Safari's toolbar: 1640×2360 on an iPad Air 11" while the layout viewport is 820×1094 CSS px starting 86 pt
   * down. Scaling it to the viewport's size squashes it (coordinates read off it miss by up to ~75 px); use
   * `viewportScreenshot` for anything a tester reads coordinates from.
   */
  async pageScreenshot(file) {
    const base64 = await this.command('GET', '/screenshot')
    await writeFile(file, Buffer.from(base64, 'base64'))
    return file
  }

  /**
   * Exactly the layout viewport (device pixels): an element screenshot of the root element, which WebKit crops to
   * its rect — the same space as `getBoundingClientRect` and the `origin: 'viewport'` touch actions. Verified
   * 2026-09-23 (iPad Air 11" M4, iOS 26.5): 1640×2188 for a 820×1094 viewport, with a fixed `top: 0` probe at the
   * image's first row (the full `pageScreenshot` has it 172 px down).
   */
  async viewportScreenshot(file) {
    const root = await this.findElement('html')
    const base64 = await this.command('GET', `/element/${root}/screenshot`)
    await writeFile(file, Buffer.from(base64, 'base64'))
    return file
  }

  /**
   * The whole simulated screen, as the student sees it: Safari's bars, the page, system overlays.
   * `maxSide` downsizes with `sips` (1640×2360 device pixels → 820×1180 at `maxSide: 1180`); a `.jpg` file name
   * re-encodes as JPEG (`quality`, default 82), which keeps an evidence set small enough to commit.
   */
  async deviceScreenshot(file, { maxSide, quality = 82 } = {}) {
    const jpeg = /\.jpe?g$/i.test(file)
    const raw = jpeg ? `${file}.png` : file
    await run('xcrun', ['simctl', 'io', this.udid, 'screenshot', raw])
    const args = [...(maxSide ? ['-Z', String(maxSide)] : []), ...(jpeg ? ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)] : [])]
    if (args.length) await run('sips', [...args, raw, ...(jpeg ? ['--out', file] : [])])
    if (jpeg) await unlink(raw)
    return file
  }
}
