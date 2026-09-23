import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* The /2d chunk stays light: nothing from the 3D studio, three.js or the physics engine ever gets imported. */

const root = decodeURIComponent(new URL('.', import.meta.url).pathname)

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('2D chunk boundaries', () => {
  it('imports no 3D code', () => {
    const files = sources(root)
    expect(files.length).toBeGreaterThan(20)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from\s+'three'/)
      expect(source, file).not.toMatch(/@react-three|rapier/)
      expect(source, file).not.toMatch(/BrickStudioApp|BrickStudioScene|from\s+'[^']*\/store'/)
    }
  })
})
