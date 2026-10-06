import type {
  BrickProgram,
  Expr,
  Fields,
  HatOpcode,
  Inputs,
  ListDecl,
  Procedure,
  Script,
  Stmt,
  Value,
  VariableDecl,
} from '../contracts'
import { isHatOpcode } from './definitions'

export interface Diagnostic {
  message: string
  severity: 'error' | 'warning' | 'info'
  blockId?: string
  code?: string
}

export interface CompileResult {
  program: BrickProgram
  diagnostics: Diagnostic[]
}

export interface CompileContext {
  variables?: VariableDecl[]
  lists?: ListDecl[]
  procedures?: Procedure[]
}

export interface WorkspaceConnectionJson {
  block?: WorkspaceBlockJson
  shadow?: WorkspaceBlockJson
}

export interface WorkspaceBlockJson {
  type?: unknown
  id?: unknown
  enabled?: unknown
  disabledReasons?: unknown
  extraState?: unknown
  /** Studio-only note on a block (the layered editor keeps a script's one-line label here as `label:<text>`). The compiler ignores it. */
  data?: unknown
  fields?: Record<string, unknown>
  inputs?: Record<string, WorkspaceConnectionJson | undefined>
  next?: WorkspaceConnectionJson
}

export interface WorkspaceVariableJson {
  id?: unknown
  name?: unknown
  type?: unknown
}

export interface WorkspaceProcedureJson {
  id?: unknown
  name?: unknown
  parameters?: Array<{ id?: unknown; name?: unknown; types?: unknown }>
  returnTypes?: unknown
}

export interface WorkspaceJson {
  languageVersion?: unknown
  blocks?: {
    languageVersion?: unknown
    blocks?: WorkspaceBlockJson[]
  } | WorkspaceBlockJson[]
  variables?: WorkspaceVariableJson[]
  procedures?: WorkspaceProcedureJson[]
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val)

function extractFields(block: WorkspaceBlockJson): Fields {
  const result: Fields = {}
  if (!isRecord(block.fields)) return result

  for (const [key, val] of Object.entries(block.fields)) {
    if (val === undefined || val === null) continue
    if (isRecord(val)) {
      if (typeof val.id === 'string') {
        result[key] = val.id
      } else if (typeof val.name === 'string') {
        result[key] = val.name
      } else {
        result[key] = String(val)
      }
    } else {
      result[key] = String(val)
    }
  }
  return result
}

function resolveConnectedBlock(conn?: WorkspaceConnectionJson): WorkspaceBlockJson | undefined {
  if (!conn || !isRecord(conn)) return undefined
  if (isRecord(conn.block)) return conn.block
  if (isRecord(conn.shadow)) return conn.shadow
  return undefined
}

/**
 * Blocks that used to exist and no longer do. A saved workspace that still holds one compiles (the block does nothing,
 * a reporter answers false) and gets a clear warning, so an old project never crashes.
 */
const REMOVED_BLOCKS: Readonly<Record<string, string>> = {
  platformer_touchingtile:
    'The "touching tile" block is gone: every painted block is a brick now. Use "touching [brick]?" from Sensing instead.',
}

function noteRemovedBlock(type: string, block: WorkspaceBlockJson, diagnostics: Diagnostic[]): void {
  const message = Object.hasOwn(REMOVED_BLOCKS, type) ? REMOVED_BLOCKS[type] : undefined
  if (message === undefined) return
  diagnostics.push({ message, severity: 'warning', code: 'block.unknown', blockId: typeof block.id === 'string' ? block.id : undefined })
}

