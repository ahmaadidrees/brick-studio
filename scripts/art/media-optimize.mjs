// Turns the masters from media-capture.mjs into every file the media contract lists (docs/brand/CONTRACTS.md,
// "Media (W7 → W2)") and rewrites public/brand/media/manifest.json with the real intrinsic and byte sizes.
//
//   MASTERS_DIR=/tmp/brickgineers-media-captures node scripts/art/media-optimize.mjs
//
// Environment:
//   MASTERS_DIR   where media-capture.mjs wrote hero-master.png, scene-*-master.png, character-*-master.png
//   ONLY          optional comma list of hero,scenes,characters; unselected existing files are preserved
//   OUT_DIR       destination (default public/brand/media)
//   AVIFENC       avifenc binary (default: first of $AVIFENC, /opt/homebrew/bin/avifenc, avifenc on PATH)
//   SEED_LABEL    free text recorded in the manifest provenance (default: derived from media-seed.mjs)
//
// Tooling is host-only: `sharp` (already in node_modules) resizes with Lanczos and writes WebP and quantized PNG;
// `avifenc` (libavif) writes AVIF from a lossless intermediate. Nothing is added to package.json. Every encode
// walks down in quality until the file fits its cap, so budgets hold without hand tuning:
//   hero delivered (largest variant a desktop picks, avif or webp)  <= 250 KB
//   initial marketing set (hero-1600 + four scene-800 + four character-400, per format) <= 600 KB

import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { createSeedBricks, SEED_WORLD } from './media-seed.mjs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const run = promisify(execFile)

const mastersDir = process.env.MASTERS_DIR || '/tmp/brickgineers-media-captures'
const outDir = process.env.OUT_DIR || path.resolve('public/brand/media')
const avifenc = await resolveAvifenc()

const KB = 1024
const HERO_DELIVERED_CAP = 250 * KB
const INITIAL_SET_CAP = 600 * KB

/**
 * One entry per contract file family. `cap` is the per-file byte ceiling for the delivered formats (avif/webp);
 * the sum of the initial set stays under 600 KB with these caps even in the worst case.
 */
const TARGETS = [
  { name: 'hero-1600', master: 'hero-master.png', width: 1600, height: 960, cap: HERO_DELIVERED_CAP, initial: true },
  { name: 'hero-1200', master: 'hero-master.png', width: 1200, height: 720, cap: 170 * KB },
  { name: 'hero-800', master: 'hero-master.png', width: 800, height: 480, cap: 90 * KB },
  ...['toy-room', 'brick-valley', 'sky-island', 'classic'].flatMap((id) => [
    { name: `scene-${id}-800`, master: `scene-${id}-master.png`, width: 800, height: 500, cap: 56 * KB, initial: true },
    { name: `scene-${id}-400`, master: `scene-${id}-master.png`, width: 400, height: 250, cap: 22 * KB },
  ]),
  ...['pip', 'fern', 'nova', 'toy-figure'].map((id) => (
    { name: `character-${id}-400`, master: `character-${id}-master.png`, width: 400, height: 400, cap: 30 * KB, initial: true }
  )),
]

const WEBP_QUALITIES = [84, 80, 76, 72, 68, 64, 60, 55, 50]
const AVIF_QUALITIES = [62, 58, 54, 50, 46, 42, 38, 34, 30]

async function resolveAvifenc() {
  for (const candidate of [process.env.AVIFENC, '/opt/homebrew/bin/avifenc', 'avifenc'].filter(Boolean)) {
    try {
      await run(candidate, ['--version'])
      return candidate
    } catch {
      // try the next candidate
    }
  }
  return null
}

async function fileBytes(file) {
  return (await stat(file)).size
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 16)
}

async function resized(masterPath, width, height) {
  const master = sharp(masterPath)
  const meta = await master.metadata()
  if (meta.width < width || meta.height < height) throw new Error(`${masterPath} is ${meta.width}×${meta.height}, smaller than ${width}×${height}`)
  return master.resize(width, height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).toBuffer()
}

async function writeWebp(buffer, file, cap) {
  for (const quality of WEBP_QUALITIES) {
    await sharp(buffer).webp({ quality, effort: 6, smartSubsample: true }).toFile(file)
    const bytes = await fileBytes(file)
    if (bytes <= cap) return { bytes, quality }
  }
  return { bytes: await fileBytes(file), quality: WEBP_QUALITIES.at(-1), overCap: true }
}

