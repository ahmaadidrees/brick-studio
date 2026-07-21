import { ContactShadows, Float, OrbitControls, RoundedBox, Sparkles } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { compileAssembly, readTrackColor, RED_ZONE } from '../domain/assembly'
import { PARTS } from '../domain/parts'
import type { Connection, PartId, SlotId } from '../domain/types'
import { useGameStore } from '../state/useGameStore'

const START_Z = 5.2
const ROVER_Y = 1.08

const SLOT_TRANSFORMS: Record<SlotId, { position: [number, number, number]; color: string }> = {
  drive_left: { position: [-1.08, 0, 0], color: '#8878ff' },
  drive_right: { position: [1.08, 0, 0], color: '#8878ff' },
  sensor_front: { position: [0, -0.42, -1.36], color: '#45d5c6' },
  seat_center: { position: [0, 0.72, 0.05], color: '#ffc45f' },
  cargo_rear: { position: [0, 0.58, 1.08], color: '#ffe159' },
  bumper_front: { position: [0, 0.05, -1.62], color: '#ff7f68' },
}

function isConnected(connections: Connection[], slotId: SlotId) {
  return connections.some((connection) => connection.slotId === slotId)
}

function IslandWorld() {
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[7.7, 0.35, 12]} position={[0, -0.18, -4]} />
        <mesh position={[0, -0.45, -4]} receiveShadow>
          <cylinderGeometry args={[8.8, 7.2, 1.2, 12]} />
          <meshStandardMaterial color="#936c48" roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.18, -4]} receiveShadow>
          <cylinderGeometry args={[8.75, 8.55, 0.22, 12]} />
          <meshStandardMaterial color="#8fd16a" roughness={0.82} />
        </mesh>
      </RigidBody>

      <Track />
      <Workshop />
      <Lighthouse />
      <Scenery />
      <Sparkles count={34} scale={[19, 7, 28]} size={2.1} speed={0.16} opacity={0.35} color="#fff7c2" />
    </group>
  )
}

function Track() {
  return (
    <group>
      <RoundedBox args={[4.1, 0.22, 16.4]} radius={0.14} smoothness={3} position={[0, 0.38, -3.2]} receiveShadow>
        <meshStandardMaterial color="#f4e5bd" roughness={0.9} />
      </RoundedBox>
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.51, -3.2]}>
          <planeGeometry args={[0.12, 15.8]} />
          <meshBasicMaterial color="#d7c699" />
        </mesh>
      ))}

      <RoundedBox args={[4.15, 0.26, RED_ZONE.end - RED_ZONE.start]} radius={0.08} smoothness={3} position={[0, 0.52, (RED_ZONE.start + RED_ZONE.end) / 2]}>
        <meshStandardMaterial color="#ef665c" emissive="#ff493f" emissiveIntensity={0.16} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.61, -10.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 0.56]} />
        <meshBasicMaterial color="#fff5d6" />
      </mesh>

      <group position={[0, 0.18, -5.8]}>
        <RoundedBox args={[4.5, 0.28, 4.2]} radius={0.12} smoothness={3} position={[0, 0.39, 0]}>
          <meshStandardMaterial color="#c4935d" roughness={0.8} />
        </RoundedBox>
        {[-1.85, 1.85].map((x) => (
          <group key={x} position={[x, 0.82, 0]}>
            <mesh>
              <boxGeometry args={[0.16, 0.95, 4.4]} />
              <meshStandardMaterial color="#d8584b" />
            </mesh>
            {[-1.75, -0.6, 0.6, 1.75].map((z) => (
              <mesh key={z} position={[0, 0.5, z]}>
                <boxGeometry args={[0.22, 1.1, 0.18]} />
                <meshStandardMaterial color="#f6c967" />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  )
}

function Workshop() {
  return (
    <group position={[-4.7, 0.2, 4.7]}>
      <RoundedBox args={[3.6, 0.4, 3]} radius={0.16} smoothness={3} position={[0, 0.32, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3e7f99" roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[3.15, 0.1, 2.55]} radius={0.12} smoothness={3} position={[0, 0.58, 0]}>
        <meshStandardMaterial color="#8cd7d8" roughness={0.75} />
      </RoundedBox>
      <mesh position={[0, 1.28, 1.1]}>
        <boxGeometry args={[2.7, 0.82, 0.15]} />
        <meshStandardMaterial color="#174b61" />
      </mesh>
      <TextPlate position={[0, 1.28, 1.19]} />
      {([[-1.2, -0.7], [1.2, -0.7]] as [number, number][]).map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.95, z]} castShadow>
          <cylinderGeometry args={[0.14, 0.18, 0.8, 12]} />
          <meshStandardMaterial color="#f0b64b" />
        </mesh>
      ))}
    </group>
  )
}

function TextPlate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-0.92, -0.52, -0.12, 0.28, 0.68].map((x, index) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[index === 2 ? 0.16 : 0.23, 0.32, 0.05]} />
          <meshBasicMaterial color={index === 2 ? '#ffd764' : '#ecfbff'} />
        </mesh>
      ))}
    </group>
  )
}