function compileExpr(
  conn: WorkspaceConnectionJson | undefined,
  diagnostics: Diagnostic[],
): Expr {
  const target = resolveConnectedBlock(conn)
  if (!target || typeof target.type !== 'string') {
    return { kind: 'lit', value: '' }
  }

  const type = target.type
  const fields = extractFields(target)

  // 1. Literal blocks
  if (
    type === 'math_number' ||
    type === 'math_positive_number' ||
    type === 'math_whole_number' ||
    type === 'math_integer'
  ) {
    const raw = fields.NUM !== undefined ? fields.NUM : 0
    const num = Number(raw)
    return { kind: 'lit', value: Number.isNaN(num) ? 0 : num }
  }

  if (type === 'text') {
    return { kind: 'lit', value: fields.TEXT ?? '' }
  }

  if (type === 'colour_picker') {
    return { kind: 'lit', value: fields.COLOUR ?? '#ffffff' }
  }

  // 2. Custom block parameter reporters
  if (type === 'argument_reporter_string_number') {
    const name = fields.VALUE ?? fields.NAME ?? ''
    return { kind: 'param', name, boolean: false }
  }

  if (type === 'argument_reporter_boolean') {
    const name = fields.VALUE ?? fields.NAME ?? ''
    return { kind: 'param', name, boolean: true }
  }

  // 3. Reporter / Boolean blocks
  noteRemovedBlock(type, target, diagnostics)
  const inputs: Inputs = {}
  if (isRecord(target.inputs)) {
    for (const [name, inputConn] of Object.entries(target.inputs)) {
      if (!inputConn) continue
      inputs[name] = compileExpr(inputConn, diagnostics)
    }
  }

  return {
    kind: 'block',
    opcode: type,
    inputs,
    fields,
    id: typeof target.id === 'string' ? target.id : undefined,
  }
}

function compileStack(
  startConn: WorkspaceConnectionJson | undefined,
  diagnostics: Diagnostic[],
): Stmt[] {
  const stmts: Stmt[] = []
  let curr = resolveConnectedBlock(startConn)

  while (curr) {
    if (typeof curr.type === 'string') {
      const stmt = compileStmt(curr, diagnostics)
      if (stmt) {
        stmts.push(stmt)
      }
    }
    curr = resolveConnectedBlock(curr.next)
  }

  return stmts
}

function compileStmt(
  block: WorkspaceBlockJson,
  diagnostics: Diagnostic[],
): Stmt | null {
  const type = block.type
  if (typeof type !== 'string') return null

  noteRemovedBlock(type, block, diagnostics)
  const fields = extractFields(block)
  const inputs: Inputs = {}
  let branches: Stmt[][] | undefined

  if (isRecord(block.inputs)) {
    for (const [name, inputConn] of Object.entries(block.inputs)) {
      if (!inputConn) continue

      if (name === 'SUBSTACK') {
        branches = branches ?? []
        branches[0] = compileStack(inputConn, diagnostics)
      } else if (name === 'SUBSTACK2') {
        branches = branches ?? []
        branches[0] = branches[0] ?? []
        branches[1] = compileStack(inputConn, diagnostics)
      } else if (name === 'STACK') {
        branches = branches ?? []
        branches[0] = compileStack(inputConn, diagnostics)
      } else {
        inputs[name] = compileExpr(inputConn, diagnostics)
      }
    }
  }

  const stmt: Stmt = {
    opcode: type,
    inputs,
    fields,
    id: typeof block.id === 'string' ? block.id : undefined,
  }

  if (branches && branches.length > 0) {
    stmt.branches = branches
  }

  // Procedure call handling (procedures_call, procedures_callnoreturn)
  if (type === 'procedures_call' || type === 'procedures_callnoreturn') {
    let proccode = fields.PROCCODE ?? fields.NAME
    if (!proccode && isRecord(block.extraState) && typeof block.extraState.proccode === 'string') {
      proccode = block.extraState.proccode
    }
    if (!proccode && isRecord(block.extraState) && typeof block.extraState.name === 'string') {
      proccode = block.extraState.name
    }
    stmt.call = { proccode: proccode ?? '' }
  }

  return stmt
}

