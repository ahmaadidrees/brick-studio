import { sub } from '@brick-studio/platformer-core/engine/constants'
import type { OtherBody } from '@brick-studio/platformer-core/engine/player'
import type { PlayerPose } from '../render/art/characters'
import type { PlayerLook } from '../render/renderer'
import { isCharacterId, type CharacterId, type PlayerInfo, type Pose } from '@brick-studio/platformer-core/net/protocol'

/** How far behind the newest pose other players are drawn, to smooth out network jitter. */
const DELAY = 6
/** Poses normally arrive three ticks apart; beyond six, a wrapped phase is ambiguous. */
const MAX_GAIT_GAP = 6

const isWalkPose = (a: string) => a === 'walk1' || a === 'walk2' || a === 'walk3'

/** Interpolate the sender's distance clock forward through 255 → 0 only for continuous gait. */
function gaitPhaseBetween(a: Pose, b: Pose, fraction: number): number | undefined {
  if (a.m !== 0 || b.m !== 0 || !isWalkPose(a.a) || !isWalkPose(b.a) || a.ga === undefined || a.ga !== b.ga || a.f !== b.f) return undefined
  if (b.t - a.t <= 0 || b.t - a.t > MAX_GAIT_GAP || (b.x - a.x) * a.f <= 0) return undefined
  if (a.gp === undefined || b.gp === undefined || !Number.isInteger(a.gp) || !Number.isInteger(b.gp) || a.gp < 0 || a.gp > 255 || b.gp < 0 || b.gp > 255) return undefined
  const advance = (b.gp - a.gp + 256) % 256
  // More than half a cycle between nearby poses is likely a discontinuity, not a safe forward stride.
  if (advance >= 128) return undefined
  return Math.round(a.gp + advance * fraction) % 256
}

interface Remote {
  num: number
  name: string
  poses: Pose[]
  squash: number
  character: CharacterId
  characterTick: number
}

export interface RemoteCursor {
  num: number
  name: string
  x: number
  y: number
  item?: string
}

/** Other people in the room, as last reported, drawn slightly in the past so motion is smooth. */
export class Remotes {
  private map = new Map<number, Remote>()

  setPlayers(list: PlayerInfo[], me: number) {
    const keep = new Set<number>()
    for (const p of list) {
      if (p.num === me) continue
      keep.add(p.num)
      const r = this.map.get(p.num)
      if (r) r.name = p.name
      else this.map.set(p.num, { num: p.num, name: p.name, poses: [], squash: 0, character: 'classic', characterTick: -Infinity })
    }
    for (const n of this.map.keys()) if (!keep.has(n)) this.map.delete(n)
  }

  /** A new room snapshot may start at an earlier tick (for example after a Worker restart). */
  resetPoseHistory() {
    for (const r of this.map.values()) {
      r.poses.length = 0
      r.characterTick = -Infinity
      r.squash = 0
      // Keep the last known identity until this player sends a pose in the new timeline.
    }
  }

  addPose(num: number, p: Pose) {
    const r = this.map.get(num)
    if (!r) return
    // A new selection shows at once, even while position interpolation trails the latest pose.
    // Older clients have no identity field and keep the original Classic appearance.
    if (p.t >= r.characterTick) {
      r.character = isCharacterId(p.ch) ? p.ch : 'classic'
      r.characterTick = p.t
    }
    // Poses can arrive out of order; keep them sorted by the sender's tick.
    if (r.poses.length && p.t < r.poses[r.poses.length - 1].t) {
      r.poses.push(p)
      r.poses.sort((a, b) => a.t - b.t)
    } else r.poses.push(p)
    if (r.poses.length > 30) r.poses.splice(0, r.poses.length - 30)
  }

  bonk(num: number) {
    const r = this.map.get(num)
    if (r) r.squash = 12
  }

  get count() {
    return this.map.size
  }

  /** The interpolated pose of a remote player at `tick`. */
  private sample(r: Remote, tick: number): Pose | null {
    const list = r.poses
    if (!list.length) return null
    const t = tick - DELAY
    if (t <= list[0].t) return list[0]
    const last = list[list.length - 1]
    if (t >= last.t) return last
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1]
      const b = list[i]
      if (a.t <= t && t <= b.t) {
        if (a.m !== b.m || b.t === a.t) return b
        const f = (t - a.t) / (b.t - a.t)
        // A teleport (respawn) should not glide across the level.
        if (Math.abs(b.x - a.x) > 96 || Math.abs(b.y - a.y) > 96) return b
        const gp = gaitPhaseBetween(a, b, f)
        return { ...a, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ...(gp === undefined ? {} : { gp }) }
      }
    }
    return last
  }

  looks(tick: number): PlayerLook[] {
    const out: PlayerLook[] = []
    for (const r of this.map.values()) {
      if (r.squash > 0) r.squash--
      const p = this.sample(r, tick)
      if (!p || p.m !== 0) continue
      out.push({
        num: r.num,
        x: p.x,
        y: p.y,
        facing: p.f,
        size: p.s > 0 && p.a !== 'dead' ? 'big' : 'small',
        pose: p.a as PlayerPose,
        character: r.character,
        animationFrame: p.af,
        gait: p.ga === undefined ? undefined : p.ga === 1 ? 'run' : 'walk',
        gaitPhase: p.gp === undefined ? undefined : p.gp / 256,
        spark: p.s === 2,
        visible: p.v === 1,
        name: r.name,
        squash: r.squash || p.q,
      })
    }
    return out
  }

  /** Remote players' hitboxes, for bouncing off heads. */
  bodies(tick: number, out: OtherBody[]) {
    out.length = 0
    for (const r of this.map.values()) {
      const p = this.sample(r, tick)
      if (!p || p.m !== 0 || p.a === 'dead') continue
      const h = p.s > 0 && p.a !== 'crouch' ? sub(26) : sub(14)
      out.push({ num: r.num, x: Math.round(sub(p.x) - sub(6)), y: sub(p.y) - h, w: sub(12), h })
    }
  }

  cursors(tick: number): RemoteCursor[] {
    const out: RemoteCursor[] = []
    for (const r of this.map.values()) {
      const p = this.sample(r, tick)
      if (!p || p.m !== 1 || p.x < 0) continue
      out.push({ num: r.num, name: r.name, x: p.x, y: p.y, item: p.it })
    }
    return out
  }
}
