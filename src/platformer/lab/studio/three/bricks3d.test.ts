/**
 * Hackable 3D D1 (docs/qa/hackable-3d/D1.md): the six code bricks running their own blocks in the real engine, riders on
 * movers, solid Heroes, studs on every distance block, the design checks and "Open in Hackable 3D".
 */
import { describe, expect, it } from 'vitest'
import { createRuntime, type Runtime } from '../../core'
import { validateDesign } from '../../core/project'
import { copyWorld, worldFingerprint, worldFromJson, worldToJson } from '../../core/snapshot'
import type { Expr, Stmt } from '../../core/contracts'
import { PLATE, STUD, type CopyPlacement3, type LevelDesign3, type Target3, type World3 } from '../../kit3d/contracts3d'
import { HERO3D, addPlayer3d, heroSpawn, lookPlayer3d } from '../../kit3d/engine3d'
import { kitReady } from '../../kits'
import { CODE_BRICKS_3D, createButton3d, createCoin3d, createDoor3d, createMover3d, createSpinner3d } from './bricks3d'
import { classicToHackable3d, createStarter3dProject, missingBricks, studToWorld } from './project3d'

const start = (design: LevelDesign3): Runtime => {
  const r = createRuntime(design)
  r.greenFlag()
  return r
}
const run = (r: Runtime, ticks: number) => { for (let i = 0; i < ticks; i++) r.step() }
const hero = (r: Runtime): Target3 => (r.world as World3).targets.find((t) => t.brickId === HERO3D && !t.isClone) as Target3
const copy = (r: Runtime, id: string): Target3 => (r.world as World3).targets.find((t) => t.copyId === id) as Target3

/** The starter with nothing but the Hero (at the plate's middle) and the given bricks and copies. */
function room(extra: { bricks?: LevelDesign3['bricks']; copies?: CopyPlacement3[]; scenery?: LevelDesign3['scenery3d']; hero?: Partial<CopyPlacement3> } = {}): LevelDesign3 {
  const d = createStarter3dProject().design as LevelDesign3
  return {
    ...d,
    bricks: [d.bricks.find((b) => b.id === HERO3D)!, ...(extra.bricks ?? [])],
    copies: [{ id: 'copy_hero', brickId: HERO3D, x: 0, y: 0, z: 0, ...extra.hero }, ...(extra.copies ?? [])],
    scenery3d: extra.scenery ?? [],
  }
}

describe('Hackable 3D D1: the kit', () => {
  it('is ready, and its starter is a valid design that plays', () => {
    expect(kitReady('3d')).toBe(true)
    const { design } = createStarter3dProject()
    expect(validateDesign(design)).toEqual([])
    const r = start(design as LevelDesign3)
    run(r, 30)
    expect(hero(r).body3!.onGround).toBe(true)
  })

  it('every code brick in the drawer is a valid brick with readable labelled scripts', () => {
    for (const entry of CODE_BRICKS_3D) {
      for (const part of entry.parts) {
        const made = part.make(part.id)
        expect(made.brick.program.scripts.length).toBeGreaterThan(0)
        expect(made.brick.costumes.length).toBe(1)
        expect(made.brick.shape3d).toBeDefined()
        const design = room({ bricks: [made.brick], copies: [{ id: 'c', brickId: made.brick.id, x: 2, y: 0, z: 2 }] })
        expect(validateDesign(design), `${entry.label}: ${part.id}`).toEqual([])
      }
    }
  })
})

