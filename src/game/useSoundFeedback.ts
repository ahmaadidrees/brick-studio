import { useEffect, useRef } from 'react'
import { useGameStore } from '../state/useGameStore'

type Tone = { frequency: number; offset?: number; duration?: number; volume?: number }

function playTones(tones: Tone[]) {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const now = context.currentTime

  for (const tone of tones) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = now + (tone.offset ?? 0)
    const duration = tone.duration ?? 0.09
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(tone.frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(tone.volume ?? 0.055, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  window.setTimeout(() => void context.close(), 900)
}

export function useSoundFeedback() {
  const connectionCount = useGameStore((state) => state.connections.length)
  const status = useGameStore((state) => state.simulationStatus)
  const previousConnectionCount = useRef(connectionCount)
  const previousStatus = useRef(status)

  useEffect(() => {
    if (connectionCount > previousConnectionCount.current) {
      playTones([
        { frequency: 520, duration: 0.07, volume: 0.04 },
        { frequency: 720, offset: 0.055, duration: 0.09, volume: 0.045 },
      ])
    }
    previousConnectionCount.current = connectionCount
  }, [connectionCount])

  useEffect(() => {
    if (status === 'running' && previousStatus.current !== 'running') {
      playTones([{ frequency: 180, duration: 0.13, volume: 0.035 }, { frequency: 260, offset: 0.08, duration: 0.1, volume: 0.03 }])
    }
    if (status === 'complete' && previousStatus.current !== 'complete') {
      playTones([
        { frequency: 523, duration: 0.22 },
        { frequency: 659, offset: 0.12, duration: 0.25 },
        { frequency: 784, offset: 0.24, duration: 0.36, volume: 0.065 },
      ])
    }
    previousStatus.current = status
  }, [status])
}
