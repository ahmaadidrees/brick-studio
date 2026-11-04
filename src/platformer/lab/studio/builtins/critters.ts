/**
 * Spiky, Flyer and Shellbug (parity bucket B, 2026-11-04): the classic critters (platformer-core world.ts and player.ts
 * touchEntities, art render/art/creatures.ts) as bricks with open code, built like the Walker (starter.ts): labelled
 * scripts made of My Blocks, a "speed" slider, and only broadcasts to talk to the Hero ("stomped" bounces it, "hero
 * hurt" hurts it). A stomp is the Walker's test: the Hero's middle more than 6 steps above mine.
 *
 * Classic numbers, in ticks (one tick is two classic frames): walking 0.5 px a frame is 1 step a tick; a sliding shell
 * 3 px a frame is 6; a shell wakes after 510 frames, 255 ticks; a Flyer bobs 25 px either side of home, going through
 * home at 2.5 steps a tick and pulled back by 0.125 steps a tick each tick (classic FLY_ACC 8/256 px a frame each frame,
 * x 4), so one bob up and down takes 80 ticks. Walking costumes take turns every 8 ticks (classic every 16 frames).
 *
 * Not yet like classic (B.md "What's left"): a sliding shell doesn't knock out other critters or bump ? blocks, and
 * critters don't turn around when they meet each other.
 */
import type { VariableDecl } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { buildArt } from '../../../render/art/library'
import { classicSound } from '../assets/classicSounds'
import { Blocks, type Conn, type MyBlock } from '../blockBuilder'
import { costumeFromImage } from '../pixels'
import type { MadeBrick } from '../starter'

export const SPIKY_BRICK_ID = 'brick_spiky'
export const FLYER_BRICK_ID = 'brick_flyer'
export const SHELLBUG_BRICK_ID = 'brick_shellbug'

/** Steps a tick: classic WALK_SPEED 0.5 px a frame. */
export const CRITTER_SPEED = 1
/** Classic SHELL_SPEED 3 px a frame. */
export const SHELL_SPEED = 6
/** Classic SHELL_WAKE 510 frames. */
export const SHELL_WAKE_TICKS = 255
/** The Flyer: speed through home and the pull back, per tick (classic FLY_ACC x 4 and FLY_Q 40 frames). */
export const FLY_SPEED = 2.5
export const FLY_PULL = 0.125

/**
 * A classic sprite as a costume, standing on the same line as every other costume of the brick: its lowest painted
 * row's bottom is 8 steps below the brick's y. Classic sprites are drawn on their box's bottom; if a shell (lowest row
 * 14) and a walking Shellbug (lowest row 15) were centred the same way, changing costume would push the box a step
 * into the ground, and a body that starts inside a solid falls through it.
 */
function art(name: string, key: string) {
  const a = buildArt(key)
  let bottom = 0
  for (let i = 3; i < a.data.length; i += 4) if (a.data[i]! > 0) bottom = Math.max(bottom, Math.floor((i - 3) / 4 / a.w) + 1)
  return costumeFromImage(name, { width: a.w, height: a.h, data: a.data }, { x: a.w / 2, y: bottom - 8 })
}

