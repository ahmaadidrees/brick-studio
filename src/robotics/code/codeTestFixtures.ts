import { vi } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { GATE_IDS, ROVER_IDS, fixtureDocument, gateBricks, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection, readRoboticsSection, type RoboticsSection } from '../model/section'
import type { RoboticsProgram } from '../program/types'
import { useRoboticsStore } from '../state/roboticsStore'

/**
 * Test support (not shipped): the spike's rover and gate loaded into the real brick store
 * as named, wired creations, the way a saved world opens.
 */
export const ROVER_SECTION: RoboticsSection = {
  ...emptyRoboticsSection(),
  creations: [{ id: 'rover', name: 'Mars buggy', anchorBrickIds: [ROVER_IDS.hub] }],
  connections: [
    { deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' },
    { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' },
    { deviceId: ROVER_IDS.sensor, hubId: ROVER_IDS.hub, port: 'C' },
  ],
}

export const GATE_SECTION: RoboticsSection = {
  ...emptyRoboticsSection(),
  creations: [{ id: 'gate', name: 'Castle gate', anchorBrickIds: [GATE_IDS.hinge] }],
  connections: [{ deviceId: GATE_IDS.hinge, hubId: GATE_IDS.hub, port: 'A' }, { deviceId: GATE_IDS.sensor, hubId: GATE_IDS.hub, port: 'B' }],
}

export function loadWorld(bricks = roverBricks(), section: RoboticsSection = ROVER_SECTION) {
  const result = useBrickStore.getState().restoreDocument(fixtureDocument(bricks, section))
  if (!result.ok) throw new Error('fixture document did not load')
  useBrickStore.setState({ undoStack: [], redoStack: [], mode: 'build' })
  useRoboticsStore.getState().refreshModel()
}

export const storedSection = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
export const storedPrograms = (creationId = 'rover'): RoboticsProgram[] => storedSection().programs.filter((program) => program.creationId === creationId)

/** A saved program with the given workspace, for loading into a fixture section. */
export function programRecord(id: string, workspace: unknown, extra: Partial<RoboticsProgram> = {}): RoboticsProgram {
  return { id, creationId: 'rover', name: 'Test program', workspace, deviceNames: {}, revision: 3, ...extra }
}

/**
 * jsdom has no canvas text metrics and no SVG boxes; Blockly measures field text with a
 * 2D context and positions warning bubbles from `getBBox`. Rough stand-ins keep the
 * workspace laid out and the console quiet.
 */
export function stubBlocklyLayout() {
  const context = { font: '', measureText: (text: string) => ({ width: text.length * 7 }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as unknown as CanvasRenderingContext2D)
  const proto = SVGElement.prototype as unknown as { getBBox?: () => DOMRect }
  if (!proto.getBBox) proto.getBBox = () => ({ x: 0, y: 0, width: 40, height: 20 }) as DOMRect
}
