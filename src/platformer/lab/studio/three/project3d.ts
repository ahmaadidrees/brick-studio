/**
 * Hackable 3D projects (docs/qa/hackable-3d/D1.md): the starter, a classic 3D build copied into a new project ("Open
 * in Hackable 3D"), and adding a code brick to a project from the drawer.
 *
 * A project is the studio's ordinary StudioProject: a LevelDesign with `kit: '3d'` plus each brick's Blockly
 * workspace, saved and opened by the same paths as the Platformer and Racing.
 */
import type { BrickStudioDocument } from '../../../../../packages/brick-core/src/brickDocument'
import type { BrickInstance } from '../../../../../packages/brick-core/src/types'
import type { BrickDef } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { GRID, PLATE, PLATE_SIZES3D, STUD, plateOf, type BrickDef3, type CopyPlacement3, type LevelDesign3, type SceneryBrick } from '../../kit3d/contracts3d'
import { HERO3D } from '../../kit3d/engine3d'
import { footprint, partsOf, supportTop } from '../../kit3d/parts3d'
import { STAGE_ID, type StudioProject } from '../store'
import { CODE_BRICKS_3D, STAGE_VARIABLES_3D, createBouncePad3d, createCoin3d, createGoal3d, createHero3d, createStage3dWorkspace, type CodeBrick3 } from './bricks3d'

export const PROJECT_NAME_3D = 'My 3D world'

/** World x or z of a stud position on the plate (the plate's middle is 0). */
export const studToWorld = (stud: number, plate: number = GRID): number => (stud - plate / 2) * STUD

function stage3d(): BrickDef {
  const workspace = createStage3dWorkspace()
  return { id: STAGE_ID, name: 'Stage', isStage: true, costumes: [], sounds: [], program: compileWorkspace(workspace, { variables: STAGE_VARIABLES_3D }).program }
}

function bounds(plate: number): LevelDesign3['bounds'] {
  const half = (plate / 2) * STUD
  return { left: -half, right: half, bottom: -12, top: 200 }
}

/** A small starter build: a deck four bricks up, with a wall behind it (the Bounce pad is the way up). */
function starterScenery(): SceneryBrick[] {
  const out: SceneryBrick[] = []
  const colors = ['#3e83d7', '#65b85a']
  for (let y = 0; y < 12; y++) out.push({ partId: 'plate_6x8', x: 29, z: 14, y, rotation: 0, color: colors[y % 2] })
  for (let i = 0; i < 4; i++) out.push({ partId: 'brick_2x4', x: 25 + i * 4, z: 11, y: 0, rotation: 1, color: i % 2 ? '#f5eee0' : '#e7473c' })
  for (let i = 0; i < 3; i++) out.push({ partId: 'brick_2x4', x: 27 + i * 4, z: 11, y: 3, rotation: 1, color: i % 2 ? '#e7473c' : '#f5eee0' })
  out.push({ partId: 'pillar_1x1', x: 22, z: 30, y: 0, rotation: 0, color: '#a9b7bd' })
  out.push({ partId: 'pillar_1x1', x: 41, z: 30, y: 0, rotation: 0, color: '#a9b7bd' })
  return out
}

/** A new Hackable 3D project: the Hero, a Bounce pad up to a deck with the Goal, and three Coins on the way. */
export function createStarter3dProject(): StudioProject {
  const hero = createHero3d()
  const pad = createBouncePad3d('brick3d_pad')
  const coin = createCoin3d('brick3d_coin')
  const goal = createGoal3d('brick3d_goal')
  const scenery = starterScenery()
  const parts = partsOf(undefined)
  const deckTop = supportTop(scenery, parts, 31, 17, 2, 2) * PLATE
  const coinY = 0.5 * STUD
  const copies: CopyPlacement3[] = [
    { id: 'copy_hero', brickId: HERO3D, x: 0, y: 0, z: studToWorld(42) },
    { id: 'copy_pad', brickId: pad.brick.id, x: 0, y: 0, z: studToWorld(25) },
    { id: 'copy_coin_1', brickId: coin.brick.id, x: 0, y: coinY, z: studToWorld(37) },
    { id: 'copy_coin_2', brickId: coin.brick.id, x: 0, y: coinY, z: studToWorld(33) },
    { id: 'copy_coin_3', brickId: coin.brick.id, x: 0, y: coinY, z: studToWorld(29) },
    { id: 'copy_goal', brickId: goal.brick.id, x: 0, y: deckTop, z: studToWorld(17) },
  ]
  const design: LevelDesign3 = {
    id: 'starter_3d',
    name: PROJECT_NAME_3D,
    kit: '3d',
    seed: 12345,
    bounds: bounds(GRID),
    stage: stage3d(),
    bricks: [hero.brick, pad.brick, coin.brick, goal.brick],
    copies,
    scenery3d: scenery,
  }
  return {
    design,
    workspaces: { [STAGE_ID]: createStage3dWorkspace(), [hero.brick.id]: hero.workspace, [pad.brick.id]: pad.workspace, [coin.brick.id]: coin.workspace, [goal.brick.id]: goal.workspace },
  }
}

