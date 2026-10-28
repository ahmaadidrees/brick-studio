import * as Blockly from 'blockly'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileWorkspace } from '../../core/editor/compile'
import { createBlockDefinitions, registerEditorBlocks } from '../../core/editor/definitions'
import { PLAIN_SCRATCH, plainScratchFor } from './plainScratch'
import { buildEditorContext, withCardContext } from './context'
import { StudioStore } from '../store'
import { loadProject } from '../storage'

/** The Platformer opcodes the editor defines. `platformer_touchingtile` is gone since step 7 (a card for it must not return). */
function platformerOpcodes(): string[] {
  const defined = createBlockDefinitions().map((d) => d.type as string).filter((t) => t.startsWith('platformer_'))
  return Array.from(new Set(defined)).sort()
}

function walk(node: unknown, visit: (block: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit))
  if (!node || typeof node !== 'object') return
  const rec = node as Record<string, unknown>
  if (typeof rec.type === 'string') visit(rec)
  for (const v of Object.values(rec)) walk(v, visit)
}

describe('plain Scratch cards', () => {
  it('has a card for every Platformer opcode', () => {
    for (const opcode of platformerOpcodes()) {
      const card = plainScratchFor(opcode)
      expect(card, opcode).toBeDefined()
      expect(card!.explanation.length, opcode).toBeGreaterThan(60)
      expect(card!.name.length, opcode).toBeGreaterThan(0)
    }
    expect(Object.keys(PLAIN_SCRATCH).sort()).toEqual(platformerOpcodes())
  })

  it('step 7: no touching tile card, solid explains "only on top", and bump explains both sides hear it', () => {
    expect(plainScratchFor('platformer_touchingtile')).toBeUndefined()
    expect(plainScratchFor('platformer_setsolid')!.explanation).toContain('only on top')
    expect(plainScratchFor('platformer_whenbump')!.explanation).toMatch(/Both bricks hear about it/)
  })

  it('uses only Scratch blocks (no Platformer block inside a card)', () => {
    for (const card of Object.values(PLAIN_SCRATCH)) {
      walk(card.workspace, (b) => expect(String(b.type).startsWith('platformer_'), `${card.opcode}: ${String(b.type)}`).toBe(false))
    }
  })

  it('compiles every card with zero errors and zero warnings', () => {
    for (const card of Object.values(PLAIN_SCRATCH)) {
      const { diagnostics, program } = compileWorkspace(card.workspace)
      expect(diagnostics, card.opcode).toEqual([])
      expect(program.scripts.length, card.opcode).toBeGreaterThan(0)
    }
  })

  describe('in a read-only Blockly workspace', () => {
    let store: StudioStore
    beforeAll(() => {
      store = new StudioStore(loadProject() as never)
      registerEditorBlocks(buildEditorContext(store))
    })
    afterAll(() => undefined)

    it('loads every card without dropping a block, and keeps the variable names', () => {
      for (const card of Object.values(PLAIN_SCRATCH)) {
        const ws = new Blockly.Workspace()
        try {
          const expected: string[] = []
          walk((card.workspace as { blocks: unknown }).blocks, (b) => expected.push(String(b.type)))
          withCardContext(card.extras, () => Blockly.serialization.workspaces.load(card.workspace as never, ws))
          const loaded = ws.getAllBlocks(false).map((b) => b.type)
          expect(loaded.sort(), card.opcode).toEqual(expected.sort())
          // Every menu kept its value (a dropdown that did not know the name would have fallen back to another).
          const saved = JSON.stringify(Blockly.serialization.workspaces.save(ws))
          for (const v of card.extras.variables) {
            if (JSON.stringify(card.workspace).includes(v.id)) expect(saved, `${card.opcode} ${v.name}`).toContain(v.id)
          }
          for (const brick of card.extras.bricks) {
            if (JSON.stringify(card.workspace).includes(`"${brick}"`)) expect(saved, `${card.opcode} ${brick}`).toContain(`"${brick}"`)
          }
          for (const m of card.extras.messages) expect(saved, `${card.opcode} ${m}`).toContain(m)
        } finally {
          ws.dispose()
        }
      }
    })
  })
})
