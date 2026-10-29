import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { describe, expect, it } from 'vitest'
import { registerEditorBlocks } from '../core/editor/definitions'
import type { WorkspaceBlockJson, WorkspaceJson } from '../core/editor/compile'
import { validateDesign } from '../core/project'
import { createStarterProject, createWalkerBrick } from './starter'
import { catalogOriginal, canResetBrick, compileBrickEdit, isStructuralWorkspaceChange, restoreBrickOriginal } from './remix'
import { exportProjectJson, importProjectJson } from './persist/projectIo'
import type { StudioProject } from './store'

function editWorkspace(project: StudioProject, id = 'brick_walker'): WorkspaceJson {
  return structuredClone(project.workspaces[id]) as WorkspaceJson
}
function roots(workspace: WorkspaceJson): WorkspaceBlockJson[] {
  return Array.isArray(workspace.blocks) ? workspace.blocks : workspace.blocks!.blocks!
}
function allBlocks(workspace: WorkspaceJson): WorkspaceBlockJson[] {
  const found: WorkspaceBlockJson[] = []
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if ('type' in value && typeof value.type === 'string') found.push(value as WorkspaceBlockJson)
    for (const child of Object.values(value)) if (typeof child === 'object') walk(child)
  }
  walk(workspace)
  return found
}
function structuralEdit(project: StudioProject, id = 'brick_walker'): StudioProject {
  const workspace = editWorkspace(project, id)
  roots(workspace).push({ id: 'new_block', type: 'looks_show' })
  return compileBrickEdit(project, id, workspace).project
}

