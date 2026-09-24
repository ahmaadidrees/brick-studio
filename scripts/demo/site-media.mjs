/**
 * The landing page's demo media, from the recordings in DEMO_OUT (run record-3d.mjs, record-2d.mjs and social-cut.mjs
 * first). Writes to public/brand/media (OUT_DIR changes it):
 *
 *   demo-3d.webm / .mp4, demo-2d.webm / .mp4   the hero's 4:3 auto-zoom clips, sized for the web
 *   demo-3d-poster.jpg, demo-2d-poster.jpg      each clip's last frame, shown before it plays and for reduced motion
 *   demo-full.mp4                               the 16:9 cut with title cards, for the hero's full-screen view
 *   world-2d-800.avif / .webp / .png            a 2D world at play, for the "Two ways to build" card
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpeg, hero, OUT, VIDEO, VIDEO_TAGS } from './lib/studio.mjs'

const sharp = createRequire(import.meta.url)('sharp')
const run = promisify(execFile)
const DEST = process.env.OUT_DIR || 'public/brand/media'
await mkdir(DEST, { recursive: true })

for (const key of ['3d', '2d']) {
  const meta = JSON.parse(await readFile(path.join(OUT, `build-${key}.json`), 'utf8'))
  const file = path.join(DEST, `demo-${key}`)
  hero(meta, { out: [960, 720], file, crf: [27, 38] })
  ffmpeg(['-sseof', '-0.1', '-i', `${file}.mp4`, '-frames:v', '1', '-q:v', '4', `${file}-poster.jpg`], `${key} poster`)
}

ffmpeg(['-i', path.join(OUT, 'brickgineers-demo-1080p.mp4'), '-vf', `fps=30,scale=1280:-2,${VIDEO}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', ...VIDEO_TAGS, '-movflags', '+faststart', '-an', path.join(DEST, 'demo-full.mp4')], 'full')

// The 2D card: the player bumping the ? brick, its coin popping out.
const frames = path.join(OUT, 'build-2d-frames')
const still = path.join(OUT, 'world-2d-master.png')
ffmpeg(['-i', path.join(frames, `f${String(Number(process.env.WORLD_2D_FRAME ?? 670)).padStart(5, '0')}.jpg`), '-vf', 'crop=1500:938:220:150', still], '2d still')
const img = sharp(still).resize(800, 500)
await img.clone().webp({ quality: 80 }).toFile(path.join(DEST, 'world-2d-800.webp'))
await img.clone().png({ palette: true, colours: 256 }).toFile(path.join(DEST, 'world-2d-800.png'))
const lossless = path.join(OUT, 'world-2d-800.png')
await img.clone().png().toFile(lossless)
await run(process.env.AVIFENC || 'avifenc', ['-q', '62', '-s', '6', lossless, path.join(DEST, 'world-2d-800.avif')])
await rm(lossless)
console.log(`[site] demo media → ${DEST}`)
