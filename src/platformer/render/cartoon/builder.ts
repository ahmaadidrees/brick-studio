import type { PlayerPose } from '../art/characters'
import { INK, TONE, WHITE, edge, rad, rr, stud, type G, type Tone } from './paint'

/*
 * The cartoon Classic Builder: the 3D studio's blocky builder seen from the side, in a yellow hard hat with a stud on
 * top. Drawn as a little rig (legs, arms, body, head) whose joints swing per pose, facing right. The shirt is the
 * player's colour so friends can tell each other apart; the spark power turns the shirt white and the hat electric.
 */

const SKIN: Tone = ['#f2c37f', '#fbd9a3', '#d9a15c']
const PANTS: Tone = ['#4a5d80', '#6a7fa3', '#34435e']
const HAT: Tone = TONE.gold
const HAT_SPARK: Tone = ['#46d4ff', '#a6ecff', '#1f9fd0']
const SHIRT_SPARK: Tone = ['#f6f8fb', '#ffffff', '#c9d3df']
const BADGE = '#f3ca74'

/** Joint angles in degrees; forward (the way the builder faces) is positive. */
interface Rig {
  nearLeg: number
  farLeg: number
  nearArm: number
  farArm: number
  /** Body raised (negative) or lowered (positive). */
  bob: number
  lean: number
  /** Legs shortened (crouching). */
  fold?: number
  dead?: boolean
}

const RIGS: Record<PlayerPose, Rig> = {
  stand: { nearLeg: 4, farLeg: -4, nearArm: -8, farArm: 8, bob: 0, lean: 0 },
  walk1: { nearLeg: 30, farLeg: -30, nearArm: -34, farArm: 34, bob: 0, lean: 3 },
  walk2: { nearLeg: 6, farLeg: -6, nearArm: -8, farArm: 8, bob: -0.8, lean: 3 },
  walk3: { nearLeg: -30, farLeg: 30, nearArm: 34, farArm: -34, bob: 0, lean: 3 },
  jump: { nearLeg: 38, farLeg: -18, nearArm: 100, farArm: -140, bob: -0.5, lean: 4 },
  skid: { nearLeg: 38, farLeg: 16, nearArm: -48, farArm: -26, bob: 0.4, lean: -12 },
  wall: { nearLeg: 42, farLeg: 12, nearArm: 92, farArm: 70, bob: 0, lean: 6 },
  kick: { nearLeg: 72, farLeg: -12, nearArm: -26, farArm: 22, bob: 0, lean: -4 },
  throw: { nearLeg: 12, farLeg: -12, nearArm: 96, farArm: -34, bob: 0, lean: 4 },
  crouch: { nearLeg: 24, farLeg: -10, nearArm: 26, farArm: 18, bob: 0, lean: 6, fold: 0.5 },
  dead: { nearLeg: 14, farLeg: -14, nearArm: 112, farArm: -118, bob: 0, lean: 0, dead: true },
}

export interface BuilderColors {
  shirt: Tone
  spark: boolean
}

/** Picture size in world pixels for each size: the body reaches above the hitbox (hat and head). */
export const BUILDER_SIZE = { small: { w: 20, h: 23 }, big: { w: 22, h: 34 } } as const

