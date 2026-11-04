/** The classic sound effects rendered for Hackable bricks (parity bucket B): the classic notes' length, not silent, the same every time. */
import { describe, expect, it } from 'vitest'
import { soundNotes } from '../../../audio/sound'
import { decodeBase64 } from '../../core/save'
import { classicSound } from './classicSounds'

function samples(asset: string): Int16Array {
  const bytes = decodeBase64(asset.slice(asset.indexOf(',') + 1))!
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.byteLength))
}

describe('classic sounds', () => {
  for (const effect of ['checkpoint', 'stomp', 'kick', 'powerup', 'coin'] as const) {
    it(`${effect}: as long as its notes (plus a 30 ms tail), heard, and the same every time`, () => {
      const notes = soundNotes(effect)
      const end = Math.max(...notes.map((n) => n.at + n.dur))
      const sound = classicSound(effect, 'My sound')
      expect(sound.name).toBe('My sound')
      expect(sound.durationMs).toBeGreaterThanOrEqual(end * 1000)
      expect(sound.durationMs).toBeLessThanOrEqual(end * 1000 + 40)
      const pcm = samples(sound.asset!)
      const peak = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(peak).toBeGreaterThan(2000)
      expect(peak).toBeLessThanOrEqual(32767)
      expect(classicSound(effect, 'Again').asset).toBe(sound.asset)
    })
  }
})
