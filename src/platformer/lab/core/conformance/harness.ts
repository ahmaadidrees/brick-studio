import type {
  BrickDef,
  CopyPlacement,
  Costume,
  Expr,
  Fields,
  HatOpcode,
  Inputs,
  LevelDesign,
  ListDecl,
  Procedure,
  Script,
  StageBounds,
  Stmt,
  Value,
  VariableDecl,
} from '../contracts'
import { createRuntime, Runtime, ALL_PRIMITIVES } from '../index'

export interface HarnessDesignOpts {
  scripts?: Script[]
  procedures?: Procedure[]
  variables?: VariableDecl[]
  lists?: ListDecl[]
  costumes?: Costume[]
  x?: number
  y?: number
  direction?: number
  size?: number
  visible?: boolean
  costumeIndex?: number
  knobs?: Record<string, Value>
  bounds?: StageBounds
  seed?: number
  stageScripts?: Script[]
  stageProcedures?: Procedure[]
  stageVariables?: VariableDecl[]
  stageLists?: ListDecl[]
  stageCostumes?: Costume[]
  extraBricks?: BrickDef[]
  extraCopies?: CopyPlacement[]
}

export function defaultCostume(name = 'costume1', width = 32, height = 32): Costume {
  return {
    name,
    width,
    height,
    rotationCenterX: Math.floor(width / 2),
    rotationCenterY: Math.floor(height / 2),
  }
}

export function makeHarnessDesign(opts: HarnessDesignOpts = {}): LevelDesign {
  const spriteBrick: BrickDef = {
    id: 'sprite1',
    name: 'Sprite1',
    costumes: opts.costumes ?? [defaultCostume('costume1')],
    sounds: [],
    program: {
      scripts: opts.scripts ?? [],
      procedures: opts.procedures ?? [],
      variables: opts.variables ?? [],
      lists: opts.lists ?? [],
    },
  }

  const stageBrick: BrickDef = {
    id: 'stage',
    name: 'Stage',
    isStage: true,
    costumes: opts.stageCostumes ?? [defaultCostume('backdrop1', 480, 360)],
    sounds: [],
    program: {
      scripts: opts.stageScripts ?? [],
      procedures: opts.stageProcedures ?? [],
      variables: opts.stageVariables ?? [],
      lists: opts.stageLists ?? [],
    },
  }

  const defaultCopy: CopyPlacement = {
    id: 'copy1',
    brickId: 'sprite1',
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    direction: opts.direction ?? 90,
    size: opts.size ?? 100,
    visible: opts.visible ?? true,
    costume: opts.costumeIndex ?? 0,
    knobs: opts.knobs,
  }

  return {
    id: 'test_design',
    name: 'Test Level',
    bounds: opts.bounds ?? { left: -240, right: 240, bottom: -180, top: 180 },
    seed: opts.seed ?? 1,
    stage: stageBrick,
    bricks: [spriteBrick, ...(opts.extraBricks ?? [])],
    copies: [defaultCopy, ...(opts.extraCopies ?? [])],
  }
}

export function makeHarnessRuntime(opts: HarnessDesignOpts = {}): Runtime {
  const design = makeHarnessDesign(opts)
  return createRuntime(design)
}

// ---------------------------------------------------------------- AST Helpers

export function lit(value: Value): Expr {
  return { kind: 'lit', value }
}

export function block(opcode: string, inputs: Inputs = {}, fields: Fields = {}): Expr {
  return { kind: 'block', opcode, inputs, fields }
}

export function param(name: string, boolean?: boolean): Expr {
  return { kind: 'param', name, boolean }
}

export function stmt(
  opcode: string,
  inputs: Inputs = {},
  fields: Fields = {},
  branches?: Stmt[][],
  call?: { proccode: string },
): Stmt {
  return { opcode, inputs, fields, branches, call }
}

export function script(
  opcode: HatOpcode,
  body: Stmt[],
  fields: Fields = {},
  inputs: Inputs = {},
  id = `script_${opcode}_${Math.random().toString(36).slice(2, 7)}`,
): Script {
  return {
    id,
    hat: { opcode, fields, inputs },
    body,
  }
}

export function flagScript(body: Stmt[], id = 'flag_script'): Script {
  return script('event_whenflagclicked', body, {}, {}, id)
}

export function keyScript(key: string, body: Stmt[], id = `key_${key}`): Script {
  return script('event_whenkeypressed', body, { KEY_OPTION: key }, {}, id)
}

export function clickScript(body: Stmt[], id = 'click_script'): Script {
  return script('event_whenthisspriteclicked', body, {}, {}, id)
}

export function stageClickScript(body: Stmt[], id = 'stage_click_script'): Script {
  return script('event_whenstageclicked', body, {}, {}, id)
}

export function broadcastScript(msg: string, body: Stmt[], id = `bc_${msg}`): Script {
  return script('event_whenbroadcastreceived', body, { BROADCAST_OPTION: msg }, {}, id)
}

export function cloneScript(body: Stmt[], id = 'clone_script'): Script {
  return script('control_start_as_clone', body, {}, {}, id)
}

export function backdropScript(backdrop: string, body: Stmt[], id = `bd_${backdrop}`): Script {
  return script('event_whenbackdropswitchesto', body, { BACKDROP: backdrop }, {}, id)
}

export function greaterThanScript(menu: 'TIMER' | 'LOUDNESS', value: Expr, body: Stmt[], id = 'gt_script'): Script {
  return script('event_whengreaterthan', body, { WHENGREATERTHANMENU: menu }, { VALUE: value }, id)
}
