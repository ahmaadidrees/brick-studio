import type { CustomPartDefinition } from '../types'

export type CreateBrickDraft = Omit<CustomPartDefinition, 'id'>

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function createCustomPartDefinition(draft: CreateBrickDraft): CustomPartDefinition {
  const normalized = { ...draft, name: draft.name.trim() }
  const slug = normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'brick'
  return {
    id: `custom_${slug}_${stableHash(JSON.stringify(normalized))}`,
    ...normalized,
  }
}