function Lighthouse() {
  const beam = useRef<THREE.Group>(null)
  const missionComplete = useGameStore((state) => state.missionComplete)

  useFrame((_, delta) => {
    if (beam.current) beam.current.rotation.y += delta * (missionComplete ? 2.4 : 0.65)
  })

  return (
    <group position={[0, 0.2, -14.6]}>
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[0.65, 0.95, 3.2, 12]} />
        <meshStandardMaterial color="#fff7e1" roughness={0.8} />
      </mesh>
      {[0.7, 1.75, 2.7].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.82, 0.82, 0.32, 12]} />
          <meshStandardMaterial color="#ee675c" roughness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, 3.25, 0]} castShadow>
        <cylinderGeometry args={[0.75, 0.72, 0.92, 12]} />
        <meshStandardMaterial color="#234c64" metalness={0.1} roughness={0.55} />
      </mesh>
      <mesh position={[0, 3.28, 0]}>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshStandardMaterial
          color={missionComplete ? '#fff4a5' : '#95a7b0'}
          emissive={missionComplete ? '#ffd53e' : '#23404a'}
          emissiveIntensity={missionComplete ? 3 : 0.15}
        />
      </mesh>
      <group ref={beam} position={[0, 3.3, 0]}>
        <mesh position={[2.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.55, 4.8, 16, 1, true]} />
          <meshBasicMaterial color="#fff0a0" transparent opacity={missionComplete ? 0.2 : 0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      <mesh position={[0, 3.9, 0]}>
        <coneGeometry args={[1.1, 0.65, 12]} />
        <meshStandardMaterial color="#d94f49" />
      </mesh>
    </group>
  )
}

