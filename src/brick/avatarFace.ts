import * as THREE from 'three'
import {
  FACE_ATLAS_COLUMNS,
  FACE_ATLAS_ROWS,
  FACE_FRAME_BLINK,
  FACE_FRAME_GASP,
  FACE_FRAME_GRIN,
  FACE_FRAME_OPEN,
} from './avatarPose'

/**
 * The toy figure's face is one small canvas atlas rather than four meshes of
 * eyelids. Expression changes are then a texture-offset write per frame, which
 * costs nothing and never recompiles a shader.
 *
 * Layout is 2x2, row-major from the top-left: open, blink, grin, gasp. Each cell
 * keeps a transparent margin so mip levels of neighbouring frames cannot bleed
 * into one another at distance.
 */

const CELL_MARGIN = 0.12
const INK = '#2b3550'
const BROW = '#7a4a2e'
const MOUTH_INNER = '#8e3a4a'
const TONGUE = '#e2748a'
const EYE_WHITE = '#fdfcfa'

type Cell = {
  context: CanvasRenderingContext2D
  /** Maps 0..1 face-space to canvas pixels inside this cell's safe area. */
  px: (value: number) => number
  py: (value: number) => number
  unit: number
}

function makeCell(context: CanvasRenderingContext2D, column: number, row: number, size: number): Cell {
  const inset = size * CELL_MARGIN
  const safe = size - inset * 2
  const originX = column * size + inset
  const originY = row * size + inset
  return {
    context,
    px: (value: number) => originX + value * safe,
    py: (value: number) => originY + value * safe,
    unit: safe,
  }
}

function ellipse(cell: Cell, x: number, y: number, radiusX: number, radiusY: number, fill: string) {
  const { context } = cell
  context.beginPath()
  context.ellipse(cell.px(x), cell.py(y), radiusX * cell.unit, radiusY * cell.unit, 0, 0, Math.PI * 2)
  context.fillStyle = fill
  context.fill()
}

function stroke(cell: Cell, width: number, color: string) {
  cell.context.lineWidth = width * cell.unit
  cell.context.strokeStyle = color
  cell.context.lineCap = 'round'
  cell.context.lineJoin = 'round'
  cell.context.stroke()
}

/** Quadratic arc through (x0,y0) -> (x1,y1) bowing by `bow` (positive is downward). */
function arc(cell: Cell, x0: number, y0: number, x1: number, y1: number, bow: number) {
  const { context } = cell
  context.beginPath()
  context.moveTo(cell.px(x0), cell.py(y0))
  context.quadraticCurveTo(cell.px((x0 + x1) / 2), cell.py((y0 + y1) / 2 + bow), cell.px(x1), cell.py(y1))
}

function drawBrows(cell: Cell, lift: number, tilt: number) {
  arc(cell, 0.16, 0.27 - lift + tilt, 0.4, 0.24 - lift - tilt, -0.05)
  stroke(cell, 0.052, BROW)
  arc(cell, 0.6, 0.24 - lift - tilt, 0.84, 0.27 - lift + tilt, -0.05)
  stroke(cell, 0.052, BROW)
}

function drawOpenEye(cell: Cell, x: number, radiusY: number) {
  ellipse(cell, x, 0.45, 0.088, radiusY, INK)
  ellipse(cell, x - 0.028, 0.41, 0.03, 0.032, EYE_WHITE)
}

function drawWideEye(cell: Cell, x: number) {
  // `ellipse` leaves its path current, so the outline strokes the shape just filled.
  ellipse(cell, x, 0.45, 0.105, 0.125, EYE_WHITE)
  stroke(cell, 0.026, INK)
  ellipse(cell, x, 0.47, 0.048, 0.052, INK)
}

/** Happy closed eye: a shallow upward bow, not a flat dash. */
function drawClosedEye(cell: Cell, x: number) {
  arc(cell, x - 0.095, 0.47, x + 0.095, 0.47, -0.075)
  stroke(cell, 0.05, INK)
}

function drawSmile(cell: Cell, width: number, bow: number) {
  arc(cell, 0.5 - width, 0.63, 0.5 + width, 0.63, bow)
  stroke(cell, 0.05, INK)
}

function drawOpenMouth(cell: Cell) {
  const { context } = cell
  context.beginPath()
  context.moveTo(cell.px(0.31), cell.py(0.6))
  context.quadraticCurveTo(cell.px(0.5), cell.py(0.66), cell.px(0.69), cell.py(0.6))
  context.quadraticCurveTo(cell.px(0.5), cell.py(0.88), cell.px(0.31), cell.py(0.6))
  context.closePath()
  context.fillStyle = MOUTH_INNER
  context.fill()
  ellipse(cell, 0.5, 0.755, 0.09, 0.045, TONGUE)
}

function drawFrame(cell: Cell, frame: number) {
  if (frame === FACE_FRAME_OPEN) {
    drawBrows(cell, 0, 0)
    drawOpenEye(cell, 0.32, 0.108)
    drawOpenEye(cell, 0.68, 0.108)
    drawSmile(cell, 0.155, 0.115)
    return
  }
  if (frame === FACE_FRAME_BLINK) {
    drawBrows(cell, 0.01, 0)
    drawClosedEye(cell, 0.32)
    drawClosedEye(cell, 0.68)
    drawSmile(cell, 0.155, 0.125)
    return
  }
  if (frame === FACE_FRAME_GRIN) {
    drawBrows(cell, 0.015, 0.015)
    drawOpenEye(cell, 0.32, 0.092)
    drawOpenEye(cell, 0.68, 0.092)
    drawOpenMouth(cell)
    return
  }
  drawBrows(cell, 0.06, 0)
  drawWideEye(cell, 0.315)
  drawWideEye(cell, 0.685)
  ellipse(cell, 0.5, 0.72, 0.072, 0.092, MOUTH_INNER)
}

/**
 * Builds the 2x2 face atlas. `cellSize` drops on the compact renderer, which is
 * the only quality knob the face needs: the drawing is resolution independent.
 */
export function createFaceTexture(cellSize = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = cellSize * FACE_ATLAS_COLUMNS
  canvas.height = cellSize * FACE_ATLAS_ROWS
  const context = canvas.getContext('2d')
  if (context) {
    for (const frame of [FACE_FRAME_OPEN, FACE_FRAME_BLINK, FACE_FRAME_GRIN, FACE_FRAME_GASP]) {
      const column = frame % FACE_ATLAS_COLUMNS
      const row = Math.floor(frame / FACE_ATLAS_COLUMNS)
      drawFrame(makeCell(context, column, row, cellSize), frame)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.repeat.set(1 / FACE_ATLAS_COLUMNS, 1 / FACE_ATLAS_ROWS)
  texture.offset.set(0, 1 / FACE_ATLAS_ROWS)
  return texture
}
