import { describe, expect, it } from 'vitest'

/* The /2d chunk stays light: nothing from the 3D studio, three.js or the physics engine ever gets imported. */

/** Resolve a relative import against the importing file's folder (both relative to src/platformer). */
function resolveFrom(file: string, spec: string): string {
  const parts = file.split('/').slice(0, -1)
  for (const p of spec.split('/')) {
    if (p === '..') { if (parts.length && parts[parts.length - 1] !== '..' && parts[parts.length - 1] !== '.') parts.pop(); else parts.push('..') }
    else if (p !== '.') parts.push(p)
  }
  return parts.filter((p) => p !== '.').join('/')
}

const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

describe('2D chunk boundaries', () => {
  it('imports no 3D code', () => {
    const files = Object.entries(sources)
    expect(files.length).toBeGreaterThan(20)
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/from\s+'three'/)
      expect(source, file).not.toMatch(/@react-three|rapier/)
      expect(source, file).not.toMatch(/BrickStudioApp|BrickStudioScene/)
      // The 3D game store lives in src/state (useGameStore). 2D code may have stores of its own (Code Lab's studio/store).
      for (const [, spec] of source.matchAll(/from\s+'(\.[^']*)'/g)) {
        expect(resolveFrom(file, spec), `${file} imports ${spec}`).not.toMatch(/^\.\.\/state(\/|$)/)
      }
    }
  })
})
