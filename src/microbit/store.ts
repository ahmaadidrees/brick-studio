import { create } from 'zustand'
import {
  DEFAULT_ASSIGNMENTS,
  DEFAULT_REACTIONS,
  GAME_EVENTS,
  IDLE_BOARD,
  PULSE_MS,
  REMOTE_MODES,
  cleanAssignments,
  type Assignments,
  type BoardState,
  type GameEvent,
  type Part,
  type Reaction,
  type RemoteAction,
  type RemoteMode,
} from './assign'
import { IMAGES, TUNES, type InMessage, type OutMessage, type Pin } from './protocol'

/*
 * One micro:bit per browser tab: its connection, its live state, and what each part does.
 * The real board (over USB, see link.ts) and the virtual board in the panel both report here the same way,
 * so the game can't tell them apart.
 */

export type LinkStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'error'

export interface MonitorLine {
  dir: 'in' | 'out'
  text: string
}

const MONITOR_MAX = 30
/** At most one reaction this often, so a run of coins doesn't flood the micro:bit. */
const REACTION_GAP_MS = 120

interface MicrobitState {
  status: LinkStatus
  error: string
  /** The Brickgineers Remote program answered (not some other program printing). */
  hello: boolean
  board: BoardState
  /** The mode whose game is on screen, set by that game; the panel shows its actions. */
  mode: RemoteMode
  assignments: Record<RemoteMode, Assignments>
  reactions: Record<GameEvent, Reaction>
  panelOpen: boolean
  /** Recent lines both ways, newest last, for the live monitor. */
  monitor: MonitorLine[]

  /** From the serial link or the virtual board. */
  receive: (m: InMessage, raw?: string) => void
  /** Virtual board: press or let go of a pin. */
  setPin: (pin: Pin, down: boolean) => void
  setTilt: (x: number, y: number) => void
  gesture: (g: 'shake' | 'loud') => void
  /** Let go of everything (unplugged, tab hidden). */
  releaseAll: () => void
  setMode: (mode: RemoteMode) => void
  assign: (mode: RemoteMode, part: Part, action: RemoteAction) => void
  resetAssignments: (mode: RemoteMode) => void
  setReaction: (event: GameEvent, reaction: Reaction) => void
  resetReactions: () => void
  setPanelOpen: (open: boolean) => void
  /** Send a command to the micro:bit when one is connected. */
  send: (m: OutMessage) => void
  /** The game reports something happened; the micro:bit reacts as set up. `n` is the lap or place for `count`. */
  react: (event: GameEvent, n?: number) => void
  setLink: (status: LinkStatus, error?: string) => void
}

/* ---------- Sending: link.ts installs the real sender ---------- */

type Sender = (line: OutMessage) => void
let sender: Sender | null = null
export function setSender(s: Sender | null) {
  sender = s
}

/* ---------- Saved in this browser ---------- */

const STORAGE_KEY = 'brick-studio.microbit.v1'

interface Saved {
  assignments: Record<RemoteMode, Assignments>
  reactions: Record<GameEvent, Reaction>
}

const isImage = (v: unknown) => typeof v === 'string' && (IMAGES as readonly string[]).includes(v)
const isTune = (v: unknown) => typeof v === 'string' && (TUNES as readonly string[]).includes(v)

function cleanReactions(raw: unknown): Record<GameEvent, Reaction> {
  const out = { ...DEFAULT_REACTIONS }
  if (!raw || typeof raw !== 'object') return out
  for (const e of GAME_EVENTS) {
    const r = (raw as Record<string, unknown>)[e] as Partial<Reaction> | undefined
    if (!r || typeof r !== 'object') continue
    const show = r.show === 'count' || r.show === 'none' || isImage(r.show) ? r.show! : out[e].show
    const sound = r.sound === 'beep' || r.sound === 'buzz' || r.sound === 'none' || isTune(r.sound) ? r.sound! : out[e].sound
    out[e] = { show, sound }
  }
  return out
}

