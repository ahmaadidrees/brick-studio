import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYS,
  defaultEditorContext,
  getBackdropOptions,
  getCostumeOptions,
  getEditorContext,
  getKeyOptions,
  getListOptions,
  getMessageOptions,
  getSoundOptions,
  getTargetOptions,
  getVariableOptions,
  setEditorContext,
  type EditorContext,
} from './context'

describe('EditorContext and dynamic menus', () => {
  it('provides default fallback menus when context is empty or default', () => {
    expect(getVariableOptions(defaultEditorContext)).toEqual([['my variable', 'var_default']])
    expect(getListOptions(defaultEditorContext)).toEqual([['my list', 'list_default']])
    expect(getMessageOptions(defaultEditorContext)).toEqual([['message1', 'message1']])
    expect(getCostumeOptions(defaultEditorContext)).toEqual([['costume1', 'costume1']])
    expect(getSoundOptions(defaultEditorContext)).toEqual([['pop', 'pop']])
    expect(getBackdropOptions(defaultEditorContext)).toEqual([['backdrop1', 'backdrop1']])
    expect(getKeyOptions(defaultEditorContext)).toEqual([...DEFAULT_KEYS])
  })

  it('reflects custom context entries', () => {
    const custom: EditorContext = {
      getVariables: () => [
        { id: 'v1', name: 'score' },
        { id: 'v2', name: 'lives' },
      ],
      getLists: () => [{ id: 'l1', name: 'inventory' }],
      getMessages: () => ['start_game', 'game_over'],
      getBricks: () => ['Walker', 'Coin'],
      getCostumes: () => ['walk1', 'walk2'],
      getSounds: () => ['jump', 'hit'],
      getBackdrops: () => ['level1', 'level2'],
      getKeys: () => [
        ['space', 'space'],
        ['enter', 'enter'],
      ],
    }

    expect(getVariableOptions(custom)).toEqual([
      ['score', 'v1'],
      ['lives', 'v2'],
    ])
    expect(getListOptions(custom)).toEqual([['inventory', 'l1']])
    expect(getMessageOptions(custom)).toEqual([
      ['start_game', 'start_game'],
      ['game_over', 'game_over'],
    ])
    expect(getCostumeOptions(custom)).toEqual([
      ['walk1', 'walk1'],
      ['walk2', 'walk2'],
    ])
    expect(getSoundOptions(custom)).toEqual([
      ['jump', 'jump'],
      ['hit', 'hit'],
    ])
    expect(getBackdropOptions(custom, true)).toEqual([
      ['level1', 'level1'],
      ['level2', 'level2'],
      ['next backdrop', 'next backdrop'],
      ['previous backdrop', 'previous backdrop'],
      ['random backdrop', 'random backdrop'],
    ])
    expect(getKeyOptions(custom)).toEqual([
      ['space', 'space'],
      ['enter', 'enter'],
    ])
    expect(
      getTargetOptions(custom, [
        { label: 'mouse-pointer', value: '_mouse_' },
        { label: 'random position', value: '_random_' },
      ]),
    ).toEqual([
      ['mouse-pointer', '_mouse_'],
      ['random position', '_random_'],
      ['Walker', 'Walker'],
      ['Coin', 'Coin'],
    ])
  })

  it('manages active context via setEditorContext and returns restore cleanup', () => {
    const custom: EditorContext = {
      getMessages: () => ['custom_msg'],
    }
    const restore = setEditorContext(custom)
    expect(getEditorContext()).toBe(custom)
    expect(getMessageOptions()).toEqual([['custom_msg', 'custom_msg']])
    restore()
    expect(getEditorContext()).toBe(defaultEditorContext)
  })
})
