import { describe, it, expect } from 'vitest'
import { REFERENCE_HASH, ROLLBACK_HASH, runReferenceScenario, runRollbackScenario } from './selftest'

describe('reference scenario', () => {
  it('produces the recorded fingerprint (the in-browser self-test compares against it)', () => {
    const h = runReferenceScenario()
    expect(h).toBe(REFERENCE_HASH)
  })

  it('rollback scenario converges to the recorded fingerprint', () => {
    const hashes = runRollbackScenario()
    expect(new Set(hashes).size).toBe(1)
    expect(hashes[0]).toBe(ROLLBACK_HASH)
  })
})
