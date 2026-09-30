import { describe, expect, it } from 'vitest'
import { brickDef, starterDoc, type LabDoc } from '../level/doc'
import { compileProgram } from '../program/compile'
import { flatLevel, labHarness, type LabHarness } from '../testHarness'
import { BUILTIN_BRICKS, type BrickDef } from './builtins'
import { returningBallProgram, returningThrowScripts, reusablePatrolProgram, signalCarProgram, trafficSignalProgram } from './freedom'
import { scriptsJson, type WorkspaceJson } from './dsl'
import { RECIPES } from './recipes'

function appendScripts(source: unknown, prefix: string, scripts: ReturnType<typeof returningThrowScripts>): WorkspaceJson {
  const workspace = JSON.parse(JSON.stringify(source)) as WorkspaceJson
  const roots = workspace.blocks.blocks
  const bottom = roots.reduce((y, b) => Math.max(y, b.y ?? 0), 0)
  return { ...workspace, blocks: { languageVersion: 0, blocks: [...roots, ...scriptsJson(prefix, bottom + 260, ...scripts)] } }
}

function withPrograms(programs: Record<string, { name: string; costume: BrickDef['costume']; program: unknown }>, playerProgram?: WorkspaceJson): LabDoc {
  const doc = starterDoc()
  const player = brickDef(doc, 'you')!
  doc.bricks = {
    ...doc.bricks,
    ...(playerProgram ? { you: { ...player, origin: 'copy', program: playerProgram } } : {}),
    ...Object.fromEntries(Object.entries(programs).map(([id, def]) => [id, {
      id,
      name: def.name,
      costume: def.costume,
      basedOn: null,
      origin: 'mine',
      program: def.program,
      blurb: 'Test example.',
    } satisfies BrickDef])),
  }
  return doc
}

function placed(h: LabHarness, brick: string) {
  return h.ofBrick(brick)[0]
}

describe('freedom examples', () => {
  it('returns a ball toward the player and respects the throw cooldown', () => {
    const playerProgram = appendScripts(brickDef(starterDoc(), 'you')!.program, 'returning-throw', returningThrowScripts())
    const doc = withPrograms({ 'returning-ball': { name: 'Returning ball', costume: 'ball', program: returningBallProgram() } }, playerProgram)
    const h = labHarness(doc, flatLevel(60))
    h.run(5)
    h.step({}, ['z'])
    h.run(15)
    const ball = placed(h, 'returning-ball')
    expect(ball).toBeTruthy()
    const farX = ball.x
    expect(farX).toBeGreaterThan(h.player.x)
    h.step({}, ['z'])
    expect(h.ofBrick('returning-ball')).toHaveLength(1)
    h.run(160)
    expect(h.ofBrick('returning-ball')).toHaveLength(0)
    expect(h.player.mem.cooldown).toBe(0)
    expect(compileProgram(returningBallProgram(), { bricks: BUILTIN_BRICKS.map(({ id, name }) => ({ id, name })).concat([{ id: 'returning-ball', name: 'Returning ball' }]) }).ok).toBe(true)
  })

  it('broadcasts GO and STOP, and the vehicle reads the world signal', () => {
    const doc = withPrograms({ 'signal-car': { name: 'Signal car', costume: 'car', program: signalCarProgram() } }, trafficSignalProgram())
    const level = flatLevel(60, 16, [{ id: 1, brick: 'signal-car', x: 10, y: 14, dir: 1 }])
    const h = labHarness(doc, level)
    h.run(4)
    const car = placed(h, 'signal-car')
    const x0 = car.x
    h.step({}, ['z'])
    h.run(20)
    expect(h.world.variables?.signal).toBe(1)
    expect(car.x).toBeGreaterThan(x0)
    const movingX = car.x
    h.step({}, ['x'])
    h.run(4)
    expect(h.world.variables?.signal).toBe(0)
    expect(car.x).toBe(movingX)
    expect(compileProgram(signalCarProgram(), { bricks: BUILTIN_BRICKS.map(({ id, name }) => ({ id, name })).concat([{ id: 'signal-car', name: 'Signal car' }]) }).ok).toBe(true)
  })

  it('defines and calls a reusable patrol with a changeable numeric input', () => {
    const fastProgram = reusablePatrolProgram(2.5)
    const slowProgram = reusablePatrolProgram(1)
    const context = { bricks: BUILTIN_BRICKS.map(({ id, name }) => ({ id, name })) }
    expect(compileProgram(fastProgram, context).ok).toBe(true)
    const run = (source: WorkspaceJson) => {
      const doc = withPrograms({ patrol: { name: 'Patrol', costume: 'platform', program: source } })
      const h = labHarness(doc, flatLevel(60, 16, [{ id: 1, brick: 'patrol', x: 10, y: 13, dir: 1 }]))
      h.run(35)
      return placed(h, 'patrol').x
    }
    const fastDistance = run(fastProgram)
    const slowDistance = run(slowProgram)
    expect(fastDistance).toBeGreaterThan(slowDistance + 30 * 256)
    expect(RECIPES.filter((recipe) => ['returning-ball', 'traffic-signal', 'reusable-patrol'].includes(recipe.id))).toHaveLength(3)
  })
})
