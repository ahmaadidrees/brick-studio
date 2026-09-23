import { describe, expect, it } from 'vitest'
import { createArbiter, type ArbiterDevice } from './arbiter'
import type { ActuatorIntent, IntentSource } from './types'

const DEVICES: ArbiterDevice[] = [
  { id: 'left', kind: 'motor', name: 'Left motor', plugged: true },
  { id: 'right', kind: 'motor', name: 'Right motor', plugged: true },
  { id: 'arm', kind: 'hinge', name: 'Arm motor', plugged: true },
  { id: 'lamp', kind: 'light', name: 'Light', plugged: true },
  { id: 'loose', kind: 'motor', name: 'Back motor', plugged: false },
]
const script = (scriptId: string, blockId: string, controller = false): IntentSource => ({ scriptId, blockId, controller })
const power = (deviceId: string, percent: number, source: IntentSource): ActuatorIntent => ({ kind: 'motorPower', deviceId, percent, source })

describe('the arbiter', () => {
  it('keeps one command per actuator: the later autonomous script wins, with one info on the overruled block', () => {
    const arbiter = createArbiter(DEVICES)
    const first = arbiter.arbitrate([power('left', 40, script('a', 'a1')), power('right', 40, script('a', 'a2')), power('left', -20, script('b', 'b1'))])
    expect(first.winners.map((winner) => [winner.deviceId, winner.intent.source.scriptId])).toEqual([['left', 'b'], ['right', 'a']])
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'power', percent: -20 })
    expect(first.diagnostics).toEqual([{ code: 'runtime.two-scripts-one-motor', severity: 'info', message: 'Another script also drives Left motor; the later script wins, so this block was overruled.', blockId: 'a1', deviceId: 'left', scriptId: 'a' }])
    // The same conflict next tick is not reported again.
    const second = arbiter.arbitrate([power('left', 40, script('a', 'a1')), power('left', -20, script('b', 'b1'))])
    expect(second.diagnostics).toEqual([])
  })

  it('one script writing the same motor twice in a tick keeps its last word, silently', () => {
    const arbiter = createArbiter(DEVICES)
    const result = arbiter.arbitrate([power('left', 40, script('a', 'a1')), { kind: 'motorStop', deviceId: 'left', source: script('a', 'a2') }])
    expect(result.winners).toHaveLength(1)
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'stop' })
    expect(result.diagnostics).toEqual([])
  })

  it('a controller script wins for the actuators it wrote; the others follow the autonomous scripts', () => {
    const arbiter = createArbiter(DEVICES)
    const result = arbiter.arbitrate([power('left', 40, script('auto', 'x1')), power('right', 40, script('auto', 'x2')), power('left', 90, script('pad', 'p1', true))])
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'power', percent: 90 })
    expect(arbiter.motorCommand('right')).toEqual({ kind: 'power', percent: 40 })
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.blockId])).toEqual([['runtime.two-scripts-one-motor', 'x1']])
    // Even out of order, a controller intent is not overruled by an autonomous one.
    arbiter.arbitrate([power('left', 70, script('pad', 'p1', true)), power('left', 10, script('auto', 'x1'))])
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'power', percent: 70 })
  })

  it('drops intents for unplugged devices with one warning per device, and for parts outside the creation', () => {
    const arbiter = createArbiter(DEVICES)
    const first = arbiter.arbitrate([power('loose', 40, script('a', 'a1')), power('left', 40, script('a', 'a2')), power('ghost', 40, script('a', 'a3'))])
    expect(first.winners.map((winner) => winner.deviceId)).toEqual(['left'])
    expect(first.diagnostics).toEqual([
      { code: 'device.unplugged', severity: 'warning', message: 'Back motor is not plugged in, so it did nothing', blockId: 'a1', deviceId: 'loose', scriptId: 'a' },
      { code: 'device.not-in-creation', severity: 'warning', message: 'That part is not part of this creation, so it did nothing.', blockId: 'a3', deviceId: 'ghost', scriptId: 'a' },
    ])
    expect(arbiter.arbitrate([power('loose', 50, script('b', 'b1'))]).diagnostics).toEqual([])
    expect(arbiter.motorCommand('loose')).toEqual({ kind: 'stop' })
  })

  it('commands latch until replaced; only a change is reported as changed', () => {
    const arbiter = createArbiter(DEVICES)
    expect(arbiter.arbitrate([power('left', 40, script('a', 'a1'))]).changed).toHaveLength(1)
    expect(arbiter.arbitrate([power('left', 40, script('a', 'a1'))]).changed).toHaveLength(0)
    expect(arbiter.arbitrate([]).winners).toHaveLength(0)
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'power', percent: 40 })
    expect(arbiter.arbitrate([{ kind: 'motorTarget', deviceId: 'arm', degrees: 90, source: script('a', 'a3') }]).changed).toHaveLength(1)
    expect(arbiter.motorCommand('arm')).toEqual({ kind: 'target', degrees: 90 })
    expect(arbiter.arbitrate([{ kind: 'light', deviceId: 'lamp', color: 'red', source: script('a', 'a4') }]).changed).toHaveLength(1)
    expect(arbiter.lightColor('lamp')).toBe('red')
    arbiter.stopAll()
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'stop' })
    expect(arbiter.motorCommand('arm')).toEqual({ kind: 'stop' })
    expect(arbiter.lightColor('lamp')).toBe('red')
    arbiter.reset()
    expect(arbiter.lights()).toEqual({ lamp: null })
  })

  it('clamps power, drops non-finite numbers and ignores an intent of the wrong kind for the device', () => {
    const arbiter = createArbiter(DEVICES)
    arbiter.arbitrate([power('left', 250, script('a', 'a1')), power('right', Number.NaN, script('a', 'a2')), { kind: 'light', deviceId: 'left', color: 'red', source: script('a', 'a3') }, power('lamp', 50, script('a', 'a4'))])
    expect(arbiter.motorCommand('left')).toEqual({ kind: 'power', percent: 100 })
    expect(arbiter.motorCommand('right')).toEqual({ kind: 'stop' })
    expect(arbiter.lightColor('lamp')).toBeNull()
  })

  it('reset forgets the once-per-run notes', () => {
    const arbiter = createArbiter(DEVICES)
    expect(arbiter.arbitrate([power('loose', 40, script('a', 'a1'))]).diagnostics).toHaveLength(1)
    arbiter.reset()
    expect(arbiter.arbitrate([power('loose', 40, script('a', 'a1'))]).diagnostics).toHaveLength(1)
  })
})
