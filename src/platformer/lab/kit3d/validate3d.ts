/**
 * What a Hackable 3D design must hold before it is opened, saved or played (core/project.ts validateDesign calls this
 * for kit '3d'): finite z on every copy, at most 2,000 build bricks of known parts on the plate, sane custom parts and
 * positive code-brick boxes. Problems use validateDesign's own shape, so every caller already knows how to show them.
 */
import { CUSTOM_BRICK_MAX_DEPTH, CUSTOM_BRICK_MAX_HEIGHT, CUSTOM_BRICK_MAX_WIDTH, BRICK_STUDIO_MAX_CUSTOM_PARTS, BRICK_STUDIO_MAX_Y } from '../../../../packages/brick-core/src/brickDocument'
import type { LevelDesign } from '../core/contracts'
import { MAX_SCENERY3D, MODELS3, PLATE_SIZES3D, plateOf, type LevelDesign3 } from './contracts3d'
import { partsOf } from './parts3d'

type Push = (code: 'bad-value' | 'limit', path: string, message: string) => void

const CUSTOM_TEMPLATES = ['solid', 'slope', 'invertedSlope', 'corner', 'round', 'cone', 'stairs', 'arch', 'window', 'door']
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const PART_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const MAX_UNITS = 10_000

export function validateDesign3d(design: LevelDesign, push: Push): void {
  const d = design as LevelDesign3
  const custom = d.customParts3d
  if (custom !== undefined) {
    if (!Array.isArray(custom)) push('bad-value', 'customParts3d', 'Custom parts must be a list.')
    else {
      if (custom.length > BRICK_STUDIO_MAX_CUSTOM_PARTS) push('limit', 'customParts3d', `A build can hold ${BRICK_STUDIO_MAX_CUSTOM_PARTS} custom parts.`)
      custom.forEach((p, i) => {
        const path = `customParts3d[${i}]`
        if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !PART_ID_RE.test(p.id) || typeof p.name !== 'string' || p.name.length > 80) return push('bad-value', path, 'A custom part needs an id and a name.')
        if (!CUSTOM_TEMPLATES.includes(p.template)) push('bad-value', `${path}.template`, 'Unknown custom part shape.')
        if (!Number.isInteger(p.width) || p.width < 1 || p.width > CUSTOM_BRICK_MAX_WIDTH) push('bad-value', `${path}.width`, 'Bad custom part width.')
        if (!Number.isInteger(p.depth) || p.depth < 1 || p.depth > CUSTOM_BRICK_MAX_DEPTH) push('bad-value', `${path}.depth`, 'Bad custom part depth.')
        if (!Number.isInteger(p.height) || p.height < 1 || p.height > CUSTOM_BRICK_MAX_HEIGHT) push('bad-value', `${path}.height`, 'Bad custom part height.')
      })
    }
  }

  if (d.plate3d !== undefined && !PLATE_SIZES3D.includes(d.plate3d)) push('bad-value', 'plate3d', 'The build plate is 64, 96 or 128 studs.')
  const plate = plateOf(d)
  const scenery = d.scenery3d
  if (scenery === undefined) push('bad-value', 'scenery3d', 'A 3D project needs its build (scenery3d), even an empty one.')
  else if (!Array.isArray(scenery)) push('bad-value', 'scenery3d', 'The build must be a list.')
  else {
    if (scenery.length > MAX_SCENERY3D) push('limit', 'scenery3d', `A 3D build can hold ${MAX_SCENERY3D} bricks.`)
    const parts = partsOf(Array.isArray(custom) ? d : undefined)
    for (let i = 0; i < Math.min(scenery.length, MAX_SCENERY3D); i++) {
      const b = scenery[i]
      const path = `scenery3d[${i}]`
      if (!b || typeof b !== 'object') { push('bad-value', path, 'A build brick must be an object.'); continue }
      const part = typeof b.partId === 'string' ? parts[b.partId] : undefined
      if (!part) { push('bad-value', `${path}.partId`, 'This build brick is a part this version does not know.'); continue }
      if (!Number.isInteger(b.x) || !Number.isInteger(b.z) || b.x < 0 || b.z < 0 || b.x > plate || b.z > plate) push('bad-value', path, 'A build brick sits on the build plate.')
      if (!Number.isInteger(b.y) || b.y < 0 || b.y > BRICK_STUDIO_MAX_Y) push('bad-value', `${path}.y`, 'A build brick is 0 to 1024 plates up.')
      if (b.rotation !== 0 && b.rotation !== 1 && b.rotation !== 2 && b.rotation !== 3) push('bad-value', `${path}.rotation`, 'A build brick turns in quarter turns.')
      if (typeof b.color !== 'string' || !COLOR_RE.test(b.color)) push('bad-value', `${path}.color`, 'A build brick has a colour like #e7473c.')
    }
  }

  if (Array.isArray(d.copies)) d.copies.forEach((c, i) => {
    if (c && typeof c === 'object' && (!finite(c.z) || Math.abs(c.z) > MAX_UNITS)) push('bad-value', `copies[${i}].z`, 'A 3D copy needs a z.')
  })
  if (Array.isArray(d.bricks)) d.bricks.forEach((b, i) => {
    const shape = b?.shape3d
    if (shape === undefined) return
    const path = `bricks[${i}].shape3d`
    if (!shape || typeof shape !== 'object' || ![shape.w, shape.h, shape.d].every((n) => finite(n) && n > 0 && n <= 100)) return push('bad-value', path, 'A 3D brick has a positive size.')
    const look = shape.look
    if (look !== undefined && (!look || typeof look.color !== 'string' || !COLOR_RE.test(look.color) || (look.model !== undefined && !MODELS3.includes(look.model)))) push('bad-value', `${path}.look`, 'A 3D brick’s look is a colour and a model.')
  })
}
