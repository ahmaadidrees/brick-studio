#!/usr/bin/env node
// Generates Brick Studio's icon and link-preview artwork into public/.
//
//   node scripts/assets/build-brand-assets.mjs
//
// The art is drawn in code in the same flat-shaded isometric language as the
// landing page (src/brick/landing/LandingArt.tsx) so it stays consistent with
// the product without importing React at build time. It contains no wordmark
// or text, so a future product rename does not require new artwork.
//
// Outputs (vector sources are committed next to the PNGs so a reviewer can
// open them in a browser):
//   public/favicon.svg          rounded tile + 2x2 brick, scales to any size
//   public/favicon-32.png       PNG fallback for browsers without SVG favicons
//   public/icon-192.png         web app manifest icon (full bleed)
//   public/icon-512.png         web app manifest icon (full bleed / maskable)
//   public/apple-touch-icon.png 180x180, full bleed (iOS rounds it)
//   public/og-image.png         1200x630 Open Graph / Twitter card image
//   scripts/assets/og-image.svg vector source of the card image
//
// Rasterizing needs no extra dependency: the script uses `sharp` when it is
// resolvable from node_modules (it arrives transitively through miniflare in
// the worker workspace) and otherwise falls back to macOS `qlmanage` + `sips`.
// If neither is available it still writes the SVGs and prints the commands.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLIC_DIR = join(ROOT, 'public')
const VECTOR_DIR = join(ROOT, 'scripts', 'assets')

// Landing-page palette (LandingArt.tsx + landing.css); the app's theme-color is the sky tint.
const COLOR = {
  blue: '#3e83d7',
  red: '#e2574c',
  yellow: '#f0be54',
  green: '#31a06c',
  purple: '#8d6bd9',
  teal: '#1fa3b8',
  plate: '#dfe0d0',
  cream: '#fffaf0',
  ink: '#294650',
  sky: '#e9fbff',
  paper: '#fdf6e9',
}
const EDGE = 'rgba(31, 62, 84, 0.2)'
const ISO_X = 0.866
const ISO_Y = 0.5

const f = (value) => Number(value.toFixed(2)).toString()

/** Projects grid space (x right-down, z left-down, y up) to screen space. */
function point(x, y, z, scale) {
  return [(x - z) * ISO_X * scale, (x + z) * ISO_Y * scale - y * scale]
}

function polygon(coords) {
  return coords.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
}

/** Mixes a hex color toward white (positive) or black (negative). */
function shade(hex, amount) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
  const target = amount >= 0 ? 255 : 0
  const mix = Math.abs(amount)
  return `#${channels
    .map((channel) => Math.round(channel + (target - channel) * mix).toString(16).padStart(2, '0'))
    .join('')}`
}

/** One shaded brick box: top and the two camera-facing sides, plus optional studs. */
function isoBox({ x, z, y, w, d, h, color, studs = true, s }) {
  const x1 = x + w
  const z1 = z + d
  const y1 = y + h
  const top = polygon([point(x, y1, z, s), point(x1, y1, z, s), point(x1, y1, z1, s), point(x, y1, z1, s)])
  const right = polygon([point(x1, y1, z, s), point(x1, y1, z1, s), point(x1, y, z1, s), point(x1, y, z, s)])
  const left = polygon([point(x1, y1, z1, s), point(x, y1, z1, s), point(x, y, z1, s), point(x1, y, z1, s)])
  const face = (points, fill) =>
    `<polygon points="${points}" fill="${fill}" stroke="${EDGE}" stroke-width="0.6" stroke-linejoin="round"/>`

  let studMarkup = ''
  if (studs) {
    const rx = 0.3 * Math.SQRT2 * ISO_X * s
    const ry = 0.3 * Math.SQRT2 * ISO_Y * s
    const lift = 0.16 * s
    for (let i = 0; i < w; i += 1) {
      for (let k = 0; k < d; k += 1) {
        const [cx, cy] = point(x + i + 0.5, y1, z + k + 0.5, s)
        studMarkup += `<ellipse cx="${f(cx)}" cy="${f(cy - lift / 2)}" rx="${f(rx)}" ry="${f(ry + lift / 2)}" fill="${shade(color, 0.02)}"/>`
        studMarkup += `<ellipse cx="${f(cx)}" cy="${f(cy - lift)}" rx="${f(rx)}" ry="${f(ry)}" fill="${shade(color, 0.32)}"/>`
      }
    }
  }
  return `<g>${face(left, shade(color, -0.3))}${face(right, shade(color, -0.12))}${face(top, shade(color, 0.2))}${studMarkup}</g>`
}