describe('Hackable 3D D1: studs on every distance block', () => {
  const blockBrick = (body: Stmt[]): LevelDesign3['bricks'][number] => ({
    id: 'brick_t', name: 'Thing', costumes: createCoin3d('x').brick.costumes, sounds: [],
    shape3d: { w: STUD, h: STUD, d: STUD },
    program: { scripts: [{ id: 's', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body }], procedures: [], variables: [{ id: 'out', name: 'out', value: 0 }, { id: 'sp', name: 'sp', value: 0 }], lists: [] },
  })
  const lit = (value: number): Expr => ({ kind: 'lit', value })
  const rep = (opcode: string, fields: Record<string, string> = {}): Expr => ({ kind: 'block', opcode, fields, inputs: {} })

  it('go to x: y: z: and the position reporters are in studs from the middle of the plate', () => {
    const design = room({
      bricks: [blockBrick([
        { opcode: 'kit3d_gotoxyz', fields: {}, inputs: { X: lit(3), Y: lit(2), Z: lit(-4) } },
        { opcode: 'kit3d_changez', fields: {}, inputs: { DZ: lit(1) } },
        { opcode: 'motion_changexby', fields: {}, inputs: { DX: lit(0.5) } },
        { opcode: 'data_setvariableto', fields: { VARIABLE: 'out' }, inputs: { VALUE: rep('kit3d_zposition') } },
      ])],
      copies: [{ id: 'c', brickId: 'brick_t', x: 0, y: 0, z: 0 }],
    })
    const r = start(design)
    run(r, 1)
    const t = copy(r, 'c')
    expect(t.x).toBeCloseTo(3.5 * STUD, 9)
    expect(t.y).toBeCloseTo(2 * STUD, 9)
    expect(t.z).toBeCloseTo(-3 * STUD, 9)
    expect(t.variables.out).toBe(-3)
  })

  it('speeds are studs a second, and a speed reads back as the number typed', () => {
    const design = room({
      bricks: [blockBrick([
        { opcode: 'platformer_setspeed', fields: { AXIS: 'z' }, inputs: { SPEED: lit(2) } },
        { opcode: 'data_setvariableto', fields: { VARIABLE: 'sp' }, inputs: { VALUE: rep('platformer_speed', { AXIS: 'z' }) } },
      ])],
      copies: [{ id: 'c', brickId: 'brick_t', x: 4, y: 0, z: 0 }],
    })
    const r = start(design)
    run(r, 30) // one second
    const t = copy(r, 'c')
    expect(t.variables.sp).toBe(2)
    expect(t.z / STUD).toBeCloseTo(2, 6)
  })
})