function parseProcedureDef(
  block: WorkspaceBlockJson,
  workspaceProcedures: Map<string, WorkspaceProcedureJson>,
  diagnostics: Diagnostic[],
): Procedure | null {
  const type = block.type
  if (type !== 'procedures_definition' && type !== 'procedures_defnoreturn') {
    return null
  }

  let proccode = ''
  let argumentNames: string[] = []
  let warp = false
  let bodyConn: WorkspaceConnectionJson | undefined = block.next

  if (type === 'procedures_definition') {
    // Check custom_block input (procedures_prototype)
    const protoConn = block.inputs?.custom_block
    const protoBlock = resolveConnectedBlock(protoConn)
    const protoExtra = isRecord(protoBlock?.extraState) ? protoBlock.extraState : undefined
    const defExtra = isRecord(block.extraState) ? block.extraState : undefined

    if (protoExtra) {
      if (typeof protoExtra.proccode === 'string') proccode = protoExtra.proccode
      if (Array.isArray(protoExtra.argumentNames)) {
        argumentNames = protoExtra.argumentNames.map((a) => String(a))
      }
      if (typeof protoExtra.warp === 'boolean') warp = protoExtra.warp
    }

    if (defExtra) {
      if (!proccode && typeof defExtra.proccode === 'string') proccode = defExtra.proccode
      if (argumentNames.length === 0 && Array.isArray(defExtra.argumentNames)) {
        argumentNames = defExtra.argumentNames.map((a) => String(a))
      }
      if (typeof defExtra.warp === 'boolean') warp = defExtra.warp
    }

    if (!proccode && protoBlock?.fields) {
      const fields = extractFields(protoBlock)
      if (fields.PROCCODE) proccode = fields.PROCCODE
    }
  } else if (type === 'procedures_defnoreturn') {
    // Shareable procedures definition
    const defExtra = isRecord(block.extraState) ? block.extraState : undefined
    const procId = typeof defExtra?.procedureId === 'string' ? defExtra.procedureId : undefined
    const procMeta = procId ? workspaceProcedures.get(procId) : undefined

    if (procMeta && typeof procMeta.name === 'string') {
      proccode = procMeta.name
      if (Array.isArray(procMeta.parameters)) {
        argumentNames = procMeta.parameters
          .map((p) => (isRecord(p) && typeof p.name === 'string' ? p.name : ''))
          .filter(Boolean)
      }
    } else {
      const fields = extractFields(block)
      proccode = fields.NAME ?? ''
      if (Array.isArray(defExtra?.params)) {
        argumentNames = defExtra.params
          .map((p) => (isRecord(p) && typeof p.name === 'string' ? p.name : ''))
          .filter(Boolean)
      }
    }

    if (typeof defExtra?.warp === 'boolean') warp = defExtra.warp
    // In procedures_defnoreturn, body can be in inputs.STACK
    if (block.inputs?.STACK) {
      bodyConn = block.inputs.STACK
    }
  }

  const body = compileStack(bodyConn, diagnostics)

  return {
    proccode: proccode || 'unnamed',
    argumentNames,
    warp,
    body,
  }
}

/**
 * Compiles a Blockly workspace serialization JSON into a `BrickProgram` IR.
 *
 * Catches any structural or block irregularities and appends them to `diagnostics`
 * without throwing errors.
 */
