/* What the 2D mode remembers in this browser. Every read and write survives storage being blocked. */

import { DEFAULT_CHARACTER, type CharacterId } from '@brick-studio/platformer-core/net/protocol'
import { normalizeCharacterId } from '../characters/catalog'

const CHARACTER_KEY = 'brick-studio.2d.character.v1'
let visitCharacter: CharacterId | null = null

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function set(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    // Private browsing or storage full: the preference lasts for this visit only.
    return false
  }
}

/** A cosmetic choice for this player, shared across 2D worlds on this browser. */
export function savedCharacter(): CharacterId {
  const stored = get(CHARACTER_KEY)
  return visitCharacter ?? (stored === null ? DEFAULT_CHARACTER : normalizeCharacterId(stored))
}

export function saveCharacter(id: CharacterId): void {
  visitCharacter = set(CHARACTER_KEY, id) ? null : id
}

/** Identifies this browser to guest rooms, so a dropped connection can rejoin a closed room. */
export function clientKey(): string {
  let key = get('brick-studio.2d.client-key')
  if (!key || !/^[a-z0-9]{8,32}$/.test(key)) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('')
    set('brick-studio.2d.client-key', key)
  }
  return key
}

/** The owner token for a guest room this browser opened; holding it makes you the host. */
export const ownerTokenFor = (roomId: string): string | null => get(`brick-studio.2d.owner.${roomId}`)
export const rememberOwnerToken = (roomId: string, token: string) => set(`brick-studio.2d.owner.${roomId}`, token)

/** The name a guest last used in a room. */
export const savedGuestName = (): string => get('brick-studio.2d.name') ?? ''
export const saveGuestName = (name: string) => set('brick-studio.2d.name', name)

export interface SoundPrefs {
  muted: boolean
  music: boolean
}

/** Music is opt-in for solo play; rooms always start without music. Sound effects default on. */
export function soundPrefs(inRoom: boolean): SoundPrefs {
  return { muted: get('brick-studio.2d.muted') === '1', music: !inRoom && get('brick-studio.2d.music') === '1' }
}

export function saveSoundPrefs(p: SoundPrefs, inRoom: boolean) {
  set('brick-studio.2d.muted', p.muted ? '1' : '0')
  if (!inRoom) set('brick-studio.2d.music', p.music ? '1' : '0')
}

/** First-time hints, shown once per browser. */
export const hasSeen = (hint: string) => get(`brick-studio.2d.seen.${hint}`) === '1'
export const markSeen = (hint: string) => set(`brick-studio.2d.seen.${hint}`, '1')