describe('Slice 1 remix by default', () => {
  it('ignores number/dropdown, folding, position and top-level ordering edits; they remain resettable', () => {
    const project = createStarterProject()
    expect(canResetBrick(project, 'brick_walker')).toBe(false)
    const workspace = editWorkspace(project)
    const number = allBlocks(workspace).find((b) => b.type === 'math_number')!
    number.fields!.NUM = 22
    const dropdown = allBlocks(workspace).find((b) => b.type === 'platformer_setgravity')!
    dropdown.fields!.GRAVITY = 'off'
    const root = roots(workspace)[0] as WorkspaceBlockJson & { x?: number; collapsed?: boolean }
    root.x = 999
    root.collapsed = true
    roots(workspace).reverse()
    const edited = compileBrickEdit(project, 'brick_walker', workspace)
    expect(edited.remixed).toBeUndefined()
    expect(edited.project.design.bricks.find((b) => b.id === 'brick_walker')!.name).toBe('Walker')
    expect(canResetBrick(edited.project, 'brick_walker')).toBe(true)
    expect(canResetBrick(restoreBrickOriginal(edited.project, 'brick_walker'), 'brick_walker')).toBe(false)
  })

  it('remixes on addition, removal, replacement and changed connections, keeping every copy on the same brick', () => {
    const project = createStarterProject()
    const workspace = editWorkspace(project)
    roots(workspace).push({ type: 'looks_show', id: 'added' })
    const result = compileBrickEdit(project, 'brick_walker', workspace)
    const walker = result.project.design.bricks.find((b) => b.id === 'brick_walker')!
    expect(result.remixed).toBe('My Walker')
    expect(walker.remixOf).toBe('brick_walker')
    expect(result.project.design.copies.filter((c) => c.brickId === walker.id)).toHaveLength(2)
    expect(catalogOriginal(walker)!.brick.name).toBe('Walker')
    expect(createStarterProject().design.bricks.find((b) => b.id === walker.id)!.name).toBe('Walker')
    const removed = editWorkspace(project)
    roots(removed).pop()
    expect(isStructuralWorkspaceChange(workspace, removed)).toBe(true)
    const replaced = editWorkspace(project)
    roots(replaced)[0].id = 'replacement_hat'
    expect(isStructuralWorkspaceChange(project.workspaces.brick_walker, replaced)).toBe(true)
    const moved = editWorkspace(project)
    const first = roots(moved)[0]
    const second = roots(moved)[1]
    ;[first.next, second.next] = [second.next, first.next]
    expect(isStructuralWorkspaceChange(project.workspaces.brick_walker, moved)).toBe(true)
    expect(compileBrickEdit(result.project, 'brick_walker', workspace).remixed).toBeUndefined()
  })

  it('does not mistake a new custom brick made from a starter for a built-in', () => {
    const project = createStarterProject()
    const custom = createWalkerBrick('brick1', 'Walker 2')
    project.design.bricks.push(custom.brick)
    const compiled = compileBrickEdit(project, 'brick1', custom.workspace)
    expect(compiled.remixed).toBeUndefined()
    expect(catalogOriginal(custom.brick)).toBeUndefined()
    expect(canResetBrick(compiled.project, 'brick1')).toBe(false)
  })

  it('does not remix on a real Blockly load/save, even the first number edit', () => {
    const project = createStarterProject()
    for (const id of ['brick_walker', 'brick_hero', 'brick_ground', 'brick_qblock']) {
      const brick = project.design.bricks.find((b) => b.id === id)!
      registerEditorBlocks({ getBricks: () => project.design.bricks.map((b) => b.name), getVariables: () => [...brick.program.variables, ...project.design.stage.program.variables], getCostumes: () => brick.costumes.map((c) => c.name), getMessages: () => ['boing', 'stomped', 'hero hurt', 'bounce', 'coin collected', 'course clear'] })
      const workspace = new Blockly.Workspace()
      try {
        Blockly.serialization.workspaces.load(project.workspaces[id] as object, workspace)
        const saved = Blockly.serialization.workspaces.save(workspace)
        expect(isStructuralWorkspaceChange(project.workspaces[id], saved), id).toBe(false)
        const edited = compileBrickEdit(project, id, saved)
        expect(edited.remixed, id).toBeUndefined()
        expect(canResetBrick(edited.project, id), id).toBe(false)
        const number = workspace.getAllBlocks(false).find((b) => b.type === 'math_number')
        if (number) {
          number.setFieldValue('22', 'NUM')
          const valueEdited = compileBrickEdit(project, id, Blockly.serialization.workspaces.save(workspace))
          expect(valueEdited.remixed, id).toBeUndefined()
          expect(canResetBrick(valueEdited.project, id), id).toBe(true)
        }
      } finally { workspace.dispose() }
    }
  })

  it('keeps target menus and compiled references intact through Hero remix, save/reopen and reset', () => {
    let project = createStarterProject()
    const staleWalkerWorkspace = editWorkspace(project)
    // Add non-starter forms too: clone and bump menus, and literal menu input.
    const ws = editWorkspace(project, 'brick_coin')
    roots(ws).push({ type: 'platformer_whenbump', id: 'bump_hero', fields: { SIDE: 'top', BRICK: 'Hero' }, next: { block: { type: 'control_create_clone_of', id: 'clone_hero', fields: { CLONE_OPTION: 'Hero' } } } })
    roots(ws).push({ type: 'control_create_clone_of', id: 'literal_clone', inputs: { CLONE_OPTION: { shadow: { type: 'text', id: 'target_name', fields: { TEXT: 'Hero' } } } } })
    project = compileBrickEdit(project, 'brick_coin', ws).project
    project = structuralEdit(project, 'brick_hero')
    const coin = project.design.bricks.find((b) => b.id === 'brick_coin')!
    expect(JSON.stringify(coin.program)).toContain('My Hero')
    expect(JSON.stringify(project.workspaces.brick_walker)).toContain('My Hero')
    expect(JSON.stringify(project.workspaces.brick_coin)).toContain('"BRICK":"My Hero"')
    expect(JSON.stringify(project.workspaces.brick_coin)).toContain('"TEXT":"My Hero"')
    expect(canResetBrick(project, 'brick_walker')).toBe(false)
    // Saving an editor mounted before the Hero remixed cannot put the old target name back into the program.
    project = compileBrickEdit(project, 'brick_walker', staleWalkerWorkspace).project
    expect(JSON.stringify(project.design.bricks.find((b) => b.id === 'brick_walker')!.program)).toContain('My Hero')
    const imported = importProjectJson(exportProjectJson(project))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.project.design.bricks.find((b) => b.id === 'brick_hero')!.remixOf).toBe('brick_hero')
    // Reset Walker while Hero is still remixed: its restored code must sense My Hero.
    project = restoreBrickOriginal(imported.project, 'brick_walker')
    expect(JSON.stringify(project.design.bricks.find((b) => b.id === 'brick_walker')!.program)).toContain('My Hero')
    project = restoreBrickOriginal(project, 'brick_hero')
    expect(JSON.stringify(project.workspaces.brick_walker)).not.toContain('My Hero')
    expect(JSON.stringify(project.design.bricks.find((b) => b.id === 'brick_coin')!.program)).not.toContain('My Hero')
    expect(validateDesign(project.design)).toEqual([])
  })

  it('restores code, variables, art and name, retaining compatible own values only', () => {
    let project = structuralEdit(createStarterProject())
    const walker = project.design.bricks.find((b) => b.id === 'brick_walker')!
    walker.program.variables.push({ id: 'new_slider', name: 'new slider', value: 9, showInBuild: true })
    walker.costumes = []
    project.design.copies.find((c) => c.id === 'copy_walker_fast')!.knobs = { brick_walker_speed: 7, new_slider: 12 }
    project = restoreBrickOriginal(project, 'brick_walker')
    const restored = project.design.bricks.find((b) => b.id === 'brick_walker')!
    expect(restored.name).toBe('Walker')
    expect(restored.remixOf).toBeUndefined()
    expect(restored.costumes).toHaveLength(1)
    expect(restored.program.variables.map((v) => v.id)).not.toContain('new_slider')
    expect(project.design.copies.find((c) => c.id === 'copy_walker_fast')!.knobs).toEqual({ brick_walker_speed: 7 })
    expect(validateDesign(project.design)).toEqual([])
    // A later edit cannot corrupt the cached catalog.
    restored.program.variables[0].value = 999
    expect(catalogOriginal(restored)!.brick.program.variables[0].value).toBe(3)
  })

  it('loads older saves without adding remix provenance, and rejects unsafe provenance ids', () => {
    const project = createStarterProject()
    const imported = importProjectJson(exportProjectJson(project))
    expect(imported.ok).toBe(true)
    if (imported.ok) expect(imported.project.design.bricks.every((b) => b.remixOf === undefined)).toBe(true)
    project.design.bricks[0].remixOf = '__proto__'
    expect(validateDesign(project.design).some((p) => p.path.endsWith('.remixOf'))).toBe(true)
  })

  it('removes own values for deleted slider declarations so the edited level still saves', () => {
    const project = createStarterProject()
    const workspace = editWorkspace(project)
    workspace.variables = workspace.variables!.filter((v) => v.id !== 'brick_walker_speed')
    const edited = compileBrickEdit(project, 'brick_walker', workspace).project
    expect(edited.design.bricks.find((b) => b.id === 'brick_walker')!.program.variables.some((v) => v.id === 'brick_walker_speed')).toBe(false)
    expect(edited.design.copies.filter((c) => c.brickId === 'brick_walker').every((c) => !Object.hasOwn(c.knobs ?? {}, 'brick_walker_speed'))).toBe(true)
    expect(validateDesign(edited.design)).toEqual([])
    expect(importProjectJson(exportProjectJson(edited)).ok).toBe(true)
    const empty = editWorkspace(project)
    delete empty.variables
    expect(compileBrickEdit(project, 'brick_walker', empty).project.design.bricks.find((b) => b.id === 'brick_walker')!.program.variables).toEqual([])
  })
})