/** The studio's block explorer: boxy legs, torso, and a smiling head. */
function isoCharacter(x, z, s) {
  const skin = COLOR.yellow
  const shirt = COLOR.blue
  const legs = '#305f91'
  const face = (fy, fz) => point(x + 1.02, fy, z + fz, s)
  const [leftEyeX, leftEyeY] = face(2.62, 0.32)
  const [rightEyeX, rightEyeY] = face(2.62, 0.7)
  const [smileX, smileY] = face(2.3, 0.51)
  return [
    isoBox({ x, z, y: 0, w: 1, d: 1, h: 0.9, color: legs, studs: false, s }),
    isoBox({ x: x - 0.08, z: z - 0.08, y: 0.9, w: 1.16, d: 1.16, h: 1.05, color: shirt, studs: false, s }),
    isoBox({ x: x + 0.06, z: z + 0.06, y: 1.95, w: 0.88, d: 0.88, h: 0.85, color: skin, studs: false, s }),
    isoBox({ x: x + 0.3, z: z + 0.3, y: 2.8, w: 0.4, d: 0.4, h: 0.14, color: skin, studs: false, s }),
    `<circle cx="${f(leftEyeX)}" cy="${f(leftEyeY)}" r="${f(s * 0.055)}" fill="${COLOR.ink}"/>`,
    `<circle cx="${f(rightEyeX)}" cy="${f(rightEyeY)}" r="${f(s * 0.055)}" fill="${COLOR.ink}"/>`,
    `<path d="M ${f(smileX - s * 0.11)} ${f(smileY)} Q ${f(smileX)} ${f(smileY + s * 0.12)} ${f(smileX + s * 0.11)} ${f(smileY)}" fill="none" stroke="${COLOR.ink}" stroke-width="${f(s * 0.05)}" stroke-linecap="round"/>`,
  ].join('')
}

function isoFlag(x, z, y, s) {
  const [baseX, baseY] = point(x, y, z, s)
  const [tipX, tipY] = point(x, y + 1.9, z, s)
  const [wave1X, wave1Y] = point(x + 1.05, y + 1.62, z - 0.1, s)
  const [wave2X, wave2Y] = point(x + 1.05, y + 1.2, z - 0.1, s)
  const [footX, footY] = point(x, y + 1.32, z, s)
  return [
    `<line x1="${f(baseX)}" y1="${f(baseY)}" x2="${f(tipX)}" y2="${f(tipY)}" stroke="#4a5b63" stroke-width="${f(s * 0.1)}" stroke-linecap="round"/>`,
    `<path d="M ${f(tipX)} ${f(tipY)} Q ${f(wave1X)} ${f(wave1Y - s * 0.3)} ${f(wave1X)} ${f(wave1Y)} Q ${f(wave2X)} ${f(wave2Y)} ${f(footX)} ${f(footY)} Z" fill="${COLOR.red}" stroke="${EDGE}" stroke-width="0.6"/>`,
    `<circle cx="${f(tipX)}" cy="${f(tipY - s * 0.1)}" r="${f(s * 0.11)}" fill="${COLOR.yellow}"/>`,
  ].join('')
}

function sparkle(x, y, size) {
  const d = `M ${f(x)} ${f(y - size)} Q ${f(x + size * 0.18)} ${f(y - size * 0.18)} ${f(x + size)} ${f(y)} Q ${f(x + size * 0.18)} ${f(y + size * 0.18)} ${f(x)} ${f(y + size)} Q ${f(x - size * 0.18)} ${f(y + size * 0.18)} ${f(x - size)} ${f(y)} Q ${f(x - size * 0.18)} ${f(y - size * 0.18)} ${f(x)} ${f(y - size)} Z`
  return `<path d="${d}" fill="${COLOR.yellow}" opacity="0.9"/>`
}

