import { DEFAULT_FEEL, feelToSub } from '@brick-studio/platformer-core/engine/feel'
import { allBricks, brickDef, lineage, type LabDoc } from './level/doc'
import { compileProgram, type CompiledProgram } from './program/compile'
import type { BrickRef } from './program/types'
import { swapProgram } from './runtime/runtime'
import type { BrickInfo, LabHost, LabWorld } from './sim/types'

/**
 * The world's host: each brick's compiled program (compiled when its code or the set of bricks changes, and kept
 * until then), what each brick is, and the feel of running and jumping (the /2d defaults).
 */
export class ProgramBook implements LabHost {
  readonly feel = feelToSub(DEFAULT_FEEL)
  private cache = new Map<string, { source: unknown; refs: string; program: CompiledProgram }>()
  private refsCache: { doc: LabDoc | null; refs: BrickRef[]; key: string } = { doc: null, refs: [], key: '' }

  constructor(public doc: LabDoc) {}

  private refs(): { refs: BrickRef[]; key: string } {
    if (this.refsCache.doc !== this.doc) {
      const refs = allBricks(this.doc).map((b) => ({ id: b.id, name: b.name }))
      this.refsCache = { doc: this.doc, refs, key: refs.map((r) => r.id).join('|') }
    }
    return this.refsCache
  }

  program(id: string): CompiledProgram | null {
    const def = brickDef(this.doc, id)
    if (!def) return null
    const { refs, key } = this.refs()
    const hit = this.cache.get(id)
    if (hit && hit.source === def.program && hit.refs === key) return hit.program
    const program = compileProgram(def.program, { bricks: refs })
    this.cache.set(id, { source: def.program, refs: key, program })
    return program
  }

  brick(id: string): BrickInfo | null {
    const def = brickDef(this.doc, id)
    return def ? { id, costume: def.costume, appearance: def.appearance, lineage: lineage(this.doc, id) } : null
  }

  /**
   * Take a new version of the lab. Running things whose brick's program changed carry on under the new program
   * (see `swapProgram`): this is how code edited during play applies live.
   */
  update(doc: LabDoc, world: LabWorld | null) {
    const before = new Map<string, CompiledProgram | null>()
    if (world) for (const t of world.things) if (!before.has(t.brick)) before.set(t.brick, this.program(t.brick))
    this.doc = doc
    if (!world) return
    for (const [brick, old] of before) {
      const next = this.program(brick)
      if (!next || next === old) continue
      for (const t of world.things) if (t.brick === brick && !t.removed) swapProgram(t, old, next)
    }
  }
}
