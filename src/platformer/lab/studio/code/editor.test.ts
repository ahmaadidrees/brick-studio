import { describe, expect, it } from 'vitest'
import {
  VARIABLE_CATEGORIES,
  LIST_CATEGORIES,
  ALL_VARIABLE_WORDS,
  ALL_LIST_WORDS,
  ALL_BROADCAST_WORDS,
  ALL_PROCEDURE_LABEL_WORDS,
  PROCEDURE_INPUT_WORDS,
  PROCEDURE_BOOLEAN_WORDS,
} from './words'
import { extractBroadcastMessages, extractMessagesFromWorkspace, buildEditorContext } from './context'
import { formatKidDiagnostic } from './DiagnosticsList'
import { createContinuousToolbox } from '../../core/editor/toolbox'
import { StudioStore, STAGE_ID } from '../store'
import { loadProject } from '../storage'
import type { Diagnostic } from '../../core/editor/compile'

describe('Code Editor: Kid Words Lists', () => {
  it('provides curated non-empty lists of kid-friendly words', () => {
    expect(ALL_VARIABLE_WORDS.length).toBeGreaterThan(15)
    expect(ALL_LIST_WORDS.length).toBeGreaterThan(10)
    expect(ALL_BROADCAST_WORDS.length).toBeGreaterThan(10)
    expect(ALL_PROCEDURE_LABEL_WORDS.length).toBeGreaterThan(15)
    expect(PROCEDURE_INPUT_WORDS.length).toBeGreaterThan(5)
    expect(PROCEDURE_BOOLEAN_WORDS.length).toBeGreaterThan(5)

    // Variables contain common game concepts
    expect(ALL_VARIABLE_WORDS).toContain('score')
    expect(ALL_VARIABLE_WORDS).toContain('speed')
    expect(ALL_VARIABLE_WORDS).toContain('health')

    // Lists contain collection concepts
    expect(ALL_LIST_WORDS).toContain('inventory')
    expect(ALL_LIST_WORDS).toContain('high scores')

    // Procedure labels contain action words
    expect(ALL_PROCEDURE_LABEL_WORDS).toContain('jump')
    expect(ALL_PROCEDURE_LABEL_WORDS).toContain('dash')
    expect(ALL_PROCEDURE_LABEL_WORDS).toContain('flash')

    // Procedure parameters contain valid placeholders
    expect(PROCEDURE_INPUT_WORDS).toContain('steps')
    expect(PROCEDURE_BOOLEAN_WORDS).toContain('fast?')
  })

  it('categorizes variables and lists neatly for pill navigation', () => {
    expect(VARIABLE_CATEGORIES.length).toBeGreaterThanOrEqual(3)
    expect(LIST_CATEGORIES.length).toBeGreaterThanOrEqual(2)

    for (const cat of VARIABLE_CATEGORIES) {
      expect(cat.id).toBeTruthy()
      expect(cat.name).toBeTruthy()
      expect(cat.words.length).toBeGreaterThan(0)
    }
  })
})

describe('Code Editor: Message and Context Extraction', () => {
  it('recursively extracts broadcast messages from nested workspace JSON', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'event_whenbroadcastreceived',
            fields: { BROADCAST_OPTION: 'game over' },
          },
          {
            type: 'event_broadcast',
            inputs: {
              BROADCAST_INPUT: {
                shadow: {
                  type: 'event_broadcast_menu',
                  fields: { BROADCAST_OPTION: 'victory' },
                },
              },
            },
          },
          {
            type: 'event_broadcastandwait',
            inputs: {
              BROADCAST_INPUT: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'level complete' },
                },
              },
            },
          },
        ],
      },
    }

    const messages = new Set<string>()
    extractMessagesFromWorkspace(ws, messages)

    expect(messages.has('game over')).toBe(true)
    expect(messages.has('victory')).toBe(true)
    expect(messages.has('level complete')).toBe(true)
  })

  it('extracts broadcast messages across all workspaces in store', () => {
    const workspaces = {
      brick1: JSON.stringify({
        blocks: {
          blocks: [
            {
              type: 'event_whenbroadcastreceived',
              fields: { BROADCAST_OPTION: 'player hit' },
            },
          ],
        },
      }),
      brick2: {
        blocks: {
          blocks: [
            {
              type: 'event_broadcast',
              inputs: {
                BROADCAST_INPUT: {
                  shadow: {
                    fields: { BROADCAST_OPTION: 'respawn' },
                  },
                },
              },
            },
          ],
        },
      },
    }

    const messages = extractBroadcastMessages(workspaces)
    expect(messages).toContain('player hit')
    expect(messages).toContain('respawn')
  })

  it('builds an EditorContext aggregating brick and stage globals', () => {
    const project = loadProject()
    project.design.bricks.push({
      id: 'brick_player',
      name: 'Player',
      costumes: [{ name: 'idle', width: 16, height: 16, rotationCenterX: 8, rotationCenterY: 8 }],
      sounds: [],
      program: { variables: [], lists: [], scripts: [], procedures: [] }
    })
    const store = new StudioStore(project)
    const brick1Id = store.getState().selectedBrickId

    // Add local variable to brick
    const brick = store.brick(brick1Id)!
    brick.program.variables.push({
      id: 'var_speed',
      name: 'speed',
      value: 5,
      showInBuild: true,
    })

    // Add global variable to stage
    const stage = store.brick(STAGE_ID)!
    stage.program.variables.push({
      id: 'var_global_score',
      name: 'score',
      value: 100,
    })

    const ctx = buildEditorContext(store)
    const vars = ctx.getVariables?.() ?? []

    // Both local and global variables are available
    expect(vars.some((v) => v.name === 'speed')).toBe(true)
    expect(vars.some((v) => v.name === 'score')).toBe(true)

    // Build knob is preserved
    const speedVar = vars.find((v) => v.name === 'speed')
    expect(speedVar?.showInBuild).toBe(true)

    // Stage detection
    expect(ctx.isStage).toBe(false)

    // Switch to stage
    store.selectBrick(STAGE_ID)
    const stageCtx = buildEditorContext(store)
    expect(stageCtx.isStage).toBe(true)
  })
})