export function compileWorkspace(
  workspace: unknown,
  context?: CompileContext,
): CompileResult {
  const diagnostics: Diagnostic[] = []
  const scripts: Script[] = []
  const procedures: Procedure[] = context?.procedures ? [...context.procedures] : []
  const varMap = new Map<string, VariableDecl>()
  const listMap = new Map<string, ListDecl>()

  if (context?.variables) {
    for (const v of context.variables) varMap.set(v.id, { ...v })
  }
  if (context?.lists) {
    for (const l of context.lists) listMap.set(l.id, { ...l })
  }

  let ws: WorkspaceJson
  if (typeof workspace === 'string') {
    try {
      ws = JSON.parse(workspace) as WorkspaceJson
    } catch {
      diagnostics.push({
        message: 'Invalid JSON workspace string',
        severity: 'error',
        code: 'workspace.invalid_json',
      })
      return {
        program: { scripts, procedures, variables: [], lists: [] },
        diagnostics,
      }
    }
  } else if (isRecord(workspace)) {
    ws = workspace as WorkspaceJson
  } else {
    diagnostics.push({
      message: 'Workspace is null or not an object',
      severity: 'error',
      code: 'workspace.invalid',
    })
    return {
      program: { scripts, procedures, variables: [], lists: [] },
      diagnostics,
    }
  }

  // 1. Process variables / lists from workspace.variables
  if (Array.isArray(ws.variables)) {
    for (const v of ws.variables) {
      if (!isRecord(v)) continue
      const id = typeof v.id === 'string' ? v.id : String(v.id || '')
      const name = typeof v.name === 'string' ? v.name : id
      if (!id) continue

      if (v.type === 'list') {
        if (!listMap.has(id)) {
          listMap.set(id, { id, name, value: [] })
        }
      } else {
        if (!varMap.has(id)) {
          varMap.set(id, { id, name, value: 0 })
        }
      }
    }
  }

  // 2. Index shareable procedures from workspace.procedures
  const workspaceProcedures = new Map<string, WorkspaceProcedureJson>()
  if (Array.isArray(ws.procedures)) {
    for (const p of ws.procedures) {
      if (isRecord(p) && typeof p.id === 'string') {
        workspaceProcedures.set(p.id, p)
      }
    }
  }

  // 3. Extract top-level blocks
  let topBlocks: WorkspaceBlockJson[] = []
  if (isRecord(ws.blocks) && Array.isArray(ws.blocks.blocks)) {
    topBlocks = ws.blocks.blocks.filter(isRecord) as WorkspaceBlockJson[]
  } else if (Array.isArray(ws.blocks)) {
    topBlocks = ws.blocks.filter(isRecord) as WorkspaceBlockJson[]
  }

  // 4. Walk top-level blocks
  for (const block of topBlocks) {
    if (typeof block.type !== 'string') {
      diagnostics.push({
        message: 'Top-level block has no type',
        severity: 'warning',
        blockId: typeof block.id === 'string' ? block.id : undefined,
        code: 'block.no_type',
      })
      continue
    }

    const type = block.type

    // Check for Hat blocks
    if (isHatOpcode(type)) {
      const hatOpcode = type as HatOpcode
      const fields = extractFields(block)
      const inputs: Inputs = {}
      if (isRecord(block.inputs)) {
        for (const [name, inputConn] of Object.entries(block.inputs)) {
          if (!inputConn) continue
          inputs[name] = compileExpr(inputConn, diagnostics)
        }
      }

      const body = compileStack(block.next, diagnostics)
      scripts.push({
        id: typeof block.id === 'string' ? block.id : `script_${scripts.length}`,
        hat: { opcode: hatOpcode, fields, inputs },
        body,
      })
      continue
    }

    // Check for procedure definitions
    if (type === 'procedures_definition' || type === 'procedures_defnoreturn') {
      const proc = parseProcedureDef(block, workspaceProcedures, diagnostics)
      if (proc) {
        procedures.push(proc)
      }
      continue
    }

    // Disconnected block (non-hat, non-procedure top-level block)
    diagnostics.push({
      message: `Disconnected block "${type}" ignored`,
      severity: 'warning',
      blockId: typeof block.id === 'string' ? block.id : undefined,
      code: 'block.disconnected',
    })
  }

  return {
    program: {
      scripts,
      procedures,
      variables: Array.from(varMap.values()),
      lists: Array.from(listMap.values()),
    },
    diagnostics,
  }
}

/** Alias for compileWorkspace */
export const compile = compileWorkspace
