import { describe, expect, it } from 'vitest'
import { exportProjectJson } from './persist/projectIo'
import { createRaceStarterProject } from './race/raceProject'
import { upgradeLegacySaveText } from './legacySave'

describe('the step 7 upgrade leaves saves that name a kit alone', () => {
  /** A race track whose tiles hold a character no brick of it owns ('Q', a Platformer ? block before step 7). */
  function raceWithStray(kit: boolean): string {
    const save = JSON.parse(exportProjectJson(createRaceStarterProject()))
    const rows: string[] = save.design.tiles.data
    rows[0] = `Q${rows[0].slice(1)}`
    if (!kit) delete save.design.kit
    return JSON.stringify(save)
  }

  it('a race track is never rewritten into Platformer bricks', () => {
    const text = raceWithStray(true)
    expect(upgradeLegacySaveText(text)).toBe(text)
  })

  it('(the same save without a kit would be: that is what the check is for)', () => {
    const text = raceWithStray(false)
    expect(upgradeLegacySaveText(text)).not.toBe(text)
  })

  it('the beginner track as saved is unchanged', () => {
    const text = exportProjectJson(createRaceStarterProject())
    expect(upgradeLegacySaveText(text)).toBe(text)
  })
})