/** Where a Hero stands at the plate's middle: on top of whatever is built there. */
export function heroStartOn(scenery: readonly SceneryBrick[], design: Pick<LevelDesign3, 'customParts3d' | 'plate3d'>): { x: number; y: number; z: number } {
  const plate = plateOf(design)
  const mid = plate / 2
  return { x: 0, y: supportTop(scenery, partsOf(design), mid - 1, mid - 1, 2, 2) * PLATE, z: 0 }
}

/** The build bricks of a classic document, as a Hackable 3D build: field for field, no ids. */
export function sceneryFromClassic(bricks: readonly Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation' | 'color'>[]): SceneryBrick[] {
  return bricks.map((b) => ({ partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation, color: b.color }))
}

/**
 * "Open in Hackable 3D": a copy of a classic 3D build as a new Hackable 3D project. The classic build is left alone.
 * Its bricks become the plain build (scenery), its custom parts come along, and the Hero stands in the middle of the
 * plate on top of whatever is there. No code bricks yet: the kid adds them from the drawer.
 */
export function classicToHackable3d(document: Pick<BrickStudioDocument, 'bricks' | 'customParts' | 'plateSize' | 'environmentId'>, name: string): StudioProject {
  const hero = createHero3d()
  const plate = document.plateSize && PLATE_SIZES3D.includes(document.plateSize) ? document.plateSize : GRID
  const custom = (document.customParts ?? []).map((p) => ({ ...p }))
  const scenery = sceneryFromClassic(document.bricks)
  const shape = { ...(custom.length > 0 ? { customParts3d: custom } : {}), ...(plate !== GRID ? { plate3d: plate as 96 | 128 } : {}) }
  const start = heroStartOn(scenery, shape)
  const design: LevelDesign3 = {
    id: 'world_3d',
    name: name.trim().slice(0, 80) || PROJECT_NAME_3D,
    kit: '3d',
    seed: 12345,
    bounds: bounds(plate),
    stage: stage3d(),
    bricks: [hero.brick],
    copies: [{ id: 'copy_hero', brickId: HERO3D, ...start }],
    scenery3d: scenery,
    ...shape,
    ...(document.environmentId ? { look3d: { environmentId: document.environmentId } } : {}),
  }
  return { design, workspaces: { [STAGE_ID]: createStage3dWorkspace(), [hero.brick.id]: hero.workspace } }
}

/**
 * The bricks a code-brick entry needs, made fresh (with their workspaces) for any the project does not have yet. A
 * brick already in the project (by its fixed id, or a remix of it) is reused, so a second Coin is a copy of the first.
 */
export function missingBricks(design: Pick<LevelDesign3, 'bricks'>, entry: CodeBrick3): Array<{ brick: BrickDef3; workspace: unknown }> {
  const out: Array<{ brick: BrickDef3; workspace: unknown }> = []
  for (const part of entry.parts) {
    if (brickFor(design, part.id)) continue
    const made = part.make(part.id)
    // A kid may have taken the name already ("Coin" for a brick of their own): number it.
    const taken = new Set(design.bricks.map((b) => b.name.toLowerCase()))
    let name = made.brick.name
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${made.brick.name} ${n}`
    out.push({ brick: { ...made.brick, name }, workspace: made.workspace })
  }
  return out
}

/** The project's brick for a code-brick part: its own id, or a remix of it. */
export function brickFor(design: Pick<LevelDesign3, 'bricks'>, id: string): BrickDef3 | undefined {
  return (design.bricks.find((b) => b.id === id) ?? design.bricks.find((b) => b.remixOf === id)) as BrickDef3 | undefined
}

export const codeBrickEntry = (key: CodeBrick3['key']): CodeBrick3 => CODE_BRICKS_3D.find((e) => e.key === key)!

/** A footprint's size in studs for a part id (unknown parts are 1 × 1). */
export function partFootprint(design: Pick<LevelDesign3, 'customParts3d'>, partId: string, rotation: number): { w: number; d: number; h: number } {
  const part = partsOf(design)[partId]
  if (!part) return { w: 1, d: 1, h: 3 }
  return { ...footprint(part, rotation), h: part.height }
}
