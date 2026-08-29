import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('runtime content bundle boundaries', () => {
  it.each(['environment.tsx', 'character.tsx'])(
    'keeps heavy implementations out of eager imports in %s',
    (filename) => {
      const source = readFileSync(decodeURIComponent(new URL(filename, import.meta.url).pathname), 'utf8')
      expect(source).not.toMatch(
        /from ['"].*\/(adapter|ToyRoomWorld|BrickValleyScene|SkyIslandWorld|ToyFigureAvatar|HeroAvatar)['"]/,
      )
      expect(source).toContain('loadRuntimeRegistration')
    },
  )
})