function Scenery() {
  const shrubs = useMemo(
    () => [
      [-5.9, -1.8, 1.2],
      [5.7, -3.2, 0.9],
      [-5.5, -9.4, 1.1],
      [5.6, -11.4, 1.25],
      [-6.2, 1.7, 0.8],
    ] as [number, number, number][],
    [],
  )

  return (
    <group>
      {shrubs.map(([x, z, scale]) => (
        <group key={`${x}-${z}`} position={[x, 0.52, z]} scale={scale}>
          <mesh castShadow>
            <dodecahedronGeometry args={[0.65, 0]} />
            <meshStandardMaterial color="#4fae68" roughness={0.9} />
          </mesh>
          <mesh position={[0.55, -0.08, 0.2]} castShadow>
            <dodecahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color="#71c56f" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {([[-8.5, 2.8, -9], [9, 3.9, -2], [-7.5, 4.4, 3]] as [number, number, number][]).map(([x, y, z]) => (
        <Float key={`${x}-${z}`} speed={0.45} floatIntensity={0.8}>
          <group position={[x, y, z]}>
            {[-0.75, 0, 0.75].map((offset, index) => (
              <mesh key={offset} position={[offset, index === 1 ? 0.25 : 0, 0]}>
                <sphereGeometry args={[0.82 - Math.abs(offset) * 0.16, 12, 8]} />
                <meshStandardMaterial color="#ffffff" transparent opacity={0.78} roughness={1} />
              </mesh>
            ))}
          </group>
        </Float>
      ))}
    </group>
  )
}

function SnapSlot({ slotId, connections }: { slotId: SlotId; connections: Connection[] }) {
  const mode = useGameStore((state) => state.mode)
  const selectedPart = useGameStore((state) => state.selectedPart)
  const placePart = useGameStore((state) => state.placePart)
  const occupied = isConnected(connections, slotId)
  const compatible = PARTS[selectedPart].compatibleSlots.includes(slotId)
  const transform = SLOT_TRANSFORMS[slotId]
  const pulse = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (pulse.current) {
      const size = 1 + Math.sin(clock.elapsedTime * 4) * 0.12
      pulse.current.scale.setScalar(size)
    }
  })

  if (mode !== 'build' || occupied) return null

  return (
    <group position={transform.position}>
      <mesh
        ref={pulse}
        onClick={(event) => {
          event.stopPropagation()
          placePart(slotId)
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'default' }}
      >
        <sphereGeometry args={[compatible ? 0.24 : 0.17, 16, 12]} />
        <meshStandardMaterial
          color={compatible ? transform.color : '#7d8c91'}
          emissive={compatible ? transform.color : '#29353a'}
          emissiveIntensity={compatible ? 0.75 : 0.1}
          transparent
          opacity={compatible ? 0.94 : 0.48}
          depthWrite={false}
        />
      </mesh>
      {compatible && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.34, 0.045, 8, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  )
}

function RemovablePart({ slotId, children }: { slotId: SlotId; children: React.ReactNode }) {
  const mode = useGameStore((state) => state.mode)
  const removePart = useGameStore((state) => state.removePart)

  return (
    <group
      onClick={(event) => {
        if (mode !== 'build') return
        event.stopPropagation()
        removePart(slotId)
      }}
      onPointerOver={() => {
        if (mode === 'build') document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => { document.body.style.cursor = 'default' }}
    >
      {children}
    </group>
  )
}

function MotorModule({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? -1.04 : 1.04
  return (
    <RemovablePart slotId={side === 'left' ? 'drive_left' : 'drive_right'}>
      <group position={[x, 0, 0]}>
        <RoundedBox args={[0.38, 0.55, 1.35]} radius={0.09} smoothness={3} castShadow>
          <meshStandardMaterial color="#695ae4" roughness={0.6} />
        </RoundedBox>
        {[-0.75, 0.72].map((z) => (
          <group key={z} position={[side === 'left' ? -0.25 : 0.25, -0.24, z]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.48, 0.48, 0.32, 20]} />
              <meshStandardMaterial color="#27323a" roughness={0.85} />
            </mesh>
            <mesh position={[0, side === 'left' ? -0.17 : 0.17, 0]}>
              <cylinderGeometry args={[0.23, 0.23, 0.34, 16]} />
              <meshStandardMaterial color="#a99cff" roughness={0.55} />
            </mesh>
          </group>
        ))}
      </group>
    </RemovablePart>
  )
}

function RoverParts({ connections, sensorColor }: { connections: Connection[]; sensorColor: string }) {
  return (
    <>
      {isConnected(connections, 'drive_left') && <MotorModule side="left" />}
      {isConnected(connections, 'drive_right') && <MotorModule side="right" />}
      {isConnected(connections, 'sensor_front') && (
        <RemovablePart slotId="sensor_front">
          <group position={[0, -0.22, -1.28]}>
            <RoundedBox args={[0.55, 0.34, 0.55]} radius={0.08} smoothness={3} castShadow>
              <meshStandardMaterial color="#259f9a" roughness={0.55} />
            </RoundedBox>
            <mesh position={[0, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.1, 16]} />
              <meshStandardMaterial color={sensorColor === 'red' ? '#ff453a' : '#bdfbee'} emissive={sensorColor === 'red' ? '#ff2d27' : '#48d7ca'} emissiveIntensity={0.6} />
            </mesh>
          </group>
        </RemovablePart>
      )}
      {isConnected(connections, 'seat_center') && (
        <RemovablePart slotId="seat_center">
          <group position={[0, 0.62, 0.06]}>
            <RoundedBox args={[1.05, 0.32, 0.9]} radius={0.12} smoothness={3} castShadow>
              <meshStandardMaterial color="#f0a63d" roughness={0.62} />
            </RoundedBox>
            <RoundedBox args={[1.05, 0.9, 0.25]} radius={0.11} smoothness={3} position={[0, 0.47, 0.34]} castShadow>
              <meshStandardMaterial color="#f5bd58" roughness={0.62} />
            </RoundedBox>
          </group>
        </RemovablePart>
      )}
      {isConnected(connections, 'cargo_rear') && (
        <RemovablePart slotId="cargo_rear">
          <group position={[0, 0.76, 1.05]}>
            <RoundedBox args={[0.88, 0.78, 0.65]} radius={0.11} smoothness={3} castShadow>
              <meshStandardMaterial color="#f0d64d" emissive="#5c4f09" emissiveIntensity={0.15} roughness={0.5} metalness={0.1} />
            </RoundedBox>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[0.3, 0.08, 0.26]} />
              <meshStandardMaterial color="#fff5ad" emissive="#ffe164" emissiveIntensity={0.75} />
            </mesh>
          </group>
        </RemovablePart>
      )}
      {isConnected(connections, 'bumper_front') && (
        <RemovablePart slotId="bumper_front">
          <RoundedBox args={[1.8, 0.38, 0.28]} radius={0.1} smoothness={3} position={[0, -0.02, -1.5]} castShadow>
            <meshStandardMaterial color="#ef6d55" roughness={0.65} />
          </RoundedBox>
        </RemovablePart>
      )}
    </>
  )
}

function Rover() {
  const body = useRef<RapierRigidBody>(null)
  const connections = useGameStore((state) => state.connections)
  const mode = useGameStore((state) => state.mode)
  const program = useGameStore((state) => state.program)
  const simulationStatus = useGameStore((state) => state.simulationStatus)
  const simulationEpoch = useGameStore((state) => state.simulationEpoch)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const stopSimulation = useGameStore((state) => state.stopSimulation)
  const completeMission = useGameStore((state) => state.completeMission)
  const showToast = useGameStore((state) => state.showToast)
  const isBoarded = useGameStore((state) => state.isBoarded)
  const telemetry = useGameStore((state) => state.telemetry)
  const lastTelemetryUpdate = useRef(0)
  const currentZ = useRef(START_Z)

  const assembly = useMemo(() => compileAssembly(connections), [connections])

  useEffect(() => {
    currentZ.current = START_Z
    body.current?.setNextKinematicTranslation({ x: 0, y: ROVER_Y, z: START_Z })
  }, [simulationEpoch])

  useFrame(({ clock }, delta) => {
    if (!body.current || (mode !== 'test' && mode !== 'play')) return

    const sensorHeight = isConnected(connections, 'sensor_front') ? 0.28 : 2
    const sensorZ = currentZ.current - 1.28
    const sensorColor = isConnected(connections, 'sensor_front') ? readTrackColor(sensorZ, sensorHeight) : 'none'

    if (simulationStatus === 'running' && assembly.readyToDrive) {
      const velocity = 1.25 + (program.speed / 100) * 2.4
      currentZ.current -= velocity * Math.min(delta, 0.05)

      if (sensorColor === 'red' && program.stopOnRed) {
        stopSimulation()
        if (mode === 'play' && assembly.readyForMission) {
          completeMission()
        } else {
          showToast('Sensor saw red — program stopped both motors.')
        }
      } else if (currentZ.current < -14.2) {
        stopSimulation()
        showToast(program.stopOnRed ? 'The sensor missed the red tile. Check the build.' : 'The rover passed the lighthouse. Add the red stop block!')
      }
    }

    body.current.setNextKinematicTranslation({ x: 0, y: ROVER_Y, z: currentZ.current })

    if (clock.elapsedTime - lastTelemetryUpdate.current > 0.1) {
      lastTelemetryUpdate.current = clock.elapsedTime
      setTelemetry({
        sensorColor,
        distanceTravelled: Math.max(0, START_Z - currentZ.current),
        motorSpeed: simulationStatus === 'running' ? program.speed : 0,
      })
    }
  })

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, ROVER_Y, START_Z]}
      enabledRotations={[false, true, false]}
    >
      <CuboidCollider args={[1.18, 0.42, 1.55]} />
      <group>
        <RoundedBox args={[2.15, 0.55, 2.8]} radius={0.18} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color="#f4f0e8" roughness={0.58} />
        </RoundedBox>
        <RoundedBox args={[1.55, 0.26, 2.25]} radius={0.12} smoothness={3} position={[0, 0.39, 0]} castShadow>
          <meshStandardMaterial color="#43a7c2" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.59, -0.78]}>
          <boxGeometry args={[0.8, 0.18, 0.6]} />
          <meshStandardMaterial color="#254d61" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.7, -0.78]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.13, 16]} />
          <meshBasicMaterial color={assembly.readyToDrive ? '#77eea4' : '#ffb35c'} />
        </mesh>

        {(Object.keys(SLOT_TRANSFORMS) as SlotId[]).map((slotId) => (
          <SnapSlot key={slotId} slotId={slotId} connections={connections} />
        ))}
        <RoverParts connections={connections} sensorColor={telemetry.sensorColor} />

        {isConnected(connections, 'sensor_front') && (mode === 'test' || mode === 'play') && (
          <mesh position={[0, -0.49, -1.28]}>
            <cylinderGeometry args={[0.018, 0.018, 0.42, 8]} />
            <meshBasicMaterial color={telemetry.sensorColor === 'red' ? '#ff5146' : '#45e5d2'} transparent opacity={0.7} />
          </mesh>
        )}
      </group>
    </RigidBody>
  )
}

