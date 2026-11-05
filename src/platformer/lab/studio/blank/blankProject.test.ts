import { describe, expect, it } from 'vitest'
import { validateDesign } from '../../core/project'
import { createRuntime } from '../../core'
import { KITS, kitReady } from '../../kits'
import { hasPlayer, isPlayerBrick, playerBrickOf, screensFor, backgroundOf, KIT_SCREENS } from '../kitScreens'
import { hackableHref, hackableRoute, newProjectName } from '../persist/hackableProjects'
import { parse2dRoute } from '../../../routes2d'
import { hackableKind, PROJECT_KIND_LABEL } from '../../../../projects/projectFile'
import { spawnOf } from '../../rooms/game'
import { createBlankProject, BLANK_COLS, BLANK_ROWS, stageCells } from './blankProject'

const withBrick = () => {
  const project = createBlankProject()
  const brick = { id: 'brick1', name: 'Zip', costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } }
  return { ...project.design, bricks: [brick], copies: [{ id: 'copy1', brickId: 'brick1', x: 40, y: 40 }] }
}

describe('Start from nothing: the kit seam (lane A)', () => {
  it('starts as an empty stage the size of a Scratch stage: 30 x 22 cells, paper, no bricks', () => {
    const { design } = createBlankProject()
    expect(design.kit).toBe('blank')
    expect(design.bricks).toEqual([])
    expect(design.copies).toEqual([])
    expect(stageCells(design)).toEqual({ cols: BLANK_COLS, rows: BLANK_ROWS })
    expect(design.bounds).toEqual({ left: 0, right: 480, bottom: 0, top: 352 })
    expect(validateDesign(design)).toEqual([])
    expect(backgroundOf(design)).toBe('paper')
  })

  it('is a kit this version can open and run, at its own address', () => {
    expect(kitReady('blank')).toBe(true)
    expect(KITS.blank.route).toBe(hackableRoute('blank'))
    expect(hackableHref.fresh('blank')).toBe('/2d/hackable-blank?new=1')
    expect(parse2dRoute(new URL('https://x.test/2d/hackable-blank?new=1'))).toMatchObject({ kind: 'studio', fresh: true, kit: 'blank' })
    expect(newProjectName('blank')).toBe(KIT_SCREENS.blank.copy.projectName)
    expect(() => createRuntime(createBlankProject().design).greenFlag()).not.toThrow()
  })

  it('My projects calls it an Own game', () => {
    expect(hackableKind('blank')).toBe('hackable-blank')
    expect(PROJECT_KIND_LABEL['hackable-blank']).toBe('Own game')
  })

  it('its player is the brick the design names, never one picked by name', () => {
    const design = withBrick()
    expect(screensFor(design).kit).toBe('blank')
    expect(isPlayerBrick(design, 'brick1')).toBe(false)
    expect(hasPlayer(design)).toBe(false)
    // A brick named like a kit's player is still not the player.
    expect(isPlayerBrick({ ...design, bricks: [{ ...design.bricks[0], name: 'Hero' }] }, 'brick1')).toBe(false)
    const playing = { ...design, player: 'brick1' }
    expect(isPlayerBrick(playing, 'brick1')).toBe(true)
    expect(playerBrickOf(playing)?.id).toBe('brick1')
    expect(hasPlayer(playing)).toBe(true)
    // Rooms spawn every friend's copy from it.
    expect(spawnOf(playing)?.id).toBe('copy1')
    expect(spawnOf(design)).toBeUndefined()
  })

  it('refuses a player or backdrop that is not one', () => {
    const design = createBlankProject().design
    expect(validateDesign({ ...design, player: 5 as never }).map((p) => p.path)).toContain('player')
    expect(validateDesign({ ...design, backdrop: 'lava' as never }).map((p) => p.path)).toContain('backdrop')
    expect(validateDesign({ ...design, backdrop: 'night' })).toEqual([])
  })
})
