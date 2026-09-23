import { levelFromJson, levelToJson, type LevelDesign } from '@brick-studio/platformer-core/engine/level'

/* Share links: the whole level, deflated and base64url-encoded, in the URL fragment (`/2d/play#l=…`). */

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const body = new Blob([bytes as unknown as ArrayBuffer]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(body).arrayBuffer())
}

export async function encodeShareCode(level: LevelDesign): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(levelToJson(level)))
  return toBase64Url(await pipeThrough(json, new CompressionStream('deflate-raw')))
}

export async function decodeShareCode(code: string): Promise<LevelDesign> {
  if (code.length > 200_000) throw new Error('share code too long')
  const bytes = await pipeThrough(fromBase64Url(code), new DecompressionStream('deflate-raw'))
  if (bytes.length > 2_000_000) throw new Error('share code too large')
  return levelFromJson(JSON.parse(new TextDecoder().decode(bytes)))
}
