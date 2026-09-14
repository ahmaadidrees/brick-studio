import { afterEach, describe, expect, it } from 'vitest'
import { createBrickStudioDocument } from './brickDocument'
import {
  captureRecoverySnapshot,
  registerRecoverySnapshotProvider,
  type RecoverySnapshot,
  type RecoverySnapshotProvider,
} from './recoverySnapshot'
import type { BrickInstance } from './types'

const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#ffffff' }

const releases: Array<() => void> = []

function register(provider: RecoverySnapshotProvider) {
  const release = registerRecoverySnapshotProvider(provider)
  releases.push(release)
  return release
}

function snapshot(overrides: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  return {
    document: createBrickStudioDocument([brick]),
    source: 'local',
    worldId: null,
    title: null,
    capturedAt: 1,
    ...overrides,
  }
}

afterEach(() => {
  for (const release of releases.splice(0)) release()
})

describe('captureRecoverySnapshot', () => {
  it('returns null while no provider is registered', () => {
    expect(captureRecoverySnapshot()).toBeNull()
  })

  it('asks the newest provider first', () => {
    register(() => snapshot({ worldId: 'older' }))
    register(() => snapshot({ source: 'cloud', worldId: 'newer' }))
    expect(captureRecoverySnapshot()).toMatchObject({ source: 'cloud', worldId: 'newer' })
  })

  it('skips providers that return nothing, an invalid document, or throw', () => {
    register(() => snapshot({ worldId: 'valid-older' }))
    register(() => snapshot({
      document: { ...createBrickStudioDocument([brick]), schemaVersion: 99 } as unknown as RecoverySnapshot['document'],
      worldId: 'unsupported-schema',
    }))
    register(() => { throw new Error('provider exploded') })
    register(() => null)
    expect(captureRecoverySnapshot()).toMatchObject({ worldId: 'valid-older' })
  })

  it('rejects documents brick-core would refuse to import and unknown sources', () => {
    const overlapping = register(() => snapshot({
      document: createBrickStudioDocument([brick, { ...brick, id: 'brick-overlap' }]),
    }))
    expect(captureRecoverySnapshot()).toBeNull()
    overlapping()
    register(() => ({ ...snapshot(), source: 'ftp' as unknown as RecoverySnapshot['source'] }))
    expect(captureRecoverySnapshot()).toBeNull()
  })

  it('returns a normalized copy instead of aliasing the provider document', () => {
    const document = createBrickStudioDocument([brick])
    register(() => snapshot({ document, source: 'live', worldId: 'room-1', title: 'Castle', capturedAt: 42 }))
    const captured = captureRecoverySnapshot()
    expect(captured).toMatchObject({ source: 'live', worldId: 'room-1', title: 'Castle', capturedAt: 42 })
    expect(captured?.document).toEqual(document)
    expect(captured?.document).not.toBe(document)
    expect(captured?.document.bricks[0]).not.toBe(document.bricks[0])
  })

  it('upgrades an older schema and fills in identity defaults', () => {
    register(() => ({
      document: { schemaVersion: 1, partLibraryVersion: 1, bricks: [brick] },
      source: 'cloud',
      worldId: '',
      title: '',
      capturedAt: Number.NaN,
    }) as unknown as RecoverySnapshot)
    const captured = captureRecoverySnapshot()
    expect(captured?.document.schemaVersion).toBe(2)
    expect(captured?.document.bricks).toEqual([brick])
    expect(captured?.worldId).toBeNull()
    expect(captured?.title).toBeNull()
    expect(Number.isFinite(captured?.capturedAt)).toBe(true)
  })

  it('unregisters idempotently and leaves the other providers in place', () => {
    const older = register(() => snapshot({ worldId: 'older' }))
    const newer = register(() => snapshot({ worldId: 'newer' }))
    newer()
    newer()
    expect(captureRecoverySnapshot()).toMatchObject({ worldId: 'older' })
    older()
    expect(captureRecoverySnapshot()).toBeNull()
  })
})
