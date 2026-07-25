type Tone = { frequency: number; offset: number; duration: number; volume: number }

// Soft two-tone "snap" for a confirmed placement.
const PLACE_CLICK_TONES: Tone[] = [
  { frequency: 340, offset: 0, duration: 0.05, volume: 0.04 },
  { frequency: 560, offset: 0.03, duration: 0.08, volume: 0.05 },
]

// Lower and quieter than the place snap so picking a brick up never reads as a
// confirmed placement.
const GRAB_TICK_TONES: Tone[] = [{ frequency: 210, offset: 0, duration: 0.07, volume: 0.03 }]

// One shared context: browsers cap live AudioContext instances, and reusing it
// avoids per-click construction. Placement always follows a user gesture, so
// resume() is allowed to lift the autoplay suspension.
let sharedContext: AudioContext | null = null

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return null
  sharedContext ??= new AudioContextClass()
  if (sharedContext.state === 'suspended') void sharedContext.resume()
  return sharedContext
}

function playTones(tones: Tone[]) {
  const context = ensureAudioContext()
  if (!context) return
  const now = context.currentTime

  for (const tone of tones) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = now + tone.offset
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(tone.frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + tone.duration + 0.02)
  }
}

export function playPlaceClick() {
  playTones(PLACE_CLICK_TONES)
}

export function playGrabTick() {
  playTones(GRAB_TICK_TONES)
}
