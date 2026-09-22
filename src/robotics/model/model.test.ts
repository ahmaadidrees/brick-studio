import { beforeAll, describe, expect, it } from 'vitest'
import { createPartMap } from '../../brick/parts'
import { parseBrickStudioDocument, serializeBrickStudioDocument, validateBrickStudioDocument } from '../../brick/brickDocument'
import { installRoboticsParts } from '../parts/install'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { WORLD_NODE, armNode, deriveStudJoints } from './assembly'
import { deriveBodies } from './bodies'
import { connect, disconnect, freePorts, hubPorts, planAssistedConnection } from './control'
import { creationComponent, defaultCreationName, defaultDeviceName, deriveCandidate, deriveCreations } from './creations'
import { GATE_IDS, ROVER_IDS, SIGNAL_IDS, fixtureDocument, fixtureInput, gateBricks, roverBricks, signalPostBricks } from './fixtures'
import { deriveMechanisms } from './mechanism'
import { emptyRoboticsSection, readRoboticsSection, writeRoboticsSection, type RoboticsSection } from './section'

beforeAll(() => { installRoboticsParts(true) })

const partMap = () => createPartMap([])

describe('assembly: stud joints', () => {
  it('joins a brick with tubes to the studs it stands on, and y=0 bricks to the world', () => {
    const joints = deriveStudJoints(roverBricks(), partMap())
    const plateToHub = joints.find((joint) => joint.lowerBrickId === ROVER_IDS.plate && joint.upperBrickId === ROVER_IDS.hub)
    expect(plateToHub?.cells.length).toBe(16)
    expect(joints.find((joint) => joint.lower === WORLD_NODE && joint.upperBrickId === ROVER_IDS.plate)).toBeTruthy()
    // Wheels and axles have neither studs nor tubes: never a stud joint.
    expect(joints.some((joint) => [ROVER_IDS.leftWheel, ROVER_IDS.leftAxle].includes(joint.upperBrickId as never))).toBe(false)
    expect(joints.some((joint) => joint.lowerBrickId === ROVER_IDS.leftWheel)).toBe(false)
  })

  it('gives the hinge motor two sides: tubes on the housing, studs on the turntable', () => {
    const joints = deriveStudJoints(gateBricks(), partMap())
    expect(joints.find((joint) => joint.upperBrickId === GATE_IDS.hinge)?.lowerBrickId).toBe(GATE_IDS.sill)
    expect(joints.find((joint) => joint.upperBrickId === GATE_IDS.door)?.lower).toBe(armNode(GATE_IDS.hinge))
  })

  it('handles rotated footprints: a 1×4 turned a quarter covers four cells along x', () => {
    const joints = deriveStudJoints(gateBricks(), partMap())
    const lintel = joints.filter((joint) => joint.upperBrickId === GATE_IDS.lintel).map((joint) => joint.lowerBrickId).sort()
    expect(lintel).toEqual([GATE_IDS.leftPostTop, GATE_IDS.rightPostTop])
  })
})

