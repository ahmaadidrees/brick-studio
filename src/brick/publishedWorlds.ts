import { validateBrickStudioDocument, type BrickStudioDocument } from './brickDocument'

export const PUBLISHED_WORLD_MAX_HASH_LENGTH = 80_000

export type PublishedWorld = { title: string; document: BrickStudioDocument }

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export function createPublishedWorldUrl(document: BrickStudioDocument, title?: string) {
  const snapshot = encodeBase64Url(JSON.stringify({ title: title || 'Published world', document }))
  if (snapshot.length > PUBLISHED_WORLD_MAX_HASH_LENGTH) throw new Error('This build is too large for a shareable snapshot link. Export the project file instead.')
  return new URL(`/world#${snapshot}`, window.location.origin).toString()
}

export function loadPublishedWorld(hash: string): PublishedWorld {
  const snapshot = hash.startsWith('#') ? hash.slice(1) : hash
  if (!snapshot || snapshot.length > PUBLISHED_WORLD_MAX_HASH_LENGTH) throw new Error('This published world link is missing or too large.')
  try {
    const payload = JSON.parse(decodeBase64Url(snapshot)) as { title?: unknown; document?: unknown }
    const validated = validateBrickStudioDocument(payload.document)
    if (!validated.ok) throw new Error(validated.error.message)
    return { title: typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Published world', document: validated.document }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('This ')) throw error
    throw new Error('This published world link is invalid or damaged.')
  }
}
