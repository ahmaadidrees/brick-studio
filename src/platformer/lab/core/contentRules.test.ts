import { describe, expect, it } from 'vitest'
import { builtInPowers } from '../studio/powers/powers'
import { checkPowerPayload, checkPowerText, isCostumeSource, isSoundSource, MAX_ASSET_CHARS, POWER_FILE_MAX_CHARS, POWER_MAX_BLOCKS, POWER_REFUSALS } from './contentRules'
import { DESIGN_LIMITS } from './project'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA='

describe('picture sources', () => {
  it('take PNG, JPEG, WebP and GIF data URLs', () => {
    for (const type of ['png', 'jpeg', 'webp', 'gif']) expect(isCostumeSource(PNG.replace('png', type)), type).toBe(true)
  })

  it('refuse web addresses, SVG (it can carry script), other schemes, and anything that is not base64 data', () => {
    for (const bad of [
      'https://example.com/cat.png',
      'http://192.168.0.1/track.gif',
      '//example.com/cat.png',
      '/assets/hero.png',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
      'data:image/svg+xml,<svg onload="alert(1)"/>',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png,not-base64',
      'data:image/png;base64,abc def',
      `${PNG}"><script>`,
      WAV,
      '',
      42,
      null,
    ]) {
      expect(isCostumeSource(bad), String(bad)).toBe(false)
    }
  })

  it('cap a picture at the save limit', () => {
    expect(MAX_ASSET_CHARS).toBe(DESIGN_LIMITS.maxAssetChars)
    const prefix = 'data:image/png;base64,'
    expect(isCostumeSource(prefix + 'A'.repeat(MAX_ASSET_CHARS - prefix.length))).toBe(true)
    expect(isCostumeSource(prefix + 'A'.repeat(MAX_ASSET_CHARS - prefix.length + 1))).toBe(false)
  })
})

describe('sound sources', () => {
  it('take audio data URLs only', () => {
    expect(isSoundSource(WAV)).toBe(true)
    expect(isSoundSource(WAV.replace('wav', 'mpeg'))).toBe(true)
    for (const bad of ['https://example.com/boom.wav', PNG, 'data:audio/wav,raw', 'data:text/plain;base64,aGk=', 'data:audio/wav;base64,' + 'A'.repeat(MAX_ASSET_CHARS)]) {
      expect(isSoundSource(bad), bad.slice(0, 40)).toBe(false)
    }
  })
})

const power = (over: Record<string, unknown> = {}) => ({
  kind: 'brickgineers-power',
  version: 1,
  id: 'zip',
  name: 'Zip',
  credits: ['Ana'],
  what: 'Go fast',
  fits: 'brick',
  blocks: [{ type: 'platformer_everytick', id: 'a', next: { block: { type: 'platformer_setspeed', id: 'b', inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 5 } } } } } } }],
  variables: [{ id: 'v1', name: 'speed', value: 5, showInBuild: true }],
  ...over,
})

