import { memo } from 'react'
import { createBrickGeometry } from './geometry'
import type { BrickPart } from './types'

type ThumbnailPolygon = {
  points: string
  fill: string
  depth: number
}

type PartThumbnailModel = {
  polygons: ThumbnailPolygon[]
  vertexCount: number
}

const VIEWBOX_SIZE = 96
const VIEWBOX_PADDING = 8
const thumbnailCache = new Map<string, PartThumbnailModel>()

type ProjectedVertex = {
  x: number
  y: number
  depth: number
}

function projectVertex(x: number, y: number, z: number): ProjectedVertex {
  return {
    x: (x - z) * 0.86,
    y: (x + z) * 0.34 - y * 1.14,
    depth: x + z + y * 0.18,
  }
}

function triangleLighting(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
) {
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const acx = cx - ax
  const acy = cy - ay
  const acz = cz - az
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  const magnitude = Math.hypot(nx, ny, nz) || 1
  const light = Math.max(0, (-nx * 0.35 + ny * 0.82 + nz * 0.45) / magnitude)
  return {
    facingCamera: (nx * 0.62 + ny * 0.5 + nz * 0.62) / magnitude,
    lightness: 43 + light * 18,
  }
}

function createPartThumbnailModel(part: BrickPart): PartThumbnailModel {
  const cached = thumbnailCache.get(part.id)
  if (cached) return cached

  const geometry = createBrickGeometry(part)
  const positions = geometry.getAttribute('position')
  const indices = geometry.getIndex()
  const rawPolygons: Array<ThumbnailPolygon & { vertices: ProjectedVertex[] }> = []
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const elementCount = indices?.count ?? positions.count
  for (let element = 0; element + 2 < elementCount; element += 3) {
    const a = indices?.getX(element) ?? element
    const b = indices?.getX(element + 1) ?? element + 1
    const c = indices?.getX(element + 2) ?? element + 2
    const ax = positions.getX(a)
    const ay = positions.getY(a)
    const az = positions.getZ(a)
    const bx = positions.getX(b)
    const by = positions.getY(b)
    const bz = positions.getZ(b)
    const cx = positions.getX(c)
    const cy = positions.getY(c)
    const cz = positions.getZ(c)
    const vertices = [
      projectVertex(ax, ay, az),
      projectVertex(bx, by, bz),
      projectVertex(cx, cy, cz),
    ]
    const area = Math.abs(
      (vertices[1].x - vertices[0].x) * (vertices[2].y - vertices[0].y)
      - (vertices[1].y - vertices[0].y) * (vertices[2].x - vertices[0].x),
    )
    if (area < 0.00001) continue
    const lighting = triangleLighting(ax, ay, az, bx, by, bz, cx, cy, cz)
    if (lighting.facingCamera <= 0.001) continue

    vertices.forEach((vertex) => {
      minX = Math.min(minX, vertex.x)
      maxX = Math.max(maxX, vertex.x)
      minY = Math.min(minY, vertex.y)
      maxY = Math.max(maxY, vertex.y)
    })
    rawPolygons.push({
      vertices,
      points: '',
      fill: `hsl(211 64% ${lighting.lightness.toFixed(1)}%)`,
      depth: vertices.reduce((total, vertex) => total + vertex.depth, 0) / 3,
    })
  }

  const contentSize = VIEWBOX_SIZE - VIEWBOX_PADDING * 2
  const width = Math.max(0.001, maxX - minX)
  const height = Math.max(0.001, maxY - minY)
  const scale = Math.min(contentSize / width, contentSize / height)
  const offsetX = (VIEWBOX_SIZE - width * scale) / 2 - minX * scale
  const offsetY = (VIEWBOX_SIZE - height * scale) / 2 - minY * scale
  const polygons = rawPolygons
    .sort((left, right) => left.depth - right.depth)
    .map(({ vertices, fill, depth }) => ({
      fill,
      depth,
      points: vertices
        .map((vertex) => `${(vertex.x * scale + offsetX).toFixed(2)},${(vertex.y * scale + offsetY).toFixed(2)}`)
        .join(' '),
    }))
  const model = { polygons, vertexCount: positions.count }
  thumbnailCache.set(part.id, model)
  return model
}

type PartThumbnailProps = {
  part: BrickPart
}

export const PartThumbnail = memo(function PartThumbnail({ part }: PartThumbnailProps) {
  const model = createPartThumbnailModel(part)
  return (
    <svg
      className="part-thumbnail"
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      aria-hidden="true"
      data-part-id={part.id}
      data-vertex-count={model.vertexCount}
      focusable="false"
    >
      <ellipse className="part-thumbnail-shadow" cx="49" cy="83" rx="30" ry="7" />
      {model.polygons.map((polygon, index) => (
        <polygon
          key={`${polygon.depth}-${index}`}
          points={polygon.points}
          fill={polygon.fill}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
})
