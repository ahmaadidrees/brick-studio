import { describe, expect, it } from 'vitest'
import { StudioStore } from './store'
import { createStarterProject } from './starter'
import { checkLevelForPlay } from './builder/playRules'
import { parse } from '../core/save'
import { exportProjectJson } from './storage'

function fixture() {
  const project = createStarterProject()
  const walker = project.design.bricks.find((b) => b.name === 'Walker')!
  const copies = project.design.copies.filter((c) => c.brickId === walker.id)
  const speed = walker.program.variables.find((v) => v.showInBuild)!
  // An inherited copy alongside an overridden copy exercises the explicit all/one contract.
  delete copies[0].knobs
  copies[1].knobs = { [speed.id]: 9 }
  return { store: new StudioStore(project), walker, copies, speed }
}

describe('Slice 1 shared studio lifecycle', () => {
  it('shows a pending Restart only for program changes, not layout or immediate slider tuning', () => {
    const { store, walker, speed } = fixture()
    store.openCode(walker.id)
    const original = structuredClone(store.getState().project.workspaces[walker.id]) as { blocks: { blocks: Array<Record<string, unknown>> } }
    store.setBrickSlider(walker.id, speed.id, 4)
    expect(store.getState().pendingCodeChanges).toBe(false)
    const moved = structuredClone(original)
    moved.blocks.blocks[0].x = 900
    store.setWorkspace(walker.id, moved)
    expect(store.getState().pendingCodeChanges).toBe(false)
    const changed = structuredClone(moved)
    changed.blocks.blocks.push({ type: 'event_whenflagclicked', id: 'new-pending-hat' })
    store.setWorkspace(walker.id, changed)
    expect(store.getState().pendingCodeChanges).toBe(true)
    store.restartPreview()
    expect(store.getState().pendingCodeChanges).toBe(false)
    store.stop()
    expect(store.getState().pendingCodeChanges).toBe(false)
  })
  it('keeps remixed Hero and Goal playable and removes overrides when a slider is hidden', () => {
    const { store, walker, copies, speed } = fixture()
    const design = store.getState().project.design
    for (const brick of design.bricks) {
      if (brick.id === 'brick_hero' || brick.id === 'brick_goal') {
        brick.remixOf = brick.id
        brick.name = `My ${brick.name}`
      }
    }
    expect(checkLevelForPlay(design)).toEqual({ hero: true, goal: true })
    store.setVariableKnob(walker.id, speed.id, false)
    expect(store.getState().project.design.copies.find((c) => c.id === copies[1].id)!.knobs?.[speed.id]).toBeUndefined()
    expect(parse(exportProjectJson(store.getState().project)).ok).toBe(true)
  })
  it('starts with Ground and switches the selected brick without moving the Hero', () => {
    const { store, walker, copies } = fixture()
    expect(store.brick(store.getState().brushBrickId!)?.grid?.char).toBe('G')
    const hero = store.getState().project.design.copies.find((c) => c.brickId === 'brick_hero')!
    const position = [hero.x, hero.y]
    store.selectCopy(copies[0].id)
    expect(store.getState().selectedBrickId).toBe(walker.id)
    store.selectCopy('cell:0:0')
    expect(store.brick(store.getState().selectedBrickId)?.grid?.char).toBe('G')
    expect([hero.x, hero.y]).toEqual(position)
  })

  it('previews the real level while retaining selection, and separates pause/resume/restart', () => {
    const { store, walker, copies } = fixture()
    store.selectCopy(copies[0].id)
    store.openCode(walker.id)
    const first = store.getState().runtime!
    first.step()
    store.pausePreview()
    expect(store.getState().previewPaused).toBe(true)
    store.startPreview()
    expect(store.getState().runtime).toBe(first)
    expect(store.getState().previewPaused).toBe(false)
    store.restartPreview()
    expect(store.getState().runtime).not.toBe(first)
    expect(store.getState().runtime!.world.tick).toBe(0)
    expect(store.getState().mode).toBe('build')
    expect(store.getState().selectedCopyId).toBe(copies[0].id)
    store.closeCode()
    expect(store.getState().cardTab).toBe('sliders')
    store.setBrush(walker.id)
    expect(store.getState().selectedCopyId).toBeNull()
    expect(store.getState().runtime).toBeNull()
  })

  it('updates inherited copies immediately, retains own values, and can return a copy to the brick default', () => {
    const { store, walker, copies, speed } = fixture()
    store.selectCopy(copies[0].id)
    store.openCode(walker.id)
    const rt = store.getState().runtime!
    const value = (id: string) => rt.world.targets.find((t) => t.copyId === id && !t.isClone)!.variables[speed.id]
    store.setBrickSlider(walker.id, speed.id, 6)
    expect(store.brick(walker.id)!.program.variables.find((v) => v.id === speed.id)!.value).toBe(6)
    expect(value(copies[0].id)).toBe(6)
    expect(value(copies[1].id)).toBe(9)
    store.setKnob(copies[0].id, speed.id, 11)
    expect(value(copies[0].id)).toBe(11)
    store.setBrickSlider(walker.id, speed.id, 4)
    expect(value(copies[0].id)).toBe(11)
    store.setKnob(copies[0].id, speed.id, undefined)
    expect(value(copies[0].id)).toBe(4)
  })

  it('does not hot-swap code into running threads; restart picks up the latest design', () => {
    const { store, walker, copies } = fixture()
    store.selectCopy(copies[0].id)
    store.openCode(walker.id)
    const rt = store.getState().runtime!
    const workspace = structuredClone(store.getState().project.workspaces[walker.id]) as { blocks: { blocks: unknown[] } }
    workspace.blocks.blocks.push({ type: 'event_whenflagclicked', id: 'another-hat', next: { block: { type: 'looks_show', id: 'show-new' } } })
    store.setWorkspace(walker.id, workspace)
    expect(store.getState().runtime).toBe(rt)
    expect(store.brick(walker.id)!.name).toBe('My Walker')
    store.restartPreview()
    expect(store.getState().runtime).not.toBe(rt)
    expect(store.getState().runtime!.world.targets.some((t) => t.brickId === walker.id)).toBe(true)
  })

  it('releases held inputs on pause and resets editor selection on loading another project', () => {
    const { store, walker, copies } = fixture()
    store.selectCopy(copies[0].id)
    store.openCode(walker.id)
    const rt = store.getState().runtime!
    rt.pressKey('right arrow')
    rt.world.mouse.down = true
    store.pausePreview()
    expect(rt.world.keysDown.size).toBe(0)
    expect(rt.world.mouse.down).toBe(false)
    store.load(createStarterProject())
    expect(store.getState().cardTab).toBe('sliders')
    expect(store.getState().selectedCopyId).toBeNull()
    expect(store.getState().workshopBrickId).toBeNull()
    expect(store.getState().runtime).toBeNull()
  })
})