describe('Hackable 3D D1: the six code bricks', () => {
  it('Bounce pad: a Hero walking onto it is thrown up "launch speed" studs a second', () => {
    const { design } = createStarter3dProject()
    const r = start(design as LevelDesign3)
    run(r, 5)
    r.pressKey('up arrow')
    let top = 0
    for (let i = 0; i < 120; i++) { r.step(); top = Math.max(top, hero(r).y) }
    // 15 studs/s = 9.3 units/s → about 2.7 units above the pad; the deck (12 plates) is 2.16 up.
    expect(top).toBeGreaterThan(2.3)
  })

  it('the starter is winnable: up the pad onto the deck, three coins, and the Goal says you made it', () => {
    const { design } = createStarter3dProject()
    const r = start(design as LevelDesign3)
    const said: string[] = []
    run(r, 5)
    r.pressKey('up arrow')
    let won = false
    for (let i = 0; i < 300 && !won; i++) {
      r.step()
      const goal = copy(r, 'copy_goal')
      if (goal.bubble?.text) said.push(goal.bubble.text)
      won = said.includes('You made it!')
    }
    expect(r.world.stage.variables.coins).toBe(3)
    expect(won).toBe(true)
  })

  it('Mover: slides "speed" studs a second for "seconds", then back, and carries the Hero standing on it', () => {
    const mover = createMover3d('brick3d_mover')
    const design = room({ bricks: [mover.brick], copies: [{ id: 'm', brickId: mover.brick.id, x: 0, y: 1, z: 0 }], hero: { x: 0, y: 1 + PLATE + 0.5, z: 0 } })
    const r = start(design)
    run(r, 15) // the Hero drops onto the Mover and the Mover sets off
    expect(hero(r).body3!.onGround).toBe(true)
    const m0 = copy(r, 'm').x
    const h0 = hero(r).x
    run(r, 30)
    const moved = copy(r, 'm').x - m0
    expect(Math.abs(moved)).toBeGreaterThan(1.5 * STUD)
    // The rider went exactly as far as the platform under it, and is still standing on it.
    expect(hero(r).x - h0).toBeCloseTo(moved, 6)
    expect(hero(r).y).toBeCloseTo(1 + PLATE, 6)
    run(r, 60) // and back
    expect(Math.abs(copy(r, 'm').x - m0)).toBeLessThan(0.8 * STUD)
    expect(hero(r).y).toBeCloseTo(1 + PLATE, 6)
  })

  it('a platform its scripts move (Door: change y by) carries whoever stands on it too', () => {
    const button = createButton3d('brick3d_button')
    const door = createDoor3d('brick3d_door')
    const design = room({
      bricks: [button.brick, door.brick],
      copies: [{ id: 'b', brickId: button.brick.id, x: 0, y: 0, z: 0 }, { id: 'd', brickId: door.brick.id, x: 0, y: 0, z: -3 * STUD }],
      hero: { x: 0, y: 2, z: 0 },
    })
    const r = start(design)
    // A second Hero-sized rider: put the Hero on the door instead after the button press, to check carrying.
    run(r, 30) // the Hero falls onto the button: open
    expect(copy(r, 'b').variables[`${button.brick.id}_pressed`]).toBe(1)
    run(r, 20)
    const doorTarget = copy(r, 'd')
    expect(doorTarget.y).toBeCloseTo(2 * STUD, 6)
  })

  it('Door rising carries a Hero standing on top of it', () => {
    const door = createDoor3d('brick3d_door')
    const design = room({ bricks: [door.brick], copies: [{ id: 'd', brickId: door.brick.id, x: 0, y: 0, z: 0 }], hero: { x: 0, y: 9 * PLATE + 0.3, z: 0 } })
    const r = start(design)
    run(r, 20)
    expect(hero(r).y).toBeCloseTo(9 * PLATE, 6)
    r.broadcast('open')
    run(r, 20)
    expect(copy(r, 'd').y).toBeCloseTo(2 * STUD, 6)
    expect(hero(r).y).toBeCloseTo(9 * PLATE + 2 * STUD, 6)
  })

  it('Spinner: turns, and a Hero its turned bar sweeps into goes back to the start', () => {
    const spinner = createSpinner3d('brick3d_spinner')
    // The bar is 6 studs long along x at first. The Hero starts 6 studs toward you, then stands 2 studs from the
    // Spinner's middle along z: clear of the bar until it has turned about a quarter.
    const design = room({ bricks: [spinner.brick], copies: [{ id: 's', brickId: spinner.brick.id, x: 0, y: 0, z: 0 }], hero: { x: 0, y: 0, z: 6 * STUD } })
    const r = start(design)
    run(r, 1)
    const h = hero(r)
    h.z = 2 * STUD
    run(r, 5)
    expect(h.z).toBeCloseTo(2 * STUD, 9) // not touched yet: the bar runs along x
    let home = -1
    for (let i = 0; i < 40 && home < 0; i++) {
      r.step()
      if (Math.abs(h.z - 6 * STUD) < 1e-9) home = i
    }
    expect(copy(r, 's').direction).not.toBe(90)
    // Sent home at about a quarter turn (3 degrees a tick from 90): 24 to 34 ticks in.
    expect(home).toBeGreaterThan(15)
  })

  it('Coin: a Hero touching it collects it once, and the Stage counts coins', () => {
    const coin = createCoin3d('brick3d_coin')
    const design = room({ bricks: [coin.brick], copies: [{ id: 'c', brickId: coin.brick.id, x: 0, y: 0.3, z: -STUD }] })
    const r = start(design)
    r.pressKey('up arrow')
    run(r, 30)
    expect(copy(r, 'c').visible).toBe(false)
    expect(r.world.stage.variables.coins).toBe(1)
  })

  it('Button + Door adds two bricks, and reuses them the second time', () => {
    const entry = CODE_BRICKS_3D.find((e) => e.key === 'buttonDoor')!
    const d = room()
    const first = missingBricks(d, entry)
    expect(first.map((m) => m.brick.id)).toEqual(['brick3d_button', 'brick3d_door'])
    expect(missingBricks({ bricks: [...d.bricks, ...first.map((m) => m.brick)] }, entry)).toEqual([])
  })
})

describe('Hackable 3D D1: Heroes', () => {
  it('are solid: one Hero stands on another, and walking into one stops you', () => {
    const d = room({ hero: { x: 0, y: 0, z: 0 } })
    const r = start(d)
    addPlayer3d(r, { num: 1, name: 'A', yaw: 0 }, heroSpawn(d))
    addPlayer3d(r, { num: 2, name: 'B', yaw: 0 }, heroSpawn(d))
    const world = r.world as World3
    const heroes = world.targets.filter((t) => t.brickId === HERO3D && (t as Target3).body3?.character) as Target3[]
    expect(heroes.length).toBeGreaterThanOrEqual(2)
    const [a, b] = heroes.slice(-2)
    // Put B right on top of A.
    b.x = a.x; b.z = a.z; b.y = a.y + 0.72 + 0.4
    run(r, 30)
    expect(b.y).toBeCloseTo(a.y + 0.72, 6)
    expect(b.body3!.onGround).toBe(true)
  })
})