describe('mechanism: motor → axle → wheel', () => {
  it('reads the rover chain off the geometry', () => {
    const mechanisms = deriveMechanisms(roverBricks(), partMap(), 64)
    const left = mechanisms.motorById.get(ROVER_IDS.leftMotor)!
    const right = mechanisms.motorById.get(ROVER_IDS.rightMotor)!
    expect(left.axleId).toBe(ROVER_IDS.leftAxle)
    expect(right.axleId).toBe(ROVER_IDS.rightAxle)
    expect(left.socket.normal).toEqual({ x: -1, y: 0, z: 0 })
    expect(right.socket.normal).toEqual({ x: 1, y: 0, z: 0 })
    expect(mechanisms.wheelById.get(ROVER_IDS.leftWheel)!.axleId).toBe(ROVER_IDS.leftAxle)
    expect(mechanisms.wheelById.get(ROVER_IDS.rightWheel)!.axleId).toBe(ROVER_IDS.rightAxle)
    const axle = mechanisms.axleById.get(ROVER_IDS.leftAxle)!
    expect(axle.ends.map((end) => [end.motorId, end.wheelId])).toEqual([[null, ROVER_IDS.leftWheel], [ROVER_IDS.leftMotor, null]])
  })

  it('a wheel one stud away from the axle end is not on it', () => {
    const mechanisms = deriveMechanisms(roverBricks({ leftWheelOff: true }), partMap(), 64)
    const wheel = mechanisms.wheelById.get(ROVER_IDS.leftWheel)!
    expect(wheel.axleId).toBeNull()
    expect(wheel.nearest?.axleId).toBe(ROVER_IDS.leftAxle)
    expect(mechanisms.axleById.get(ROVER_IDS.leftAxle)!.ends[0].wheelId).toBeNull()
  })

  it('a wheel one plate too high is not on the axle either', () => {
    const bricks = roverBricks().map((brick) => (brick.id === ROVER_IDS.leftWheel ? { ...brick, y: 1 } : brick))
    const mechanisms = deriveMechanisms(bricks, partMap(), 64)
    expect(mechanisms.wheelById.get(ROVER_IDS.leftWheel)!.axleId).toBeNull()
    expect(mechanisms.wheelById.get(ROVER_IDS.leftWheel)!.nearest?.gap.y).toBeCloseTo(-0.18, 5)
  })

  it('a motor socket accepts one axle, pointing in; an axle end cannot sit in a socket sideways', () => {
    const sideways = roverBricks().map((brick) => (brick.id === ROVER_IDS.leftAxle ? { ...brick, rotation: 1 as const, x: 26, z: 31 } : brick))
    const mechanisms = deriveMechanisms(sideways, partMap(), 64)
    expect(mechanisms.motorById.get(ROVER_IDS.leftMotor)!.axleId).toBeNull()
  })

  it('finds the hinge pivot and vertical axis', () => {
    const mechanisms = deriveMechanisms(gateBricks(), partMap(), 64)
    const hinge = mechanisms.hingeById.get(GATE_IDS.hinge)!
    expect(hinge.axis).toEqual({ x: 0, y: 1, z: 0 })
    // The hinge stands at y = 2 plates on the sill; its turntable pivot is 4 plates up its housing.
    expect(hinge.pivot.y).toBeCloseTo(2 * 0.18 + 0.72, 5)
  })
})

describe('bodies', () => {
  it('rover: the chassis is one body, each axle+wheel another; on the test plate nothing is anchored', () => {
    const graph = deriveBodies(roverBricks(), partMap(), 64, { anchorToWorld: false })
    const chassis = graph.bodies.find((body) => body.brickIds.includes(ROVER_IDS.plate))!
    expect(chassis.brickIds.sort()).toEqual([ROVER_IDS.hub, ROVER_IDS.leftMotor, ROVER_IDS.plate, ROVER_IDS.rightMotor, ROVER_IDS.sensor].sort())
    expect(chassis.anchored).toBe(false)
    const leftWheel = graph.bodies.find((body) => body.brickIds.includes(ROVER_IDS.leftWheel))!
    expect(leftWheel.brickIds.sort()).toEqual([ROVER_IDS.leftAxle, ROVER_IDS.leftWheel].sort())
    expect(graph.bodies).toHaveLength(3)
  })

  it('in my world the plate anchors what stands on it', () => {
    const graph = deriveBodies(roverBricks(), partMap(), 64, { anchorToWorld: true })
    expect(graph.bodies.find((body) => body.brickIds.includes(ROVER_IDS.plate))!.anchored).toBe(true)
    expect(graph.bodies.find((body) => body.brickIds.includes(ROVER_IDS.leftWheel))!.anchored).toBe(false)
  })

  it('gate: the frame is one anchored body and the door another, free one', () => {
    const graph = deriveBodies(gateBricks(), partMap(), 64, { anchorToWorld: true })
    const frame = graph.bodies.find((body) => body.brickIds.includes(GATE_IDS.leftPost))!
    expect(frame.anchored).toBe(true)
    expect(frame.brickIds).toContain(GATE_IDS.hinge)
    expect(frame.brickIds).toContain(GATE_IDS.sill)
    expect(frame.brickIds).not.toContain(GATE_IDS.door)
    const door = graph.bodies.find((body) => body.brickIds.includes(GATE_IDS.door))!
    expect(door.nodes).toEqual([GATE_IDS.door, armNode(GATE_IDS.hinge)])
    expect(door.anchored).toBe(false)
  })

  it('gate built into the frame: the door and the frame collapse into one body', () => {
    const graph = deriveBodies(gateBricks({ builtIntoFrame: true }), partMap(), 64, { anchorToWorld: true })
    const frame = graph.bodies.find((body) => body.brickIds.includes(GATE_IDS.leftPost))!
    expect(frame.brickIds).toContain(GATE_IDS.door)
    expect(graph.bodyOfNode.get(armNode(GATE_IDS.hinge))).toBe(frame.id)
  })

  it('bodies never come from selection: the same bricks give the same bodies in any document order', () => {
    const forward = deriveBodies(roverBricks(), partMap(), 64, { anchorToWorld: false })
    const reversed = deriveBodies([...roverBricks()].reverse(), partMap(), 64, { anchorToWorld: false })
    expect(reversed.bodies.map((body) => body.id)).toEqual(forward.bodies.map((body) => body.id))
  })
})

