import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import { createPartMap } from '../brick/parts'
import { useBrickStore } from '../brick/store'
import { deriveCreations } from './model/creations'
import { ROVER_IDS, roverBricks } from './model/fixtures'
import { disconnect } from './model/control'
import { emptyRoboticsSection, readRoboticsSection, writeRoboticsSection } from './model/section'
import { installRoboticsParts } from './parts/install'
import { createMechanics } from './sim/mechanics'
import { installRoboticsWatcher, useRoboticsStore } from './state/roboticsStore'

beforeAll(async () => { await RAPIER.init(); installRoboticsParts(true); installRoboticsWatcher() })
beforeEach(() => {
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [] })
  useRoboticsStore.setState({ card: null, wiringNote: null })
  useRoboticsStore.getState().refreshModel()
})
const section = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
function place(partId: string, x: number, y: number, z: number, rotation = 0) {
  const s=useBrickStore.getState()
  s.choosePart(partId)
  for(let i=0;i<rotation;i++) s.rotate()
  s.setDraftPosition(x,y,z)
  expect(s.placeDraft()).toBe(true)
  useBrickStore.getState().cancelInteraction()
  return useBrickStore.getState().bricks.at(-1)!.id
}
function setupMotor() {
  place('plate_6x8',28,0,26)
  place('robo_hub',29,1,27)
  useRoboticsStore.getState().confirmCard('QA rover',false)
  const motor=place('robo_motor',28,1,31,2)
  return {motor,id:section().creations[0].id}
}
it.each([60,90,144,240])('one elapsed second at %i fps advances one simulation second', fps => {
  const bricks=roverBricks()
  const partMap=createPartMap([])
  const s={...emptyRoboticsSection(),creations:[{id:'qa',name:'QA',anchorBrickIds:[ROVER_IDS.hub]}],connections:[]}
  const creation=deriveCreations({bricks,partMap,plateSize:64,section:s})[0]
  const sim=createMechanics({rapier:RAPIER,bricks,partMap,plateSize:64,creation})
  try {
    for(let i=0;i<fps;i++) sim.step(1/fps)
    console.log('FRAME_RATE_QA',fps,sim.elapsed)
    expect(sim.elapsed).toBeCloseTo(1,2)
  } finally {sim.dispose()}
})
it('wiring Undo still removes only its cable after the existing creation card is confirmed',()=>{
  const {motor}=setupMotor()
  useRoboticsStore.getState().confirmCard('QA rover',false)
  console.log('UNDO_QA_TOP',useBrickStore.getState().undoStack.at(-1)?.label)
  useRoboticsStore.getState().undoWiring()
  expect(section().connections.some(c=>c.deviceId===motor)).toBe(false)
  expect(useBrickStore.getState().bricks.some(b=>b.id===motor)).toBe(true)
})
it('Reset cancels a simulation that is still starting',async()=>{
  const {id}=setupMotor()
  useRoboticsStore.getState().confirmCard('QA rover',false)
  const pending=useRoboticsStore.getState().startSim(id)
  useRoboticsStore.getState().resetSim()
  await pending
  const restarted=useRoboticsStore.getState().sim!==null
  useRoboticsStore.getState().resetSim()
  expect(restarted).toBe(false)
})
it('a cable edit retires an active simulation before using stale powered state',async()=>{
  const {id,motor}=setupMotor()
  useRoboticsStore.getState().confirmCard('QA rover',false)
  await useRoboticsStore.getState().startSim(id)
  useRoboticsStore.getState().nudgeMotor(motor,0.4)
  useBrickStore.getState().setRoboticsSection(writeRoboticsSection(disconnect(section(),motor)),'Unplug motor')
  const remained=useRoboticsStore.getState().sim!==null
  useRoboticsStore.getState().resetSim()
  expect(remained).toBe(false)
})

