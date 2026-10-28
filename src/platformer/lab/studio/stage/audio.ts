import type { RuntimeNote, World } from '../../core/contracts'

export interface SoundSource {
  stop(): void
}

/**
 * Handles sound runtime notes from the core simulation.
 * Decoupled from DOM/AudioContext for testability and safety.
 */
export class AudioManager {
  private activeSounds = new Set<SoundSource>()
  private audioCtx: AudioContext | null = null
  private audioBufferCache = new Map<string, AudioBuffer>()

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtxClass) {
        try {
          this.audioCtx = new AudioCtxClass()
        } catch {
          this.audioCtx = null
        }
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  handleNote(note: RuntimeNote, world: World): void {
    if (note.kind === 'stopSounds') {
      this.stopAll()
      return
    }

    if (note.kind !== 'sound') return

    // Find the target & sound definition
    const target = world.targets.find((t) => t.id === note.targetId) ?? (world.stage.id === note.targetId ? world.stage : undefined)
    const brick = target ? world.bricks[target.brickId] : undefined
    const soundDef = brick?.sounds.find((s) => s.name === note.sound)
    if (!soundDef?.asset) return

    this.playSound(soundDef.asset, note.volume, note.pitch, note.pan)
  }

  playSound(assetDataUrl: string, volume = 100, pitch = 0, _pan = 0): void {
    // Scratch volume is 0..100
    const gainVal = Math.max(0, Math.min(1, volume / 100))
    // Scratch pitch effect: +10 units is 1 semitone (playback rate = 2 ^ (pitch / 120))
    const playbackRate = Math.max(0.1, Math.min(4, Math.pow(2, pitch / 120)))

    const ctx = this.getContext()
    if (ctx) {
      this.playViaWebAudio(ctx, assetDataUrl, gainVal, playbackRate)
    } else if (typeof Audio !== 'undefined') {
      this.playViaAudioElement(assetDataUrl, gainVal, playbackRate)
    }
  }

  private async playViaWebAudio(ctx: AudioContext, asset: string, gainVal: number, playbackRate: number): Promise<void> {
    try {
      let buffer = this.audioBufferCache.get(asset)
      if (!buffer) {
        const resp = await fetch(asset)
        const arrayBuf = await resp.arrayBuffer()
        buffer = await ctx.decodeAudioData(arrayBuf)
        this.audioBufferCache.set(asset, buffer)
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = playbackRate

      const gainNode = ctx.createGain()
      gainNode.gain.value = gainVal

      source.connect(gainNode)
      gainNode.connect(ctx.destination)

      const handle: SoundSource = {
        stop: () => {
          try {
            source.stop()
          } catch {
            // Already ended
          }
        },
      }

      this.activeSounds.add(handle)
      source.onended = () => {
        this.activeSounds.delete(handle)
      }

      source.start(0)
    } catch {
      // Fallback or decode failure
    }
  }

  private playViaAudioElement(asset: string, gainVal: number, playbackRate: number): void {
    try {
      const audio = new Audio(asset)
      audio.volume = gainVal
      audio.playbackRate = playbackRate
      const handle: SoundSource = {
        stop: () => {
          audio.pause()
          audio.currentTime = 0
        },
      }
      this.activeSounds.add(handle)
      audio.onended = () => {
        this.activeSounds.delete(handle)
      }
      audio.play().catch(() => {})
    } catch {
      // Ignore
    }
  }

  stopAll(): void {
    for (const s of this.activeSounds) {
      s.stop()
    }
    this.activeSounds.clear()
  }

  destroy(): void {
    this.stopAll()
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {})
      this.audioCtx = null
    }
  }
}
