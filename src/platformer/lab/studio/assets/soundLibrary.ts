import type { Sound } from '../../core/contracts'

const SAMPLE_RATE = 22050

/**
 * Encode raw mono float32 audio samples (-1.0 to 1.0) into a standard 16-bit PCM RIFF WAV data URL.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number = SAMPLE_RATE
): { buffer: Uint8Array; asset: string; durationMs: number } {
  const numSamples = samples.length
  const dataSize = numSamples * 2
  const fileSize = 44 + dataSize
  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  // RIFF identifier
  buffer[0] = 0x52 // 'R'
  buffer[1] = 0x49 // 'I'
  buffer[2] = 0x46 // 'F'
  buffer[3] = 0x46 // 'F'
  view.setUint32(4, 36 + dataSize, true)

  // WAVE identifier
  buffer[8] = 0x57 // 'W'
  buffer[9] = 0x41 // 'A'
  buffer[10] = 0x56 // 'V'
  buffer[11] = 0x45 // 'E'

  // 'fmt ' chunk
  buffer[12] = 0x66 // 'f'
  buffer[13] = 0x6d // 'm'
  buffer[14] = 0x74 // 't'
  buffer[15] = 0x20 // ' '
  view.setUint32(16, 16, true) // Subchunk1Size for PCM
  view.setUint16(20, 1, true) // AudioFormat 1 = PCM
  view.setUint16(22, 1, true) // NumChannels = 1 (mono)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // ByteRate = sampleRate * numChannels * bitsPerSample / 8
  view.setUint16(32, 2, true) // BlockAlign = numChannels * bitsPerSample / 8
  view.setUint16(34, 16, true) // BitsPerSample = 16

  // 'data' chunk
  buffer[36] = 0x64 // 'd'
  buffer[37] = 0x61 // 'a'
  buffer[38] = 0x74 // 't'
  buffer[39] = 0x61 // 'a'
  view.setUint32(40, dataSize, true)

  // Write 16-bit PCM samples
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(offset, Math.round(int16), true)
    offset += 2
  }

  // Base64 encoding
  let binary = ''
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
  }
  const asset = `data:audio/wav;base64,${btoa(binary)}`
  const durationMs = Math.round((numSamples / sampleRate) * 1000)

  return { buffer, asset, durationMs }
}

/** Synthesize a custom tone buffer */
function createBuffer(durationSec: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.floor(durationSec * sampleRate))
}

// ------------------------------------------------------------- Retro sound synthesizers

function synthJump(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.18
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    // Frequency sweeps up from 150 to 600 Hz
    const freq = 150 + 450 * Math.pow(t, 0.7)
    phase += (2 * Math.PI * freq) / sampleRate
    // Square wave with envelope
    const env = 1 - t
    const wave = Math.sin(phase) > 0 ? 0.6 : -0.6
    samples[i] = wave * env
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'jump', durationMs, asset }
}

function synthCoin(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.32
  const samples = createBuffer(durationSec, sampleRate)
  const splitIndex = Math.floor(0.08 * sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const isFirstNote = i < splitIndex
    const freq = isFirstNote ? 987.77 : 1318.51 // B5 then E6
    phase += (2 * Math.PI * freq) / sampleRate
    const noteTime = isFirstNote ? i / splitIndex : (i - splitIndex) / (samples.length - splitIndex)
    const env = Math.exp(-noteTime * 3)
    const wave = Math.sin(phase) > 0 ? 0.5 : -0.5
    samples[i] = wave * env
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'coin', durationMs, asset }
}

function synthPop(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.06
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    const freq = 800 * Math.exp(-t * 8) + 120
    phase += (2 * Math.PI * freq) / sampleRate
    const env = Math.exp(-t * 6)
    samples[i] = Math.sin(phase) * env
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'pop', durationMs, asset }
}

function synthBoing(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.38
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    // Vibrato modulation
    const mod = Math.sin(2 * Math.PI * 18 * (i / sampleRate)) * 60
    const freq = 200 + mod + 100 * (1 - t)
    phase += (2 * Math.PI * freq) / sampleRate
    const env = Math.exp(-t * 3.5)
    // Triangle wave
    const wave = (2 / Math.PI) * Math.asin(Math.sin(phase))
    samples[i] = wave * env * 0.8
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'boing', durationMs, asset }
}