describe('Hackable 3D D1: rewinds and keyframes carry everything new', () => {
  it('a rewind, JSON keyframe and fingerprint include the riders and moved-by-script memory', () => {
    const mover = createMover3d('brick3d_mover')
    const design = room({ bricks: [mover.brick], copies: [{ id: 'm', brickId: mover.brick.id, x: 0, y: 1, z: 0 }], hero: { x: 0, y: 1.5, z: 0 } })
    const r = start(design)
    run(r, 20)
    const saved = copyWorld(r.world)
    const json = worldToJson(r.world)
    run(r, 40)
    const end = worldFingerprint(r.world)
    r.restoreWorld(copyWorld(saved))
    run(r, 40)
    expect(worldFingerprint(r.world)).toBe(end)
    const fresh = createRuntime(design)
    fresh.restoreWorld(worldFromJson(json, fresh.world.bricks, design))
    run(fresh, 40)
    expect(worldFingerprint(fresh.world)).toBe(end)
  })
})

describe('Hackable 3D D1: the design checks', () => {
  it('refuses a 3D copy without a z, an unknown part and too many build bricks', () => {
    const d = room()
    expect(validateDesign({ ...d, copies: [{ id: 'copy_hero', brickId: HERO3D, x: 0, y: 0 } as CopyPlacement3] }).map((p) => p.path)).toContain('copies[0].z')
    expect(validateDesign({ ...d, scenery3d: [{ partId: 'nope', x: 0, y: 0, z: 0, rotation: 0, color: '#ffffff' }] } as LevelDesign3).map((p) => p.path)).toContain('scenery3d[0].partId')
    const many = Array.from({ length: 2001 }, () => ({ partId: 'plate_2x4', x: 0, y: 0, z: 0, rotation: 0 as const, color: '#ffffff' }))
    expect(validateDesign({ ...d, scenery3d: many } as LevelDesign3).some((p) => p.code === 'limit')).toBe(true)
    expect(validateDesign({ ...d, scenery3d: undefined } as unknown as LevelDesign3).map((p) => p.path)).toContain('scenery3d')
  })
})

describe('Hackable 3D D1: Open in Hackable 3D', () => {
  it('copies a classic build field for field, keeps its custom parts and plate, and stands the Hero on top', () => {
    const doc = {
      bricks: [
        { id: 'a', partId: 'brick_4x4', x: 30, y: 0, z: 30, rotation: 0 as const, color: '#e7473c' },
        { id: 'b', partId: 'my_ramp', x: 10, y: 0, z: 10, rotation: 1 as const, color: '#3e83d7' },
      ],
      customParts: [{ id: 'my_ramp', name: 'My ramp', template: 'slope' as const, width: 2, depth: 3, height: 3, studs: 'auto' as const }],
      plateSize: 96 as const,
      environmentId: 'sky-island' as const,
    }
    const { design } = classicToHackable3d(doc, '  My castle ')
    const d = design as LevelDesign3
    expect(d.kit).toBe('3d')
    expect(d.name).toBe('My castle')
    expect(d.scenery3d).toEqual([
      { partId: 'brick_4x4', x: 30, y: 0, z: 30, rotation: 0, color: '#e7473c' },
      { partId: 'my_ramp', x: 10, y: 0, z: 10, rotation: 1, color: '#3e83d7' },
    ])
    expect(d.customParts3d).toEqual(doc.customParts)
    expect(d.plate3d).toBe(96)
    expect(validateDesign(d)).toEqual([])
    // The plate's middle is stud 48; the 4 × 4 brick at 30..34 is not under it, so the Hero stands on the plate.
    expect(d.copies[0]).toMatchObject({ brickId: HERO3D, x: 0, y: 0, z: 0 })
    const r = start(d)
    run(r, 10)
    expect(hero(r).body3!.onGround).toBe(true)
  })

  it('stands the Hero on top of a brick built in the middle of the plate', () => {
    const { design } = classicToHackable3d({ bricks: [{ id: 'a', partId: 'brick_4x4', x: 30, y: 0, z: 30, rotation: 0, color: '#e7473c' }], customParts: [], environmentId: 'classic' }, 'Tower')
    expect(design.copies[0].y).toBeCloseTo(3 * PLATE, 9)
    expect(studToWorld(32)).toBe(0)
  })
})
