import { create } from 'zustand'

/**
 * Which creation the Drive view ("Drive" for a rover, "Try it" for a gate or a signal
 * post) is open for. Transient, never persisted. Seeded by the lead for the kid-UX pass
 * (docs/robotics/KID-UX.md): the creation panel and the next-steps guide open it; the
 * Drive lane builds the view and mounts it the way the Code view is mounted.
 */
export type DriveViewState = {
  creationId: string | null
  openDrive: (creationId: string) => void
  closeDrive: () => void
}

export const useDriveView = create<DriveViewState>((set) => ({
  creationId: null,
  openDrive: (creationId) => set({ creationId }),
  closeDrive: () => set({ creationId: null }),
}))
