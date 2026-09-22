import type { BrickInstance } from '../../brick/types'
import { WORLD_NODE, armNode, brickIdOfNode, deriveStudJoints, type AssemblyNode, type StudJoint } from './assembly'
import type { PartMap } from './grid'
import { deriveMechanisms, type Mechanisms } from './mechanism'
import { roboticsSpec } from '../parts/catalog'

/**
 * Rigid bodies (contract §2): the connected components of the assembly graph.
 * Stud joints join two nodes rigidly; so does a wheel on an axle end (the wheel is
 * keyed to the axle and turns with it). A motor and the axle in its socket are NOT
 * joined: that is the mechanism's degree of freedom, and the same goes for the two
 * sides of a hinge motor. Bodies are derived from what is attached, never from
 * selection, grouping or naming.
 *
 * `anchorToWorld` decides whether the build plate's studs count. In *My world* a
 * brick standing on the plate is fixed to the ground (a gate frame stays put); on
 * the *Test plate* the creation has been picked up and set down free, so nothing is
 * anchored (a rover built on the plate can roll). Contract §7.5.
 */
export type RigidBody = {
  id: string
  nodes: AssemblyNode[]
  /** Distinct bricks (a hinge motor appears in the body of each of its sides). */
  brickIds: string[]
  anchored: boolean
}

export type BodyGraph = {
  bodies: RigidBody[]
  bodyOfNode: Map<AssemblyNode, string>
  joints: StudJoint[]
  mechanisms: Mechanisms
}

class UnionFind {
  private parent = new Map<string, string>()
  find(node: string): string {
    if (!this.parent.has(node)) { this.parent.set(node, node); return node }
    let root: string = node
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string
    // Path compression.
    let current: string = node
    while (current !== root) {
      const next = this.parent.get(current) as string
      this.parent.set(current, root)
      current = next
    }
    return root
  }
  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

export type DeriveBodiesOptions = { anchorToWorld: boolean; mechanisms?: Mechanisms; joints?: StudJoint[] }

export function deriveBodies(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number, options: DeriveBodiesOptions): BodyGraph {
  const joints = options.joints ?? deriveStudJoints(bricks, partMap)
  const mechanisms = options.mechanisms ?? deriveMechanisms(bricks, partMap, plateSize)
  const nodes: AssemblyNode[] = []
  for (const brick of bricks) {
    if (!partMap[brick.partId]) continue
    nodes.push(brick.id)
    if (roboticsSpec(brick.partId)?.hinge) nodes.push(armNode(brick.id))
  }
  const sets = new UnionFind()
  for (const node of nodes) sets.find(node)
  if (options.anchorToWorld) sets.find(WORLD_NODE)
  for (const joint of joints) {
    if (joint.lower === WORLD_NODE) {
      if (options.anchorToWorld) sets.union(WORLD_NODE, joint.upper)
      continue
    }
    sets.union(joint.lower, joint.upper)
  }
  for (const axle of mechanisms.axles) {
    for (const end of axle.ends) if (end.wheelId) sets.union(axle.axleId, end.wheelId)
  }

  const members = new Map<string, AssemblyNode[]>()
  for (const node of nodes) {
    const root = sets.find(node)
    const list = members.get(root) ?? []
    list.push(node)
    members.set(root, list)
  }
  const worldRoot = options.anchorToWorld ? sets.find(WORLD_NODE) : null
  const bodies: RigidBody[] = [...members.values()].map((groupNodes) => {
    const brickIds = [...new Set(groupNodes.map((node) => brickIdOfNode(node)!))]
    const sortedNodes = [...groupNodes].sort()
    return { id: `body:${sortedNodes[0]}`, nodes: sortedNodes, brickIds: brickIds.sort(), anchored: worldRoot !== null && sets.find(groupNodes[0]) === worldRoot }
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const bodyOfNode = new Map<AssemblyNode, string>()
  for (const body of bodies) for (const node of body.nodes) bodyOfNode.set(node, body.id)
  return { bodies, bodyOfNode, joints, mechanisms }
}

export function bodyOfBrick(graph: BodyGraph, brickId: string): RigidBody | null {
  const id = graph.bodyOfNode.get(brickId)
  return id ? graph.bodies.find((body) => body.id === id) ?? null : null
}
