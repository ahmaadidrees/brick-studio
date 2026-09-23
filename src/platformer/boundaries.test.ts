import { describe, expect, it } from 'vitest'

/* The /2d chunk stays light: nothing from the 3D studio, three.js or the physics engine ever gets imported. */

const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

describe('2D chunk boundaries', () => {
  it('imports no 3D code', () => {
    const files = Object.entries(sources)
    expect(files.length).toBeGreaterThan(20)
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/from\s+'three'/)
      expect(source, file).not.toMatch(/@react-three|rapier/)
      expect(source, file).not.toMatch(/BrickStudioApp|BrickStudioScene|from\s+'[^']*\/store'/)
    }
  })
})
