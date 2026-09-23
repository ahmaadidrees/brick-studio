/*
 * Chiptune sound, synthesised in the browser: pulse waves, a triangle bass and noise, like an 8-bit
 * console's sound chip. Every effect and the music loop are original.
 */

export type SoundName =
  | 'jump'
  | 'jumpBig'
  | 'walljump'
  | 'skid'
  | 'bonk'
  | 'spring'
  | 'hurt'
  | 'die'
  | 'checkpoint'
  | 'goal'
  | 'headbounce'
  | 'powerup'
  | 'coin'
  | 'bump'
  | 'break'
  | 'stomp'
  | 'kick'
  | 'kill'
  | 'item'
  | 'throw'
  | 'burst'
  | 'thud'
  | 'bounce'
  | 'poof'
  | 'reset'
  | 'place'
  | 'erase'
  | 'toggle'

type Wave = 'square' | 'triangle' | 'pulse25' | 'pulse12' | 'noise'

interface Note {
  wave: Wave
  /** Start and end frequency (Hz). Ignored for noise except as a filter hint. */
  f0: number
  f1?: number
  /** Start time and length in seconds. */
  at: number
  dur: number
  vol: number
  /** Pitch slide shape. */
  curve?: 'lin' | 'exp'
}

const n = (wave: Wave, f0: number, f1: number | undefined, at: number, dur: number, vol = 0.5, curve: 'lin' | 'exp' = 'exp'): Note => ({ wave, f0, f1, at, dur, vol, curve })

/** Midi note number to Hz. */
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const arp = (wave: Wave, notes: number[], step: number, vol = 0.4, len = step) => notes.map((m, i) => n(wave, hz(m), undefined, i * step, len, vol))

const SOUNDS: Record<SoundName, Note[]> = {
  jump: [n('pulse25', 300, 720, 0, 0.14, 0.35)],
  jumpBig: [n('pulse25', 220, 560, 0, 0.16, 0.35)],
  walljump: [n('pulse25', 420, 820, 0, 0.09, 0.3), n('noise', 3000, undefined, 0, 0.05, 0.15)],
  skid: [n('noise', 1800, undefined, 0, 0.14, 0.12)],
  bonk: [n('square', 180, 120, 0, 0.07, 0.3)],
  spring: [n('triangle', 180, 900, 0, 0.22, 0.6), n('pulse25', 300, 1200, 0.02, 0.18, 0.15)],
  hurt: [n('pulse25', 700, 200, 0, 0.35, 0.35, 'lin')],
  die: [...arp('pulse25', [76, 74, 71, 67, 64, 60], 0.09, 0.35), n('triangle', 200, 60, 0.55, 0.4, 0.5)],
  checkpoint: arp('pulse12', [72, 76, 79, 84], 0.06, 0.3),
  goal: [
    ...arp('pulse25', [60, 64, 67, 72, 76, 79], 0.08, 0.32),
    n('pulse25', hz(84), undefined, 0.5, 0.5, 0.32),
    ...arp('triangle', [48, 52, 55, 60], 0.12, 0.45, 0.2),
  ],
  headbounce: [n('square', 500, 900, 0, 0.08, 0.3)],
  powerup: arp('pulse25', [60, 64, 67, 72, 65, 69, 72, 77, 67, 71, 74, 79], 0.035, 0.28),
  coin: [n('pulse12', hz(84), undefined, 0, 0.06, 0.28), n('pulse12', hz(91), undefined, 0.06, 0.26, 0.28)],
  bump: [n('square', 150, 90, 0, 0.08, 0.35)],
  break: [n('noise', 900, undefined, 0, 0.25, 0.35), n('square', 120, 60, 0, 0.12, 0.25)],
  stomp: [n('square', 330, 110, 0, 0.1, 0.4), n('noise', 1200, undefined, 0, 0.04, 0.2)],
  kick: [n('noise', 4000, undefined, 0, 0.03, 0.25), n('square', 900, 500, 0, 0.06, 0.25)],
  kill: [n('square', 800, 200, 0, 0.12, 0.25)],
  item: arp('pulse12', [67, 71, 74, 79, 83], 0.04, 0.25),
  throw: [n('pulse12', 1400, 500, 0, 0.08, 0.25)],
  burst: [n('noise', 2500, undefined, 0, 0.05, 0.15)],
  thud: [n('triangle', 160, 90, 0, 0.06, 0.4)],
  bounce: [n('triangle', 300, 700, 0, 0.12, 0.5)],
  poof: [n('noise', 600, undefined, 0, 0.12, 0.1)],
  reset: arp('pulse25', [72, 67, 64, 60], 0.05, 0.25),
  place: [n('square', 520, 520, 0, 0.03, 0.18)],
  erase: [n('square', 300, 220, 0, 0.04, 0.18)],
  toggle: arp('pulse12', [67, 74], 0.05, 0.2),
}

