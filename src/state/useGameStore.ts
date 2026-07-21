import { create } from 'zustand'
import { compileAssembly } from '../domain/assembly'
import { PART_ORDER, PARTS } from '../domain/parts'
import type {
  Connection,
  GameMode,
  PartId,
  RoverProgram,
  SimulationStatus,
  SlotId,
  Telemetry,
} from '../domain/types'

type BuildSnapshot = Connection[]

type GameState = {
  mode: GameMode
  selectedPart: PartId
  connections: Connection[]
  undoStack: BuildSnapshot[]
  redoStack: BuildSnapshot[]
  program: RoverProgram
  simulationStatus: SimulationStatus
  simulationEpoch: number
  telemetry: Telemetry
  isBoarded: boolean
  missionComplete: boolean
  toast: string | null
  setMode: (mode: GameMode) => void
  selectPart: (partId: PartId) => void
  placePart: (slotId: SlotId) => boolean
  removePart: (slotId: SlotId) => void
  undo: () => void
  redo: () => void
  setProgramSpeed: (speed: number) => void
  setStopOnRed: (enabled: boolean) => void
  startSimulation: () => void
  stopSimulation: () => void
  resetSimulation: () => void
  setTelemetry: (telemetry: Partial<Telemetry>) => void
  setBoarded: (boarded: boolean) => void
  completeMission: () => void
  showToast: (message: string | null) => void
}

const initialTelemetry: Telemetry = {
  sensorColor: 'none',
  distanceTravelled: 0,
  motorSpeed: 0,
}

function cloneConnections(connections: Connection[]) {
  return connections.map((connection) => ({ ...connection }))
}

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'build',
  selectedPart: 'motor_left',
  connections: [],
  undoStack: [],
  redoStack: [],
  program: { speed: 55, stopOnRed: false },
  simulationStatus: 'idle',
  simulationEpoch: 0,
  telemetry: initialTelemetry,
  isBoarded: false,
  missionComplete: false,
  toast: null,

  setMode: (mode) => {
    const current = get()
    if ((mode === 'test' || mode === 'play') && !compileAssembly(current.connections).readyToDrive) {
      set({ toast: 'Your rover needs both drive motors before it can move.' })
      return
    }

    set({
      mode,
      simulationStatus: 'idle',
      simulationEpoch: current.simulationEpoch + 1,
      telemetry: initialTelemetry,
      isBoarded: false,
      missionComplete: false,
      toast: null,
    })
  },

  selectPart: (selectedPart) => set({ selectedPart, toast: null }),

  placePart: (slotId) => {
    const state = get()
    const definition = PARTS[state.selectedPart]
    if (!definition.compatibleSlots.includes(slotId)) {
      set({ toast: `${definition.shortName} does not fit that connector.` })
      return false
    }
    if (state.connections.some((connection) => connection.slotId === slotId)) {
      set({ toast: 'That connector is already occupied.' })
      return false
    }

    const next = [
      ...state.connections,
      { instanceId: `${state.selectedPart}-${Date.now()}`, partId: state.selectedPart, slotId },
    ]
    const nextSuggestedPart = PART_ORDER.find((partId) => !next.some((connection) => connection.partId === partId))
    set({
      connections: next,
      undoStack: [...state.undoStack, cloneConnections(state.connections)],
      redoStack: [],
      selectedPart: nextSuggestedPart ?? state.selectedPart,
      toast: `${definition.shortName} snapped into place!`,
    })
    return true
  },

  removePart: (slotId) => {
    const state = get()
    const next = state.connections.filter((connection) => connection.slotId !== slotId)
    if (next.length === state.connections.length) return
    set({
      connections: next,
      undoStack: [...state.undoStack, cloneConnections(state.connections)],
      redoStack: [],
      toast: 'Part returned to the tray.',
    })
  },

  undo: () => {
    const state = get()
    const previous = state.undoStack.at(-1)
    if (!previous) return
    set({
      connections: cloneConnections(previous),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, cloneConnections(state.connections)],
      toast: 'Undid the last build change.',
    })
  },

  redo: () => {
    const state = get()
    const next = state.redoStack.at(-1)
    if (!next) return
    set({
      connections: cloneConnections(next),
      undoStack: [...state.undoStack, cloneConnections(state.connections)],
      redoStack: state.redoStack.slice(0, -1),
      toast: 'Redid the build change.',
    })
  },

  setProgramSpeed: (speed) => set((state) => ({ program: { ...state.program, speed } })),
  setStopOnRed: (stopOnRed) => set((state) => ({ program: { ...state.program, stopOnRed } })),

  startSimulation: () => {
    const state = get()
    if (state.simulationStatus === 'stopped' || state.simulationStatus === 'complete') {
      set({
        simulationStatus: 'running',
        simulationEpoch: state.simulationEpoch + 1,
        telemetry: initialTelemetry,
        missionComplete: false,
        toast: null,
      })
      return
    }
    set({ simulationStatus: 'running', toast: null })
  },
  stopSimulation: () => set({ simulationStatus: 'stopped' }),
  resetSimulation: () =>
    set((state) => ({
      simulationStatus: 'idle',
      simulationEpoch: state.simulationEpoch + 1,
      telemetry: initialTelemetry,
      isBoarded: false,
      missionComplete: false,
      toast: 'Simulation reset.',
    })),
  setTelemetry: (telemetry) => set((state) => ({ telemetry: { ...state.telemetry, ...telemetry } })),
  setBoarded: (isBoarded) => set({ isBoarded }),
  completeMission: () => set({ missionComplete: true, simulationStatus: 'complete' }),
  showToast: (toast) => set({ toast }),
}))
