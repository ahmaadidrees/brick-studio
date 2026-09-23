import { describe, expect, it } from 'vitest'
import { autoplay } from '../engine/autoplay'
import { COURSES } from './courses'

describe('courses', () => {
  it('have unique ids and one start and one goal each', () => {
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(COURSES.length)
    for (const c of COURSES) {
      const level = c.level()
      expect(level.title).toBe(c.title)
      expect(level.objects.filter((o) => o.kind === 'start')).toHaveLength(1)
      expect(level.objects.filter((o) => o.kind === 'goal')).toHaveLength(1)
    }
  })

  // A bot using the real physics has to reach the goal, so no course ships with an impossible section.
  for (const c of COURSES) {
    it(`${c.title} can be beaten`, () => {
      expect(autoplay(c.level(), { beam: 24, maxSteps: 3000 }).cleared).toBe(true)
    }, 60_000)
  }
})
