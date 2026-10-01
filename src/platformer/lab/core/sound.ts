/**
 * Sound primitives (Scratch opcodes `sound_*`).
 *
 * Sound playback, effects (pitch, pan), and volume. Primitives emit `RuntimeNote`s;
 * no actual audio synthesis or decoding happens in the core runtime.
 * Timed play-until-done yields until `runtime.nowMs()` reaches the sound duration.
 */
import { YIELD } from './contracts'
import type { PrimitiveCtx, PrimitiveTable, RuntimeApi, Sound, Target, World } from './contracts'

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

function read(ctx: PrimitiveCtx, name: string): unknown {
  const value = ctx.arg(name)
  return value !== '' ? value : ctx.field(name)
}

function isWhiteSpace(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length === 0
}

function soundsOf(world: World, target: Target): Sound[] {
  return world.bricks[target.brickId]?.sounds ?? []
}

/** 0-based wrapped index into a list of length. Non-finite values return 0. */
function wrapIndex(index: number, length: number): number {
  if (!(length > 0)) return 0
  const rounded = Math.round(index)
  if (!Number.isFinite(rounded)) return 0
  return rounded - Math.floor(rounded / length) * length
}

/**
 * Resolve sound according to L01 / Scratch semantics:
 * 1. Numbers are 1-based indices that wrap into the sounds array.
 * 2. Strings first check for an exact, case-sensitive sound name.
 * 3. If not matched, non-whitespace numeric strings convert to a 1-based wrapped index.
 * 4. Otherwise, returns undefined.
 */
export function resolveSound(world: World, target: Target, requested: unknown): Sound | undefined {
  const sounds = soundsOf(world, target)
  if (sounds.length === 0) return undefined

  if (typeof requested === 'number') {
    if (!Number.isFinite(requested)) return undefined
    const idx = wrapIndex(requested - 1, sounds.length)
    return sounds[idx]
  }

  const name = String(requested)

  // 1. Exact match by name
  for (let i = 0; i < sounds.length; i++) {
    if (sounds[i].name === name) return sounds[i]
  }

  // 2. Numeric string
  if (!isWhiteSpace(name)) {
    const parsed = Number(name)
    if (!Number.isNaN(parsed)) {
      const idx = wrapIndex(parsed - 1, sounds.length)
      return sounds[idx]
    }
  }

  return undefined
}

export function clampPitch(value: number): number {
  return Math.min(360, Math.max(-360, value))
}

export function clampPan(value: number): number {
  return Math.min(100, Math.max(-100, value))
}

export function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function clearSoundEffects(target: Target): void {
  target.soundEffects.pitch = 0
  target.soundEffects.pan = 0
}

export function onGreenFlagSound(runtime: RuntimeApi): void {
  for (const target of [runtime.world.stage, ...runtime.world.targets]) {
    clearSoundEffects(target)
  }
}

export function onStopAllSound(runtime: RuntimeApi): void {
  runtime.emit({ kind: 'stopSounds' })
  onGreenFlagSound(runtime)
}

function emitSoundNote(runtime: RuntimeApi, target: Target, sound: Sound): void {
  runtime.emit({
    kind: 'sound',
    targetId: target.id,
    sound: sound.name,
    volume: target.volume,
    pitch: target.soundEffects.pitch,
    pan: target.soundEffects.pan,
  })
}

export const soundPrimitives: PrimitiveTable = {
  sound_play(ctx) {
    const requested = read(ctx, 'SOUND_MENU') !== '' ? read(ctx, 'SOUND_MENU') : read(ctx, 'SOUND')
    const sound = resolveSound(ctx.runtime.world, ctx.target, requested)
    if (!sound) return
    emitSoundNote(ctx.runtime, ctx.target, sound)
  },

  sound_playuntildone(ctx) {
    if (ctx.frame.started !== true) {
      const requested = read(ctx, 'SOUND_MENU') !== '' ? read(ctx, 'SOUND_MENU') : read(ctx, 'SOUND')
      const sound = resolveSound(ctx.runtime.world, ctx.target, requested)
      if (!sound) return
      emitSoundNote(ctx.runtime, ctx.target, sound)
      ctx.frame.started = true
      const ms = Math.max(0, sound.durationMs)
      ctx.frame.endMs = ctx.runtime.nowMs() + ms
      return YIELD
    }
    if (ctx.runtime.nowMs() < (ctx.frame.endMs as number)) return YIELD
  },

  sound_stopallsounds(ctx) {
    ctx.runtime.emit({ kind: 'stopSounds' })
  },

  sound_changeeffectby(ctx) {
    const effect = String(read(ctx, 'EFFECT')).toLowerCase()
    const rawVal = read(ctx, 'VALUE') !== '' ? read(ctx, 'VALUE') : read(ctx, 'CHANGE')
    const delta = asNumber(rawVal)
    if (effect === 'pitch') {
      ctx.target.soundEffects.pitch = clampPitch(ctx.target.soundEffects.pitch + delta)
    } else if (effect === 'pan') {
      ctx.target.soundEffects.pan = clampPan(ctx.target.soundEffects.pan + delta)
    }
  },

  sound_seteffectto(ctx) {
    const effect = String(read(ctx, 'EFFECT')).toLowerCase()
    const val = asNumber(read(ctx, 'VALUE'))
    if (effect === 'pitch') {
      ctx.target.soundEffects.pitch = clampPitch(val)
    } else if (effect === 'pan') {
      ctx.target.soundEffects.pan = clampPan(val)
    }
  },

  sound_cleareffects(ctx) {
    clearSoundEffects(ctx.target)
  },

  sound_changevolumeby(ctx) {
    const delta = asNumber(read(ctx, 'VOLUME'))
    ctx.target.volume = clampVolume(ctx.target.volume + delta)
  },

  sound_setvolumeto(ctx) {
    const val = asNumber(read(ctx, 'VOLUME'))
    ctx.target.volume = clampVolume(val)
  },

  sound_volume(ctx) {
    return Math.round(ctx.target.volume)
  },
}