async function writeAvif(buffer, file, cap, scratch) {
  const lossless = path.join(scratch, `${path.basename(file, '.avif')}-src.png`)
  await sharp(buffer).png({ compressionLevel: 1 }).toFile(lossless)
  for (const quality of AVIF_QUALITIES) {
    await run(avifenc, ['-q', String(quality), '--speed', '4', '--jobs', '4', '--yuv', '420', lossless, file])
    const bytes = await fileBytes(file)
    if (bytes <= cap) return { bytes, quality }
  }
  return { bytes: await fileBytes(file), quality: AVIF_QUALITIES.at(-1), overCap: true }
}

/** Quantized PNG fallback: 256-colour palette with dithering. Fallback only; never part of the delivered budget. */
async function writePng(buffer, file) {
  await sharp(buffer).png({ palette: true, colours: 256, quality: 90, dither: 1, effort: 9, compressionLevel: 9 }).toFile(file)
  return { bytes: await fileBytes(file) }
}

async function gitDescribe() {
  try {
    const { stdout } = await run('git', ['rev-parse', '--short', 'HEAD'])
    return stdout.trim()
  } catch {
    return 'unknown'
  }
}

async function sharpVersion() {
  return `sharp ${sharp.versions.sharp} (libvips ${sharp.versions.vips})`
}

async function avifencVersion() {
  if (!avifenc) return null
  const { stdout } = await run(avifenc, ['--version'])
  return stdout.split('\n')[0].trim()
}

const scratch = path.join(tmpdir(), `brickgineers-media-${process.pid}`)
await mkdir(scratch, { recursive: true })
await mkdir(outDir, { recursive: true })

