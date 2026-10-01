import { describe, expect, it } from 'vitest'
import { instantiate, validateDesign } from '../core/project'
import { compileWorkspace } from '../core/editor/compile'
import { createStarterProject } from './starter'
import { STAGE_ID } from './store'

describe('Starter project (starter.ts)', () => {
  it('validates with validateDesign with zero problems', () => {
    const project = createStarterProject()
    const problems = validateDesign(project.design)
    expect(problems).toEqual([])
  })

  it('compiles every starter workspace with zero errors', () => {
    const project = createStarterProject()

    for (const [brickId, workspace] of Object.entries(project.workspaces)) {
      const brick =
        brickId === STAGE_ID
          ? project.design.stage
          : project.design.bricks.find((b) => b.id === brickId)

      expect(brick).toBeDefined()

      const result = compileWorkspace(workspace, {
        variables: brick?.program.variables,
        lists: brick?.program.lists,
      })

      const errors = result.diagnostics.filter((d) => d.severity === 'error')
      expect(errors).toHaveLength(0)
    }
  })

  it('contains Spinner, Bouncer, and Blinker with pixel-art costumes', () => {
    const project = createStarterProject()
    const brickIds = project.design.bricks.map((b) => b.id)
    expect(brickIds).toEqual(['brick_spinner', 'brick_bouncer', 'brick_blinker'])

    // Spinner
    const spinner = project.design.bricks.find((b) => b.id === 'brick_spinner')!
    expect(spinner.name).toBe('Spinner')
    expect(spinner.costumes).toHaveLength(1)
    expect(spinner.costumes[0].width).toBe(16)
    expect(spinner.costumes[0].height).toBe(16)
    expect(spinner.program.scripts).toHaveLength(1)
    expect(spinner.program.scripts[0].hat.opcode).toBe('event_whenflagclicked')

    // Bouncer
    const bouncer = project.design.bricks.find((b) => b.id === 'brick_bouncer')!
    expect(bouncer.name).toBe('Bouncer')
    expect(bouncer.costumes).toHaveLength(1)
    const speedVar = bouncer.program.variables.find((v) => v.id === 'speed')
    expect(speedVar).toBeDefined()
    expect(speedVar?.showInBuild).toBe(true)

    // Blinker
    const blinker = project.design.bricks.find((b) => b.id === 'brick_blinker')!
    expect(blinker.name).toBe('Blinker')
    expect(blinker.costumes).toHaveLength(2)
    expect(blinker.program.scripts).toHaveLength(1)
    expect(blinker.program.scripts[0].hat.opcode).toBe('event_whenthisspriteclicked')

    // Stage
    expect(project.design.stage.isStage).toBe(true)
    expect(project.design.stage.costumes).toHaveLength(1)
  })

  it('has bouncer painted twice with different knob values', () => {
    const project = createStarterProject()
    const bouncerCopies = project.design.copies.filter((c) => c.brickId === 'brick_bouncer')
    expect(bouncerCopies).toHaveLength(2)

    expect(bouncerCopies[0].knobs).toEqual({ speed: 5 })
    expect(bouncerCopies[1].knobs).toEqual({ speed: 12 })
  })

  it('instantiates into a valid World where copies have their knob values', () => {
    const project = createStarterProject()
    const world = instantiate(project.design)

    expect(world.targets).toHaveLength(4)
    const bouncerTargets = world.targets.filter((t) => t.brickId === 'brick_bouncer')
    expect(bouncerTargets).toHaveLength(2)

    const slowBouncer = bouncerTargets.find((t) => t.copyId === 'copy_bouncer_slow')
    const fastBouncer = bouncerTargets.find((t) => t.copyId === 'copy_bouncer_fast')

    expect(slowBouncer?.variables.speed).toBe(5)
    expect(fastBouncer?.variables.speed).toBe(12)
  })
})
