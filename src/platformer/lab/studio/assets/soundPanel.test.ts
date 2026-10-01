import { describe, expect, it } from 'vitest'
import { blankImage, costumeFromImage } from '../pixels'
import { emptyProject, STAGE_ID, StudioStore } from '../store'
import { getSoundLibrary } from './soundLibrary'

describe('SoundPanel and sound store actions', () => {
  it('adds and removes sounds from a brick', () => {
    const store = new StudioStore(emptyProject())
    const brickId = store.addBrick('Hero', costumeFromImage('Hero', blankImage(32, 32)))

    const library = getSoundLibrary()
    const jumpSound = library.find((s) => s.name === 'jump')!
    const coinSound = library.find((s) => s.name === 'coin')!

    expect(jumpSound).toBeDefined()
    expect(coinSound).toBeDefined()

    // Initially 0 sounds
    expect(store.brick(brickId)!.sounds.length).toBe(0)

    // Add jump sound
    store.setSounds(brickId, [jumpSound])
    expect(store.brick(brickId)!.sounds.length).toBe(1)
    expect(store.brick(brickId)!.sounds[0].name).toBe('jump')
    expect(store.brick(brickId)!.sounds[0].durationMs).toBeGreaterThan(0)

    // Add coin sound
    store.setSounds(brickId, [jumpSound, coinSound])
    expect(store.brick(brickId)!.sounds.length).toBe(2)
    expect(store.brick(brickId)!.sounds[1].name).toBe('coin')

    // Remove jump sound
    store.setSounds(brickId, [coinSound])
    expect(store.brick(brickId)!.sounds.length).toBe(1)
    expect(store.brick(brickId)!.sounds[0].name).toBe('coin')
  })

  it('adds sounds to the Stage', () => {
    const store = new StudioStore(emptyProject())
    const library = getSoundLibrary()
    const winSound = library.find((s) => s.name === 'win')!

    store.setSounds(STAGE_ID, [winSound])
    expect(store.brick(STAGE_ID)!.sounds.length).toBe(1)
    expect(store.brick(STAGE_ID)!.sounds[0].name).toBe('win')
  })
})
