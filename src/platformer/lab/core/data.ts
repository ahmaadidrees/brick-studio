/**
 * Variable and list blocks. Fields hold the id (fields.VARIABLE, fields.LIST).
 * Lookup checks the target first, then the stage. A missing id is not created:
 * reads report 0 or an empty list, and writes do nothing.
 *
 * List edits mutate the existing array so a global list shared by reference stays shared.
 * Nothing here resets on the green flag. Play reloads the saved design; a flag inside a session does not.
 */
import type { PrimitiveCtx, PrimitiveTable, Target, Value } from './contracts'
import { LIST_ALL, LIST_INVALID, compare, toListIndex, toNumber } from './values'

/** Scratch's list cap. Add past this is ignored. Insert past this is refused or trims the tail. */
export const LIST_ITEM_LIMIT = 200_000

function hasId(record: object, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, id)
}

function ownerOf(target: Target, stage: Target, id: string, which: 'variables' | 'lists'): Target | undefined {
  if (hasId(target[which], id)) return target
  if (target !== stage && hasId(stage[which], id)) return stage
  return undefined
}

function readVariable(ctx: PrimitiveCtx): Value {
  const id = ctx.field('VARIABLE')
  const owner = ownerOf(ctx.target, ctx.runtime.world.stage, id, 'variables')
  return owner ? owner.variables[id] : 0
}

function writeVariable(ctx: PrimitiveCtx, value: Value): void {
  const id = ctx.field('VARIABLE')
  const owner = ownerOf(ctx.target, ctx.runtime.world.stage, id, 'variables')
  if (owner) owner.variables[id] = value
}

function readList(ctx: PrimitiveCtx): Value[] | undefined {
  const id = ctx.field('LIST')
  const owner = ownerOf(ctx.target, ctx.runtime.world.stage, id, 'lists')
  return owner ? owner.lists[id] : undefined
}

/** No separator when every item is one UTF-16 code unit; otherwise a space. An empty list is "". */
function contentsOf(items: Value[]): string {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (typeof item !== 'string' || item.length !== 1) return items.join(' ')
  }
  return items.join('')
}

function itemNumber(items: Value[], item: Value): number {
  for (let i = 0; i < items.length; i++) {
    if (compare(items[i], item) === 0) return i + 1
  }
  return 0
}

function listContains(items: Value[], item: Value): boolean {
  if (items.indexOf(item) >= 0) return true
  for (let i = 0; i < items.length; i++) {
    if (compare(items[i], item) === 0) return true
  }
  return false
}

const showOrHide: PrimitiveTable[string] = () => {}

export const dataPrimitives: PrimitiveTable = {
  data_variable(ctx) {
    return readVariable(ctx)
  },

  data_setvariableto(ctx) {
    writeVariable(ctx, ctx.arg('VALUE'))
  },

  data_changevariableby(ctx) {
    const id = ctx.field('VARIABLE')
    const owner = ownerOf(ctx.target, ctx.runtime.world.stage, id, 'variables')
    if (!owner) return
    owner.variables[id] = toNumber(owner.variables[id]) + toNumber(ctx.arg('VALUE'))
  },

  data_showvariable: showOrHide,
  data_hidevariable: showOrHide,
  data_showlist: showOrHide,
  data_hidelist: showOrHide,

  data_listcontents(ctx) {
    const items = readList(ctx)
    return items ? contentsOf(items) : ''
  },

  data_addtolist(ctx) {
    const items = readList(ctx)
    if (!items || items.length >= LIST_ITEM_LIMIT) return
    items.push(ctx.arg('ITEM'))
  },

  data_deleteoflist(ctx) {
    const items = readList(ctx)
    if (!items) return
    const index = toListIndex(ctx.arg('INDEX'), items.length, true, () => ctx.runtime.random())
    if (index === LIST_INVALID) return
    if (index === LIST_ALL) {
      items.length = 0
      return
    }
    items.splice(index - 1, 1)
  },

  data_deletealloflist(ctx) {
    const items = readList(ctx)
    if (items) items.length = 0
  },

  data_insertatlist(ctx) {
    const items = readList(ctx)
    if (!items) return
    // length + 1 so "last" means the slot after the current tail, including on an empty list.
    const index = toListIndex(ctx.arg('INDEX'), items.length + 1, false, () => ctx.runtime.random())
    if (index === LIST_INVALID || index === LIST_ALL) return
    if (index > LIST_ITEM_LIMIT) return
    items.splice(index - 1, 0, ctx.arg('ITEM'))
    if (items.length > LIST_ITEM_LIMIT) items.pop()
  },

  data_replaceitemoflist(ctx) {
    const items = readList(ctx)
    if (!items) return
    const index = toListIndex(ctx.arg('INDEX'), items.length, false, () => ctx.runtime.random())
    if (typeof index !== 'number') return
    items[index - 1] = ctx.arg('ITEM')
  },

  data_itemoflist(ctx) {
    const items = readList(ctx)
    if (!items) return ''
    const index = toListIndex(ctx.arg('INDEX'), items.length, false, () => ctx.runtime.random())
    if (typeof index !== 'number') return ''
    return items[index - 1]
  },

  data_itemnumoflist(ctx) {
    const items = readList(ctx)
    if (!items) return 0
    return itemNumber(items, ctx.arg('ITEM'))
  },

  data_lengthoflist(ctx) {
    const items = readList(ctx)
    return items ? items.length : 0
  },

  data_listcontainsitem(ctx) {
    const items = readList(ctx)
    if (!items) return false
    return listContains(items, ctx.arg('ITEM'))
  },
}