function synthLaser(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.16
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    const freq = 1200 * Math.exp(-t * 7) + 80
    phase += (2 * Math.PI * freq) / sampleRate
    const env = 1 - t
    // Sawtooth-like wave
    const wave = ((phase / Math.PI) % 2) - 1
    samples[i] = wave * env * 0.7
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'laser', durationMs, asset }
}

function synthHit(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.13
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  let noiseState = 0x1234
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    // Pseudo-random noise
    noiseState = (noiseState * 1664525 + 1013904223) >>> 0
    const noise = (noiseState / 0xffffffff) * 2 - 1
    const freq = 120 * Math.exp(-t * 5)
    phase += (2 * Math.PI * freq) / sampleRate
    const env = Math.exp(-t * 8)
    const crunch = (Math.sin(phase) * 0.4 + noise * 0.6) * env
    samples[i] = crunch
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'hit', durationMs, asset }
}

function synthWin(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.65
  const samples = createBuffer(durationSec, sampleRate)
  // Arpeggio: C5, E5, G5, C6
  const notes = [523.25, 659.25, 783.99, 1046.5]
  const noteDuration = 0.14
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate
    const noteIdx = Math.min(notes.length - 1, Math.floor(t / noteDuration))
    const freq = notes[noteIdx]
    phase += (2 * Math.PI * freq) / sampleRate
    const noteT = (t - noteIdx * noteDuration) / noteDuration
    const env = noteIdx === notes.length - 1 ? Math.exp(-(t - 3 * noteDuration) * 3) : Math.exp(-noteT * 2)
    const wave = Math.sin(phase) > 0 ? 0.45 : -0.45
    samples[i] = wave * env
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'win', durationMs, asset }
}

function synthPowerup(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.35
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    // Rapid arpeggiating chirp
    const step = Math.floor(t * 8)
    const baseFreq = 300 * Math.pow(1.15, step)
    phase += (2 * Math.PI * baseFreq) / sampleRate
    const env = 1 - t * 0.5
    const wave = (2 / Math.PI) * Math.asin(Math.sin(phase))
    samples[i] = wave * env * 0.6
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'powerup', durationMs, asset }
}

function synthStep(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.05
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  let noiseState = 0x5678
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    noiseState = (noiseState * 1664525 + 1013904223) >>> 0
    const noise = (noiseState / 0xffffffff) * 2 - 1
    const freq = 140 * Math.exp(-t * 10)
    phase += (2 * Math.PI * freq) / sampleRate
    const env = Math.exp(-t * 12)
    samples[i] = (Math.sin(phase) * 0.5 + noise * 0.5) * env
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'step', durationMs, asset }
}

function synthBuzzer(sampleRate = SAMPLE_RATE): Sound {
  const durationSec = 0.22
  const samples = createBuffer(durationSec, sampleRate)
  let phase = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length
    const freq = 110 // Low A buzz
    phase += (2 * Math.PI * freq) / sampleRate
    const env = Math.exp(-t * 2)
    const wave = Math.sin(phase) > 0 ? 0.6 : -0.6
    samples[i] = wave * env
  }
  const { asset, durationMs } = encodeWav(samples, sampleRate)
  return { name: 'buzzer', durationMs, asset }
}

/** Pre-built library of synthesized retro game sounds */
export function buildSoundLibrary(sampleRate = SAMPLE_RATE): Sound[] {
  return [
    synthJump(sampleRate),
    synthCoin(sampleRate),
    synthPop(sampleRate),
    synthBoing(sampleRate),
    synthLaser(sampleRate),
    synthHit(sampleRate),
    synthWin(sampleRate),
    synthPowerup(sampleRate),
    synthStep(sampleRate),
    synthBuzzer(sampleRate),
  ]
}

/** Cached instance of the standard sound library */
let cachedLibrary: Sound[] | null = null
export function getSoundLibrary(): Sound[] {
  if (!cachedLibrary) {
    cachedLibrary = buildSoundLibrary()
  }
  return cachedLibrary
}
