import { describe, expect, it } from 'vitest'
import { buildSoundLibrary, encodeWav, getSoundLibrary } from './soundLibrary'

describe('soundLibrary and WAV generator', () => {
  it('generates a valid RIFF 16-bit PCM mono WAV header', () => {
    const sampleRate = 22050
    const durationMsExpected = 200 // 0.2 seconds = 4410 samples
    const numSamples = 4410
    const samples = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate)
    }

    const { buffer, asset, durationMs } = encodeWav(samples, sampleRate)
    expect(durationMs).toBe(durationMsExpected)
    expect(asset.startsWith('data:audio/wav;base64,')).toBe(true)

    // Check file size
    const expectedDataSize = numSamples * 2
    expect(buffer.length).toBe(44 + expectedDataSize)

    // Check RIFF header magic
    const ascii = (start: number, len: number) =>
      String.fromCharCode(...buffer.subarray(start, start + len))
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(12, 4)).toBe('fmt ')
    expect(ascii(36, 4)).toBe('data')

    const view = new DataView(buffer.buffer)
    expect(view.getUint32(4, true)).toBe(36 + expectedDataSize) // File size - 8
    expect(view.getUint32(16, true)).toBe(16) // Subchunk1Size = 16 for PCM
    expect(view.getUint16(20, true)).toBe(1) // AudioFormat = 1 (PCM)
    expect(view.getUint16(22, true)).toBe(1) // NumChannels = 1 (mono)
    expect(view.getUint32(24, true)).toBe(sampleRate) // SampleRate
    expect(view.getUint32(28, true)).toBe(sampleRate * 2) // ByteRate
    expect(view.getUint16(32, true)).toBe(2) // BlockAlign = 2
    expect(view.getUint16(34, true)).toBe(16) // BitsPerSample = 16
    expect(view.getUint32(40, true)).toBe(expectedDataSize) // Subchunk2Size
  })

  it('builds sound library with all required retro effects', () => {
    const lib = buildSoundLibrary()
    const names = lib.map((s) => s.name)
    expect(names).toContain('jump')
    expect(names).toContain('coin')
    expect(names).toContain('pop')
    expect(names).toContain('boing')
    expect(names).toContain('laser')
    expect(names).toContain('hit')
    expect(names).toContain('win')

    for (const sound of lib) {
      expect(sound.durationMs).toBeGreaterThan(0)
      expect(sound.durationMs).toBeLessThan(2000)
      expect(sound.asset).toBeDefined()
      expect(sound.asset!.startsWith('data:audio/wav;base64,')).toBe(true)
    }
  })

  it('returns cached sound library instance', () => {
    const lib1 = getSoundLibrary()
    const lib2 = getSoundLibrary()
    expect(lib1).toBe(lib2)
    expect(lib1.length).toBeGreaterThanOrEqual(7)
  })
})