const only = new Set((process.env.ONLY || 'hero,scenes,characters').split(',').map((part) => part.trim()))
const selectedTargets = TARGETS.filter((target) => only.has(target.name.startsWith('hero-') ? 'hero' : target.name.startsWith('scene-') ? 'scenes' : 'characters'))
const selectedFiles = new Set(selectedTargets.flatMap((target) => ['avif', 'webp', 'png'].map((format) => `${target.name}.${format}`)))
let previousManifest = null
try { previousManifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8')) } catch {}
const files = (previousManifest?.files || []).filter((entry) => !selectedFiles.has(entry.file))
const notes = files.length ? (previousManifest.provenance.notes?.length ? [...previousManifest.provenance.notes] : [`Retained ${files.length} unselected files from capture ${previousManifest.provenance.capturedAt} (source ${previousManifest.provenance.commit}); hero and scene recaptures do not replace verified character portraits.`]) : []
try {
  for (const target of selectedTargets) {
    const masterPath = path.join(mastersDir, target.master)
    try {
      await access(masterPath)
    } catch {
      throw new Error(`Missing master ${masterPath} — run media-capture.mjs first`)
    }
    const buffer = await resized(masterPath, target.width, target.height)
    const outputs = []
    if (avifenc) {
      const avifFile = path.join(outDir, `${target.name}.avif`)
      const result = await writeAvif(buffer, avifFile, target.cap, scratch)
      outputs.push({ file: path.basename(avifFile), format: 'avif', ...result })
    } else {
      notes.push(`${target.name}.avif skipped: avifenc not found`)
    }
    const webpFile = path.join(outDir, `${target.name}.webp`)
    outputs.push({ file: path.basename(webpFile), format: 'webp', ...(await writeWebp(buffer, webpFile, target.cap)) })
    const pngFile = path.join(outDir, `${target.name}.png`)
    outputs.push({ file: path.basename(pngFile), format: 'png', ...(await writePng(buffer, pngFile)) })

    for (const output of outputs) {
      const full = path.join(outDir, output.file)
      const meta = await sharp(full).metadata()
      files.push({
        file: output.file,
        width: meta.width,
        height: meta.height,
        bytes: output.bytes,
        sha256: await sha256(full),
        quality: output.quality,
        initial: Boolean(target.initial),
        overCap: Boolean(output.overCap),
        source: target.master,
      })
      console.log(`${output.file.padEnd(32)} ${String(meta.width).padStart(4)}×${String(meta.height).padEnd(4)} ${(output.bytes / KB).toFixed(1).padStart(7)} KB${output.quality !== undefined ? `  q${output.quality}` : ''}${output.overCap ? '  OVER CAP' : ''}`)
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}

const byName = new Map(files.map((entry) => [entry.file, entry]))
const bytesOf = (name) => byName.get(name)?.bytes ?? 0
const initialFor = (format) => files.filter((entry) => entry.initial && entry.file.endsWith(`.${format}`)).reduce((sum, entry) => sum + entry.bytes, 0)
const budgets = {
  heroDeliveredCapBytes: HERO_DELIVERED_CAP,
  heroDelivered: { avif: bytesOf('hero-1600.avif'), webp: bytesOf('hero-1600.webp') },
  initialSetCapBytes: INITIAL_SET_CAP,
  initialSet: { avif: initialFor('avif'), webp: initialFor('webp') },
}
budgets.heroDeliveredOk = Math.max(budgets.heroDelivered.avif, budgets.heroDelivered.webp) <= HERO_DELIVERED_CAP
budgets.initialSetOk = Math.max(budgets.initialSet.avif, budgets.initialSet.webp) <= INITIAL_SET_CAP

let captureReport = null
try {
  captureReport = JSON.parse(await readFile(path.join(mastersDir, 'capture-report.json'), 'utf8'))
} catch {
  notes.push('capture-report.json not found beside the masters; capture timestamp unrecorded')
}

const seedBricks = createSeedBricks()
const manifest = {
  version: 2,
  status: budgets.heroDeliveredOk && budgets.initialSetOk ? 'final' : 'over-budget',
  note: 'Runtime captures of the real Brickgineers editor (no UI). Intrinsic sizes and bytes are measured from the files in this folder.',
  sourceScripts: ['scripts/art/media-seed.mjs', 'scripts/art/media-capture.mjs', 'scripts/art/media-optimize.mjs'],
  provenance: {
    commit: await gitDescribe(),
    capturedAt: captureReport?.timestamp ?? null,
    captureOrigin: captureReport?.origin ?? null,
    seed: process.env.SEED_LABEL || `media-seed.mjs castle: ${seedBricks.length} catalog bricks on a ${SEED_WORLD.plateSize} plate, same build in every scene`,
    characters: 'real runtime avatars (pip, fern, nova, toy-figure) standing on the plate in the Toy Room; cc0-hero excluded from marketing',
    encoders: { sharp: await sharpVersion(), avifenc: await avifencVersion() },
    notes,
  },
  budgets,
  files: files.map(({ file, width, height, bytes, sha256, quality, initial }) => ({ file, width, height, bytes, sha256, ...(quality !== undefined ? { quality } : {}), ...(initial ? { initial: true } : {}) })),
}
await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const table = [
  '| File | Size | Bytes | Quality |',
  '|---|---|---:|---|',
  ...manifest.files.map((entry) => `| ${entry.file} | ${entry.width}×${entry.height} | ${entry.bytes.toLocaleString('en-US')} | ${entry.quality ?? 'palette png'} |`),
].join('\n')
const kb = (bytes) => `${(bytes / KB).toFixed(1)} KB`
await writeFile(path.join(outDir, 'MEDIA.md'), `# Brickgineers marketing media

Generated by \`scripts/art/media-optimize.mjs\` from masters captured by \`scripts/art/media-capture.mjs\` at commit
\`${manifest.provenance.commit}\`${manifest.provenance.capturedAt ? ` (captured ${manifest.provenance.capturedAt})` : ''}. Seed: ${manifest.provenance.seed}.
Encoders: ${manifest.provenance.encoders.sharp}; ${manifest.provenance.encoders.avifenc ?? 'avifenc unavailable'}.

## Budgets

| Budget | Cap | AVIF | WebP | OK |
|---|---:|---:|---:|---|
| Hero delivered (hero-1600) | ${kb(HERO_DELIVERED_CAP)} | ${kb(budgets.heroDelivered.avif)} | ${kb(budgets.heroDelivered.webp)} | ${budgets.heroDeliveredOk ? 'yes' : 'NO'} |
| Initial marketing set (hero-1600 + 4 × scene-800 + 4 × character-400) | ${kb(INITIAL_SET_CAP)} | ${kb(budgets.initialSet.avif)} | ${kb(budgets.initialSet.webp)} | ${budgets.initialSetOk ? 'yes' : 'NO'} |

PNG files are the no-AVIF/no-WebP fallback only (256-colour palette) and are not part of the delivered budgets.

## Files

${table}
${notes.length ? `\n## Notes\n\n${notes.map((note) => `- ${note}`).join('\n')}\n` : ''}`)

console.log(`\nhero delivered: avif ${kb(budgets.heroDelivered.avif)}, webp ${kb(budgets.heroDelivered.webp)} (cap ${kb(HERO_DELIVERED_CAP)}) ${budgets.heroDeliveredOk ? 'OK' : 'OVER'}`)
console.log(`initial set:    avif ${kb(budgets.initialSet.avif)}, webp ${kb(budgets.initialSet.webp)} (cap ${kb(INITIAL_SET_CAP)}) ${budgets.initialSetOk ? 'OK' : 'OVER'}`)
if (!budgets.heroDeliveredOk || !budgets.initialSetOk) process.exitCode = 1