// ---------------------------------------------------------------------------------------------
// Music: an original 16-bar loop. Notes are [midi, sixteenths]; 0 is a rest.

type Line = [number, number][]
const C5 = 72,
  D5 = 74,
  E5 = 76,
  F5 = 77,
  G5 = 79,
  A5 = 81,
  B5 = 83,
  C6 = 84,
  D6 = 86,
  E6 = 88,
  F6 = 89,
  G6 = 91
const R = 0

const LEAD: Line = [
  // A
  [E5, 2], [G5, 2], [C6, 4], [B5, 2], [G5, 2], [E5, 4],
  [F5, 2], [A5, 2], [D6, 4], [C6, 2], [A5, 2], [F5, 4],
  [E5, 2], [G5, 2], [C6, 2], [E6, 2], [D6, 4], [C6, 2], [B5, 2],
  [A5, 2], [B5, 2], [C6, 4], [G5, 8],
  [E5, 2], [G5, 2], [C6, 4], [B5, 2], [G5, 2], [E5, 4],
  [F5, 2], [A5, 2], [D6, 4], [F6, 2], [E6, 2], [D6, 4],
  [C6, 2], [B5, 2], [A5, 2], [G5, 2], [F5, 2], [E5, 2], [D5, 4],
  [C5, 8], [R, 8],
  // B
  [A5, 3], [A5, 1], [G5, 2], [A5, 2], [C6, 4], [A5, 4],
  [G5, 3], [G5, 1], [F5, 2], [G5, 2], [B5, 4], [G5, 4],
  [F5, 3], [F5, 1], [E5, 2], [F5, 2], [A5, 4], [C6, 4],
  [B5, 4], [D6, 4], [G6, 8],
  // A'
  [E5, 2], [G5, 2], [C6, 4], [B5, 2], [G5, 2], [E5, 4],
  [F5, 2], [A5, 2], [D6, 4], [C6, 2], [A5, 2], [F5, 4],
  [E6, 2], [D6, 2], [C6, 2], [B5, 2], [A5, 2], [G5, 2], [F5, 2], [D5, 2],
  [C6, 4], [G5, 2], [E5, 2], [C5, 8],
]

/** Chord root (midi, bass octave) per bar. */
const ROOTS = [48, 41, 48, 43, 48, 41, 43, 48, 45, 43, 41, 43, 48, 41, 43, 48]

