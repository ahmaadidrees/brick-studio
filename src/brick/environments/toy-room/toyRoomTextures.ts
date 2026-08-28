import * as THREE from 'three'

/**
 * Procedural canvas textures for the explore-mode toy room. Everything is drawn
 * locally at mount time — no network, no bundled image payload — and every
 * generator survives a 2D context that refuses to exist (jsdom, locked-down
 * browsers) by falling back to a flat 1×1 fill.
 */

function paint(size: number, draw: (context: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

/**
 * Oak-ish table grain. Every stroke is a sine of the full canvas width so the
 * pattern tiles seamlessly along the grain, and each stroke is drawn three times
 * (−size, 0, +size) so it tiles across the grain as well.
 */
export function createWoodTexture(size: number) {
  return paint(size, (context) => {
    context.fillStyle = '#b07a45'
    context.fillRect(0, 0, size, size)

    const stroke = (y: number, amplitude: number, waves: number, phase: number, width: number, style: string) => {
      context.strokeStyle = style
      context.lineWidth = width
      for (const wrap of [-size, 0, size]) {
        context.beginPath()
        for (let x = 0; x <= size; x += 4) {
          const wobble = Math.sin((x / size) * Math.PI * 2 * waves + phase) * amplitude
            + Math.sin((x / size) * Math.PI * 2 * waves * 2.7 + phase * 1.7) * amplitude * 0.35
          const py = y + wrap + wobble
          if (x === 0) context.moveTo(x, py)
          else context.lineTo(x, py)
        }
        context.stroke()
      }
    }

    // Broad tonal cathedral bands — wide and faint, they only shift the hue.
    for (let index = 0; index < 16; index += 1) {
      const y = (index / 16) * size + Math.random() * 8
      stroke(
        y,
        3 + Math.random() * 6,
        1,
        Math.random() * Math.PI * 2,
        10 + Math.random() * 18,
        index % 3 === 0 ? 'rgba(206, 158, 104, 0.13)' : 'rgba(134, 92, 50, 0.11)',
      )
    }
    // Fine grain: many hairlines, each barely visible on its own.
    for (let index = 0; index < 520; index += 1) {
      stroke(
        Math.random() * size,
        1.5 + Math.random() * 4,
        1 + Math.floor(Math.random() * 2),
        Math.random() * Math.PI * 2,
        0.4 + Math.random() * 0.8,
        Math.random() > 0.62 ? 'rgba(214, 172, 122, 0.10)' : 'rgba(118, 76, 36, 0.10)',
      )
    }
    // A couple of knots, drawn well inside the tile so they never straddle a seam.
    for (const knot of [{ x: size * 0.31, y: size * 0.42 }, { x: size * 0.74, y: size * 0.78 }]) {
      for (let ring = 8; ring > 0; ring -= 1) {
        context.strokeStyle = `rgba(102, 66, 30, ${0.03 + ring * 0.011})`
        context.lineWidth = 1
        context.beginPath()
        context.ellipse(knot.x, knot.y, ring * 2.2, ring * 1.1, 0.5, 0, Math.PI * 2)
        context.stroke()
      }
    }
  })
}

/** Soft two-tone wallpaper: wide stripes with a sprinkle of little cross motifs. */
export function createWallpaperTexture(size: number) {
  return paint(size, (context) => {
    context.fillStyle = '#b3c4c0'
    context.fillRect(0, 0, size, size)
    const stripe = size / 8
    for (let index = 0; index < 8; index += 1) {
      if (index % 2 === 0) continue
      context.fillStyle = 'rgba(238, 242, 232, 0.34)'
      context.fillRect(index * stripe, 0, stripe * 0.55, size)
      context.fillStyle = 'rgba(238, 242, 232, 0.16)'
      context.fillRect(index * stripe + stripe * 0.62, 0, stripe * 0.16, size)
    }
    context.strokeStyle = 'rgba(126, 154, 148, 0.5)'
    context.lineWidth = size / 96
    const step = size / 4
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const cx = column * step + step / 2 + (row % 2 ? step / 2 : 0)
        const cy = row * step + step / 2
        const arm = size / 44
        context.beginPath()
        context.moveTo(cx - arm, cy)
        context.lineTo(cx + arm, cy)
        context.moveTo(cx, cy - arm)
        context.lineTo(cx, cy + arm)
        context.stroke()
      }
    }
  })
}

