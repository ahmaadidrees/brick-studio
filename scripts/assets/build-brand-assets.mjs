#!/usr/bin/env node
// Generates the Brickgineers icon and link-preview artwork into public/.
//
//   node scripts/assets/build-brand-assets.mjs
//
// The mark is the same geometry as src/brand/BrickMark.tsx (`MARK`): two
// equal rounded brick lobes forming a B — blue #5888DA upper, coral #F17861
// lower — with exactly two front studs per lobe. This script cannot import
// TSX, so the numbers are mirrored here; src/test/indexHtml.test.ts checks the
// favicon against the brand palette. Nothing here contains text, so a rename
// never needs new artwork and no font has to be present on the build host.
//
// Outputs (vector sources are committed next to the PNGs):
//   public/favicon.svg          mark on a rounded warm-white tile
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

// Brand palette (src/brand/brand.ts). theme-color in index.html/manifest is the warm white.
const COLOR = {
  cornflower: '#5888DA',
  coral: '#F17861',
  butter: '#F3CA74',
  ink: '#263C51',
  warmWhite: '#F8F4EB',
  upperStud: '#8FB0EA',
  lowerStud: '#F8A896',
  butterStud: '#F9E0A6',
  wall: '#DCE6F7',
  wallDeep: '#C9D8F2',
  desk: '#E7C58C',
  deskEdge: '#D4AC6E',
  plate: '#EDE6D6',
  plateStud: '#E2D9C4',
  book: '#F4EBDD',
}

const f = (value) => Number(value.toFixed(2)).toString()

// Mirror of MARK in src/brand/BrickMark.tsx.
const MARK = { viewBox: 64, lobe: { x: 8, width: 48, height: 24, leftRadius: 6, rightRadius: 12 }, upperY: 7, lowerY: 33, studRadius: 4.6, studColumns: [22, 38] }

/** Rounded rectangle with a squarer left edge and a round right edge (a B bowl). */
function lobePath(x, y, width, height, leftRadius, rightRadius) {
  const right = x + width
  const bottom = y + height
  return `M${x + leftRadius} ${y} H${right - rightRadius} A${rightRadius} ${rightRadius} 0 0 1 ${right} ${y + rightRadius} V${bottom - rightRadius} A${rightRadius} ${rightRadius} 0 0 1 ${right - rightRadius} ${bottom} H${x + leftRadius} A${leftRadius} ${leftRadius} 0 0 1 ${x} ${bottom - leftRadius} V${y + leftRadius} A${leftRadius} ${leftRadius} 0 0 1 ${x + leftRadius} ${y} Z`
}

/** The mark in its 64-unit box; wrap in a <g transform> to place it. */
function markSvg() {
  const { lobe, upperY, lowerY, studRadius, studColumns } = MARK
  const studs = (y, fill) => studColumns.map((cx) => `<circle cx="${cx}" cy="${f(y + lobe.height / 2)}" r="${studRadius}" fill="${fill}"/>`).join('')
  return [
    `<path d="${lobePath(lobe.x, upperY, lobe.width, lobe.height, lobe.leftRadius, lobe.rightRadius)}" fill="${COLOR.cornflower}"/>`,
    `<path d="${lobePath(lobe.x, lowerY, lobe.width, lobe.height, lobe.leftRadius, lobe.rightRadius)}" fill="${COLOR.coral}"/>`,
    studs(upperY, COLOR.upperStud),
    studs(lowerY, COLOR.lowerStud),
  ].join('')
}

/**
 * Icon: the mark on a warm-white tile. `rounded` cuts the tile corners for
 * favicons; full-bleed variants keep the mark inside the maskable safe zone
 * (inner 80%) for platforms that apply their own mask.
 */
function iconSvg({ px = null, rounded }) {
  const size = 64
  const scale = rounded ? 0.84 : 0.7
  const offset = (size - MARK.viewBox * scale) / 2
  const sizeAttributes = px ? ` width="${px}" height="${px}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${sizeAttributes}>
<rect width="${size}" height="${size}" rx="${rounded ? 14 : 0}" fill="${COLOR.warmWhite}"/>
<g transform="translate(${f(offset)} ${f(offset)}) scale(${scale})">${markSvg()}</g>
</svg>
`
}

/** A flat, front-facing brick in the mark's language: rounded body plus a row of studs on top. */
function brick({ x, y, w, h, color, stud, studs = 2, rx = 6 }) {
  const studR = Math.min(h * 0.17, w / (studs * 3))
  const gap = w / studs
  const row = Array.from({ length: studs }, (_, index) => `<circle cx="${f(x + gap * (index + 0.5))}" cy="${f(y + h / 2)}" r="${f(studR)}" fill="${stud}"/>`).join('')
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}"/>${row}`
}

