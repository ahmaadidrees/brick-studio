import { create } from 'zustand'

/**
 * Which creation the Code view is open for (null: Build). Transient, never persisted.
 * Deliberately tiny and Blockly-free: the creation card, the creation panel and the
 * robotics store open the view through it, and the view itself (with Blockly) loads
 * lazily only once `creationId` is set.
 */
export type CodeViewState = {
  creationId: string | null
  openCode: (creationId: string) => void
  closeCode: () => void
}

export const useCodeView = create<CodeViewState>((set) => ({
  creationId: null,
  openCode: (creationId) => set({ creationId }),
  closeCode: () => set({ creationId: null }),
}))

/** The line the robot panel shows in a live room, under its Drive and Code buttons (contract §8: shared rooms are deferred). */
export const LIVE_ROOM_CODE_LINE = 'Drive and Code are off in a shared world for now. Building still works.'