const STEP = 60 / 150 / 4 // sixteenth at 150 bpm

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private noise: AudioBuffer | null = null
  private waves = new Map<Wave, PeriodicWave>()
  private musicTimer: number | null = null
  private musicStep = 0
  private musicAt = 0
  private lastPlayed = new Map<SoundName, number>()
  muted = false
  musicOn = true

  /** The audio context's state ('running' once sound is unlocked), or 'none' before the first try. */
  get state(): string {
    return this.ctx?.state ?? 'none'
  }

  /** Browsers only allow audio after a user gesture: call this from one. */
  unlock() {
    if (this.ctx) {
      // iPad Safari leaves audio 'interrupted' after switching apps; any tap brings it back.
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {})
      return
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.5
    this.master.connect(ctx.destination)
    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.9
    this.sfxBus.connect(this.master)
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.28
    this.musicBus.connect(this.master)
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.noise = buf
    for (const [w, duty] of [
      ['pulse25', 0.25],
      ['pulse12', 0.125],
    ] as const)
      this.waves.set(w, pulseWave(ctx, duty))
    if (this.musicOn) this.startMusic()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02)
  }

  setMusic(on: boolean) {
    this.musicOn = on
    if (on) this.startMusic()
    else this.stopMusic()
  }

  play(name: SoundName, volume = 1) {
    const ctx = this.ctx
    if (!ctx || !this.sfxBus || this.muted || volume <= 0) return
    // The same sound many times in one frame (a shell through a line of enemies) plays once.
    const now = ctx.currentTime
    const last = this.lastPlayed.get(name) ?? -1
    if (now - last < 0.03) return
    this.lastPlayed.set(name, now)
    for (const note of SOUNDS[name]) this.voice(note, now, this.sfxBus, volume)
  }

  private voice(note: Note, base: number, bus: AudioNode, volume: number) {
    const ctx = this.ctx!
    const t0 = base + note.at
    const t1 = t0 + note.dur
    const gain = ctx.createGain()
    const v = note.vol * volume
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(v, t0 + 0.005)
    gain.gain.setValueAtTime(v, Math.max(t0 + 0.005, t1 - Math.min(0.05, note.dur * 0.4)))
    gain.gain.linearRampToValueAtTime(0, t1)
    gain.connect(bus)
    if (note.wave === 'noise') {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = note.f0
      filter.Q.value = 0.8
      src.connect(filter)
      filter.connect(gain)
      src.start(t0, Math.random())
      src.stop(t1 + 0.02)
      return
    }
    const osc = ctx.createOscillator()
    const pw = this.waves.get(note.wave)
    if (pw) osc.setPeriodicWave(pw)
    else osc.type = note.wave as OscillatorType
    osc.frequency.setValueAtTime(note.f0, t0)
    if (note.f1 && note.f1 !== note.f0) {
      if (note.curve === 'lin') osc.frequency.linearRampToValueAtTime(note.f1, t1)
      else osc.frequency.exponentialRampToValueAtTime(note.f1, t1)
    }
    osc.connect(gain)
    osc.start(t0)
    osc.stop(t1 + 0.02)
  }

  // --- Music ------------------------------------------------------------------------------------

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return
    this.musicAt = this.ctx.currentTime + 0.1
    this.musicStep = 0
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50)
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer)
    this.musicTimer = null
  }

  private scheduleMusic() {
    const ctx = this.ctx
    const bus = this.musicBus
    if (!ctx || !bus) return
    const leadSteps = LEAD.reduce((s, [, d]) => s + d, 0)
    // Keep a quarter second of music queued.
    while (this.musicAt < ctx.currentTime + 0.25) {
      const step = this.musicStep % leadSteps
      const t = this.musicAt
      // Lead
      let acc = 0
      for (const [m, d] of LEAD) {
        if (acc === step && m !== R) this.voice(n('pulse25', hz(m), undefined, 0, d * STEP * 0.92, 0.35), t, bus, 1)
        acc += d
        if (acc > step) break
      }
      const bar = Math.floor(step / 16) % ROOTS.length
      const inBar = step % 16
      const root = ROOTS[bar]
      // Bass: root, fifth, octave, fifth in eighths.
      if (inBar % 2 === 0) {
        const pattern = [0, 7, 12, 7]
        this.voice(n('triangle', hz(root + pattern[(inBar / 2) % 4]), undefined, 0, STEP * 1.8, 0.7), t, bus, 1)
      }
      // Off-beat chord stab.
      if (inBar % 4 === 2) {
        this.voice(n('pulse12', hz(root + 24 + 4), undefined, 0, STEP * 0.8, 0.12), t, bus, 1)
        this.voice(n('pulse12', hz(root + 24 + 7), undefined, 0, STEP * 0.8, 0.12), t, bus, 1)
      }
      // Drums: kick on 1 and 3, snare on 2 and 4, hats on eighths.
      if (inBar === 0 || inBar === 8) this.voice(n('triangle', 150, 45, 0, 0.1, 0.8), t, bus, 1)
      if (inBar === 4 || inBar === 12) this.voice(n('noise', 1800, undefined, 0, 0.1, 0.35), t, bus, 1)
      if (inBar % 2 === 0) this.voice(n('noise', 7000, undefined, 0, 0.025, 0.12), t, bus, 1)
      this.musicStep++
      this.musicAt += STEP
    }
  }
}

function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const N = 32
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  for (let k = 1; k < N; k++) {
    real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.cos(k * Math.PI * duty)
    imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.sin(k * Math.PI * duty)
  }
  return ctx.createPeriodicWave(real, imag)
}