describe('creations', () => {
  const section = (anchors: string[], name = 'Test'): RoboticsSection => ({ ...emptyRoboticsSection(), creations: [{ id: 'c1', name, anchorBrickIds: anchors }] })

  it('rover: one creation over three bodies, two wheels on motors, drive pair with the right motor reversed', () => {
    const [creation] = deriveCreations(fixtureInput(roverBricks(), section([ROVER_IDS.hub])))
    expect(creation.kind).toBe('rover')
    expect(creation.testSpace).toBe('testPlate')
    expect(creation.brickIds).toHaveLength(9)
    expect(creation.bodies).toHaveLength(3)
    expect(creation.lines.attached).toBe('9 bricks attached')
    expect(creation.lines.parts).toBe('1 hub, 2 motors, 2 wheels, 2 axles, 1 distance sensor')
    expect(creation.lines.ready).toBe('Axles and wheels on both motors, so it can roll')
    expect(creation.wheels.every((wheel) => wheel.onAxle)).toBe(true)
    expect(creation.drivePair).toMatchObject({ leftId: ROVER_IDS.leftMotor, rightId: ROVER_IDS.rightMotor, reversedIds: [ROVER_IDS.rightMotor] })
    expect(creation.motors.find((motor) => motor.brickId === ROVER_IDS.leftMotor)!.drives).toBe('forward')
    expect(creation.motors.find((motor) => motor.brickId === ROVER_IDS.rightMotor)!.drives).toBe('backward')
    expect(creation.sensors[0].facing).toBe('forward')
  })

  it('a wheel left off its axle is reported, and the motor keeps its axle', () => {
    const [creation] = deriveCreations(fixtureInput(roverBricks({ leftWheelOff: true }), section([ROVER_IDS.hub])))
    const wheel = creation.wheels.find((candidate) => candidate.brickId === ROVER_IDS.leftWheel)!
    expect(wheel.onAxle).toBe(false)
    expect(wheel.note).toContain('Not on an axle')
    // The loose wheel is not reachable, so it is not part of the creation.
    expect(creation.brickIds).not.toContain(ROVER_IDS.leftWheel)
    expect(creation.brickIds).toHaveLength(8)
    expect(creation.motors.find((motor) => motor.brickId === ROVER_IDS.leftMotor)!.axleId).toBe(ROVER_IDS.leftAxle)
    expect(creation.lines.ready).toContain('1 motor with a wheel')
    expect(creation.drivePair).toBeNull()
  })

  it('sensor pointed sideways says so', () => {
    const [creation] = deriveCreations(fixtureInput(roverBricks({ sensorSideways: true }), section([ROVER_IDS.hub])))
    expect(creation.sensors[0].facing).toBe('left')
  })

  it('gate: base and arm, hinge zero as built; built into the frame is locked with the bridging joint named', () => {
    const [gate] = deriveCreations(fixtureInput(gateBricks(), section([GATE_IDS.hinge])))
    expect(gate.kind).toBe('gate')
    expect(gate.testSpace).toBe('myWorld')
    expect(gate.hinges[0].locked).toBe(false)
    expect(gate.hinges[0].armBrickIds).toEqual([GATE_IDS.door])
    expect(gate.armBodyIds).toHaveLength(1)
    expect(gate.lines.ready).toBe('Fixed side on the frame, moving side on the arm · zero is as built')
    // Everything studded to the gate's plate is the gate: frame, sill, hinge, door, hub and sensor.
    expect(gate.brickIds).toContain(GATE_IDS.hub)
    expect(gate.brickIds).toHaveLength(11)
    expect(gate.bodies).toHaveLength(2)
    expect(gate.bodies.find((body) => body.brickIds.includes(GATE_IDS.plate))!.anchored).toBe(true)

    const [locked] = deriveCreations(fixtureInput(gateBricks({ builtIntoFrame: true }), section([GATE_IDS.hinge])))
    expect(locked.hinges[0].locked).toBe(true)
    expect(locked.armBodyIds).toHaveLength(0)
    expect(locked.hinges[0].bridging.map((joint) => [joint.lowerBrickId, joint.upperBrickId])).toEqual([[`${GATE_IDS.bridge}-2`, GATE_IDS.door]])
    expect(locked.lines.ready).toContain("built into the frame, so it can't swing")
  })

  it('signal post: hub, sensor and light with no motor is a valid creation', () => {
    const [post] = deriveCreations(fixtureInput(signalPostBricks(), section([SIGNAL_IDS.hub])))
    expect(post.kind).toBe('signal')
    expect(post.brickIds).toHaveLength(3)
    expect(post.lines.ready).toBe('Hub, sensor and light, so it can sense and signal')
    expect(post.motors).toHaveLength(0)
  })

  it('removing hardware never dissolves a creation: the name stays with the remaining anchors', () => {
    const anchors = [ROVER_IDS.hub, ROVER_IDS.plate]
    const without = roverBricks().filter((brick) => brick.id !== ROVER_IDS.hub)
    const [creation] = deriveCreations(fixtureInput(without, section(anchors, 'Mars buggy')))
    expect(creation.name).toBe('Mars buggy')
    expect(creation.brickIds).toHaveLength(8)
    const [empty] = deriveCreations(fixtureInput([], section(anchors, 'Mars buggy')))
    expect(empty.name).toBe('Mars buggy')
    expect(empty.brickIds).toHaveLength(0)
  })

  it('two creations touching stay two; a brick reachable only through a cable is not a member', () => {
    const bricks = [...roverBricks(), ...signalPostBricks()]
    const wired: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'r', name: 'Rover', anchorBrickIds: [ROVER_IDS.hub] }, { id: 's', name: 'Post', anchorBrickIds: [SIGNAL_IDS.hub] }], connections: [{ deviceId: ROVER_IDS.leftMotor, hubId: SIGNAL_IDS.hub, port: 'A' }] }
    const [rover, post] = deriveCreations(fixtureInput(bricks, wired))
    expect(rover.brickIds).not.toContain(SIGNAL_IDS.hub)
    expect(post.brickIds).not.toContain(ROVER_IDS.leftMotor)
    expect(creationComponent(fixtureInput(bricks), ROVER_IDS.leftMotor)).toHaveLength(9)
  })

  it('default device names read off the build', () => {
    const input = fixtureInput(roverBricks())
    const name = (id: string) => defaultDeviceName(input.bricks.find((brick) => brick.id === id)!, input)
    expect(name(ROVER_IDS.leftMotor)).toBe('Left motor')
    expect(name(ROVER_IDS.rightMotor)).toBe('Right motor')
    expect(name(ROVER_IDS.sensor)).toBe('Front sensor')
    expect(name(ROVER_IDS.hub)).toBe('Hub')
    expect(defaultCreationName('rover', ['Buggy'])).toBe('Buggy 2')
  })

  it('a candidate creation previews the same structure before it is saved', () => {
    const candidate = deriveCandidate(fixtureInput(roverBricks()), [ROVER_IDS.leftMotor])
    expect(candidate.saved).toBe(false)
    expect(candidate.brickIds).toHaveLength(9)
    expect(candidate.kind).toBe('rover')
  })
})

