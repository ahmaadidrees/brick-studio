import {
  BRICK_STUDIO_MAX_JSON_LENGTH,
  validateBrickStudioDocument,
  type BrickStudioDocument,
} from './brickDocument'

export const PUBLISHED_WORLD_MAX_HASH_LENGTH = 80_000
export const PUBLISHED_WORLD_MAX_PAYLOAD_BYTES = BRICK_STUDIO_MAX_JSON_LENGTH
const COMPRESSED_SNAPSHOT_PREFIX = 'v2.'

export type PublishedWorld = { title: string; document: BrickStudioDocument }

function encodeBytesBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64UrlBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function collectStream(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('This published world expands beyond the safe snapshot limit.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function transformBytes(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
) {
  // Attach both success and failure handlers before writing. A decoded-size
  // rejection cancels the transform's readable side, which can reject the
  // writer at the same time; settling both avoids an unhandled rejection.
  const collected = collectStream(transform.readable, PUBLISHED_WORLD_MAX_PAYLOAD_BYTES).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  const writer = transform.writable.getWriter()
  const input = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(input).set(bytes)
  let writeError: unknown
  try {
    await writer.write(input)
    await writer.close()
  } catch (error) {
    writeError = error
  }
  const output = await collected
  if (!output.ok) throw output.error
  if (writeError) throw writeError
  return output.value
}

async function gzip(bytes: Uint8Array) {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser cannot create compressed world links. Export the project file instead.')
  }
  return transformBytes(bytes, new CompressionStream('gzip'))
}

async function gunzip(bytes: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open compressed world links.')
  }
  return transformBytes(bytes, new DecompressionStream('gzip'))
}

export async function createPublishedWorldUrl(document: BrickStudioDocument, title?: string) {
  const payload = new TextEncoder().encode(JSON.stringify({ title: title || 'Published world', document }))
  if (payload.byteLength > PUBLISHED_WORLD_MAX_PAYLOAD_BYTES) {
    throw new Error('This build is too large for a shareable snapshot link. Export the project file instead.')
  }
  const snapshot = `${COMPRESSED_SNAPSHOT_PREFIX}${encodeBytesBase64Url(await gzip(payload))}`
  if (snapshot.length > PUBLISHED_WORLD_MAX_HASH_LENGTH) throw new Error('This build is too large for a shareable snapshot link. Export the project file instead.')
  return new URL(`/world#${snapshot}`, window.location.origin).toString()
}

export async function loadPublishedWorld(hash: string): Promise<PublishedWorld> {
  const snapshot = hash.startsWith('#') ? hash.slice(1) : hash
  if (!snapshot || snapshot.length > PUBLISHED_WORLD_MAX_HASH_LENGTH) throw new Error('This published world link is missing or too large.')
  try {
    const payloadBytes = snapshot.startsWith(COMPRESSED_SNAPSHOT_PREFIX)
      ? await gunzip(decodeBase64UrlBytes(snapshot.slice(COMPRESSED_SNAPSHOT_PREFIX.length)))
      : decodeBase64UrlBytes(snapshot)
    if (payloadBytes.byteLength > PUBLISHED_WORLD_MAX_PAYLOAD_BYTES) {
      throw new Error('This published world expands beyond the safe snapshot limit.')
    }
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { title?: unknown; document?: unknown }
    const validated = validateBrickStudioDocument(payload.document)
    if (!validated.ok) throw new Error(validated.error.message)
    return { title: typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Published world', document: validated.document }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('This ')) throw error
    throw new Error('This published world link is invalid or damaged.')
  }
}
