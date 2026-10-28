import { characterFrame } from '../../characters/atlas'
import { CartoonSkin } from '../../render/cartoon/cartoonSkin'
import type { Sprite } from '../../render/skin'
import type { BrickDef } from '../bricks/builtins'
import { CostumeArt } from '../render/costumes'
import { imageDataPixels, type CostumeFrame, type CostumeSet } from './model'

const SIZE = 32
const HERO_POSES = [
  ['stand', 'Stand'], ['walk1', 'Walk 1'], ['walk2', 'Walk 2'], ['walk3', 'Walk 3'], ['jump', 'Jump'],
] as const

function canvas() {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  return c
}

function pixelsOf(draw: (g: CanvasRenderingContext2D) => void): string {
  const c = canvas()
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('Canvas is needed to edit costumes')
  g.imageSmoothingEnabled = true
  draw(g)
  return imageDataPixels(g.getImageData(0, 0, SIZE, SIZE))
}

function placedPixels(sprite: Sprite): string {
  return pixelsOf((g) => {
    const scale = Math.min((SIZE - 3) / sprite.w, (SIZE - 2) / sprite.h)
    const w = sprite.w * scale
    const h = sprite.h * scale
    g.drawImage(sprite.img, (SIZE - w) / 2, SIZE - h - 1, w, h)
  })
}

function fromHeroAtlas(image: HTMLImageElement): CostumeFrame[] {
  return HERO_POSES.map(([pose, name], i) => {
    const crop = characterFrame('builder', pose)!
    return {
      id: `frame-${i + 1}`,
      name,
      // The source cell is 256 square. Keep a consistent bottom center across poses.
      pixels: pixelsOf((g) => g.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh,
        (256 - crop.sw) / 16, (256 - crop.sh) / 8, crop.sw / 8, crop.sh / 8)),
    }
  })
}

function loadBuilder(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth === 1536 && image.naturalHeight === 1024 ? image : null)
    image.onerror = () => resolve(null)
    image.src = '/platformer/characters/builder-v1.png'
  })
}

/** Creates a draft from the actual stage art. Caller saves it only after an edit or explicit action. */
export async function seedCostumeSet(definition: BrickDef): Promise<CostumeSet> {
  const skin = new CartoonSkin(3)
  const art = new CostumeArt(3)
  let frames: CostumeFrame[] = []
  if (definition.costume === 'hero') {
    const builder = await loadBuilder()
    if (builder) frames = fromHeroAtlas(builder)
    else {
      frames = HERO_POSES.map(([pose, name], i) => ({
        id: `frame-${i + 1}`, name,
        pixels: placedPixels(skin.sprite(`p:1:small:${pose}:0`)),
      }))
    }
  } else {
    const sampled = definition.costume === 'coin' || definition.costume === 'qblock' ? [0, 8, 16, 24]
      : definition.costume === 'walker' || definition.costume === 'spiky' ? [0, 16]
        : definition.costume === 'flyer' ? [0, 4] : [0]
    frames = sampled.flatMap((tick, i) => {
      const placed = art.costume(skin, definition.costume, tick, 1, 'none')
      return placed ? [{ id: `frame-${i + 1}`, name: `Frame ${i + 1}`, pixels: placedPixels(placed.sprite) }] : []
    })
  }
  if (!frames.length) throw new Error('Could not load this brick’s art')
  return { version: 1, width: SIZE, height: SIZE, fps: 8, frames }
}