/** Cut page edges — dense horizontal striations with a warm cream base. */
export function createPageTexture(size = 128) {
  return paint(size, (context) => {
    context.fillStyle = '#f2e6cd'
    context.fillRect(0, 0, size, size)
    for (let y = 0; y < size; y += 2) {
      context.fillStyle = `rgba(150, 126, 88, ${0.10 + Math.random() * 0.16})`
      context.fillRect(0, y, size, 1)
    }
    context.fillStyle = 'rgba(120, 96, 60, 0.10)'
    context.fillRect(0, 0, size, size * 0.06)
  })
}

/** A wooden alphabet block face. */
export function createLetterTexture(letter: string, size = 128) {
  return paint(size, (context) => {
    context.fillStyle = '#e8d5ac'
    context.fillRect(0, 0, size, size)
    context.strokeStyle = 'rgba(150, 112, 62, 0.55)'
    context.lineWidth = size * 0.05
    context.strokeRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8)
    context.fillStyle = '#c0442f'
    context.font = `bold ${size * 0.6}px Georgia, serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(letter, size / 2, size * 0.54)
  })
}

/** A five-pip die face. */
export function createDieTexture(size = 96) {
  return paint(size, (context) => {
    context.fillStyle = '#f6f2e8'
    context.fillRect(0, 0, size, size)
    context.fillStyle = '#2c3138'
    const pip = size * 0.1
    const spots: [number, number][] = [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]]
    for (const [u, v] of spots) {
      context.beginPath()
      context.arc(u * size, v * size, pip, 0, Math.PI * 2)
      context.fill()
    }
  })
}

/** Soft round sprite used for dust motes. */
export function createDustTexture(size = 32) {
  return paint(size, (context) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 246, 226, 1)')
    gradient.addColorStop(0.45, 'rgba(255, 240, 210, 0.42)')
    gradient.addColorStop(1, 'rgba(255, 236, 200, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  })
}

/**
 * Alpha ramp for the lamp beam cone. Cylinder UVs run v = 0 at the wide bottom
 * to v = 1 at the shade, so the beam is densest where it leaves the shade and
 * dissolves before it reaches the table.
 */
export function createBeamAlphaTexture(size = 64) {
  const texture = paint(size, (context) => {
    const gradient = context.createLinearGradient(0, size, 0, 0)
    gradient.addColorStop(0, '#000000')
    gradient.addColorStop(0.12, '#141414')
    gradient.addColorStop(0.55, '#4a4a4a')
    gradient.addColorStop(0.88, '#8a8a8a')
    gradient.addColorStop(1, '#2a2a2a')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  })
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** Faint coffee ring left on the table. */
export function createCoffeeRingTexture(size = 128) {
  return paint(size, (context) => {
    context.clearRect(0, 0, size, size)
    context.strokeStyle = 'rgba(96, 58, 28, 0.42)'
    context.lineWidth = size * 0.045
    context.beginPath()
    context.arc(size / 2, size / 2, size * 0.36, 0.2, Math.PI * 1.85)
    context.stroke()
    context.strokeStyle = 'rgba(96, 58, 28, 0.18)'
    context.lineWidth = size * 0.02
    context.beginPath()
    context.arc(size / 2, size / 2, size * 0.3, 1.1, Math.PI * 1.6)
    context.stroke()
  })
}

/** Room floorboards seen far below the table edge. */
export function createFloorTexture(size = 256) {
  return paint(size, (context) => {
    context.fillStyle = '#8a6039'
    context.fillRect(0, 0, size, size)
    const plank = size / 5
    for (let index = 0; index < 5; index += 1) {
      context.fillStyle = `rgba(${index % 2 ? 120 : 96}, ${index % 2 ? 84 : 62}, ${index % 2 ? 48 : 32}, 0.35)`
      context.fillRect(0, index * plank, size, plank)
      context.fillStyle = 'rgba(48, 30, 14, 0.5)'
      context.fillRect(0, index * plank, size, size / 128)
    }
  })
}

export function disposeTextures(textures: (THREE.Texture | null | undefined)[]) {
  for (const texture of textures) texture?.dispose()
}