/** The landing hero diorama: a floating baseplate world mid-build. Same geometry as HeroDiorama. */
function heroDiorama() {
  const s = 30
  return [
    `<ellipse cx="0" cy="172" rx="196" ry="34" fill="rgba(47, 76, 92, 0.12)"/>`,
    '<g transform="translate(0, 40)">',
    isoBox({ x: -3.5, z: -3.5, y: -0.5, w: 7, d: 7, h: 0.5, color: COLOR.plate, s }),
    isoBox({ x: -3, z: -3, y: 0, w: 4, d: 1, h: 1.2, color: COLOR.red, s }),
    isoBox({ x: -3, z: -3, y: 1.2, w: 2, d: 1, h: 1.2, color: COLOR.red, s }),
    isoBox({ x: -3, z: -3, y: 2.4, w: 4, d: 1, h: 1.2, color: COLOR.yellow, s }),
    isoBox({ x: -3, z: -1.6, y: 0, w: 1, d: 2, h: 1.2, color: COLOR.green, s }),
    isoBox({ x: -3, z: 0.6, y: 0, w: 1, d: 2, h: 2.4, color: COLOR.green, s }),
    isoBox({ x: 1.4, z: -2.9, y: 0, w: 2, d: 2, h: 3.6, color: COLOR.blue, s }),
    isoBox({ x: 1.65, z: -2.65, y: 3.6, w: 1.5, d: 1.5, h: 0.5, color: COLOR.purple, s }),
    isoFlag(2.4, -1.9, 4.1, s),
    isoBox({ x: -1.4, z: 2.1, y: 0, w: 2, d: 1, h: 1.2, color: COLOR.teal, s }),
    isoBox({ x: 2.1, z: 1.4, y: 0, w: 1, d: 1, h: 1.2, color: COLOR.yellow, s }),
    isoCharacter(0.4, 0.55, s),
    '</g>',
    `<g transform="translate(-186, -120)">${isoBox({ x: 0, z: 0, y: 0, w: 2, d: 1, h: 1.2, color: COLOR.red, s: 22 })}</g>`,
    `<g transform="translate(172, -142)">${isoBox({ x: 0, z: 0, y: 0, w: 1, d: 1, h: 1.2, color: COLOR.green, s: 19 })}</g>`,
    `<g transform="translate(148, 96)">${isoBox({ x: 0, z: 0, y: 0, w: 2, d: 2, h: 0.5, color: COLOR.purple, s: 17 })}</g>`,
    sparkle(-176, -108, 9),
    sparkle(186, -52, 7),
    sparkle(128, -158, 11),
  ].join('\n')
}

/** 1200x630 card: sky gradient, the diorama centered, loose bricks drifting in from the sides. No text. */
function ogImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLOR.sky}"/><stop offset="1" stop-color="${COLOR.paper}"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.55" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="630" fill="url(#sky)"/>
<ellipse cx="600" cy="345" rx="470" ry="270" fill="url(#glow)"/>
<g transform="translate(600 330) scale(1.3)">
${heroDiorama()}
</g>
<g transform="translate(150 190)">${isoBox({ x: 0, z: 0, y: 0, w: 2, d: 2, h: 1.2, color: COLOR.teal, s: 26 })}</g>
<g transform="translate(118 430)">${isoBox({ x: 0, z: 0, y: 0, w: 1, d: 2, h: 1.2, color: COLOR.yellow, s: 22 })}</g>
<g transform="translate(1056 176)">${isoBox({ x: 0, z: 0, y: 0, w: 2, d: 1, h: 1.2, color: COLOR.red, s: 24 })}</g>
<g transform="translate(1046 436)">${isoBox({ x: 0, z: 0, y: 0, w: 2, d: 2, h: 0.5, color: COLOR.purple, s: 22 })}</g>
${sparkle(226, 300, 10)}
${sparkle(986, 322, 8)}
${sparkle(84, 118, 8)}
${sparkle(1122, 562, 9)}
</svg>
`
}

/**
 * Icon: the landing wordmark's 2x2 blue brick (BrickMark) on a cream tile.
 * `rounded` cuts the tile's corners for favicons; full-bleed variants keep the
 * brick inside the maskable safe zone for platforms that apply their own mask.
 */
function iconSvg({ px = null, rounded }) {
  const size = 64
  const s = rounded ? 15 : 12
  const sizeAttributes = px ? ` width="${px}" height="${px}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${sizeAttributes}>
