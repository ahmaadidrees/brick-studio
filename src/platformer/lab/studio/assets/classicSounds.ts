/**
 * The classic Platformer's sound effects (src/platformer/audio/sound.ts) as Hackable sounds (parity bucket B,
 * 2026-11-04): the same notes, rendered once into a WAV here instead of being played live by the browser's synth, so a
 * brick carries its sound like any sound a kid adds. The render follows `Sound.voice`: each note's 5 ms attack, hold
 * and release, its exponential or linear pitch slide, the pulse, square and triangle waves, and band-passed noise; the
 * mix is scaled by the classic master and effects volumes (0.5 x 0.9). The noise is seeded, so a sound is the same
 * every time (saves and their fingerprints don't change on reload).
 */
import type { Sound } from '../../core/contracts'
import { soundNotes, type Note, type SoundName } from '../../../audio/sound'
import { encodeWav } from './soundLibrary'

const RATE = 22050
const MIX = 0.5 * 0.9

function wave(kind: Note['wave'], phase: number): number {
  const f = phase - Math.floor(phase)
  switch (kind) {
    case 'square':
      return f < 0.5 ? 1 : -1
    case 'pulse25':
      // A pulse with no DC (the browser's periodic wave has none): high for a quarter, low the rest.
      return f < 0.25 ? 1.5 : -0.5
    case 'pulse12':
      return f < 0.125 ? 1.75 : -0.25
    case 'triangle':
      return 1 - 4 * Math.abs(f - 0.5)
    default:
      return 0
  }
}

function envelope(note: Note, t: number): number {
  const t1 = note.dur
  const hold = Math.max(0.005, t1 - Math.min(0.05, note.dur * 0.4))
  if (t < 0 || t > t1) return 0
  if (t < 0.005) return (t / 0.005) * note.vol
  if (t < hold) return note.vol
  return note.vol * Math.max(0, (t1 - t) / (t1 - hold))
}

/** One note into `out`, starting at sample `start`. */
function renderNote(note: Note, out: Float32Array, seed: number): void {
  const start = Math.round(note.at * RATE)
  const count = Math.round(note.dur * RATE)
  if (note.wave === 'noise') {
    // White noise through a band-pass at f0, Q 0.8 (RBJ biquad, 0 dB peak), like the browser's BiquadFilter.
    const w0 = (2 * Math.PI * note.f0) / RATE
    const alpha = Math.sin(w0) / (2 * 0.8)
    const a0 = 1 + alpha
    const b0 = alpha / a0
    const b2 = -alpha / a0
    const a1 = (-2 * Math.cos(w0)) / a0
    const a2 = (1 - alpha) / a0
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    let s = seed >>> 0 || 1
    for (let i = 0; i < count && start + i < out.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      const x = (s / 0x100000000) * 2 - 1
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
      x2 = x1; x1 = x; y2 = y1; y1 = y
      out[start + i] += y * envelope(note, i / RATE)
    }
    return
  }
  const f1 = note.f1 && note.f1 !== note.f0 ? note.f1 : note.f0
  let phase = 0
  for (let i = 0; i < count && start + i < out.length; i++) {
    const u = i / count
    const f = f1 === note.f0 ? note.f0 : note.curve === 'lin' ? note.f0 + (f1 - note.f0) * u : note.f0 * Math.pow(f1 / note.f0, u)
    phase += f / RATE
    out[start + i] += wave(note.wave, phase) * envelope(note, i / RATE)
  }
}

const made = new Map<string, Sound>()

/** A classic sound effect as a Hackable sound named `name` (a fresh object each time; the asset is made once). */
export function classicSound(effect: SoundName, name: string): Sound {
  let sound = made.get(effect)
  if (!sound) {
    const notes = soundNotes(effect)
    const length = Math.ceil((Math.max(...notes.map((n) => n.at + n.dur)) + 0.03) * RATE)
    const out = new Float32Array(length)
    notes.forEach((note, i) => renderNote(note, out, 0x9e3779b9 + i))
    for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]! * MIX))
    const { asset, durationMs } = encodeWav(out, RATE)
    sound = { name: effect, durationMs, asset }
    made.set(effect, sound)
  }
  return { ...sound, name }
}
