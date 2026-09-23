import { LEVEL_MAX_OBJECTS } from './constants'
import type { EditOp } from './events'
import { SINGLETON_KINDS, type LevelDesign } from './level'
import { TILE_ID_COUNT, T, holdsContent } from './tiles'

/**
 * Apply an edit op to a bare level design, in place. The room server keeps the saved copy of a
 * level this way without running the world. Same rules as the world's own edit handling
 * (world.ts applyOp); a test keeps the two in agreement.
 */
export function editDesign(d: LevelDesign, op: EditOp): boolean {
  switch (op.o) {
    case 'tile': {
      if (op.x < 0 || op.y < 0 || op.x >= d.width || op.y >= d.height) return false
      const i = op.y * d.width + op.x
      const t = op.t < TILE_ID_COUNT ? op.t : T.EMPTY
      const c = holdsContent(t) ? op.c : 0
      if (d.tiles[i] === t && d.contents[i] === c) return false
      d.tiles[i] = t
      d.contents[i] = c
      return true
    }
    case 'add': {
      if (d.objects.length >= LEVEL_MAX_OBJECTS || d.objects.some((o) => o.id === op.obj.id)) return false
      if (SINGLETON_KINDS.has(op.obj.kind)) d.objects = d.objects.filter((o) => o.kind !== op.obj.kind)
      d.objects.push({ ...op.obj })
      return true
    }
    case 'del': {
      const idx = d.objects.findIndex((o) => o.id === op.id)
      if (idx < 0) return false
      d.objects.splice(idx, 1)
      return true
    }
    case 'move': {
      const idx = d.objects.findIndex((o) => o.id === op.id)
      if (idx < 0) return false
      const old = d.objects[idx]
      if (old.x === op.x && old.y === op.y) return false
      d.objects[idx] = { ...old, x: op.x, y: op.y }
      return true
    }
    case 'theme':
      if (d.theme === op.theme) return false
      d.theme = op.theme
      return true
    case 'style':
      if (d.style === op.style) return false
      d.style = op.style
      return true
    case 'title':
      if (d.title === op.title) return false
      d.title = op.title
      return true
  }
}