export function loadSaved(): Saved {
  let raw: unknown = null
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    raw = null
  }
  const r = (raw ?? {}) as Partial<Record<keyof Saved, unknown>>
  const a = (r.assignments ?? {}) as Record<string, unknown>
  const assignments = Object.fromEntries(REMOTE_MODES.map((m) => [m, cleanAssignments(m, a[m])])) as Record<RemoteMode, Assignments>
  return { assignments, reactions: cleanReactions(r.reactions) }
}

function save(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the setup lasts for this visit.
  }
}

/* ---------- Reactions to commands ---------- */

export function reactionCommands(r: Reaction, n?: number): OutMessage[] {
  const out: OutMessage[] = []
  if (r.show === 'count') {
    if (n !== undefined) out.push({ t: 'num', n })
  } else if (r.show !== 'none') out.push({ t: 'show', image: r.show })
  if (r.sound === 'beep') out.push({ t: 'tone', hz: 1320, ms: 80 })
  else if (r.sound === 'buzz') out.push({ t: 'tone', hz: 140, ms: 250 })
  else if (r.sound !== 'none') out.push({ t: 'tune', name: r.sound })
  return out
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

let lastReaction = -Infinity

const saved = loadSaved()

export const useMicrobit = create<MicrobitState>((set, get) => {
  const log = (dir: MonitorLine['dir'], text: string) =>
    set((s) => ({ monitor: [...s.monitor.slice(-(MONITOR_MAX - 1)), { dir, text }] }))
  const persist = () => save({ assignments: get().assignments, reactions: get().reactions })

  return {
    status: typeof navigator !== 'undefined' && 'serial' in navigator ? 'idle' : 'unsupported',
    error: '',
    hello: false,
    board: IDLE_BOARD,
    mode: 'platformer',
    assignments: saved.assignments,
    reactions: saved.reactions,
    panelOpen: false,
    monitor: [],

    receive(m, raw) {
      if (raw !== undefined) log('in', raw)
      set((s) => {
        switch (m.t) {
          case 'hello':
            return { hello: true }
          case 'pin':
            return { board: { ...s.board, pins: { ...s.board.pins, [m.pin]: m.down } } }
          case 'tilt':
            return { board: { ...s.board, tilt: { x: m.x, y: m.y } } }
          case 'gesture':
            if (m.g !== 'shake' && m.g !== 'loud') return {}
            return { board: { ...s.board, pulses: { ...s.board.pulses, [m.g]: now() + PULSE_MS } } }
        }
      })
    },
    setPin: (pin, down) => get().receive({ t: 'pin', pin, down }),
    setTilt: (x, y) => get().receive({ t: 'tilt', x, y }),
    gesture: (g) => get().receive({ t: 'gesture', g }),
    releaseAll: () => set({ board: IDLE_BOARD }),
    setMode: (mode) => set({ mode }),
    assign(mode, part, action) {
      set((s) => ({ assignments: { ...s.assignments, [mode]: cleanAssignments(mode, { ...s.assignments[mode], [part]: action }) } }))
      persist()
    },
    resetAssignments(mode) {
      set((s) => ({ assignments: { ...s.assignments, [mode]: { ...DEFAULT_ASSIGNMENTS[mode] } } }))
      persist()
    },
    setReaction(event, reaction) {
      set((s) => ({ reactions: cleanReactions({ ...s.reactions, [event]: reaction }) }))
      persist()
    },
    resetReactions() {
      set({ reactions: { ...DEFAULT_REACTIONS } })
      persist()
    },
    setPanelOpen: (open) => set({ panelOpen: open }),
    send(m) {
      if (get().status !== 'connected' || !sender) return
      sender(m)
    },
    react(event, n) {
      const t = now()
      if (t - lastReaction < REACTION_GAP_MS) return
      lastReaction = t
      for (const m of reactionCommands(get().reactions[event], n)) get().send(m)
    },
    setLink(status, error = '') {
      set({ status, error, ...(status === 'connected' ? {} : { hello: false, board: IDLE_BOARD }) })
    },
  }
})

/** For the monitor: link.ts logs what it sends. */
export function logOut(text: string) {
  useMicrobit.setState((s) => ({ monitor: [...s.monitor.slice(-(MONITOR_MAX - 1)), { dir: 'out', text }] }))
}
