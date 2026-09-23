/**
 * Social cut: the 3D and 2D demos back to back with title cards, for LinkedIn and other feeds. Feeds autoplay muted,
 * so the words are on screen. Run after record-3d.mjs and record-2d.mjs; it reads their frames from DEMO_OUT.
 *
 * Writes brickgineers-demo-1080p.mp4 (16:9: card, 3D, card, 2D, end card) and brickgineers-demo-square.mp4 (1:1: the
 * same, with each clip framed under its caption). Cards are drawn in HTML with the site's fonts and colours.
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { launchOptions, loadChromium } from '../qa/lib/env.mjs'
import { ffmpeg, OUT, VIDEO, VIDEO_TAGS } from './lib/studio.mjs'

const FPS = 60
const FADE = 0.4
const INK = '#263C51'
const PAPER = '#F8F4EB'
const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 7 H44 A12 12 0 0 1 56 19 V19 A12 12 0 0 1 44 31 H14 A6 6 0 0 1 8 25 V13 A6 6 0 0 1 14 7 Z" fill="#5888DA"/><path d="M14 33 H44 A12 12 0 0 1 56 45 V45 A12 12 0 0 1 44 57 H14 A6 6 0 0 1 8 51 V39 A6 6 0 0 1 14 33 Z" fill="#F17861"/><circle cx="22" cy="19" r="4.6" fill="#8FB0EA"/><circle cx="38" cy="19" r="4.6" fill="#8FB0EA"/><circle cx="22" cy="45" r="4.6" fill="#F8A896"/><circle cx="38" cy="45" r="4.6" fill="#F8A896"/></svg>`

const CLIPS = [
  { name: 'build-3d', chip: '3D', tint: '#5888DA', title: 'Build it in 3D.', line: 'Pick a brick, click to place it, then step inside.' },
  { name: 'build-2d', chip: '2D', tint: '#F17861', title: 'Or build it in 2D.', line: 'Paint a world, press play, run through it.' },
]
const END = { title: 'Snap it together. Then play it.', line: 'brickgineers.com' }

const page = (w, h, body, { transparent = false } = {}) => `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Nunito:wght@700;800&display=block">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  body { background: ${transparent ? 'transparent' : PAPER}; color: ${INK}; font-family: Nunito, sans-serif; position: relative; }
  .centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 8%; }
  .mark svg { display: block; width: 100%; height: 100%; }
  h1 { font-family: Fredoka, sans-serif; font-weight: 600; letter-spacing: -0.01em; line-height: 1.04; }
  .chip { display: inline-block; font-family: Fredoka, sans-serif; font-weight: 600; color: #fff; border-radius: 999px; }
  .line { font-weight: 700; color: #5B6B7A; }
  .url { font-weight: 800; }
</style></head><body>${body}</body></html>`

/** A full-screen title card. `s` scales it (1 at 1080 px tall). */
const card = ({ chip, tint, title, line }, w, h, s) => page(w, h, `<div class="centre">
  ${chip ? `<span class="chip" style="background:${tint};font-size:${44 * s}px;padding:${8 * s}px ${30 * s}px">${chip}</span>` : `<div class="mark" style="width:${150 * s}px;height:${150 * s}px"></div>`}
  <h1 style="font-size:${(chip ? 132 : 104) * s}px;margin-top:${34 * s}px">${title}</h1>
  <p class="${chip ? 'line' : 'url'}" style="font-size:${(chip ? 46 : 52) * s}px;margin-top:${30 * s}px">${line}</p>
</div>`)

/** The square frame around a clip: caption above, mark and address below, a rounded window cut out for the video. */
const WINDOW = { x: 40, y: 259, w: 1000, h: 562 }
const frame = ({ title }) => page(1080, 1080, `
  <div style="position:absolute;left:${WINDOW.x}px;top:${WINDOW.y}px;width:${WINDOW.w}px;height:${WINDOW.h}px;border-radius:28px;box-shadow:0 0 0 3px rgba(38,60,81,.10),0 0 0 2000px ${PAPER}"></div>
  <div class="centre" style="bottom:${1080 - WINDOW.y}px"><h1 style="font-size:78px">${title}</h1></div>
  <div class="centre" style="top:${WINDOW.y + WINDOW.h}px;flex-direction:row;gap:18px">
    <div class="mark" style="width:58px;height:58px"></div><span class="url" style="font-size:40px">brickgineers.com</span>
  </div>`, { transparent: true })

