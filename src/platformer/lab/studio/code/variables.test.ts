import { describe, expect, it } from 'vitest'
import { compileWorkspace } from '../../core/editor/compile'
import { getVariableOptions, VARIABLE_MENU_DELETE, VARIABLE_MENU_RENAME } from '../../core/editor/context'
import { MAX_VARIABLE_NAME, renameInWorkspace, variableNameProblem, workspaceUsesVariable } from './variables'

describe('variableNameProblem', () => {
  it('accepts a new name and refuses empty, too long and used names (any case)', () => {
    expect(variableNameProblem('lives', ['coins'])).toBeNull()
    expect(variableNameProblem('  ', ['coins'])).toBe('Type a name first.')
    expect(variableNameProblem('x'.repeat(MAX_VARIABLE_NAME + 1), [])).toMatch(/too long/)
    expect(variableNameProblem(' Coins ', ['coins'])).toBe('There’s already a variable called “Coins”. Try another name.')
    expect(variableNameProblem('loot', ['loot'], 'list')).toMatch(/already a list/)
  })
})

describe('saved workspaces', () => {
  const ws = {
    variables: [{ id: 'v1', name: 'coins', type: '' }],
    blocks: { languageVersion: 0, blocks: [{ type: 'event_whenflagclicked', id: 'h', next: { block: { type: 'data_changevariableby', id: 'c', fields: { VARIABLE: 'v1' } } } }] },
  }

  it('renames only the declaration, and finds the blocks that use a variable', () => {
    expect(renameInWorkspace(ws, 'v1', 'gems')?.variables).toEqual([{ id: 'v1', name: 'gems', type: '' }])
    expect(renameInWorkspace(JSON.stringify(ws), 'missing', 'gems')).toBeNull()
    expect(workspaceUsesVariable(ws, 'v1')).toBe(true)
    expect(workspaceUsesVariable(JSON.stringify(ws), 'v2')).toBe(false)
  })

  it('a renamed variable keeps its value and Build slider when compiled', () => {
    const renamed = renameInWorkspace(ws, 'v1', 'gems')
    const program = compileWorkspace(renamed, { variables: [{ id: 'v1', name: 'coins', value: 5, showInBuild: true }] }).program
    expect(program.variables).toEqual([{ id: 'v1', name: 'gems', value: 5, showInBuild: true }])
  })
})

describe('the variable menu', () => {
  const vars = () => [{ id: 'a', name: 'coins' }, { id: 'b', name: 'lives' }]
  it('offers Rename and Delete (naming the variable shown) only when the editor handles them', () => {
    expect(getVariableOptions({ getVariables: vars })).toEqual([['coins', 'a'], ['lives', 'b']])
    expect(getVariableOptions({ getVariables: vars, onVariableMenu: () => {} }, 'b')).toEqual([
      ['coins', 'a'], ['lives', 'b'], ['Rename variable', VARIABLE_MENU_RENAME], ['Delete the "lives" variable', VARIABLE_MENU_DELETE],
    ])
  })
})
