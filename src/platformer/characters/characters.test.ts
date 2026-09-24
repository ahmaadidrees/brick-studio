import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_OPTIONS, characterPreviewStyle, normalizeCharacterId } from './catalog'
import { characterFrame, drawGeneratedCharacter } from './atlas'
import { gaitLeg } from './locomotion'

afterEach(() => vi.unstubAllGlobals())

describe('character choices', () => {
  it('keeps a stable default and preserves every valid identity', () => {
    expect(CHARACTER_OPTIONS.map(({ id }) => id)).toEqual(['classic', 'builder', 'bolt-bot', 'brick-fox'])
    expect(normalizeCharacterId(undefined)).toBe('builder')
    expect(normalizeCharacterId('brick-fox')).toBe('brick-fox')
    expect(normalizeCharacterId('unknown')).toBe('builder')
  })

  it('shows one idle cell in each generated preview', () => {
    expect(characterPreviewStyle('builder')).toMatchObject({ backgroundSize: '600% 400%', backgroundPosition: 'left top' })
    expect(characterPreviewStyle('classic')).toMatchObject({ backgroundSize: 'contain', backgroundPosition: 'center' })
  })
})

describe('generated character frames', () => {
  it('plants each supporting foot, passes under the hips and alternates the legs', () => {
    for (const gait of ['walk', 'run'] as const) {
      const height = 23
      const poses = Array.from({ length: 100 }, (_, i) => gaitLeg(i / 100, gait, height, -height * 0.35))
      const support = poses.filter(pose => pose.planted)
      expect(support.every(pose => pose.ankle.y === -height * 0.088)).toBe(true)
      expect(support[0].ankle.x).toBeGreaterThan(0)
      expect(support.at(-1)!.ankle.x).toBeLessThan(0)
      expect(poses.filter(pose => !pose.planted).every(pose => pose.ankle.y <= -height * 0.088)).toBe(true)
      for (const pose of poses) {
        expect(Math.hypot(pose.knee.x - pose.hip.x, pose.knee.y - pose.hip.y)).toBeCloseTo(height * 0.20)
        expect(Math.hypot(pose.ankle.x - pose.knee.x, pose.ankle.y - pose.knee.y)).toBeCloseTo(height * 0.20)
      }
      expect(gaitLeg(0, gait, height, -height * 0.35)).toEqual(gaitLeg(1, gait, height, -height * 0.35))
      expect(gaitLeg(0.5, gait, height, -height * 0.35).ankle.x).toBeLessThan(0)
    }
  })

  it('loads the separate parts and mirrors the complete jointed character', () => {
    class MotionImage {
      decoding = ''
      src = ''
      naturalWidth = 1536
      naturalHeight = 1024
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      static images: MotionImage[] = []
      constructor() { MotionImage.images.push(this) }
    }
    vi.stubGlobal('Image', MotionImage)
    const ctx = {
      save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const look = { character: 'bolt-bot' as const, x: 80, y: 120, facing: 1 as const, size: 'small' as const, pose: 'walk1' as const, spark: false, gait: 'walk' as const, gaitPhase: 0 }
    expect(drawGeneratedCharacter(ctx, look, 'cartoon', (n) => n, 0, 0)).toBeNull()
    const sheet = MotionImage.images.find(image => image.src.endsWith('bolt-bot-rig-v1.png'))!
    sheet.onload?.()
    for (let i = 0; i < 8; i++) drawGeneratedCharacter(ctx, { ...look, gaitPhase: i / 8 }, 'cartoon', (n) => n, 0, 0)
    const calls = vi.mocked(ctx.drawImage).mock.calls
    expect(calls.length).toBe(8 * 9) // two arms, two three-part legs, one body
    expect(new Set(calls.map(call => `${call[1]},${call[2]}`)).size).toBe(5)
    expect(ctx.translate).toHaveBeenCalledWith(80, 120)
    drawGeneratedCharacter(ctx, { ...look, facing: -1 }, 'cartoon', (n) => n, 0, 0)
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1)
    const normalTop = drawGeneratedCharacter(ctx, look, 'cartoon', (n) => n, 0, 0)!
    const squashedTop = drawGeneratedCharacter(ctx, { ...look, squash: 5 }, 'cartoon', (n) => n, 0, 0)!
    expect(ctx.scale).toHaveBeenCalledWith(1, 0.6)
    expect(squashedTop).toBeCloseTo(120 - (120 - normalTop) * 0.6)
  })

  it('uses bounded, curated cells for movement and blinking', () => {
    expect(characterFrame('classic', 'stand')).toBeNull()
    expect(characterFrame('builder', 'stand', 0)?.index).toBe(0)
    expect(characterFrame('builder', 'stand', 105)?.index).toBe(3)
    expect(characterFrame('brick-fox', 'jump')?.index).toBe(16)
    for (const id of ['builder', 'bolt-bot', 'brick-fox'] as const) {
      for (const pose of ['stand', 'walk1', 'walk2', 'walk3', 'jump', 'wall', 'throw', 'kick', 'skid', 'crouch', 'dead'] as const) {
        const frame = characterFrame(id, pose)!
        expect(frame.sw).toBeGreaterThan(0)
        expect(frame.sh).toBeGreaterThan(0)
        expect(frame.sw).toBeLessThanOrEqual(256)
        expect(frame.sh).toBeLessThanOrEqual(256)
        expect(frame.sx + frame.sw).toBeLessThanOrEqual(1536)
        expect(frame.sy + frame.sh).toBeLessThanOrEqual(1024)
      }
    }
  })

  it('falls back while loading, then draws just the crop with directional mirroring', () => {
    class MockImage {
      naturalWidth = 1536
      naturalHeight = 1024
      decoding = ''
      src = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      static last: MockImage
      constructor() { MockImage.last = this }
    }
    vi.stubGlobal('Image', MockImage)
    const ctx = {
      save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      imageSmoothingEnabled: false, imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D
    const look = { character: 'builder' as const, x: 80, y: 120, facing: -1 as const, size: 'small' as const, pose: 'walk1' as const, spark: false }
    expect(drawGeneratedCharacter(ctx, look, 'cartoon', (n) => n, 0, 0)).toBeNull()
    expect(MockImage.last.src).toBe('/platformer/characters/builder-v1.png')
    MockImage.last.onload?.()
    expect(drawGeneratedCharacter(ctx, look, 'cartoon', (n) => n, 0, 0)).toBeCloseTo(96.9, 1)
    expect(ctx.translate).toHaveBeenCalledWith(80, 0)
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1)
    const call = vi.mocked(ctx.drawImage).mock.calls[0]
    expect(call[3]).toBeLessThan(256) // source crop width, not the full atlas
    expect(call[4]).toBeLessThanOrEqual(256)
    expect(call[8]).toBeCloseTo(23.1, 1) // stable source-pixel scale across poses

    vi.mocked(ctx.drawImage).mockClear()
    const jumpTop = drawGeneratedCharacter(ctx, { ...look, pose: 'jump' }, 'cartoon', (n) => n, 0, 0)
    const jump = vi.mocked(ctx.drawImage).mock.calls[0]
    expect(jumpTop).toBe(97) // the head stays level while the airborne legs tuck or extend
    expect(jump[8] / jump[4]).toBeCloseTo(23 / 242, 5)

    vi.mocked(ctx.drawImage).mockClear()
    const crouchTop = drawGeneratedCharacter(ctx, { ...look, pose: 'crouch' }, 'cartoon', (n) => n, 0, 0)
    const crouch = vi.mocked(ctx.drawImage).mock.calls[0]
    expect(crouchTop).toBeCloseTo(120 - crouch[8], 5) // crouch stays grounded
    expect(crouch[8] / crouch[4]).toBeCloseTo(23 / 242, 5)
  })
})