describe('saves with the old Hero', () => {
  it('a Hero that is exactly the previous built-in one moves to the current one and keeps the slider values the kid tuned', async () => {
    const { upgradeUntouchedHero } = await import('./remix')
    const { createStarterProject } = await import('./starter')
    const previous = (await import('./__fixtures__/hero-before-feel-scripts.json')).default as unknown as { program: never; workspace: unknown }
    const current = createStarterProject()
    const old = createStarterProject()
    old.workspaces.brick_hero = previous.workspace
    const hero = old.design.bricks.find((b) => b.id === 'brick_hero')!
    hero.program = previous.program
    hero.program = { ...hero.program, variables: hero.program.variables.map((v) => (v.id === 'walk_top' ? { ...v, value: 9 } : v)) }
    const up = upgradeUntouchedHero(old)
    expect(up.workspaces.brick_hero).toEqual(current.workspaces.brick_hero)
    const upHero = up.design.bricks.find((b) => b.id === 'brick_hero')!
    expect(upHero.program.procedures.map((p) => p.proccode)).toEqual(['move and collide'])
    expect(upHero.program.scripts.length).toBe(current.design.bricks.find((b) => b.id === 'brick_hero')!.program.scripts.length)
    expect(upHero.program.variables.find((v) => v.id === 'walk_top')!.value).toBe(9)
  })

  it('leaves alone a current Hero, a remixed "My Hero", and any Hero with other blocks (it may be a kid\'s own edits)', async () => {
    const { upgradeUntouchedHero } = await import('./remix')
    const { createStarterProject } = await import('./starter')
    const previous = (await import('./__fixtures__/hero-before-feel-scripts.json')).default as unknown as { program: never; workspace: { blocks: { blocks: Array<{ x: number }> } } }
    const fresh = createStarterProject()
    expect(upgradeUntouchedHero(fresh)).toBe(fresh)
    const mine = createStarterProject()
    mine.workspaces.brick_hero = previous.workspace
    mine.design.bricks.find((b) => b.id === 'brick_hero')!.remixOf = 'brick_hero'
    expect(upgradeUntouchedHero(mine)).toBe(mine)
    const edited = createStarterProject()
    edited.workspaces.brick_hero = edited.workspaces.brick_walker
    expect(upgradeUntouchedHero(edited)).toBe(edited)
  })

  it('moving the old Hero\'s scripts around does not stop the upgrade (positions are not part of the blocks)', async () => {
    const { upgradeUntouchedHero } = await import('./remix')
    const { createStarterProject } = await import('./starter')
    const previous = (await import('./__fixtures__/hero-before-feel-scripts.json')).default as unknown as { program: never; workspace: { blocks: { blocks: Array<{ x: number }> } } }
    const moved = structuredClone(previous.workspace)
    for (const b of moved.blocks.blocks) b.x += 100
    const old = createStarterProject()
    old.workspaces.brick_hero = moved
    expect(upgradeUntouchedHero(old)).not.toBe(old)
  })
})
