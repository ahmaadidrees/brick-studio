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
 * Honey table grain. Every stroke is a sine of the full canvas width so the
 * pattern tiles seamlessly along the grain, and each stroke is drawn three times
 * (−size, 0, +size) so it tiles across the grain as well.
 */
export function createWoodTexture(size: number) {
  return paint(size, (context) => {
    context.fillStyle = '#cf9a5f'
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
        index % 3 === 0 ? 'rgba(236, 196, 138, 0.14)' : 'rgba(164, 112, 62, 0.10)',
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
        Math.random() > 0.62 ? 'rgba(240, 206, 156, 0.10)' : 'rgba(146, 96, 48, 0.09)',
      )
    }
    // A couple of knots, drawn well inside the tile so they never straddle a seam.
    for (const knot of [{ x: size * 0.31, y: size * 0.42 }, { x: size * 0.74, y: size * 0.78 }]) {
      for (let ring = 8; ring > 0; ring -= 1) {
        context.strokeStyle = `rgba(128, 84, 40, ${0.03 + ring * 0.01})`
        context.lineWidth = 1
        context.beginPath()
        context.ellipse(knot.x, knot.y, ring * 2.2, ring * 1.1, 0.5, 0, Math.PI * 2)
        context.stroke()
      }
    }
  })
}

/**
 * The view through the window: a dusk gradient with a few stars, a simple city
 * skyline and a sprinkle of lit windows. One plane, one texture, no lights.
 */
export function createSkylineTexture(size = 512) {
  const texture = paint(size, (context) => {
    const sky = context.createLinearGradient(0, 0, 0, size)
    sky.addColorStop(0, '#1d2a55')
    sky.addColorStop(0.42, '#4a4a8f')
    sky.addColorStop(0.66, '#b46a7e')
    sky.addColorStop(0.8, '#f0a06a')
    sky.addColorStop(1, '#f7c890')
    context.fillStyle = sky
    context.fillRect(0, 0, size, size)

    // Stars in the dark upper third.
    context.fillStyle = 'rgba(255, 248, 230, 0.9)'
    let seed = 7
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    for (let index = 0; index < 34; index += 1) {
      const x = random() * size
      const y = random() * size * 0.34
      const r = 0.6 + random() * 1.3
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fill()
    }

    // Two rows of buildings: a pale distant row and a darker near row.
    const skyline = (baseY: number, color: string, windowColor: string, count: number, tallest: number) => {
      let x = 0
      context.fillStyle = color
      const buildings: [number, number, number][] = []
      for (let index = 0; index < count && x < size; index += 1) {
        const width = size * (0.05 + random() * 0.08)
        const height = size * (0.1 + random() * tallest)
        context.fillRect(x, baseY - height, width + 1, height + size)
        buildings.push([x, width, height])
        x += width
      }
      context.fillStyle = windowColor
      for (const [bx, bw, bh] of buildings) {
        const columns = Math.max(1, Math.floor(bw / (size * 0.03)))
        const rows = Math.max(1, Math.floor(bh / (size * 0.04)))
        for (let column = 0; column < columns; column += 1) {
          for (let row = 0; row < rows; row += 1) {
            if (random() > 0.45) continue
            context.fillRect(
              bx + size * 0.008 + column * (size * 0.03),
              baseY - bh + size * 0.012 + row * (size * 0.04),
              size * 0.012,
              size * 0.016,
            )
          }
        }
      }
    }
    skyline(size * 0.86, '#5b5a9a', 'rgba(255, 224, 170, 0.55)', 14, 0.3)
    skyline(size * 0.98, '#2a3566', 'rgba(255, 214, 140, 0.85)', 10, 0.24)
    // Ground line so the city sits on something.
    context.fillStyle = '#222c52'
    context.fillRect(0, size * 0.97, size, size * 0.03)
  })
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/** Wall clock face — ticks, numerals at the quarters and hands painted at ten past ten. */
export function createClockFaceTexture(size = 256) {
  const texture = paint(size, (context) => {
    const center = size / 2
    context.fillStyle = '#f8f4eb'
    context.fillRect(0, 0, size, size)
    context.strokeStyle = '#263c51'
    context.lineCap = 'round'
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2
      const quarter = index % 3 === 0
      const outer = size * 0.44
      const inner = quarter ? size * 0.36 : size * 0.4
      context.lineWidth = quarter ? size * 0.035 : size * 0.018
      context.beginPath()
      context.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner)
      context.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer)
      context.stroke()
    }
    const hand = (angle: number, length: number, width: number) => {
      context.lineWidth = width
      context.beginPath()
      context.moveTo(center - Math.cos(angle) * size * 0.05, center - Math.sin(angle) * size * 0.05)
      context.lineTo(center + Math.cos(angle) * length, center + Math.sin(angle) * length)
      context.stroke()
    }
    // Ten past ten, the classic friendly clock face.
    hand(-Math.PI / 2 - (2 / 12) * Math.PI * 2, size * 0.24, size * 0.05)
    hand(-Math.PI / 2 + (2 / 12) * Math.PI * 2, size * 0.36, size * 0.035)
    context.fillStyle = '#f17861'
    context.beginPath()
    context.arc(center, center, size * 0.035, 0, Math.PI * 2)
    context.fill()
  })
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/**
 * Butter ruler with ink markings, drawn once instead of a dozen tick meshes.
 * The texture is laid along the ruler's length (u) with the ticks on one edge.
 */
export function createRulerTexture(width = 512, height = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#f3ca74'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#263c51'
    const ticks = 24
    for (let index = 0; index <= ticks; index += 1) {
      const x = (index / ticks) * (width - 2) + 1
      const major = index % 2 === 0
      const length = major ? height * 0.42 : height * 0.24
      context.fillRect(x - 1, 0, 2, length)
    }
    context.font = `bold ${Math.round(height * 0.3)}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (let index = 1; index < ticks / 2; index += 1) {
      context.fillText(String(index), (index / (ticks / 2)) * (width - 2) + 1, height * 0.72)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 8
  return texture
}

/** The "SAME DESK / MORE WORLDS" poster from the direction I boards: warm-white type on cornflower. */
export function createPosterTexture(width = 256, height = 320) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#5888da'
    context.fillRect(0, 0, width, height)
    context.strokeStyle = 'rgba(248, 244, 235, 0.55)'
    context.lineWidth = width * 0.02
    context.strokeRect(width * 0.07, height * 0.06, width * 0.86, height * 0.88)
    context.fillStyle = '#f8f4eb'
    context.font = `bold ${Math.round(width * 0.19)}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const lines = ['SAME', 'DESK', 'MORE', 'WORLDS']
    lines.forEach((line, index) => {
      context.fillText(line, width / 2, height * (0.24 + index * 0.17))
    })
    context.fillStyle = '#f17861'
    context.fillRect(width * 0.34, height * 0.9, width * 0.32, height * 0.018)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
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
    context.fillStyle = '#f8f4eb'
    context.fillRect(0, 0, size, size)
    context.strokeStyle = '#f17861'
    context.lineWidth = size * 0.05
    context.strokeRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8)
    context.fillStyle = '#5888da'
    context.font = `bold ${size * 0.6}px system-ui, sans-serif`
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

/** Room floorboards seen far below the table edge. */
export function createFloorTexture(size = 256) {
  return paint(size, (context) => {
    context.fillStyle = '#7d5a3a'
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