/** The parts every critter shares: walk, turn around at a bump, flip the walking costume every 8 ticks. */
function walkingParts(b: Blocks, id: string) {
  const speed = `${id}_speed`
  const way = `${id}_way`
  const frame = `${id}_frame`
  const walkAt: MyBlock = { proccode: 'walk at %s', argumentNames: ['speed'] }
  const turnAround: MyBlock = { proccode: 'turn around', argumentNames: [] }
  const step: MyBlock = { proccode: 'step my feet', argumentNames: [] }
  const defineWalking = (stillWalking: Conn | null) => {
    b.define(walkAt, 'Walk the way I face at this speed', [
      b.gravityOn(),
      b.rotationStyle('left-right'),
      b.pointInDirection(b.mul(b.v(way), 90)),
      b.setSpeed('x', b.mul(b.v(way), b.arg('speed'))),
    ])
    const turn = [b.set(way, b.sub(0, b.v(way))), b.pointInDirection(b.mul(b.v(way), 90)), b.setSpeed('x', b.mul(b.v(way), b.v(speed)))]
    b.define(turnAround, 'Face the other way and keep going', stillWalking ? [b.when(stillWalking, turn)] : turn)
  }
  const stepFeet = (first: string, second: string) =>
    b.define(step, 'Every 8 ticks, the other foot', [
      b.change(frame, 1),
      b.when(b.eq(b.mod(b.v(frame), 16), 8), [b.switchCostume(second)]),
      b.when(b.eq(b.mod(b.v(frame), 16), 0), [b.switchCostume(first)]),
    ])
  const variables = (extra: VariableDecl[] = []): VariableDecl[] => [
    { id: speed, name: 'speed', value: CRITTER_SPEED, showInBuild: true },
    ...extra,
    // Classic critters set out to the left.
    { id: way, name: 'way', value: -1 },
    { id: frame, name: 'frame', value: 0 },
  ]
  return { speed, way, frame, walkAt, turnAround, step, defineWalking, stepFeet, variables }
}

function made(id: string, name: string, b: Blocks, costumes: ReturnType<typeof art>[], variables: VariableDecl[], sounds = [] as ReturnType<typeof classicSound>[]): MadeBrick {
  const workspace = b.workspace(variables.map((v) => ({ id: v.id, name: v.name })))
  return { brick: { id, name, costumes, sounds, program: compileWorkspace(workspace, { variables }).program }, workspace }
}

/** Spiky: walks like a Walker, but its spikes hurt the Hero from every side, so it can't be stomped. */
export function createSpikyBrick(id = SPIKY_BRICK_ID, name = 'Spiky'): MadeBrick {
  const b = new Blocks(id)
  const w = walkingParts(b, id)
  const prickle: MyBlock = { proccode: 'prickle the Hero', argumentNames: [] }
  b.flag('When the level starts: walk, and watch for the Hero', [b.call(w.walkAt, b.v(w.speed)), b.forever([b.call(w.step), b.call(prickle)])])
  b.bump('When I run into something on my right: turn around', 'left', [b.call(w.turnAround)])
  b.bump('When I run into something on my left: turn around', 'right', [b.call(w.turnAround)])
  w.defineWalking(null)
  w.stepFeet('walk 1', 'walk 2')
  b.define(prickle, 'Touching the Hero from any side hurts it: you can\'t stomp spikes', [b.when(b.touchingHero(), [b.broadcast('hero hurt')])])
  return made(id, name, b, [art('walk 1', 'spiky:1'), art('walk 2', 'spiky:2')], w.variables())
}

/**
 * Flyer: bobs up and down around where it was put. Home always pulls it back by the same amount, so it slows down going
 * away and speeds up coming back (classic flyOffset). Stomp it and it loses its wings: it drops and walks like a
 * Walker; stomp it again and it's gone.
 */
