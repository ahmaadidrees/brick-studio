import { describe, expect, it } from 'vitest'
import { designKit, type KitId } from './core/contracts'
import { createRuntime, play } from './core/index'
import { validateDesign } from './core/project'
import { parse, serialize } from './core/save'
import { KITS, kitNotReady, kitOf, kitReady } from './kits'
import { createStarterProject } from './studio/starter'
import { createRaceStarterProject } from './studio/race/raceProject'
import { StudioStore, type StudioProject } from './studio/store'
import { builtInPowers, fits, forGame, makePower, powerFromFile, powerToFile, whyNot, type PowerBrick } from './studio/powers/powers'
import { checkedHackableDocument, projectFromDocument, projectFromText } from './studio/persist/hackableSave'
import { exportProjectJson, importProjectJson } from './studio/persist/projectIo'

/** The starter project as another kit's project (slice K: only the design's `kit` differs). */
const asKit = (kit: KitId): StudioProject => {
  const project = createStarterProject()
  return { ...project, design: { ...project.design, kit } }
}
const doubleJump = (): PowerBrick => builtInPowers().find((p) => p.id === 'double-jump')!

describe('kits: which Hackable game a project is', () => {
  it('a design without a kit is the Platformer, so every save made before kits opens unchanged', () => {
    const project = createStarterProject()
    expect(project.design.kit).toBeUndefined()
    expect(designKit(project.design)).toBe('platformer')
    expect(kitOf(project.design)).toBe(KITS.platformer)
    expect(exportProjectJson(project)).not.toContain('"kit"')
  })

  it('a design with kit "race" validates, saves and reopens as a race project, in a file and in an account document', () => {
    const race = asKit('race')
    expect(validateDesign(race.design)).toEqual([])
    const text = exportProjectJson(race)
    expect(projectFromText(text)?.design.kit).toBe('race')
    const checked = checkedHackableDocument(race)
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(projectFromDocument(JSON.parse(JSON.stringify(checked.document)))?.design.kit).toBe('race')
    // The core envelope keeps it byte for byte.
    const parsed = parse(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(serialize(parsed.save)).toBe(text)
  })

  it('a kit this version does not know is a problem in the design', () => {
    const design = { ...createStarterProject().design, kit: 'kart' as KitId }
    expect(validateDesign(design)).toEqual([expect.objectContaining({ path: 'kit', code: 'bad-value' })])
  })

  it('the Platformer and Racing (R1) open in the studio; 3D is named, and refused politely', () => {
    expect(kitReady('platformer')).toBe(true)
    expect(kitReady('race')).toBe(true)
    expect(kitReady('3d')).toBe(false)
    expect(() => play(createStarterProject().design)).not.toThrow()
    expect(() => createRuntime(createRaceStarterProject().design)).not.toThrow()
    // 3D has no engine yet.
    expect(() => createRuntime(asKit('3d').design)).toThrow(/3d/)
    expect(kitNotReady(createStarterProject().design)).toBeNull()
    expect(kitNotReady(createRaceStarterProject().design)).toBeNull()
    expect(kitNotReady(asKit('3d').design)).toMatch(/Hackable 3D/)
  })

  it('a race file opens in the studio as a race track, never as a Platformer; a 3D file says what it is', () => {
    const race = importProjectJson(exportProjectJson(createRaceStarterProject()))
    expect(race.ok && race.project.design.kit).toBe('race')
    expect(importProjectJson(exportProjectJson(createStarterProject())).ok).toBe(true)
    expect(importProjectJson(exportProjectJson(asKit('3d')))).toEqual({ ok: false, error: expect.stringMatching(/Hackable 3D/) })
  })

  it('a file of the other game, opened over a project, says what it is: a project keeps its game', () => {
    const raceText = exportProjectJson(createRaceStarterProject())
    const platformerText = exportProjectJson(createStarterProject())
    expect(importProjectJson(raceText, 'platformer')).toEqual({ ok: false, error: 'That file is a Hackable Racing project. Open it from My projects.' })
    expect(importProjectJson(platformerText, 'race')).toEqual({ ok: false, error: 'That file is a Hackable Platformer project. Open it from My projects.' })
    expect(importProjectJson(raceText, 'race').ok).toBe(true)
    expect(importProjectJson(platformerText, 'platformer').ok).toBe(true)
  })

  it('names and addresses for each kit', () => {
    expect(Object.values(KITS).map((k) => [k.name, k.route])).toEqual([
      ['Hackable Platformer', '/2d/hackable'],
      ['Hackable Racing', '/2d/hackable-race'],
      ['Hackable 3D', '/3d/hackable'],
    ])
  })
})

describe('kits: a power shows only in its own game', () => {
  it('built-in powers and powers made before kits are Platformer powers, and their files are unchanged', () => {
    expect(builtInPowers().every((p) => p.game === undefined && forGame(p, 'platformer') && !forGame(p, 'race'))).toBe(true)
    const store = new StudioStore(createStarterProject())
    const made = makePower(store.getState().project, 'brick_hero', { name: 'Mine', by: 'Ana', what: '', blockIds: [] })
    expect(made.game).toBeUndefined()
    expect(powerToFile(made)).not.toContain('"game"')
  })

  it('a power made in a race project is a Racing power, and keeps that through its file', () => {
    const made = makePower(asKit('race'), 'brick_hero', { name: 'Turbo', by: 'Sam', what: 'Go faster', blockIds: [] })
    expect(made.game).toBe('race')
    const back = powerFromFile(powerToFile(made))
    expect(back?.game).toBe('race')
    expect(forGame(back!, 'race')).toBe(true)
    expect(forGame(back!, 'platformer')).toBe(false)
  })

  it('a power file for a game this version does not know is not a power it can use', () => {
    expect(powerFromFile(JSON.stringify({ ...doubleJump(), game: 'kart' }))).toBeNull()
    // A file that says "platformer" out loud reads the same as one that says nothing.
    expect(powerFromFile(JSON.stringify({ ...doubleJump(), game: 'platformer' }))?.game).toBeUndefined()
  })

  it('a Platformer power does not fit a race project, and the other way round, and says why', () => {
    const hero = createStarterProject().design.bricks.find((b) => b.id === 'brick_hero')!
    const turbo: PowerBrick = { ...doubleJump(), name: 'Turbo', game: 'race' }
    expect(fits(doubleJump(), hero)).toBe(true)
    expect(fits(doubleJump(), hero, 'race')).toBe(false)
    expect(whyNot(doubleJump(), hero, 'race')).toBe('Double jump is a Hackable Platformer power, so it snaps onto Hackable Platformer bricks.')
    expect(fits(turbo, hero)).toBe(false)
    expect(whyNot(turbo, hero)).toBe('Turbo is a Hackable Racing power, so it snaps onto Hackable Racing bricks.')
    expect(fits(turbo, hero, 'race')).toBe(true)
  })

  it('the store refuses to snap a power from another game', () => {
    const store = new StudioStore(asKit('race'))
    expect(store.snapPower('brick_hero', doubleJump())).toBeNull()
    expect(store.snapPower('brick_hero', { ...doubleJump(), game: 'race' })).not.toBeNull()
  })
})