/** Draw the builder with the feet's contact point at (0, 0), facing right. */
export function drawBuilder(g: G, size: 'small' | 'big', pose: PlayerPose, colors: BuilderColors) {
  const big = size === 'big'
  const rig = RIGS[pose]
  const shirt = colors.spark ? SHIRT_SPARK : colors.shirt
  const pants = colors.spark ? colors.shirt : PANTS
  const hat = colors.spark ? HAT_SPARK : HAT

  // Proportions
  const legLen = (big ? 7 : 3.9) * (1 - (rig.fold ?? 0))
  const legW = big ? 3.5 : 3.1
  const shoeH = big ? 2.4 : 2.1
  const torsoW = big ? 7.6 : 6.8
  const torsoH = big ? 9.2 : 5.2
  const armLen = big ? 6.8 : 4
  const armW = big ? 2.6 : 2.2
  const headW = big ? 8.2 : 7.4
  const headH = big ? 7.4 : 6.8

  const hipY = -(shoeH + legLen) + rig.bob
  const torsoTop = hipY - torsoH
  const shoulderY = torsoTop + (big ? 1.8 : 1.4)
  const headBottom = torsoTop + 0.6
  const headTop = headBottom - headH

  g.save()
  g.lineJoin = 'round'
  // Lean the upper body around the hips.
  const leanUpper = () => {
    g.translate(0, hipY)
    g.rotate(rad(rig.lean))
    g.translate(0, -hipY)
  }

  const leg = (angle: number, tone: Tone, dark: boolean) => {
    g.save()
    g.translate(dark ? -0.8 : 0.6, hipY)
    g.rotate(-rad(angle))
    rr(g, -legW / 2, -0.6, legW, legLen + 0.8, [0.6, 0.6, 1.1, 1.1])
    g.fillStyle = dark ? tone[2] : tone[0]
    g.fill()
    edge(g, 0.3, 0.45)
    // Shoe: longer toward the toes.
    rr(g, -legW / 2 - 0.3, legLen - 0.2, legW + 2.2, shoeH, [shoeH / 2, shoeH / 1.6, 0.9, 0.9])
    g.fillStyle = dark ? '#1a2a3a' : INK
    g.fill()
    g.restore()
  }

  const arm = (angle: number, tone: Tone, dark: boolean) => {
    g.save()
    g.translate(dark ? -1.1 : 0.9, shoulderY)
    g.rotate(-rad(angle))
    rr(g, -armW / 2, -0.4, armW, armLen, armW / 2)
    g.fillStyle = dark ? tone[2] : tone[0]
    g.fill()
    edge(g, 0.3, 0.45)
    g.beginPath()
    g.arc(0, armLen + 0.4, armW * 0.62, 0, Math.PI * 2)
    g.fillStyle = dark ? SKIN[2] : SKIN[0]
    g.fill()
    edge(g, 0.3, 0.4)
    g.restore()
  }

  // Far side first.
  leg(rig.farLeg, pants, true)
  g.save()
  leanUpper()
  arm(rig.farArm, shirt, true)
  g.restore()
  leg(rig.nearLeg, pants, false)

  g.save()
  leanUpper()
  // Body
  rr(g, -torsoW / 2, torsoTop, torsoW, torsoH + 0.6, [1.6, 2, 1.4, 1.4])
  const body = g.createLinearGradient(0, torsoTop, 0, hipY)
  body.addColorStop(0, shirt[1])
  body.addColorStop(0.35, shirt[0])
  body.addColorStop(1, shirt[2])
  g.fillStyle = body
  g.fill()
  edge(g, 0.35, 0.5)
  // Belt line and the badge on the chest.
  g.fillStyle = pants[2]
  g.globalAlpha = 0.55
  g.fillRect(-torsoW / 2 + 0.4, hipY - 0.9, torsoW - 0.8, 0.9)
  g.globalAlpha = 1
  rr(g, torsoW / 2 - 2.6, torsoTop + torsoH * 0.3, 2, big ? 2.2 : 1.7, 0.5)
  g.fillStyle = colors.spark ? HAT_SPARK[0] : BADGE
  g.fill()

  // Head
  rr(g, -headW / 2 + 0.3, headTop, headW, headH, [2.4, 2.8, 2.2, 2])
  const face = g.createLinearGradient(-headW / 2, 0, headW / 2, 0)
  face.addColorStop(0, SKIN[2])
  face.addColorStop(0.35, SKIN[0])
  face.addColorStop(1, SKIN[1])
  g.fillStyle = face
  g.fill()
  edge(g, 0.35, 0.5)
  // Face (toward +x)
  const ex = headW / 2 - 2.3
  const ey = headTop + headH * 0.5
  if (rig.dead) {
    g.strokeStyle = INK
    g.lineWidth = 0.7
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(ex - 0.9, ey - 0.9)
    g.lineTo(ex + 0.9, ey + 0.9)
    g.moveTo(ex + 0.9, ey - 0.9)
    g.lineTo(ex - 0.9, ey + 0.9)
    g.stroke()
  } else {
    g.beginPath()
    g.ellipse(ex, ey, 0.85, 1.25, 0, 0, Math.PI * 2)
    g.fillStyle = INK
    g.fill()
    g.beginPath()
    g.arc(ex - 0.25, ey - 0.45, 0.32, 0, Math.PI * 2)
    g.fillStyle = WHITE
    g.fill()
  }
  // Cheek and smile
  g.beginPath()
  g.arc(ex - 1.2, ey + 1.9, 0.9, 0, Math.PI * 2)
  g.fillStyle = '#f08a8a'
  g.globalAlpha = 0.45
  g.fill()
  g.globalAlpha = 1
  g.beginPath()
  if (rig.dead) g.arc(ex + 0.4, ey + 2.9, 0.8, Math.PI * 1.1, Math.PI * 1.9)
  else g.arc(ex + 0.2, ey + 1.4, 1.2, Math.PI * 0.15, Math.PI * 0.75)
  g.strokeStyle = INK
  g.lineWidth = 0.5
  g.lineCap = 'round'
  g.stroke()

  // Hard hat: a dome with a brim reaching forward and a stud on top.
  const hatY = headTop + 0.9
  const domeW = headW + 0.8
  stud(g, hat, 0.6, hatY - 3.6, 2.8, 1.5)
  g.beginPath()
  g.moveTo(-domeW / 2 + 0.3, hatY)
  g.bezierCurveTo(-domeW / 2 + 0.3, hatY - 4.6, domeW / 2 + 0.3, hatY - 4.6, domeW / 2 + 0.3, hatY)
  g.closePath()
  const dome = g.createLinearGradient(0, hatY - 4, 0, hatY)
  dome.addColorStop(0, hat[1])
  dome.addColorStop(0.5, hat[0])
  dome.addColorStop(1, hat[2])
  g.fillStyle = dome
  g.fill()
  edge(g, 0.4, 0.5)
  if (colors.spark) {
    g.strokeStyle = WHITE
    g.lineWidth = 0.7
    g.beginPath()
    g.moveTo(-0.6, hatY - 3.4)
    g.lineTo(0.8, hatY - 1.9)
    g.lineTo(-0.2, hatY - 1.8)
    g.lineTo(1.1, hatY - 0.4)
    g.stroke()
  }
  rr(g, -domeW / 2, hatY - 0.4, domeW + 2.6, 1.5, [0.7, 0.9, 0.9, 0.7])
  g.fillStyle = hat[2]
  g.fill()
  edge(g, 0.35, 0.45)

  // Near arm last, in front of the body.
  arm(rig.nearArm, shirt, false)
  g.restore()
  g.restore()
}
