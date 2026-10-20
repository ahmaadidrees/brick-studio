import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ASSIGNMENTS, IDLE_BOARD, actionsFor, cleanAssignments, resolve, tiltAxis } from './assign'
import { LineSplitter, formatMessage, parseLine } from './protocol'
import { reactionCommands, useMicrobit } from './store'
import { Input } from '../platformer/input/input'
import { carInputFrom } from '../platformer/race/raceRun'

describe('micro:bit protocol', () => {
  it('reads the remote program’s lines and ignores anything else', () => {
    expect(parseLine('bg 1')).toEqual({ t: 'hello', version: 1 })
    expect(parseLine('a 1')).toEqual({ t: 'pin', pin: 'a', down: true })
    expect(parseLine('P0 0\r')).toEqual({ t: 'pin', pin: 'p0', down: false })
    expect(parseLine('tilt 5000 -40')).toEqual({ t: 'tilt', x: 1024, y: -40 })
    expect(parseLine('g shake')).toEqual({ t: 'gesture', g: 'shake' })
    for (const junk of ['', 'MicroPython v1.18', 'a 2', 'tilt x 1', 'g wiggle', '>>> ', 'hello world']) expect(parseLine(junk)).toBeNull()
  })

  it('writes commands the remote program understands', () => {
    expect(formatMessage({ t: 'show', image: 'heart' })).toBe('show heart')
    expect(formatMessage({ t: 'text', text: 'lap\n2' })).toBe('text lap 2')
    expect(formatMessage({ t: 'tone', hz: 5, ms: 99999 })).toBe('tone 20 5000')
  })

  it('splits a stream into lines, keeping partial ones', () => {
    const s = new LineSplitter()
    expect(s.push('a 1\nti')).toEqual(['a 1'])
    expect(s.push('lt 3 4\r\n\n')).toEqual(['tilt 3 4'])
  })
})

describe('assignments', () => {
  it('only lets tilt be a stick', () => {
    expect(actionsFor('race', 'tilt')).toEqual(['nothing', 'steer'])
    expect(actionsFor('race', 'a')).not.toContain('steer')
    expect(cleanAssignments('platformer', { a: 'walk', tilt: 'jump', b: 'jump' })).toMatchObject({ a: 'jump', tilt: 'walk', b: 'jump' })
  })

  it('turns a board into game actions', () => {
    const board = { ...IDLE_BOARD, pins: { ...IDLE_BOARD.pins, a: true }, tilt: { x: -900, y: 0 }, pulses: { shake: 200 } }
    const out = resolve(DEFAULT_ASSIGNMENTS.platformer, board, 100)
    expect([...out.held].sort()).toEqual(['jump', 'left'])
    expect(out.stick?.x).toBe(-1)
    expect(resolve(DEFAULT_ASSIGNMENTS.platformer, board, 300).held.has('jump')).toBe(true) // A still held
    expect(tiltAxis(50)).toBe(0)
  })

  it('turns reactions into commands', () => {
    expect(reactionCommands({ show: 'count', sound: 'none' }, 2)).toEqual([{ t: 'num', n: 2 }])
    expect(reactionCommands({ show: 'heart', sound: 'nyan' })).toEqual([{ t: 'show', image: 'heart' }, { t: 'tune', name: 'nyan' }])
  })
})

describe('micro:bit into the 2D game input', () => {
  beforeEach(() => useMicrobit.getState().releaseAll())

  it('presses jump once on the way down, and steers a race car by tilt', () => {
    const input = new Input()
    const mb = useMicrobit.getState()
    mb.setPin('a', true)
    const f1 = input.frame()
    expect(f1.jump && f1.jumpPressed).toBe(true)
    expect(input.frame().jumpPressed).toBe(false)
    mb.setPin('a', false)
    expect(input.frame().jump).toBe(false)

    input.remoteMode = () => 'race'
    mb.setTilt(400, 0)
    mb.setPin('a', true)
    const f = input.frame()
    expect(f.up).toBe(true) // A is gas
    const car = { a: 0 } as Parameters<typeof carInputFrom>[2]
    const drive = carInputFrom(f, 'turn' as Parameters<typeof carInputFrom>[1], car)
    expect(drive.gas).toBe(true)
    expect(drive.steer).toBeGreaterThan(0.4)
    expect(drive.steer).toBeLessThan(1)
  })
})

describe('micro:bit in the 3D world', () => {
  beforeEach(() => useMicrobit.getState().releaseAll())

  it('walks by tilt and jumps once per press', async () => {
    const { Remote3D } = await import('./remote3d')
    const r = new Remote3D()
    const mb = useMicrobit.getState()
    mb.setTilt(0, 1024) // logo end tipped away: forward
    mb.setPin('a', true)
    const f = r.poll()
    expect(f.z).toBe(1)
    expect(f.jumpPressed).toBe(true)
    expect(r.poll().jumpPressed).toBe(false)
    r.reset()
    mb.setPin('a', false)
    mb.setPin('a', true)
    expect(r.poll().jumpPressed).toBe(false) // held across a pause doesn't fire
  })
})