describe('Code Editor: Stage-specific toolbox filtering', () => {
  it('omits Motion category when isStage is true', () => {
    const brickToolbox = createContinuousToolbox(undefined, { isStage: false })
    const stageToolbox = createContinuousToolbox(undefined, { isStage: true })

    expect(brickToolbox.contents).toHaveLength(9)
    expect(brickToolbox.contents.some((c) => c.name === 'Motion')).toBe(true)

    expect(stageToolbox.contents).toHaveLength(8)
    expect(stageToolbox.contents.some((c) => c.name === 'Motion')).toBe(false)
  })

  it('includes buttons for Make a Variable and Make a List', () => {
    const toolbox = createContinuousToolbox()
    const varCategory = toolbox.contents.find((c) => c.name === 'Variables')
    expect(varCategory).toBeDefined()

    const makeVarBtn = varCategory?.contents?.find(
      (item) => item.kind === 'button' && item.callbackKey === 'MAKE_A_VARIABLE',
    )
    const makeListBtn = varCategory?.contents?.find(
      (item) => item.kind === 'button' && item.callbackKey === 'MAKE_A_LIST',
    )

    expect(makeVarBtn).toBeDefined()
    expect(makeListBtn).toBeDefined()
  })

  it('includes Make a Block button in My Blocks category', () => {
    const toolbox = createContinuousToolbox()
    const myBlocks = toolbox.contents.find((c) => c.name === 'My Blocks')
    expect(myBlocks).toBeDefined()
    expect(myBlocks?.custom).toBe('PROCEDURE')

    const makeProcBtn = myBlocks?.contents?.find(
      (item) => item.kind === 'button' && item.callbackKey === 'MAKE_A_PROCEDURE',
    )
    expect(makeProcBtn).toBeDefined()
  })
})

describe('Code Editor: Diagnostics in Kid Words', () => {
  it('translates disconnected blocks into plain encouragement', () => {
    const diag: Diagnostic = {
      code: 'block.disconnected',
      severity: 'warning',
      message: 'Disconnected block "motion_movesteps" ignored',
      blockId: 'b_123',
    }

    const { title, hint } = formatKidDiagnostic(diag)
    expect(title).toBe("Block isn't connected")
    expect(hint).toContain('Snap this block under a hat block')
  })

  it('translates unrecognized blocks into plain words', () => {
    const diag: Diagnostic = {
      code: 'block.no_type',
      severity: 'warning',
      message: 'Top-level block has no type',
      blockId: 'b_unknown',
    }

    const { title, hint } = formatKidDiagnostic(diag)
    expect(title).toBe('Unrecognized block')
    expect(hint).toContain('Try replacing it from the block menu')
  })

  it('handles corrupted workspace error gracefully in kid words', () => {
    const diag: Diagnostic = {
      code: 'workspace.invalid_json',
      severity: 'error',
      message: 'Unexpected token in JSON',
    }

    const { title, hint } = formatKidDiagnostic(diag)
    expect(title).toBe('Could not load blocks')
  })
})

describe('Code Editor: Variable Knob & Store integration', () => {
  it('toggles per-copy knob via store.setVariableKnob', () => {
    const store = new StudioStore(loadProject())
    const brickId = store.getState().selectedBrickId
    const brick = store.brick(brickId)!

    brick.program.variables.push({
      id: 'var_jump_force',
      name: 'jump force',
      value: 12,
      showInBuild: false,
    })

    // Enable knob
    store.setVariableKnob(brickId, 'var_jump_force', true)
    const v = store.brick(brickId)!.program.variables.find((x) => x.id === 'var_jump_force')
    expect(v?.showInBuild).toBe(true)

    // Disable knob
    store.setVariableKnob(brickId, 'var_jump_force', false)
    const v2 = store.brick(brickId)!.program.variables.find((x) => x.id === 'var_jump_force')
    expect(v2?.showInBuild).toBe(false)
  })
})
