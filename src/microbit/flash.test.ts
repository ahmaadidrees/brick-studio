import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const usb = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  flash: vi.fn(async (_source: (board: 'V1' | 'V2') => Promise<string>, _opts: { progress?: (s: string, p?: number) => void }) => {}),
  disconnect: vi.fn(async () => {}),
}))
const link = vi.hoisted(() => ({ disconnect: vi.fn(async () => {}), reconnect: vi.fn(async () => true) }))

vi.mock('@microbit/microbit-connection/usb', () => ({ createUSBConnection: () => usb }))
vi.mock('./link', () => link)

import { flashErrorMessage, installRemote, useFlash } from './flash'
import { useMicrobit } from './store'

beforeEach(() => {
  vi.clearAllMocks()
  useFlash.setState({ phase: 'idle', progress: 0, error: '' })
  useMicrobit.setState({ status: 'idle' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(':020000040000FA\n')))
})
afterEach(() => vi.unstubAllGlobals())

describe('installRemote', () => {
  it('installs the hex, reports progress, lets go of USB and reconnects the link', async () => {
    usb.flash.mockImplementationOnce(async (source, opts) => {
      expect(await source('V2')).toContain(':02000004')
      opts.progress?.('FullFlashing', 0.5)
      expect(useFlash.getState()).toMatchObject({ phase: 'installing', progress: 0.5 })
    })
    await installRemote()
    expect(useFlash.getState().phase).toBe('done')
    expect(usb.disconnect).toHaveBeenCalled()
    expect(link.reconnect).toHaveBeenCalled()
  })

  it('closes the game link only after a micro:bit was picked', async () => {
    useMicrobit.setState({ status: 'connected' })
    usb.connect.mockRejectedValueOnce(Object.assign(new Error('none'), { code: 'no-device-selected' }))
    await installRemote()
    expect(link.disconnect).not.toHaveBeenCalled()
    expect(useFlash.getState().phase).toBe('idle')

    await installRemote()
    expect(link.disconnect).toHaveBeenCalledTimes(1)
    expect(link.reconnect).toHaveBeenCalled()
  })

  it('refuses a micro:bit V1', async () => {
    usb.flash.mockImplementationOnce(async (source) => {
      await source('V1')
    })
    await installRemote()
    expect(useFlash.getState()).toMatchObject({ phase: 'error', error: expect.stringContaining('V1') })
    expect(link.reconnect).not.toHaveBeenCalled()
  })
})

describe('flashErrorMessage', () => {
  it('says nothing when the chooser was closed, and something useful otherwise', () => {
    expect(flashErrorMessage({ code: 'no-device-selected' })).toBe('')
    expect(flashErrorMessage({ code: 'device-in-use' })).toMatch(/Another tab/)
    expect(flashErrorMessage({ name: 'SecurityError' })).toMatch(/download the file/)
    expect(flashErrorMessage(new Error('x'))).toMatch(/Unplug/)
  })
})
