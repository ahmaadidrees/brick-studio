/**
 * A sound still loading when the kid presses Stop (or leaves Play) must not start once it has loaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioManager } from './audio'

/** A fake Web Audio context whose decodes wait until the test finishes them. */
function fakeAudio() {
  const decodes: Array<() => void> = []
  const starts: string[] = []
  let decodeCalls = 0
  class FakeContext {
    state = 'running'
    destination = {}
    resume() { return Promise.resolve() }
    close() { return Promise.resolve() }
    decodeAudioData() {
      decodeCalls++
      return new Promise((resolve) => { decodes.push(() => resolve({ duration: 1 })) })
    }
    createGain() { return { gain: { value: 1 }, connect() {} } }
    createBufferSource() {
      const source = { buffer: null, playbackRate: { value: 1 }, onended: null, connect() {}, start: () => { starts.push('start') }, stop() {} }
      return source
    }
  }
  return { FakeContext, decodes, starts, decodeCalls: () => decodeCalls }
}

/** Let every pending promise callback run. */
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('sounds and Stop', () => {
  let audio: ReturnType<typeof fakeAudio>
  beforeEach(() => {
    audio = fakeAudio()
    vi.stubGlobal('AudioContext', audio.FakeContext)
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('a sound that loads normally plays', async () => {
    const manager = new AudioManager()
    manager.playSound('data:audio/wav;base64,AA==')
    await settle()
    audio.decodes.forEach((finish) => finish())
    await settle()
    expect(audio.starts).toEqual(['start'])
  })

  it('a sound still loading when Stop is pressed never starts', async () => {
    const manager = new AudioManager()
    manager.playSound('data:audio/wav;base64,AA==')
    await settle()
    manager.stopAll()
    audio.decodes.forEach((finish) => finish())
    await settle()
    expect(audio.starts).toEqual([])
    // The next play after Stop works, and uses the sound already loaded.
    manager.playSound('data:audio/wav;base64,AA==')
    await settle()
    expect(audio.starts).toEqual(['start'])
    expect(audio.decodeCalls()).toBe(1)
  })

  it('a sound still loading when Play is left (destroy) never starts', async () => {
    const manager = new AudioManager()
    manager.playSound('data:audio/wav;base64,AA==')
    await settle()
    manager.destroy()
    audio.decodes.forEach((finish) => finish())
    await settle()
    expect(audio.starts).toEqual([])
  })

  it('the same sound asked for twice while loading loads once and plays twice', async () => {
    const manager = new AudioManager()
    manager.playSound('data:audio/wav;base64,AA==')
    manager.playSound('data:audio/wav;base64,AA==')
    await settle()
    expect(audio.decodeCalls()).toBe(1)
    audio.decodes.forEach((finish) => finish())
    await settle()
    expect(audio.starts).toEqual(['start', 'start'])
  })
})
