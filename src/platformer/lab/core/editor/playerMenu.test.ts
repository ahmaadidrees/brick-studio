/**
 * Start from nothing's "the player" in the sprite menus (wave 2 integration, fix a): offered in a game from nothing
 * only, first after the menu's own specials; every kit's menus stay exactly as they were.
 */
import { describe, expect, it } from 'vitest'
import { PLAYER_MENU } from '../contracts'
import { defaultEditorContext, type EditorContext } from './context'
import { createBlockDefinitions } from './definitions'

const options = (type: string, name: string, ctx: EditorContext) => {
  const def = createBlockDefinitions(ctx).find((d) => d.type === type)!
  const arg = (def.args0 as Array<{ name: string; options: unknown }>).find((a) => a.name === name)!
  return (typeof arg.options === 'function' ? (arg.options as () => string[][])() : arg.options) as string[][]
}
const MENUS: Array<[string, string]> = [
  ['sensing_touchingobject', 'TOUCHINGOBJECTMENU'],
  ['sensing_distanceto', 'DISTANCETOMENU'],
  ['sensing_of', 'OBJECT'],
  ['platformer_whenbump', 'BRICK'],
]
const bricks = { getBricks: () => ['Zip', 'Walker'] }

describe('"the player" in the sprite menus', () => {
  it('a game from nothing offers it in touching, distance to, "of" and the bump hat', () => {
    const blank: EditorContext = { ...defaultEditorContext, ...bricks, kit: 'blank' }
    for (const [type, name] of MENUS) expect(options(type, name, blank), type).toContainEqual(['the player', PLAYER_MENU])
    expect(options('sensing_touchingobject', 'TOUCHINGOBJECTMENU', blank)[0]).toEqual(['the player', PLAYER_MENU])
  })

  it('no kit offers it: their menus are as before', () => {
    for (const kit of [undefined, 'platformer', 'race', '3d'] as const) {
      const ctx: EditorContext = { ...defaultEditorContext, ...bricks, kit }
      for (const [type, name] of MENUS) expect(options(type, name, ctx).map((o) => o[1]), `${kit} ${type}`).not.toContain(PLAYER_MENU)
    }
    expect(options('sensing_touchingobject', 'TOUCHINGOBJECTMENU', { ...defaultEditorContext, ...bricks })).toEqual([['mouse-pointer', '_mouse_'], ['edge', '_edge_'], ['Zip', 'Zip'], ['Walker', 'Walker']])
  })
})