describe('power files', () => {
  it('every built-in power passes, and comes back holding only its own fields', () => {
    for (const p of builtInPowers()) {
      const check = checkPowerPayload(JSON.parse(JSON.stringify(p)))
      expect(check.ok, p.name).toBe(true)
      if (check.ok) expect(check.power).toEqual(p)
    }
  })

  it('take a power with no game, or game "platformer"; refuse one for another game', () => {
    expect(checkPowerPayload(power()).ok).toBe(true)
    const platformer = checkPowerPayload(power({ game: 'platformer' }))
    expect(platformer.ok && platformer.power.game).toBe('platformer')
    expect(checkPowerPayload(power({ game: 'race' }))).toMatchObject({ ok: false, refusal: 'other-game', message: POWER_REFUSALS['other-game'] })
  })

  it('refuse a power holding a block this version does not have, wherever it is', () => {
    const deep = power({
      blocks: [{ type: 'platformer_everytick', next: { block: { type: 'control_if', inputs: { CONDITION: { shadow: { type: 'logic_boolean' } }, SUBSTACK: { block: { type: 'hack_fly' } } } } } }],
    })
    const check = checkPowerPayload(deep)
    expect(check).toMatchObject({ ok: false, refusal: 'unknown-blocks', message: 'That power uses blocks that aren’t part of Brickgineers, so it can’t snap on.' })
    expect(!check.ok && check.detail).toBe('logic_boolean, hack_fly')
    expect(checkPowerPayload(power({ blocks: [{ type: 'platformer_touchingtile' }] }))).toMatchObject({ refusal: 'unknown-blocks' })
  })

  it('refuse things that are not powers, or are damaged', () => {
    expect(checkPowerPayload(null)).toMatchObject({ refusal: 'not-power' })
    expect(checkPowerPayload([])).toMatchObject({ refusal: 'not-power' })
    expect(checkPowerPayload(power({ kind: 'brickgineers' }))).toMatchObject({ refusal: 'not-power' })
    expect(checkPowerPayload(power({ version: 2 }))).toMatchObject({ refusal: 'not-power' })
    for (const [what, over] of Object.entries<Record<string, unknown>>({
      'fits everything': { fits: 'everything' },
      'no name': { name: '  ' },
      'name with a control character': { name: 'Zip\u0000' },
      'a credit that is not text': { credits: ['Ana', 7] },
      'blocks not a list': { blocks: {} },
      'a block with no type': { blocks: [{ id: 'x' }] },
      'a block with a strange field': { blocks: [{ type: 'motion_movesteps', script: 'alert(1)' }] },
      'a connection with a strange field': { blocks: [{ type: 'motion_movesteps', next: { block: { type: 'looks_show' }, extra: 1 } }] },
      'a field holding an object': { blocks: [{ type: 'looks_say', fields: { MESSAGE: { deep: { deeper: 1 } } } }] },
      'a variable with no id': { variables: [{ name: 'x', value: 1 }] },
      'two variables with one id': { variables: [{ id: 'v', name: 'a', value: 1 }, { id: 'v', name: 'b', value: 1 }] },
      'a variable holding an object': { variables: [{ id: 'v', name: 'a', value: { x: 1 } }] },
      'pictures riding along': { costumes: [{ name: 'cat', asset: 'https://example.com/cat.png' }] },
      'sounds riding along': { sounds: [{ name: 'boom', asset: 'https://example.com/boom.wav' }] },
    })) {
      expect(checkPowerPayload(power(over)), what).toMatchObject({ ok: false, refusal: 'damaged', message: POWER_REFUSALS.damaged })
    }
  })

  it('refuse powers that are too big', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ type: 'platformer_everytick', id: `s${i}` }))
    expect(checkPowerPayload(power({ blocks: many }))).toMatchObject({ refusal: 'too-big' })
    let chain: Record<string, unknown> = { type: 'looks_show' }
    for (let i = 0; i < POWER_MAX_BLOCKS; i++) chain = { type: 'looks_show', next: { block: chain } }
    expect(checkPowerPayload(power({ blocks: [{ type: 'platformer_everytick', next: { block: chain } }] }))).toMatchObject({ refusal: 'too-big' })
    expect(checkPowerPayload(power({ variables: Array.from({ length: 101 }, (_, i) => ({ id: `v${i}`, name: `v${i}`, value: 0 })) }))).toMatchObject({ refusal: 'too-big' })
    expect(checkPowerText('x'.repeat(POWER_FILE_MAX_CHARS + 1))).toMatchObject({ refusal: 'too-big' })
  })

  it('read a power file\'s text, refusing what is not JSON', () => {
    expect(checkPowerText(JSON.stringify(power())).ok).toBe(true)
    expect(checkPowerText('not json')).toMatchObject({ refusal: 'not-power' })
  })
})
