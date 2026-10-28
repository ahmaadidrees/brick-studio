import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { LevelDesign } from './contracts'
import { instantiate } from './project'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PLUGIN_VERSIONS,
  MAX_PARSE_DEPTH,
  MAX_SAVE_BYTES,
  decodeBase64,
  encodeBase64,
  parse,
  registerMigration,
  serialize,
} from './save'
import type { SavedProjectEnvelope } from './save'

declare const process: { cwd: () => string }

function readFixture(name: string): string {
  const filePath = `${process.cwd()}/src/platformer/lab/core/__fixtures__/${name}`
  return fs.readFileSync(filePath, 'utf8')
}

describe('save format and golden fixtures', () => {
  it('golden fixture: minimal.json loads, re-serializes byte-identically, and instantiates', () => {
    const raw = readFixture('minimal.json')
    const result = parse(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.migrated).toBe(false)
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.save.design.name).toBe('Minimal Level')

    // Byte-identical re-serialization
    const reserialized = serialize(result.save)
    expect(reserialized).toBe(raw)

    // Instantiates cleanly to expected World
    const world = instantiate(result.save.design)
    expect(world.stage.isStage).toBe(true)
    expect(world.targets).toHaveLength(1)
    expect(world.targets[0].brickId).toBe('dot')
    expect(world.targets[0].x).toBe(100)
    expect(world.targets[0].y).toBe(100)
  })

  it('golden fixture: complex.json loads, decodes mask, re-serializes byte-identically, and instantiates', () => {
    const raw = readFixture('complex.json')
    const result = parse(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.migrated).toBe(false)
    expect(result.save.design.name).toBe('Complex Level')

    // Verify mask was decoded to Uint8Array
    const heroBrick = result.save.design.bricks.find((b) => b.id === 'hero')
    expect(heroBrick).toBeDefined()
    const mask = heroBrick!.costumes[0].mask
    expect(mask).toBeDefined()
    expect(mask!.data).toBeInstanceOf(Uint8Array)
    expect(mask!.width).toBe(4)
    expect(mask!.height).toBe(4)
    expect(mask!.data.length).toBe(16)
    expect(Array.from(mask!.data)).toEqual([1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1])

    // Byte-identical re-serialization
    const reserialized = serialize(result.save)
    expect(reserialized).toBe(raw)

    // Instantiates cleanly with knob overrides and lists
    const world = instantiate(result.save.design)
    expect(world.targets).toHaveLength(2)
    // hero-1 had knob override v-speed = 8
    expect(world.targets[0].variables['v-speed']).toBe(8)
    // hero-2 has default knob v-speed = 5
    expect(world.targets[1].variables['v-speed']).toBe(5)
    // Sliced local inventory lists
    expect(world.targets[0].lists['l-inventory']).toEqual(['sword', 'shield'])
    // Stage global leaderboard list
    expect(world.stage.lists['g-leaderboard']).toEqual([100, 50, 20])
  })
})

describe('base64 encoding and decoding', () => {
  it('round-trips arbitrary byte sequences', () => {
    for (let len = 0; len < 30; len++) {
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) bytes[i] = (i * 31) % 256
      const encoded = encodeBase64(bytes)
      const decoded = decodeBase64(encoded)
      expect(decoded).not.toBeNull()
      expect(Array.from(decoded!)).toEqual(Array.from(bytes))
    }
  })

  it('returns null for invalid base64 string length', () => {
    expect(decodeBase64('abc')).toBeNull()
  })
})

