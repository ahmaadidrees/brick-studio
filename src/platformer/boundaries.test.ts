import { describe, expect, it } from 'vitest'

/* The /2d chunk stays light: nothing from the 3D studio, three.js or the physics engine ever gets imported. */

import { posix } from 'node:path'

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
        expect(posix.join(posix.dirname(file), spec), `${file} imports ${spec}`).not.toMatch(/^\.\.\/state(\/|$)/)
      }
    }
  })
})