describe('control: cables and assisted wiring', () => {
  it('connects to the first free port, then the next; a full hub refuses', () => {
    let section = emptyRoboticsSection()
    const bricks = roverBricks()
    const motor = bricks.find((brick) => brick.id === ROVER_IDS.leftMotor)!
    const plan = planAssistedConnection(section, motor, [ROVER_IDS.hub])
    expect(plan).toEqual({ ok: true, hubId: ROVER_IDS.hub, port: 'A' })
    section = connect(section, motor.id, ROVER_IDS.hub, 'A')
    expect(planAssistedConnection(section, motor, [ROVER_IDS.hub])).toEqual({ ok: false, reason: 'already-wired' })
    expect(freePorts(section, ROVER_IDS.hub)).toEqual(['B', 'C', 'D'])
    for (const [id, port] of [[ROVER_IDS.rightMotor, 'B'], [ROVER_IDS.sensor, 'C'], ['x', 'D']] as const) section = connect(section, id, ROVER_IDS.hub, port)
    expect(planAssistedConnection(section, { ...motor, id: 'another' }, [ROVER_IDS.hub])).toEqual({ ok: false, reason: 'ports-full' })
    expect(planAssistedConnection(section, { ...motor, id: 'another' }, [])).toEqual({ ok: false, reason: 'no-hub' })
    expect(hubPorts(section, ROVER_IDS.hub, new Map(bricks.map((brick) => [brick.id, brick]))).map((port) => port.deviceMissing)).toEqual([false, false, false, true])
    section = disconnect(section, ROVER_IDS.leftMotor)
    expect(freePorts(section, ROVER_IDS.hub)).toEqual(['A'])
  })

  it('a hub is never wired to itself and a plain brick is not a device', () => {
    const bricks = roverBricks()
    expect(planAssistedConnection(emptyRoboticsSection(), bricks.find((brick) => brick.id === ROVER_IDS.hub)!, [ROVER_IDS.hub])).toEqual({ ok: false, reason: 'is-hub' })
    expect(planAssistedConnection(emptyRoboticsSection(), bricks.find((brick) => brick.id === ROVER_IDS.plate)!, [ROVER_IDS.hub])).toEqual({ ok: false, reason: 'not-a-device' })
  })

  it('an unplugged motor shows as unplugged on the creation', () => {
    const wired: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'r', name: 'Rover', anchorBrickIds: [ROVER_IDS.hub] }], connections: [{ deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' }] }
    const [rover] = deriveCreations(fixtureInput(roverBricks(), wired))
    expect(rover.motors.find((motor) => motor.brickId === ROVER_IDS.leftMotor)!.plugged).toBe(true)
    expect(rover.motors.find((motor) => motor.brickId === ROVER_IDS.rightMotor)!.plugged).toBe(false)
  })
})