describe('untrusted input defense in parse', () => {
  it('rejects non-string input without throwing', () => {
    const res = parse(123 as unknown as string)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.problems[0].code).toBe('bad-value')
    }
  })

  it('rejects oversized input exceeding MAX_SAVE_BYTES', () => {
    const bigString = ' '.repeat(MAX_SAVE_BYTES + 10)
    const res = parse(bigString)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.problems[0].code).toBe('limit')
      expect(res.problems[0].message).toContain('maximum size')
    }
  })

  it('rejects JSON exceeding maximum bracket depth before JSON.parse', () => {
    const deep = '['.repeat(MAX_PARSE_DEPTH + 10) + ']'.repeat(MAX_PARSE_DEPTH + 10)
    const res = parse(deep)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.problems[0].code).toBe('limit')
      expect(res.problems[0].message).toContain('nesting limit')
    }
  })

  it('rejects prototype pollution attempts (__proto__, constructor, prototype)', () => {
    const evil1 = '{"__proto__": {"polluted": true}, "schemaVersion": 1}'
    const res1 = parse(evil1)
    expect(res1.ok).toBe(false)
    if (!res1.ok) {
      expect(res1.problems[0].code).toBe('unsafe-id')
      expect(res1.problems[0].path).toBe('__proto__')
    }

    const evil2 = '{"constructor": 123, "schemaVersion": 1}'
    const res2 = parse(evil2)
    expect(res2.ok).toBe(false)
    if (!res2.ok) {
      expect(res2.problems[0].code).toBe('unsafe-id')
      expect(res2.problems[0].path).toBe('constructor')
    }
  })

  it('never calls eval and handles invalid JSON syntax gracefully', () => {
    const broken = '{"schemaVersion": 1, unquotedKey: "value"}'
    const res = parse(broken)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.problems[0].code).toBe('bad-value')
      expect(res.problems[0].message).toContain('Invalid JSON')
    }
  })

  it('refuses unsupported future schemaVersion', () => {
    const future = serialize({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      engineSemanticsVersion: 1,
      editorVersion: '13.3.0',
      pluginVersions: { ...DEFAULT_PLUGIN_VERSIONS },
      design: {
        id: 'lvl',
        name: 'Future Level',
        seed: 0,
        bounds: { left: 0, right: 100, bottom: 0, top: 100 },
        stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
        bricks: [],
        copies: [],
      },
    })
    const res = parse(future)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.problems[0].code).toBe('bad-value')
      expect(res.problems[0].path).toBe('schemaVersion')
      expect(res.problems[0].message).toContain('Unsupported future schema version')
    }
  })
})

describe('migrations', () => {
  it('migrates schemaVersion 0 to version 1 and keeps originalPayload', () => {
    const v0Payload = {
      schemaVersion: 0,
      design: {
        id: 'old-lvl',
        name: 'Old Level',
        seed: 10,
        bounds: { left: 0, right: 480, bottom: 0, top: 360 },
        stage: {
          id: 'stage',
          name: 'Stage',
          isStage: true,
          costumes: [{ name: 'backdrop', width: 480, height: 360, rotationCenterX: 240, rotationCenterY: 180 }],
          sounds: [],
          program: { scripts: [], procedures: [], variables: [], lists: [] },
        },
        bricks: [],
        copies: [],
      },
    }

    const raw = JSON.stringify(v0Payload)
    const result = parse(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.migrated).toBe(true)
    expect(result.save.schemaVersion).toBe(1)
    expect(result.save.editorVersion).toBe('13.3.0')
    expect(result.save.pluginVersions).toEqual(DEFAULT_PLUGIN_VERSIONS)
    // originalPayload must be preserved exactly
    expect(result.save.originalPayload).toEqual(v0Payload)
  })

  it('supports custom version migrations in the registry', () => {
    registerMigration(0, (env) => ({
      ...env,
      schemaVersion: 1,
      engineSemanticsVersion: 1,
      editorVersion: 'custom-migrated',
      pluginVersions: { ...DEFAULT_PLUGIN_VERSIONS },
      workspaces: {},
      ir: {},
    }))

    const raw = JSON.stringify({
      schemaVersion: 0,
      design: {
        id: 'custom-old',
        name: 'Custom Old',
        seed: 0,
        bounds: { left: 0, right: 100, bottom: 0, top: 100 },
        stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
        bricks: [],
        copies: [],
      },
    })
    const res = parse(raw)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.save.editorVersion).toBe('custom-migrated')
  })
})

describe('design validation integration in parse', () => {
  it('reports design validation problems from validateDesign', () => {
    const invalidDesign: SavedProjectEnvelope = {
      schemaVersion: 1,
      engineSemanticsVersion: 1,
      editorVersion: '13.3.0',
      pluginVersions: { ...DEFAULT_PLUGIN_VERSIONS },
      design: {
        id: 'bad-lvl',
        name: 'Bad Level',
        seed: -999, // invalid seed
        bounds: { left: 100, right: 50, bottom: 0, top: 100 }, // left > right
        stage: { id: 'stage', name: 'Stage', isStage: false, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } }, // isStage false
        bricks: [],
        copies: [],
      } as unknown as LevelDesign,
    }

    const raw = serialize(invalidDesign)
    const result = parse(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const codes = result.problems.map((p) => p.code)
      expect(codes).toContain('bad-seed')
      expect(codes).toContain('bad-bounds')
      expect(codes).toContain('bad-stage')
    }
  })
})