export function createFlyerBrick(id = FLYER_BRICK_ID, name = 'Flyer'): MadeBrick {
  const b = new Blocks(id)
  const w = walkingParts(b, id)
  const wings = `${id}_wings`
  const home = `${id}_home`
  const flySpeed = `${id}_fly_speed`
  const pull = `${id}_pull`
  const upSpeed = `${id}_up_speed`
  const pullNow = `${id}_pull_now`
  const bob: MyBlock = { proccode: 'bob', argumentNames: [] }
  const flap: MyBlock = { proccode: 'flap', argumentNames: [] }
  const check: MyBlock = { proccode: 'check for the Hero', argumentNames: [] }
  const loseWings: MyBlock = { proccode: 'lose my wings', argumentNames: [] }

  b.flag('When the level starts: fly up from home, and bob up and down', [
    b.set(wings, 1),
    b.set(home, b.myY()),
    b.set(upSpeed, b.v(flySpeed)),
    b.rotationStyle('left-right'),
    b.pointInDirection(b.mul(b.v(w.way), 90)),
    b.forever([b.either(b.eq(b.v(wings), 1), [b.call(bob), b.call(flap)], [b.call(w.step)])]),
  ])
  b.flag('When the level starts: watch for the Hero', [b.forever([b.call(check)])])
  b.bump('When I run into something on my right: turn around', 'left', [b.call(w.turnAround)])
  b.bump('When I run into something on my left: turn around', 'right', [b.call(w.turnAround)])
  // Above home (or at home on the way up), home pulls me down; below it, up. The half pull in the move makes each tick
  // land exactly where the classic Flyer would.
  b.define(bob, 'Home pulls me back: slower as I go away, faster as I come back', [
    b.either(b.or(b.gt(b.myY(), b.v(home)), b.and(b.eq(b.myY(), b.v(home)), b.gt(b.v(upSpeed), 0))), [b.set(pullNow, b.sub(0, b.v(pull)))], [b.set(pullNow, b.v(pull))]),
    b.changeYBy(b.add(b.v(upSpeed), b.mul(b.v(pullNow), 0.5))),
    b.change(upSpeed, b.v(pullNow)),
  ])
  b.define(flap, 'Every 4 ticks, the other wing', [
    b.change(w.frame, 1),
    b.when(b.eq(b.mod(b.v(w.frame), 8), 4), [b.switchCostume('fly 2')]),
    b.when(b.eq(b.mod(b.v(w.frame), 8), 0), [b.switchCostume('fly 1')]),
  ])
  w.defineWalking(b.eq(b.v(wings), 0))
  w.stepFeet('walk 1', 'walk 2')
  b.define(check, 'Stomped from above, or hurt the Hero', [
    b.when(b.touchingHero(), [
      b.either(
        b.gt(b.heroY(), b.add(b.myY(), 6)),
        [b.broadcast('stomped'), b.blk('sound_play', { fields: { SOUND_MENU: 'Stomp' } }), b.either(b.eq(b.v(wings), 1), [b.call(loseWings)], [b.hide()])],
        [b.broadcast('hero hurt')],
      ),
    ]),
  ])
  b.define(loseWings, 'No more wings: drop down and walk, and don\'t get stomped twice at once', [
    b.set(wings, 0),
    b.switchCostume('walk 1'),
    b.setSpeed('y', 0),
    b.call(w.walkAt, b.v(w.speed)),
    b.wait(0.2),
  ])
  const variables = w.variables([
    { id: flySpeed, name: 'fly speed', value: FLY_SPEED, showInBuild: true },
    { id: pull, name: 'pull', value: FLY_PULL },
    { id: wings, name: 'wings', value: 1 },
    { id: home, name: 'home', value: 0 },
    { id: upSpeed, name: 'up speed', value: 0 },
    { id: pullNow, name: 'pull now', value: 0 },
  ])
  return made(id, name, b, [art('fly 1', 'flyer:1'), art('fly 2', 'flyer:2'), art('walk 1', 'walker:1'), art('walk 2', 'walker:2')], variables, [classicSound('stomp', 'Stomp')])
}

/**
 * Shellbug: walks like a Walker. Stomp it and it hides in its shell. Touch the shell and it slides away from you, fast,
 * and a sliding shell hurts; stomp a sliding shell to stop it. A shell left alone wakes up and walks again.
 */