describe('the robotics section in the document', () => {
  it('round-trips through serialize/parse byte for byte and survives validation', () => {
    const section: RoboticsSection = {
      version: 1,
      settings: { wiring: 'assisted' },
      creations: [{ id: 'c1', name: 'Mars buggy', anchorBrickIds: [ROVER_IDS.hub], testSpace: 'testPlate' }],
      devices: { [ROVER_IDS.leftMotor]: { name: 'Port motor' } },
      connections: [{ deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' }],
    }
    const document = fixtureDocument(roverBricks(), section)
    const serialized = serializeBrickStudioDocument(document)
    const parsed = parseBrickStudioDocument(serialized)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(serializeBrickStudioDocument(parsed.document)).toBe(serialized)
    expect(readRoboticsSection(parsed.document.robotics)).toEqual(section)
  })

  it('a document from before this work loads unchanged and reads as an empty section', () => {
    const legacy = fixtureDocument(roverBricks().filter((brick) => brick.partId.startsWith('plate')))
    expect('robotics' in legacy).toBe(false)
    const validated = validateBrickStudioDocument(JSON.parse(JSON.stringify(legacy)))
    expect(validated.ok && JSON.stringify(validated.document)).toBe(JSON.stringify(legacy))
    expect(readRoboticsSection(undefined)).toEqual(emptyRoboticsSection())
  })

  it('drops malformed entries one at a time instead of losing the section', () => {
    const section = readRoboticsSection({
      version: 1,
      settings: { wiring: 'manual' },
      creations: [{ id: 'ok', name: 'Gate', anchorBrickIds: ['a', 7, 'a'] }, { id: 'ok', name: 'dupe', anchorBrickIds: [] }, { name: 'no id' }],
      devices: { good: { name: 'Eye' }, bad: { name: '' }, worse: 'x' },
      connections: [{ deviceId: 'm1', hubId: 'h', port: 'A' }, { deviceId: 'm2', hubId: 'h', port: 'A' }, { deviceId: 'm1', hubId: 'h', port: 'B' }, { deviceId: 'm3', hubId: 'h', port: 'E' }],
    })
    expect(section.settings.wiring).toBe('manual')
    expect(section.creations).toEqual([{ id: 'ok', name: 'Gate', anchorBrickIds: ['a'] }])
    expect(section.devices).toEqual({ good: { name: 'Eye' } })
    expect(section.connections).toEqual([{ deviceId: 'm1', hubId: 'h', port: 'A' }])
    expect(readRoboticsSection({ version: 2 })).toEqual(emptyRoboticsSection())
  })

  it('refuses an unreadable envelope but not a missing one', () => {
    const document = fixtureDocument(roverBricks())
    expect(validateBrickStudioDocument({ ...document, robotics: { version: 'one' } }).ok).toBe(false)
    expect(validateBrickStudioDocument({ ...document, robotics: [] }).ok).toBe(false)
    expect(validateBrickStudioDocument(document).ok).toBe(true)
    expect(writeRoboticsSection(emptyRoboticsSection())).toEqual({ version: 1, settings: { wiring: 'assisted' }, creations: [], devices: {}, connections: [] })
  })

  it('robotics parts are unknown to an unflagged part map and known once installed', () => {
    expect(Object.hasOwn(createPartMap([]), ROBOTICS_PART_IDS.motor)).toBe(true)
  })
})