function Avatar() {
  const group = useRef<THREE.Group>(null)
  const mode = useGameStore((state) => state.mode)
  const telemetry = useGameStore((state) => state.telemetry)
  const isBoarded = useGameStore((state) => state.isBoarded)
  const keys = useRef(new Set<string>())
  const position = useRef(new THREE.Vector3(2.3, 1.02, 5.4))
  const facing = useRef(0)
  const { camera } = useThree()

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current.add(event.key.toLowerCase())
      const state = useGameStore.getState()
      if (event.key.toLowerCase() !== 'e' || state.mode !== 'play') return

      if (state.isBoarded) {
        state.setBoarded(false)
        position.current.set(2.1, 1.02, START_Z - state.telemetry.distanceTravelled)
        state.showToast('You hopped out. Press E near the seat to board again.')
        return
      }

      const roverZ = START_Z - state.telemetry.distanceTravelled
      const nearRover = Math.abs(position.current.z - roverZ) < 2.5 && Math.abs(position.current.x) < 2.8
      if (!isConnected(state.connections, 'seat_center')) {
        state.showToast('Add a seat in Build mode before boarding.')
      } else if (!nearRover) {
        state.showToast('Walk closer to the rover seat, then press E.')
      } else {
        state.setBoarded(true)
        if (state.simulationStatus !== 'running') state.startSimulation()
        state.showToast('All aboard! Your program is running.')
      }
    }
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (mode === 'play') position.current.set(2.3, 1.02, 5.4)
  }, [mode])

  useFrame(({ clock }, delta) => {
    if (!group.current || mode !== 'play') return
    const roverZ = START_Z - telemetry.distanceTravelled

    if (isBoarded) {
      position.current.set(0, 2.12, roverZ + 0.04)
      facing.current = Math.PI
    } else {
      const forward = Number(keys.current.has('w') || keys.current.has('arrowup')) - Number(keys.current.has('s') || keys.current.has('arrowdown'))
      const sideways = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft'))
      const direction = new THREE.Vector3(sideways, 0, -forward)
      if (direction.lengthSq() > 0) {
        direction.normalize()
        position.current.addScaledVector(direction, delta * 4.2)
        position.current.x = THREE.MathUtils.clamp(position.current.x, -6.6, 6.6)
        position.current.z = THREE.MathUtils.clamp(position.current.z, -15.2, 6.5)
        facing.current = Math.atan2(direction.x, direction.z)
      }
    }

    group.current.position.copy(position.current)
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, facing.current, 0.18)
    const walking = !isBoarded && keys.current.size > 0
    group.current.position.y = position.current.y + (walking ? Math.abs(Math.sin(clock.elapsedTime * 8)) * 0.08 : 0)

    const cameraTarget = position.current.clone().add(new THREE.Vector3(0, 1.05, 0))
    const desiredCamera = position.current.clone().add(new THREE.Vector3(5.4, 4.4, 7.1))
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, delta))
    camera.lookAt(cameraTarget)
  })

  if (mode !== 'play') return null

  return (
    <group ref={group} position={[2.3, 1.02, 5.4]}>
      <RoundedBox args={[0.65, 0.76, 0.48]} radius={0.13} smoothness={3} position={[0, 0.68, 0]} castShadow>
        <meshStandardMaterial color="#ec7358" roughness={0.65} />
      </RoundedBox>
      <RoundedBox args={[0.7, 0.62, 0.58]} radius={0.16} smoothness={3} position={[0, 1.39, 0]} castShadow>
        <meshStandardMaterial color="#f6c88a" roughness={0.7} />
      </RoundedBox>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 1.48, -0.3]}>
          <sphereGeometry args={[0.055, 12, 8]} />
          <meshBasicMaterial color="#183945" />
        </mesh>
      ))}
      {[-0.22, 0.22].map((x) => (
        <RoundedBox key={x} args={[0.22, 0.62, 0.24]} radius={0.08} smoothness={2} position={[x, 0.05, 0]} castShadow>
          <meshStandardMaterial color="#2f607a" roughness={0.7} />
        </RoundedBox>
      ))}
      <mesh position={[0, 1.76, 0]}>
        <cylinderGeometry args={[0.43, 0.47, 0.15, 16]} />
        <meshStandardMaterial color="#3d7190" />
      </mesh>
    </group>
  )
}

function CameraController() {
  const mode = useGameStore((state) => state.mode)
  if (mode === 'play') return null

  return (
    <OrbitControls
      makeDefault
      target={[0, 0.8, 0]}
      minDistance={6}
      maxDistance={27}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2.06}
      enablePan={false}
    />
  )
}

export default function RoverIslandScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.65]}
      camera={{ position: [10.5, 8.4, 13.5], fov: 46, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#bcecf4']} />
      <fog attach="fog" args={['#bcecf4', 28, 58]} />
      <ambientLight intensity={1.35} />
      <hemisphereLight color="#f6fcff" groundColor="#7d9b67" intensity={1.4} />
      <directionalLight
        castShadow
        position={[9, 16, 11]}
        intensity={2.2}
        color="#fff2cc"
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <Physics gravity={[0, -9.81, 0]} timeStep="vary">
        <IslandWorld />
        <Rover />
      </Physics>
      <Avatar />
      <ContactShadows position={[0, 0.3, -3]} scale={24} opacity={0.2} blur={2.6} far={9} />
      <CameraController />
    </Canvas>
  )
}