/** 1200x630 card: a cozy toy room built from flat vector shapes — cool wall, warm desk, lamp, books, clock — with the mark centre stage. No text. */
function ogImageSvg() {
  const W = 1200
  const H = 630
  const deskTop = 430
  const bricks = [
    // Under the lamp
    brick({ x: 120, y: 372, w: 132, h: 58, color: COLOR.coral, stud: COLOR.lowerStud, studs: 2, rx: 12 }),
    brick({ x: 186, y: 314, w: 66, h: 58, color: COLOR.butter, stud: COLOR.butterStud, studs: 1, rx: 12 }),
    brick({ x: 300, y: 372, w: 66, h: 58, color: COLOR.cornflower, stud: COLOR.upperStud, studs: 1, rx: 12 }),
    // Right of the mark, a small tower
    brick({ x: 776, y: 372, w: 132, h: 58, color: COLOR.cornflower, stud: COLOR.upperStud, studs: 2, rx: 12 }),
    brick({ x: 914, y: 372, w: 66, h: 58, color: COLOR.coral, stud: COLOR.lowerStud, studs: 1, rx: 12 }),
    brick({ x: 810, y: 314, w: 132, h: 58, color: COLOR.butter, stud: COLOR.butterStud, studs: 2, rx: 12 }),
    brick({ x: 843, y: 256, w: 66, h: 58, color: COLOR.coral, stud: COLOR.lowerStud, studs: 1, rx: 12 }),
  ].join('')
  const plateStuds = []
  for (let cx = 84; cx < W - 60; cx += 48) plateStuds.push(`<circle cx="${cx}" cy="${deskTop + 22}" r="7" fill="${COLOR.plateStud}"/>`)
  const books = [
    `<rect x="1004" y="390" width="164" height="40" rx="8" fill="${COLOR.cornflower}"/>`,
    `<rect x="1016" y="350" width="150" height="40" rx="8" fill="${COLOR.coral}"/>`,
    `<rect x="1000" y="310" width="156" height="40" rx="8" fill="${COLOR.butter}"/>`,
    `<rect x="1012" y="270" width="150" height="40" rx="8" fill="${COLOR.ink}" opacity="0.85"/>`,
  ].join('')
  const clock = [
    `<circle cx="960" cy="130" r="64" fill="${COLOR.book}" stroke="${COLOR.ink}" stroke-width="8"/>`,
    `<line x1="960" y1="130" x2="960" y2="88" stroke="${COLOR.ink}" stroke-width="8" stroke-linecap="round"/>`,
    `<line x1="960" y1="130" x2="992" y2="146" stroke="${COLOR.ink}" stroke-width="8" stroke-linecap="round"/>`,
    `<circle cx="960" cy="130" r="7" fill="${COLOR.ink}"/>`,
  ].join('')
  const lamp = [
    `<path d="M 84 ${deskTop} L 120 250 L 250 132" fill="none" stroke="${COLOR.ink}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="120" cy="250" r="14" fill="${COLOR.ink}"/>`,
    `<path d="M 196 96 L 316 96 L 356 206 L 156 206 Z" fill="${COLOR.butter}" stroke="${COLOR.ink}" stroke-width="10" stroke-linejoin="round"/>`,
    `<rect x="56" y="${deskTop - 16}" width="74" height="16" rx="8" fill="${COLOR.ink}"/>`,
    `<ellipse cx="256" cy="206" rx="98" ry="14" fill="#FFF3C2"/>`,
    `<path d="M 156 214 L 356 214 L 470 ${deskTop} L 40 ${deskTop} Z" fill="url(#glow)"/>`,
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLOR.wall}"/><stop offset="1" stop-color="${COLOR.wallDeep}"/></linearGradient>
<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3C2" stop-opacity="0.75"/><stop offset="1" stop-color="#FFF3C2" stop-opacity="0"/></linearGradient>
<linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLOR.desk}"/><stop offset="1" stop-color="${COLOR.deskEdge}"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#wall)"/>
<rect x="0" y="${deskTop}" width="${W}" height="${H - deskTop}" fill="url(#desk)"/>
<rect x="0" y="${deskTop}" width="${W}" height="10" fill="${COLOR.deskEdge}"/>
<rect x="40" y="${deskTop + 4}" width="${W - 80}" height="40" rx="10" fill="${COLOR.plate}"/>
${plateStuds.join('')}
${clock}
${books}
${lamp}
${bricks}
<rect x="470" y="150" width="270" height="270" rx="56" fill="${COLOR.warmWhite}" stroke="${COLOR.ink}" stroke-opacity="0.12" stroke-width="4"/>
<g transform="translate(494 174) scale(3.4375)">${markSvg()}</g>
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
    await tools.sharp(Buffer.from(svg), { density: 288 }).resize(width, height).png().toFile(destination)
    return 'sharp'
  }
  if (tools.qlmanage) {
    const workDir = mkdtempSync(join(tmpdir(), 'brickgineers-assets-'))
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
