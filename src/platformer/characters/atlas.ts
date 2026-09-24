import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import type { LevelStyle } from '@brick-studio/platformer-core/engine/level'
import type { PlayerPose } from '../render/art/characters'

const CELL = 256
const SHEET_WIDTH = CELL * 6
const SHEET_HEIGHT = CELL * 4

type Bounds = readonly [left: number, top: number, right: number, bottom: number]
type GeneratedId = Exclude<CharacterId, 'classic'>

/**
 * Alpha bounds measured from the original sheets at alpha > 250, with a two-pixel fringe.
 * Only cells with complete, readable poses are used. The source art is never rewritten.
 */
const BOUNDS: Record<GeneratedId, Readonly<Record<number, Bounds>>> = {
  builder: {
    0: [84, 14, 226, 256], 3: [61, 15, 201, 256],
    6: [55, 13, 242, 256], 8: [34, 10, 226, 244], 11: [19, 11, 206, 244],
    13: [64, 12, 236, 255], 15: [29, 4, 224, 256], 16: [29, 12, 225, 247],
    18: [47, 17, 248, 241], 19: [48, 40, 242, 241],
  },
  'bolt-bot': {
    0: [49, 15, 204, 250], 3: [49, 15, 206, 251],
    6: [41, 16, 234, 256], 8: [16, 14, 234, 243], 11: [21, 15, 227, 245],
    13: [49, 4, 239, 251], 15: [28, 9, 227, 213], 16: [43, 24, 216, 245],
    18: [49, 35, 219, 237], 19: [46, 49, 226, 238],
  },
  'brick-fox': {
    0: [30, 23, 230, 244], 3: [19, 16, 218, 244],
    6: [32, 14, 246, 243], 7: [37, 15, 243, 241], 11: [26, 12, 234, 242],
    15: [19, 8, 248, 209], 16: [23, 22, 226, 231],
    18: [35, 19, 247, 228], 19: [28, 46, 243, 228],
  },
}

const URLS: Record<GeneratedId, string> = {
  builder: '/platformer/characters/builder-v1.png',
  'bolt-bot': '/platformer/characters/bolt-bot-v1.png',
  'brick-fox': '/platformer/characters/brick-fox-v1.png',
}

function generated(id: CharacterId): id is GeneratedId {
  return id === 'builder' || id === 'bolt-bot' || id === 'brick-fox'
}

export interface CharacterFrame {
  readonly sx: number
  readonly sy: number
  readonly sw: number
  readonly sh: number
  readonly index: number
}

export function characterFrame(id: CharacterId, pose: PlayerPose, animationFrame = 0): CharacterFrame | null {
  if (!generated(id)) return null
  const blink = animationFrame % 120 >= 104 && animationFrame % 120 < 111
  let index: number
  switch (pose) {
    case 'stand': index = blink ? 3 : 0; break
    case 'walk1': index = 6; break
    case 'walk2': index = id === 'brick-fox' ? 7 : 8; break
    case 'walk3': index = 11; break
    case 'jump': index = id === 'brick-fox' ? 16 : 15; break
    case 'wall': index = id === 'brick-fox' ? 15 : 13; break
    case 'throw': index = 16; break
    case 'kick': index = 11; break
    case 'skid': index = 18; break
    case 'crouch':
    case 'dead': index = 19; break
  }
  const bounds = BOUNDS[id][index]
  const col = index % 6
  const row = Math.floor(index / 6)
  return { sx: col * CELL + bounds[0], sy: row * CELL + bounds[1], sw: bounds[2] - bounds[0], sh: bounds[3] - bounds[1], index }
}

type AssetState = { image: HTMLImageElement; ready: boolean; failed: boolean }
const assets = new Map<GeneratedId, AssetState>()

function loadedImage(id: GeneratedId): HTMLImageElement | null {
  let state = assets.get(id)
  if (!state) {
    if (typeof Image === 'undefined') return null
    const image = new Image()
    state = { image, ready: false, failed: false }
    const record = state
    image.onload = () => { record.ready = image.naturalWidth === SHEET_WIDTH && image.naturalHeight === SHEET_HEIGHT; record.failed = !record.ready }
    image.onerror = () => { record.failed = true }
    image.decoding = 'async'
    image.src = URLS[id]
    assets.set(id, state)
  }
  return state.ready && !state.failed ? state.image : null
}

export interface CharacterDrawLook {
  character: CharacterId
  x: number
  y: number
  facing: 1 | -1
  size: 'small' | 'big'
  pose: PlayerPose
  spark: boolean
  squash?: number
  animationFrame?: number
}

function sparkCue(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - radius)
  ctx.lineTo(x + radius * 0.28, y - radius * 0.28)
  ctx.lineTo(x + radius, y)
  ctx.lineTo(x + radius * 0.28, y + radius * 0.28)
  ctx.lineTo(x, y + radius)
  ctx.lineTo(x - radius * 0.28, y + radius * 0.28)
  ctx.lineTo(x - radius, y)
  ctx.lineTo(x - radius * 0.28, y - radius * 0.28)
  ctx.closePath()
  ctx.fillStyle = '#f3ca74'
  ctx.strokeStyle = '#263c51'
  ctx.lineWidth = 0.7
  ctx.fill()
  ctx.stroke()
}

/** Returns the drawn top for name placement, or null while art is loading/if it fails. */
export function drawGeneratedCharacter(
  ctx: CanvasRenderingContext2D,
  look: CharacterDrawLook,
  style: LevelStyle,
  snap: (v: number) => number,
  camX: number,
  camY: number,
): number | null {
  if (!generated(look.character)) return null
  const image = loadedImage(look.character)
  const frame = characterFrame(look.character, look.pose, look.animationFrame)
  if (!image || !frame) return null

  const normalHeight = style === 'cartoon' ? (look.size === 'big' ? 34 : 23) : (look.size === 'big' ? 31 : 17)
  // Keep the same source-pixel scale across poses: a tucked jump or crouch should not enlarge the face.
  const idle = BOUNDS[look.character][0]
  const idleHeight = idle[3] - idle[1]
  const poseHeight = (normalHeight * frame.sh) / idleHeight
  const height = snap(look.squash ? poseHeight * 0.6 : poseHeight)
  const width = snap((normalHeight * frame.sw) / idleHeight)
  // The fox's tail reaches far left of its body. Place its torso on the hitbox centre.
  const anchor = look.character === 'brick-fox' ? 0.67 : 0.5
  const cx = snap(look.x) - camX
  // In the air, raised knees leave space below the drawing while the head stays at a steady height.
  const airbornePose = !look.squash && (look.pose === 'jump' || look.pose === 'wall')
  const top = snap(look.y - (airbornePose ? normalHeight : height)) - camY

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (look.facing < 0) {
    ctx.translate(cx, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, -width * anchor, top, width, height)
  } else {
    ctx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, cx - width * anchor, top, width, height)
  }
  ctx.restore()
  if (look.spark) sparkCue(ctx, cx + look.facing * Math.min(width * 0.42, 8), top + Math.max(3, height * 0.13), style === 'cartoon' ? 3 : 2.2)
  return top
}
