import { create } from 'zustand'
import { useCodeView } from '../code/codeViewState'

/**
 * Which creation the Drive view ("Drive" for a rover, "Try it" for a gate or a signal
 * post) is open for. Transient, never persisted. Seeded by the lead for the kid-UX pass
 * (docs/robotics/KID-UX.md): the creation panel and the next-steps guide open it; the
 * Drive lane builds the view and mounts it the way the Code view is mounted. Drive and
 * Code never show together: opening Drive closes Code.
 */
export type DriveViewState = {
  creationId: string | null
  openDrive: (creationId: string) => void
  closeDrive: () => void
}

export const useDriveView = create<DriveViewState>((set) => ({
  creationId: null,
  openDrive: (creationId) => {
    if (useCodeView.getState().creationId !== null) useCodeView.getState().closeCode()
    set({ creationId })
  },
  closeDrive: () => set({ creationId: null }),
}))