export function createShellbugBrick(id = SHELLBUG_BRICK_ID, name = 'Shellbug'): MadeBrick {
  const b = new Blocks(id)
  const w = walkingParts(b, id)
  const state = `${id}_state` // 0 walking, 1 a resting shell, 2 a sliding shell
  const shellSpeed = `${id}_shell_speed`
  const wake = `${id}_wake`
  const rest = `${id}_rest`
  const check: MyBlock = { proccode: 'check for the Hero', argumentNames: [] }
  const hide: MyBlock = { proccode: 'hide in my shell', argumentNames: [] }
  const slide: MyBlock = { proccode: 'slide away from the Hero', argumentNames: [] }
  const spin: MyBlock = { proccode: 'spin', argumentNames: [] }
  const doze: MyBlock = { proccode: 'doze, then wake up', argumentNames: [] }

  b.flag('When the level starts: walk, and watch for the Hero', [
    b.set(state, 0),
    b.call(w.walkAt, b.v(w.speed)),
    b.forever([b.either(b.eq(b.v(state), 0), [b.call(w.step)], [b.either(b.eq(b.v(state), 1), [b.call(doze)], [b.call(spin)])])]),
  ])
  b.flag('When the level starts: watch for the Hero', [b.forever([b.call(check)])])
  b.bump('When I run into something on my right: turn around', 'left', [b.call(w.turnAround)])
  b.bump('When I run into something on my left: turn around', 'right', [b.call(w.turnAround)])
  w.defineWalking(b.not(b.eq(b.v(state), 1)))
  w.stepFeet('walk 1', 'walk 2')
  b.define(check, 'Stomped, kicked, or hurt the Hero', [
    b.when(b.touchingHero(), [
      b.either(
        b.gt(b.heroY(), b.add(b.myY(), 6)),
        [b.broadcast('stomped'), b.either(b.eq(b.v(state), 1), [b.call(slide)], [b.call(hide)])],
        [b.either(b.eq(b.v(state), 1), [b.call(slide)], [b.broadcast('hero hurt')])],
      ),
    ]),
  ])
  b.define(hide, 'Into my shell: stop, and don\'t get stomped twice at once', [
    b.set(state, 1),
    b.set(rest, 0),
    b.setSpeed('x', 0),
    b.switchCostume('shell 1'),
    b.blk('sound_play', { fields: { SOUND_MENU: 'Stomp' } }),
    b.wait(0.2),
  ])
  b.define(slide, 'Shoot off the other way from the Hero', [
    b.set(state, 2),
    b.either(b.lt({ block: b.blk('sensing_of', { fields: { PROPERTY: 'x position', OBJECT: 'Hero' } }) }, b.myX()), [b.set(w.way, 1)], [b.set(w.way, -1)]),
    b.setSpeed('x', b.mul(b.v(w.way), b.v(shellSpeed))),
    b.blk('sound_play', { fields: { SOUND_MENU: 'Kick' } }),
    b.wait(0.25),
  ])
  b.define(spin, 'A sliding shell spins', [
    b.setSpeed('x', b.mul(b.v(w.way), b.v(shellSpeed))),
    b.change(w.frame, 1),
    ...[1, 2, 3, 4].map((n) => b.when(b.eq(b.mod(b.v(w.frame), 4), n % 4), [b.switchCostume(`shell ${n}`)])),
  ])
  b.define(doze, 'A resting shell wakes up after a while', [
    b.change(rest, 1),
    b.when(b.not(b.lt(b.v(rest), b.v(wake))), [b.set(state, 0), b.switchCostume('walk 1'), b.call(w.walkAt, b.v(w.speed))]),
  ])
  const variables = w.variables([
    { id: shellSpeed, name: 'shell speed', value: SHELL_SPEED, showInBuild: true },
    { id: wake, name: 'wake time', value: SHELL_WAKE_TICKS },
    { id: state, name: 'state', value: 0 },
    { id: rest, name: 'resting', value: 0 },
  ])
  const costumes = [art('walk 1', 'shellbug:1'), art('walk 2', 'shellbug:2'), art('shell 1', 'shell:0'), art('shell 2', 'shell:1'), art('shell 3', 'shell:2'), art('shell 4', 'shell:3')]
  return made(id, name, b, costumes, variables, [classicSound('stomp', 'Stomp'), classicSound('kick', 'Kick')])
}