<rect width="${size}" height="${size}" rx="${rounded ? 14 : 0}" fill="${COLOR.cream}"/>
<g transform="translate(32 ${f(32 + 0.6 * s)})">${isoBox({ x: -1, z: -1, y: 0, w: 2, d: 2, h: 1.2, color: COLOR.blue, s })}</g>
</svg>
`
}

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch {
    return null
  }
}

function hasQlmanage() {
  try {
    execFileSync('/usr/bin/qlmanage', ['-h'], { stdio: 'ignore' })
    return true
  } catch (error) {
    // qlmanage exits non-zero for -h but exists; ENOENT means it is missing.
    return error?.code !== 'ENOENT'
  }
}

/** Renders `svg` to a PNG of exactly width x height at `destination`. */
async function rasterize(svg, width, height, destination, tools) {
  if (tools.sharp) {
    await tools.sharp(Buffer.from(svg)).resize(width, height).png().toFile(destination)
    return 'sharp'
  }
  if (tools.qlmanage) {
    const workDir = mkdtempSync(join(tmpdir(), 'brick-studio-assets-'))
    try {
      const svgPath = join(workDir, `${basename(destination, '.png')}.svg`)
      writeFileSync(svgPath, svg)
      execFileSync('/usr/bin/qlmanage', ['-t', '-s', String(Math.max(width, height)), '-o', workDir, svgPath], { stdio: 'ignore' })
      const thumbnail = `${svgPath}.png`
      if (!existsSync(thumbnail)) throw new Error(`qlmanage produced no thumbnail for ${svgPath}`)
      execFileSync('/usr/bin/sips', ['-z', String(height), String(width), thumbnail], { stdio: 'ignore' })
      renameSync(thumbnail, destination)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
    return 'qlmanage+sips'
  }
  return null
}

async function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true })
  mkdirSync(VECTOR_DIR, { recursive: true })

  const faviconSvg = iconSvg({ rounded: true })
  const ogSvg = ogImageSvg()
  writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), faviconSvg)
  writeFileSync(join(VECTOR_DIR, 'og-image.svg'), ogSvg)
  console.log('wrote public/favicon.svg, scripts/assets/og-image.svg')

  const tools = { sharp: await loadSharp(), qlmanage: process.platform === 'darwin' && hasQlmanage() }
  const targets = [
    { file: 'favicon-32.png', width: 32, height: 32, svg: iconSvg({ px: 32, rounded: true }) },
    { file: 'icon-192.png', width: 192, height: 192, svg: iconSvg({ px: 192, rounded: false }) },
    { file: 'icon-512.png', width: 512, height: 512, svg: iconSvg({ px: 512, rounded: false }) },
    { file: 'apple-touch-icon.png', width: 180, height: 180, svg: iconSvg({ px: 180, rounded: false }) },
    { file: 'og-image.png', width: 1200, height: 630, svg: ogSvg },
  ]
  const pending = []
  for (const target of targets) {
    const destination = join(PUBLIC_DIR, target.file)
    const tool = await rasterize(target.svg, target.width, target.height, destination, tools)
    if (tool) console.log(`wrote public/${target.file} (${target.width}x${target.height}, ${tool})`)
    else pending.push(target)
  }
  if (pending.length) {
    console.error('\nNo rasterizer available (sharp not resolvable, qlmanage not found). Render these by hand:')
    for (const target of pending) {
      const source = target.file === 'og-image.png' ? 'scripts/assets/og-image.svg' : 'public/favicon.svg'
      console.error(`  ${source} -> public/${target.file} at ${target.width}x${target.height}`)
    }
    console.error('On macOS: qlmanage -t -s <px> -o <dir> <file>.svg  (writes <file>.svg.png), then sips -z <h> <w> <png>.')
    process.exitCode = 1
  }
}

await main()
