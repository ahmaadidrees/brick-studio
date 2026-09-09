import { describe, expect, it } from 'vitest'
import { BRICK_STUDIO_MAX_BRICKS, createBrickStudioDocument } from './brickDocument'
import {
  PUBLISHED_WORLD_MAX_HASH_LENGTH,
  PUBLISHED_WORLD_MAX_PAYLOAD_BYTES,
  loadPublishedWorld,
} from './publishedWorlds'
import type { BrickInstance } from './types'

function largeWorld(count = BRICK_STUDIO_MAX_BRICKS): BrickInstance[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `brick-${index}`,
    partId: 'brick_1x1',
    x: index % 64,
    y: 0,
    z: Math.floor(index / 64),
    rotation: 0,
    color: index % 2 ? '#3e83d7' : '#e7473c',
  }))
}

function legacySnapshot(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function compressedSnapshot(value: string) {
  const compression = new CompressionStream('gzip')
  const reader = compression.readable.getReader()
  const chunksPromise = (async () => {
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) return chunks
      chunks.push(chunk)
    }
  })()
  const writer = compression.writable.getWriter()
  const bytes = new TextEncoder().encode(value)
  // Typed-array chunks work across browser and Node compression streams.
  await writer.write(bytes)
  await writer.close()
  const chunks = await chunksPromise
  const compressed = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    compressed.set(chunk, offset)
    offset += chunk.byteLength
  }
  let binary = ''
  for (let index = 0; index < compressed.length; index += 0x8000) binary += String.fromCharCode(...compressed.subarray(index, index + 0x8000))
  return `v2.${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`
}

describe('published world snapshot links', () => {
  it('opens a compressed validated document and unicode title', async () => {
    const document = createBrickStudioDocument([], { environmentId: 'brick-valley' })
    const hash = await compressedSnapshot(JSON.stringify({ title: 'Zoë’s world', document }))

    expect(hash).toMatch(/^v2\./)
    await expect(loadPublishedWorld(hash)).resolves.toEqual({ title: 'Zoë’s world', document })
  })

  it('opens legacy uncompressed links for backwards compatibility', async () => {
    const document = createBrickStudioDocument([], { environmentId: 'toy-room' })
    const hash = legacySnapshot({ title: 'Original link', document })

    await expect(loadPublishedWorld(`#${hash}`)).resolves.toEqual({ title: 'Original link', document })
  })

  it('opens a compressed full 1,000-brick world within the guarded hash budget', async () => {
    const document = createBrickStudioDocument(largeWorld())
    const hash = await compressedSnapshot(JSON.stringify({ title: 'Big classroom world', document }))

    expect(hash.length).toBeLessThan(PUBLISHED_WORLD_MAX_HASH_LENGTH)
    await expect(loadPublishedWorld(hash)).resolves.toEqual({ title: 'Big classroom world', document })
  })

  it('rejects missing and damaged snapshots', async () => {
    await expect(loadPublishedWorld('')).rejects.toThrow(/missing/)
    await expect(loadPublishedWorld('#not-a-world')).rejects.toThrow(/invalid or damaged/)
  })

  it('stops highly compressed payloads at the decoded byte limit', async () => {
    const hash = await compressedSnapshot('a'.repeat(PUBLISHED_WORLD_MAX_PAYLOAD_BYTES + 1))

    expect(hash.length).toBeLessThan(PUBLISHED_WORLD_MAX_HASH_LENGTH)
    await expect(loadPublishedWorld(`#${hash}`)).rejects.toThrow(/safe snapshot limit/)
  })
})