async function render(browser, html, file, w, h) {
  const tab = await browser.newPage({ viewport: { width: w, height: h } })
  await tab.setContent(html.replace(/<div class="mark"([^>]*)><\/div>/g, `<div class="mark"$1>${MARK}</div>`), { waitUntil: 'networkidle' })
  await tab.evaluate(() => document.fonts.ready)
  await tab.screenshot({ path: file, omitBackground: true })
  await tab.close()
}

/** Join segments (each an ffmpeg input list and a filter that turns it into [sN]) with cross-fades. */
function join(segments, out) {
  const inputs = []
  const filters = []
  segments.forEach((seg, i) => {
    const first = inputs.filter((a) => a === '-i').length
    inputs.push(...seg.inputs)
    filters.push(`${seg.filter(first)},fps=${FPS},setsar=1,${VIDEO},settb=AVTB[s${i}]`)
  })
  let offset = 0
  let last = 's0'
  for (let i = 1; i < segments.length; i++) {
    offset += segments[i - 1].seconds - FADE
    filters.push(`[${last}][s${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${i}]`)
    last = `x${i}`
  }
  ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', `[${last}]`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', ...VIDEO_TAGS, '-movflags', '+faststart', out], out)
  const total = segments.reduce((sum, seg) => sum + seg.seconds, 0) - FADE * (segments.length - 1)
  console.log(`[social] ${out} (${total.toFixed(1)} s)`)
}

const dir = path.join(OUT, 'social-cards')
await mkdir(dir, { recursive: true })
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions({}))
for (const clip of CLIPS) {
  await render(browser, card(clip, 1920, 1080, 1), path.join(dir, `${clip.name}-card.png`), 1920, 1080)
  await render(browser, card(clip, 1080, 1080, 0.78), path.join(dir, `${clip.name}-card-square.png`), 1080, 1080)
  await render(browser, frame(clip), path.join(dir, `${clip.name}-frame-square.png`), 1080, 1080)
}
await render(browser, card(END, 1920, 1080, 1), path.join(dir, 'end.png'), 1920, 1080)
await render(browser, card(END, 1080, 1080, 0.78), path.join(dir, 'end-square.png'), 1080, 1080)
await browser.close()

const still = (file, seconds) => ['-loop', '1', '-framerate', String(FPS), '-t', String(seconds), '-i', file]
const clips = await Promise.all(CLIPS.map(async (clip) => {
  const meta = JSON.parse(await readFile(path.join(OUT, `${clip.name}.json`), 'utf8'))
  return { ...clip, fps: meta.fps, seconds: meta.frames / meta.fps, frames: ['-framerate', String(meta.fps), '-i', path.join(OUT, `${clip.name}-frames`, 'f%05d.jpg')] }
}))

const wide = []
const square = []
for (const clip of clips) {
  wide.push({ inputs: still(path.join(dir, `${clip.name}-card.png`), 1.6), seconds: 1.6, filter: (i) => `[${i}:v]scale=1920:1080` })
  wide.push({ inputs: clip.frames, seconds: clip.seconds, filter: (i) => `[${i}:v]scale=1920:1080` })
  square.push({ inputs: still(path.join(dir, `${clip.name}-card-square.png`), 1.6), seconds: 1.6, filter: (i) => `[${i}:v]scale=1080:1080` })
  square.push({
    inputs: [...clip.frames, ...still(path.join(dir, `${clip.name}-frame-square.png`), clip.seconds)],
    seconds: clip.seconds,
    filter: (i) => `[${i}:v]scale=${WINDOW.w}:${WINDOW.h},pad=1080:1080:${WINDOW.x}:${WINDOW.y}:color=${PAPER}[p${i}];[p${i}][${i + 1}:v]overlay=0:0:shortest=1`,
  })
}
wide.push({ inputs: still(path.join(dir, 'end.png'), 3), seconds: 3, filter: (i) => `[${i}:v]scale=1920:1080` })
square.push({ inputs: still(path.join(dir, 'end-square.png'), 3), seconds: 3, filter: (i) => `[${i}:v]scale=1080:1080` })
join(wide, path.join(OUT, 'brickgineers-demo-1080p.mp4'))
join(square, path.join(OUT, 'brickgineers-demo-square.mp4'))
