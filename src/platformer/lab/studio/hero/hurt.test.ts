/**
 * Getting hurt like the classic Hero (parity bucket A, 2026-11-03): a stop with an "Ouch", a hop that fades away, back
 * at the start after 2.5 seconds, then 2 seconds of blinking when nothing but a pit can hurt it. Old Heroes that upgrade
 * get the Ouch sound too.
 */
import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import { upgradeUntouchedHero } from '../remix'
import { createStarterProject } from '../starter'
import beforePits from './__fixtures__/hero-before-pits.json'
import { HERO_KNOBS, HERO_OUCH, HERO_OUCH_SOUND, HERO_START } from './heroBrick'
import { createHeroTestDesign, HERO_STAND_Y } from './heroLevel'

const knob = (id: string) => HERO_KNOBS.find((k) => k.id === id)!.value

/** Play the test level, let the Hero stand, then hurt it at `x`. Returns the runtime and a per-tick log from then on. */
function hurtAt(x: number) {
  const design = createHeroTestDesign()
  const rt = play({ ...design, copies: design.copies.map((c) => (c.brickId === 'brick_hero' ? { ...c, x } : c)) })
  for (let i = 0; i < 20; i++) rt.step()
  const hero = rt.world.targets.find((t) => t.brickId === 'brick_hero' && !t.isClone)!
  const heard: string[] = []
  rt.onBroadcast((m) => heard.push(m))
  rt.broadcast('hero hurt')
  const sounds = () => rt.notes.flatMap((n) => (n.kind === 'sound' ? [n.sound] : []))
  return { rt, hero, heard, sounds }
}

describe('getting hurt', () => {
  it('stops, says ouch with a sound, hops up while fading, and is back at the start standing after 2.5 s', () => {
    const { rt, hero, heard, sounds } = hurtAt(200)
    const log: Array<{ x: number; y: number; ghost: number }> = []
    for (let i = 0; i < knob('hurt_back') + 3; i++) {
      rt.step()
      log.push({ x: hero.x, y: hero.y, ghost: hero.effects.ghost ?? 0 })
    }
    expect(heard).toContain(HERO_OUCH)
    expect(sounds()).toEqual([HERO_OUCH_SOUND])
    // The stop: half a second standing still where it was hurt.
    for (const p of log.slice(0, knob('hurt_stop') - 1)) expect(p).toMatchObject({ x: 200, y: HERO_STAND_Y, ghost: 0 })
    // The hop: up first, fading.
    const top = Math.max(...log.map((p) => p.y))
    expect(top).toBeGreaterThan(HERO_STAND_Y + 30)
    expect(log[knob('hurt_stop') + 20]!.ghost).toBeGreaterThan(90)
    // Back at the start, standing, seen again.
    expect(log.at(-1)).toMatchObject({ x: 200, y: HERO_STAND_Y })
  })

  it('blinks for 2 seconds after coming back; nothing hurts it then, and it can be hurt again after', () => {
    const { rt, hero, heard } = hurtAt(200)
    for (let i = 0; i < knob('hurt_back') + 3; i++) rt.step()
    const ghosts: number[] = []
    for (let i = 0; i < 20; i++) {
      rt.broadcast('hero hurt')
      rt.step()
      ghosts.push(hero.effects.ghost ?? 0)
    }
    expect(heard.filter((m) => m === HERO_OUCH)).toHaveLength(1)
    expect(new Set(ghosts)).toEqual(new Set([0, 70]))
    for (let i = 0; i < knob('safe_time'); i++) rt.step()
    expect(hero.effects.ghost ?? 0).toBe(0)
    rt.broadcast('hero hurt')
    rt.step()
    rt.step()
    expect(heard.filter((m) => m === HERO_OUCH)).toHaveLength(2)
  })

  it('a second hurt while it is hurt changes nothing', () => {
    const { rt, hero, heard } = hurtAt(200)
    for (let i = 0; i < 30; i++) {
      rt.broadcast('hero hurt')
      rt.step()
    }
    for (let i = 0; i < knob('hurt_back'); i++) rt.step()
    expect(heard.filter((m) => m === HERO_OUCH)).toHaveLength(1)
    expect({ x: hero.x, y: hero.y }).toEqual({ x: 200, y: HERO_STAND_Y })
  })

  it('in the starter level, falling into the gap says ouch once and the Hero is back at the start', () => {
    const rt = play(createStarterProject().design)
    for (let i = 0; i < 20; i++) rt.step()
    const hero = rt.world.targets.find((t) => t.brickId === 'brick_hero' && !t.isClone)!
    const heard: string[] = []
    rt.onBroadcast((m) => heard.push(m))
    hero.x = 344
    hero.y = 40
    const ys: number[] = []
    for (let i = 0; i < 120; i++) {
      rt.step()
      ys.push(hero.y)
    }
    expect(heard.filter((m) => m === HERO_OUCH)).toHaveLength(1)
    // Out of sight below the level the whole time it is hurt: it never pops back up to the edge.
    const hurtFrom = ys.findIndex((y) => y < 0)
    const back = ys.findIndex((y) => y === HERO_START.y)
    expect(hurtFrom).toBeGreaterThan(0)
    expect(ys.slice(hurtFrom, back).every((y) => y < 0)).toBe(true)
    expect({ x: hero.x, y: hero.y }).toEqual({ x: HERO_START.x, y: HERO_START.y })
  })
})

describe('an upgraded Hero', () => {
  it('gets the Ouch sound, and keeps the sounds the kid added', () => {
    const project = createStarterProject()
    delete project.design.pits
    const hero = project.design.bricks.find((b) => b.id === 'brick_hero')!
    hero.program = structuredClone(beforePits.program) as never
    hero.sounds = [{ name: 'my yell', durationMs: 100 }]
    project.workspaces.brick_hero = structuredClone(beforePits.workspace)
    const up = upgradeUntouchedHero(project)
    expect(up.design.bricks.find((b) => b.id === 'brick_hero')!.sounds.map((s) => s.name)).toEqual(['my yell', HERO_OUCH_SOUND])
  })
})
