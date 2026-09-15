import { describe, expect, it } from 'vitest'
import { createBrickStudioDocument, resizeBuildPlate, validateBrickStudioDocument, parseBrickStudioDocument, serializeBrickStudioDocument } from './brickDocument'
import { getBuildPlateSize } from './buildPlate'
import { brickWorldPosition, STOCK_PART_MAP } from './parts'
import { BrickLayoutIndex, brickFitsLayout } from './brickRules'
import type { BrickInstance } from './types'

const brick: BrickInstance = { id:'kept', partId:'brick_2x4', x:5, y:12, z:7, rotation:1, color:'#123abc' }

describe('per-world build plate contract', () => {
  it('keeps legacy worlds readable without silently expanding them', () => {
    const original = createBrickStudioDocument([brick])
    expect(original.schemaVersion).toBe(2)
    expect(original).not.toHaveProperty('plateSize')
    expect(getBuildPlateSize(original)).toBe(64)
    expect(validateBrickStudioDocument(original)).toEqual({ok:true,document:original})
    expect(validateBrickStudioDocument({...original,plateSize:128}).ok).toBe(false)
  })

  it.each([96,128] as const)('preserves world-space brick position through an expansion to %i and back', size => {
    const original = createBrickStudioDocument([brick],{environmentId:'brick-valley'})
    const expanded = resizeBuildPlate(original,size)
    expect(expanded.ok).toBe(true)
    if(!expanded.ok) throw new Error(expanded.error.message)
    expect(expanded.document.schemaVersion).toBe(3)
    expect(expanded.document.plateSize).toBe(size)
    expect(expanded.document.environmentId).toBe('brick-valley')
    expect(brickWorldPosition(expanded.document.bricks[0],size)).toEqual(brickWorldPosition(brick,64))
    expect(parseBrickStudioDocument(serializeBrickStudioDocument(expanded.document))).toEqual(expanded)
    expect(resizeBuildPlate(expanded.document,64)).toEqual({ok:true,document:original})
    expect(original.bricks).toEqual([brick])
  })

  it('rejects destructive shrinking without moving or deleting any original brick', () => {
    const original = createBrickStudioDocument([{...brick,x:0,z:0}],{plateSize:128})
    const before = JSON.stringify(original)
    const result = resizeBuildPlate(original,64)
    expect(result.ok).toBe(false)
    if(!result.ok) expect(result.error.message).toMatch(/Move them toward the center/)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('validates each world independently, including far-edge collisions', () => {
    const atEdge = {...brick,partId:'brick_1x1',x:127,z:127,rotation:0 as const}
    const large = new BrickLayoutIndex(STOCK_PART_MAP,128)
    const small = new BrickLayoutIndex(STOCK_PART_MAP,64)
    expect(large.add(atEdge)).toBe(true)
    expect(large.add({...atEdge,id:'overlap'})).toBe(false)
    expect(small.add(atEdge)).toBe(false)
    expect(brickFitsLayout(atEdge,[],STOCK_PART_MAP,128)).toBe(true)
    expect(brickFitsLayout(atEdge,[],STOCK_PART_MAP,64)).toBe(false)
    expect(validateBrickStudioDocument(createBrickStudioDocument([atEdge],{plateSize:128})).ok).toBe(true)
  })

  it.each([undefined,32,65,129,'128',null])('rejects invalid expanded-world dimensions %s', plateSize => {
    const result = validateBrickStudioDocument({...createBrickStudioDocument([]),schemaVersion:3,plateSize})
    expect(result.ok).toBe(false)
    if(!result.ok) expect(result.error.code).toBe('invalid-plate-size')
  })
})
