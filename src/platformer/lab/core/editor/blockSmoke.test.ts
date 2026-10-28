/**
 * Block smoke test (step 6b). The owner said "not all of the blocks seem to be working the same", so every block in the
 * toolbox goes through the same path: loaded into Blockly with its toolbox defaults, used in a `when flag clicked`
 * script, compiled, and run for 60 ticks in a small design.
 *
 * Findings that need a core fix are `it.fails` with a comment; they are listed in reports/step6b-editor.md.
 */
import * as Blockly from 'blockly'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Expr, Stmt } from '../contracts'
import { makeHarnessDesign } from '../conformance/harness'
import { ALL_PRIMITIVES, createRuntime } from '../index'
import { compileWorkspace } from './compile'
import { defaultEditorContext, setEditorContext } from './context'
import { isHatOpcode, registerEditorBlocks } from './definitions'
import { createContinuousToolbox, type ToolboxBlock } from './toolbox'

/** Opcodes the runtime handles itself (control flow, calls, broadcasts) instead of through the primitive table. */
const STRUCTURAL = new Set([
  'control_if',
  'control_if_else',
  'control_repeat',
  'control_forever',
  'control_repeat_until',
  'control_while',
  'control_wait',
  'control_wait_until',
  'control_stop',
  'procedures_call',
  'event_broadcast',
  'event_broadcastandwait',
])

/** Opcodes the compiler turns into something other than a `block` expression (variables, lists, shadows). */
function walk(stmts: Stmt[], onStmt: (s: Stmt) => void, onExpr: (e: Expr) => void): void {
  const expr = (e: Expr) => {
    onExpr(e)
    if (e.kind === 'block') Object.values(e.inputs).forEach(expr)
  }
  for (const s of stmts) {
    onStmt(s)
    Object.values(s.inputs).forEach(expr)
    s.branches?.forEach((b) => walk(b, onStmt, onExpr))
  }
}

const toolboxBlocks: ToolboxBlock[] = createContinuousToolbox()
  .contents.filter((c) => c.name !== 'My Blocks')
  .flatMap((c) => (c.contents ?? []).filter((i): i is ToolboxBlock => i.kind === 'block'))

function toSerial(b: ToolboxBlock): Record<string, unknown> {
  const { kind: _kind, ...rest } = b
  return rest
}

/** Build the workspace for one toolbox block: a flag script holding it (hats stand beside a flag script instead). */
function workspaceFor(entry: ToolboxBlock): { blocks: { languageVersion: number; blocks: unknown[] }; variables: unknown[] } {
  const ws = new Blockly.Workspace()
  try {
    ws.getVariableMap().createVariable('my variable', '', 'var_default')
    ws.getVariableMap().createVariable('my list', 'list', 'list_default')
    const flag = ws.newBlock('event_whenflagclicked')
    const block = Blockly.serialization.blocks.append(toSerial(entry) as unknown as Blockly.serialization.blocks.State, ws) as Blockly.Block
    if (isHatOpcode(entry.type)) {
      // a hat can't sit inside a script: it is its own script
    } else if (block.previousConnection) {
      flag.nextConnection!.connect(block.previousConnection)
    } else if (block.outputConnection) {
      const isBool = block.outputConnection.getCheck()?.includes('Boolean')
      if (isBool) {
        const holder = ws.newBlock('control_if')
        holder.getInput('CONDITION')!.connection!.connect(block.outputConnection)
        flag.nextConnection!.connect(holder.previousConnection!)
      } else {
        const holder = ws.newBlock('looks_say')
        holder.getInput('MESSAGE')!.connection!.connect(block.outputConnection)
        flag.nextConnection!.connect(holder.previousConnection!)
      }
    }
    return Blockly.serialization.workspaces.save(ws) as never
  } finally {
    ws.dispose()
  }
}

let restore = () => {}
beforeAll(() => {
  restore = setEditorContext(defaultEditorContext)
  registerEditorBlocks(defaultEditorContext)
})
afterAll(() => restore())

/** Blocks whose runtime needs something core/** doesn't do yet; each is listed in the report. */
const KNOWN_RUNTIME_PROBLEMS: Record<string, string> = {}

/**
 * FINDING (core/runtime.ts `step`, for the integrator): a `forever` with nothing inside never ends a tick. The loop frame
 * yields, `step()` turns the yield back into "running" for the next sweep, and an empty body charges no op and requests
 * no redraw, so neither the op budget nor the redraw check ever stops it: the page freezes. A kid dragging out
 * `when flag clicked > forever` hits this. These blocks are compiled but not run until it is fixed.
 */
/** Fixed by the integrator (loop back-edges now cost an op); kept empty so a future freeze can be listed here. */
const FREEZES_WHEN_RUN_EMPTY = new Set<string>()

