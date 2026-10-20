import { create } from 'zustand'
import { disconnect, reconnect } from './link'
import { useMicrobit } from './store'

/*
 * Puts the Brickgineers Remote program on a micro:bit straight from the page (WebUSB), so students don't have to
 * drag a .hex onto the MICROBIT drive. Uses the micro:bit Foundation's own library, the one python.microbit.org uses.
 * The USB serial link (link.ts) is closed while installing and opened again afterwards without the chooser.
 */

export const REMOTE_HEX_URL = '/microbit/brickgineers-remote.hex'

export type FlashPhase = 'idle' | 'choosing' | 'installing' | 'done' | 'error'

interface FlashState {
  phase: FlashPhase
  /** 0…1 while installing. */
  progress: number
  error: string
}

export const useFlash = create<FlashState>(() => ({ phase: 'idle', progress: 0, error: '' }))

/** WebUSB: Chrome and Edge on computers and Chromebooks. */
export const canFlash = () => typeof navigator !== 'undefined' && 'usb' in navigator

type UsbModule = typeof import('@microbit/microbit-connection/usb')
let usbModule: Promise<UsbModule> | null = null
/** Loads the flashing library ahead of the click, so the browser's chooser opens right away. */
export function preloadFlasher(): Promise<UsbModule> {
  usbModule ??= import('@microbit/microbit-connection/usb')
  return usbModule
}

class V1Board extends Error {}

/** A student-readable message for a failed install, or '' when nothing went wrong that needs saying. */
export function flashErrorMessage(err: unknown): string {
  if (err instanceof V1Board) return 'This is a micro:bit V1. The remote program needs a micro:bit V2.'
  const code = (err as { code?: string })?.code
  const name = (err as { name?: string })?.name
  if (code === 'no-device-selected' || code === 'aborted' || name === 'NotFoundError') return ''
  if (code === 'device-in-use') return 'Another tab or app is using the micro:bit. Close it and try again.'
  if (code === 'firmware-update-required') return 'This micro:bit needs a firmware update first (see microbit.org/get-started/user-guide/firmware).'
  if (name === 'SecurityError') return 'This computer does not allow websites to use USB devices. Use "download the file" instead.'
  return "Couldn't install. Unplug the micro:bit, plug it back in, and try again."
}

let running = false

/** Picks a micro:bit (the browser's chooser), installs the remote program, then reconnects the link. */
export async function installRemote(): Promise<void> {
  if (running) return
  running = true
  const set = useFlash.setState
  set({ phase: 'choosing', progress: 0, error: '' })
  let usb: ReturnType<UsbModule['createUSBConnection']> | null = null
  let released = false
  try {
    const { createUSBConnection } = await preloadFlasher()
    usb = createUSBConnection({ pauseOnHidden: false })
    await usb.connect()
    // A micro:bit was picked. The game's link lets go of it while installing (closing the chooser keeps the link).
    if (useMicrobit.getState().status === 'connected') {
      released = true
      await disconnect()
    }
    set({ phase: 'installing', progress: 0 })
    await usb.flash(
      async (board) => {
        if (board === 'V1') throw new V1Board()
        const res = await fetch(REMOTE_HEX_URL)
        if (!res.ok) throw new Error(`remote program: HTTP ${res.status}`)
        return res.text()
      },
      { partial: true, progress: (_stage, p) => { if (p !== undefined) set({ progress: p }) } },
    )
    set({ phase: 'done', progress: 1 })
  } catch (err) {
    const message = flashErrorMessage(err)
    set(message ? { phase: 'error', error: message } : { phase: 'idle' })
  } finally {
    try {
      await usb?.disconnect()
    } catch {
      // already gone
    }
    running = false
  }
  // The micro:bit restarts with the new program; listen to it again if this browser may already use it.
  if (released || useFlash.getState().phase === 'done') await reconnectAfterInstall()
}

async function reconnectAfterInstall() {
  for (let i = 0; i < 3; i++) {
    if (await reconnect()) return
    await new Promise((r) => setTimeout(r, 500))
  }
}
