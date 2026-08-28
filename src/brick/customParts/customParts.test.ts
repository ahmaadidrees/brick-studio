import { validateBrickStudioDocument } from '@brick-studio/core/document'
import { describe, expect, it } from 'vitest'
import {
  compileCustomPart,
  createCustomPartPreviewDescriptor,
  CUSTOM_PART_ENGINE_ENABLED_BY_DEFAULT,
  CUSTOM_PART_LIMITS,
  serializeCompiledCustomPart,
  serializeCustomPartSource,
  validateCustomPartSource,
} from './index'
import type { CustomPartBoxSource, CustomPartSource } from './types'

function source(overrides: Partial<CustomPartSource> = {}): CustomPartSource {
  return {
    schemaVersion: 1,
    name: 'Bridge Foot',
    bounds: { width: 2, depth: 2, height: 3 },
    studs: 'auto',
    boxes: [{
      kind: 'box',
      center: [0, 1.5, 0],
      size: [2, 3, 2],
      material: 'body',
      collider: true,
    }],
    ...overrides,
  }
}

function enabledCompile(value: unknown) {
  return compileCustomPart(value, { enabled: true })
}

describe('custom-part feature gate and schema bridge', () => {
  it('is unmounted and disabled unless an integrator opts in', () => {
    expect(CUSTOM_PART_ENGINE_ENABLED_BY_DEFAULT).toBe(false)
    expect(compileCustomPart(source())).toEqual({
      ok: false,
      error: {
        code: 'feature-disabled',
        message: 'Custom-part compilation is disabled until an integrator explicitly enables it.',
      },
    })
  })

  it('compiles bounded boxes into immutable render, physics, preview, and schema-v2 descriptors', () => {
    const result = enabledCompile(source({
      boxes: [
        { kind: 'box', center: [0, 1, 0], size: [2, 2, 2], material: 'body', collider: true },
        { kind: 'box', center: [0, 2.5, 0], size: [1, 1, 1], material: 'accent', collider: false },
      ],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.part.id).toMatch(/^custom_box_v1_[\da-f]{32}$/)
    expect(result.part.schemaV2Part).toEqual({
      id: result.part.id,
      name: 'Bridge Foot',
      template: 'solid',
      width: 2,
      depth: 2,
      height: 3,
      studs: 'auto',
    })
    expect(result.part.boundsWorld).toEqual({ width: 1.24, depth: 1.24, height: 0.54 })
    expect(result.part.render.boxes[0]).toEqual({
      kind: 'box',
      center: [0, 0.18, 0],
      size: [1.24, 0.36, 1.24],
      material: 'body',
    })
    expect(result.part.physics.colliders[0]).toEqual({
      shape: 'cuboid',
      center: [0, 0.18, 0],
      halfExtents: [0.62, 0.18, 0.62],
    })
    expect(Object.isFrozen(result.part)).toBe(true)
    expect(Object.isFrozen(result.part.render.boxes[0].center)).toBe(true)

    const preview = createCustomPartPreviewDescriptor(result.part)
    expect(preview.partId).toBe(result.part.id)
    expect(preview.camera.target).toEqual([0, 0.27, 0])
    expect(preview.boxes).not.toBe(result.part.render.boxes)

    const documentResult = validateBrickStudioDocument({
      schemaVersion: 2,
      partLibraryVersion: 1,
      environmentId: 'classic',
      customParts: [result.part.schemaV2Part],
      bricks: [],
    })
    expect(documentResult.ok).toBe(true)
  })

  it('produces content-addressed IDs and stable serialization independent of object key order', () => {
    const ordinary = source({
      boxes: [
        source().boxes[0],
        { kind: 'box', center: [0, 2.75, 0], size: [1, 0.5, 1], material: 'accent', collider: false },
      ],
    })
    const reordered = {
      boxes: [...ordinary.boxes].reverse().map((box) => ({
        collider: box.collider,
        material: box.material,
        size: box.size,
        center: box.center,
        kind: box.kind,
      })),
      studs: ordinary.studs,
      bounds: { height: 3, depth: 2, width: 2 },
      name: ordinary.name,
      schemaVersion: 1,
    }
    const left = enabledCompile(ordinary)
    const right = enabledCompile(reordered)
    expect(left.ok && right.ok).toBe(true)
    if (!left.ok || !right.ok) return
    expect(left.part.id).toBe(right.part.id)
    expect(serializeCustomPartSource(ordinary)).toBe(serializeCustomPartSource(right.part.source))
    expect(serializeCompiledCustomPart(left.part)).toBe(serializeCompiledCustomPart(right.part))
    expect(serializeCompiledCustomPart(left.part).endsWith('\n')).toBe(true)

    const renamed = enabledCompile(source({ name: 'Bridge Foot 2' }))
    expect(renamed.ok).toBe(true)
    if (renamed.ok) expect(renamed.part.id).not.toBe(left.part.id)
  })
})

describe('custom-part adversarial validation', () => {
  it.each([
    ['NaN', source({ boxes: [{ ...source().boxes[0], center: [Number.NaN, 1.5, 0] }] })],
    ['positive infinity', source({ boxes: [{ ...source().boxes[0], size: [2, Number.POSITIVE_INFINITY, 2] }] })],
    ['negative infinity', source({ boxes: [{ ...source().boxes[0], center: [0, Number.NEGATIVE_INFINITY, 0] }] })],
    ['excess precision', source({ boxes: [{ ...source().boxes[0], center: [0.1234567, 1.5, 0] }] })],
    ['out of bounds', source({ boxes: [{ ...source().boxes[0], center: [2, 1.5, 0] }] })],
    ['degenerate box', source({ boxes: [{ ...source().boxes[0], size: [0, 3, 2] }] })],
    ['no collider', source({ boxes: [{ ...source().boxes[0], collider: false }] })],
  ])('rejects %s', (_label, value) => {
    expect(validateCustomPartSource(value).ok).toBe(false)
    const result = enabledCompile(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-source')
  })

  it('rejects primitive and collider budget attacks', () => {
    const tiny = (index: number): CustomPartBoxSource => ({
      kind: 'box',
      center: [-0.75 + (index % 7) * 0.25, 0.125, -0.75 + (index % 7) * 0.25],
      size: [0.125, 0.25, 0.125],
      material: 'body',
      collider: true,
    })
    const tooManyPrimitives = source({
      boxes: Array.from({ length: CUSTOM_PART_LIMITS.maxBoxes + 1 }, (_, index) => ({
        ...tiny(index),
        collider: index === 0,
      })),
    })
    const tooManyColliders = source({
      boxes: Array.from({ length: CUSTOM_PART_LIMITS.maxColliders + 1 }, (_, index) => tiny(index)),
    })
    const primitiveResult = validateCustomPartSource(tooManyPrimitives)
    const colliderResult = validateCustomPartSource(tooManyColliders)
    expect(primitiveResult.ok).toBe(false)
    expect(colliderResult.ok).toBe(false)
    if (!primitiveResult.ok) expect(primitiveResult.issues.some((issue) => issue.code === 'primitive-limit')).toBe(true)
    if (!colliderResult.ok) expect(colliderResult.issues.some((issue) => issue.code === 'collider-limit')).toBe(true)
  })

  it('rejects overlapping-volume amplification even below the primitive cap', () => {
    const value = source({
      boxes: Array.from({ length: 3 }, (_, index) => ({
        ...source().boxes[0],
        material: index === 0 ? 'body' as const : 'accent' as const,
        collider: index === 0,
      })),
    })
    const result = validateCustomPartSource(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((issue) => issue.code === 'volume-limit')).toBe(true)
  })

  it.each(['url', 'asset', 'code', 'modelUrl', '__proto__'])('rejects unsupported %s fields', (field) => {
    const value: Record<string, unknown> = { ...source() }
    Object.defineProperty(value, field, { value: 'https://example.invalid/unsafe.glb', enumerable: true })
    const result = validateCustomPartSource(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((issue) => issue.code === 'unexpected-field')).toBe(true)
  })

  it('rejects arbitrary properties attached to tuple and primitive arrays', () => {
    const tuple = [0, 1.5, 0] as [number, number, number] & { asset?: string }
    tuple.asset = 'unsafe.glb'
    const tupleResult = validateCustomPartSource(source({
      boxes: [{ ...source().boxes[0], center: tuple }],
    }))
    expect(tupleResult.ok).toBe(false)

    const boxes = [...source().boxes] as CustomPartBoxSource[] & { code?: string }
    boxes.code = 'run()'
    const boxesResult = validateCustomPartSource(source({ boxes }))
    expect(boxesResult.ok).toBe(false)
  })

  it('rejects custom prototypes and accessors without invoking an accessor', () => {
    const inherited = Object.assign(Object.create({ code: 'run()' }), source())
    expect(validateCustomPartSource(inherited).ok).toBe(false)

    let invoked = false
    const accessor = { ...source() }
    Object.defineProperty(accessor, 'name', {
      enumerable: true,
      get() {
        invoked = true
        return 'unsafe'
      },
    })
    expect(validateCustomPartSource(accessor).ok).toBe(false)
    expect(invoked).toBe(false)
  })
})

describe('custom-part randomized invariants', () => {
  function random(seed: number) {
    let state = seed >>> 0
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 0x1_0000_0000
    }
  }

  it('keeps 300 generated valid parts deterministic, finite, and within declared world bounds', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = random(seed)
      const width = 1 + Math.floor(next() * 8)
      const depth = 1 + Math.floor(next() * 8)
      const height = 1 + Math.floor(next() * 12)
      const count = 1 + Math.floor(next() * 8)
      const boxes: CustomPartBoxSource[] = Array.from({ length: count }, (_, index) => {
        const sizeX = Math.min(width, 0.125 + Math.floor(next() * width * 4) * 0.125)
        const sizeY = Math.min(height, 0.25 + Math.floor(next() * height * 2) * 0.25)
        const sizeZ = Math.min(depth, 0.125 + Math.floor(next() * depth * 4) * 0.125)
        const roomX = width - sizeX
        const roomY = height - sizeY
        const roomZ = depth - sizeZ
        const centerX = -width / 2 + sizeX / 2 + Math.floor(next() * (roomX * 8 + 1)) / 8
        const centerY = sizeY / 2 + Math.floor(next() * (roomY * 4 + 1)) / 4
        const centerZ = -depth / 2 + sizeZ / 2 + Math.floor(next() * (roomZ * 8 + 1)) / 8
        return {
          kind: 'box',
          center: [centerX, centerY, centerZ],
          size: [sizeX, sizeY, sizeZ],
          material: (['body', 'accent', 'clear', 'rubber'] as const)[index % 4],
          collider: index === 0,
        }
      })
      // Shrink randomized boxes if their cumulative render volume exceeds the
      // deliberately conservative overlapping-volume budget.
      const boundsVolume = width * depth * height
      const volume = boxes.reduce((total, box) => total + box.size[0] * box.size[1] * box.size[2], 0)
      const safeBoxes = volume <= boundsVolume * 2 ? boxes : [boxes[0]]
      const value = source({ name: `Generated ${seed}`, bounds: { width, depth, height }, boxes: safeBoxes })

      const first = enabledCompile(value)
      const second = enabledCompile(JSON.parse(JSON.stringify(value)) as unknown)
      expect(first.ok, `seed ${seed}`).toBe(true)
      expect(second.ok, `seed ${seed}`).toBe(true)
      if (!first.ok || !second.ok) continue
      expect(first.part.id).toBe(second.part.id)
      expect(serializeCompiledCustomPart(first.part)).toBe(serializeCompiledCustomPart(second.part))

      const allNumbers = [
        ...Object.values(first.part.boundsWorld),
        ...first.part.render.boxes.flatMap((box) => [...box.center, ...box.size]),
        ...first.part.physics.colliders.flatMap((box) => [...box.center, ...box.halfExtents]),
      ]
      expect(allNumbers.every(Number.isFinite)).toBe(true)
      for (const box of first.part.render.boxes) {
        expect(Math.abs(box.center[0]) + box.size[0] / 2).toBeLessThanOrEqual(first.part.boundsWorld.width / 2 + 1e-6)
        expect(box.center[1] - box.size[1] / 2).toBeGreaterThanOrEqual(-1e-6)
        expect(box.center[1] + box.size[1] / 2).toBeLessThanOrEqual(first.part.boundsWorld.height + 1e-6)
        expect(Math.abs(box.center[2]) + box.size[2] / 2).toBeLessThanOrEqual(first.part.boundsWorld.depth / 2 + 1e-6)
      }
    }
  })
})