describe('every toolbox block compiles and runs in a when-flag script', () => {
  it('covers the whole toolbox', () => {
    expect(toolboxBlocks.length).toBeGreaterThan(120)
  })

  for (const entry of toolboxBlocks) {
    const name = `${entry.type}${entry.fields ? ' ' + JSON.stringify(entry.fields) : ''}`
    const run = () => {
      const saved = workspaceFor(entry)
      const { program, diagnostics } = compileWorkspace(saved)
      expect(diagnostics, 'compile diagnostics').toEqual([])

      // compile-to-nothing: a flag script must keep the block (hats are scripts of their own)
      if (isHatOpcode(entry.type)) {
        expect(program.scripts.map((s) => s.hat.opcode)).toContain(entry.type)
      } else {
        const flag = program.scripts.find((s) => s.hat.opcode === 'event_whenflagclicked')!
        expect(flag.body.length, 'the block compiled to nothing').toBeGreaterThan(0)
      }

      // unknown opcodes: everything the script uses must be a primitive or something the runtime handles itself
      const unknown = new Set<string>()
      for (const s of program.scripts) {
        walk(
          s.body,
          (st) => {
            if (!ALL_PRIMITIVES[st.opcode] && !STRUCTURAL.has(st.opcode)) unknown.add(st.opcode)
          },
          (e) => {
            if (e.kind === 'block' && !ALL_PRIMITIVES[e.opcode]) unknown.add(e.opcode)
          },
        )
      }
      expect([...unknown], 'unknown opcodes').toEqual([])

      // 60 ticks, no throw
      if (FREEZES_WHEN_RUN_EMPTY.has(entry.type)) return
      const design = makeHarnessDesign({
        scripts: program.scripts,
        procedures: program.procedures,
        variables: program.variables,
        lists: program.lists,
      })
      design.bricks[0].sounds = [{ name: 'pop', durationMs: 100 }]
      const rt = createRuntime(design)
      rt.greenFlag()
      for (let i = 0; i < 60; i++) rt.step()
    }
    const known = KNOWN_RUNTIME_PROBLEMS[entry.type]
    if (known) it.fails(`${name} (${known})`, run)
    else it(name, run)
  }
})

describe('step 6b findings, fixed by the integrator in core/runtime.ts', () => {
  it('an empty forever loop finishes every tick (it used to freeze the page)', () => {
    const design = makeHarnessDesign({ scripts: [{ id: 's', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: [{ opcode: 'control_forever', inputs: {}, fields: {}, branches: [[]] }] }] })
    const rt = createRuntime(design)
    rt.greenFlag()
    for (let i = 0; i < 60; i++) rt.step()
    expect(rt.world.tick).toBe(60)
  })

  it('control_forever with nothing inside freezes a tick (see FREEZES_WHEN_RUN_EMPTY): run it with a block inside instead', () => {
    const forever: Stmt = { opcode: 'control_forever', inputs: {}, fields: {}, branches: [[{ opcode: 'motion_changexby', inputs: { DX: { kind: 'lit', value: 1 } }, fields: {} }]] }
    const design = makeHarnessDesign({
      scripts: [{ id: 's', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: [forever] }],
    })
    const rt = createRuntime(design)
    rt.greenFlag()
    for (let i = 0; i < 60; i++) rt.step()
    expect(rt.world.targets[0].x).toBeGreaterThan(0)
  })

  // FINDING: `repeat until <cond>` with an empty body evaluates the condition once and moves on (runtime.ts pushes a loop
  // frame only when the body has blocks). Scratch waits, one tick per check, until the condition is true.
  it('repeat until <cond> with an empty body keeps waiting until the condition is true', () => {
    const script: Stmt[] = [
      {
        opcode: 'control_repeat_until',
        inputs: { CONDITION: { kind: 'block', opcode: 'operator_gt', inputs: { OPERAND1: { kind: 'block', opcode: 'sensing_timer', inputs: {}, fields: {} }, OPERAND2: { kind: 'lit', value: 5 } }, fields: {} } },
        fields: {},
        branches: [[]],
      },
      { opcode: 'motion_setx', inputs: { X: { kind: 'lit', value: 100 } }, fields: {} },
    ]
    const design = makeHarnessDesign({ scripts: [{ id: 's', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: script }] })
    const rt = createRuntime(design)
    rt.greenFlag()
    for (let i = 0; i < 5; i++) rt.step()
    expect(rt.world.targets[0].x).toBe(0) // still waiting after 5 of the 150 ticks the 5 seconds take
    for (let i = 0; i < 160; i++) rt.step()
    expect(rt.world.targets[0].x).toBe(100) // and moves on once the timer passes 5
  })
})
