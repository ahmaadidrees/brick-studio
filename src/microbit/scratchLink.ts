/*
 * A Bluetooth LE session over Scratch Link, the bridge Scratch uses to reach hardware. On iPads it comes from Scrub
 * (an iPad browser for Scratch), which gives pages that carry the marker in index.html a socket class at
 * `Scratch.ScratchLinkSafariSocket`. Messages are JSON-RPC 2.0, the same ones scratch-vm's `io/ble.js` sends:
 * discover → didDiscoverPeripheral… → connect → read (with notifications) → characteristicDidChange…, plus write.
 */

/** The socket Scrub provides (scratch-link's "Safari helper" socket). */
export interface ScratchLinkSocket {
  open(): void
  close(): void
  isOpen(): boolean
  sendMessage(message: object): void
  setOnOpen(cb: () => void): void
  setOnClose(cb: (e?: unknown) => void): void
  setOnError(cb: (e?: unknown) => void): void
  setHandleMessage(cb: (message: JsonRpcMessage) => void): void
}
export type ScratchLinkSocketClass = new (type: 'BLE' | 'BT') => ScratchLinkSocket

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message?: string; code?: number } | string
}

export interface Peripheral {
  id: string | number
  name: string
}

/** Scrub's socket class, or null outside Scrub (other browsers never define it). */
export function scratchLinkSocketClass(): ScratchLinkSocketClass | null {
  if (typeof self === 'undefined') return null
  const s = (self as unknown as { Scratch?: { ScratchLinkSafariSocket?: ScratchLinkSocketClass } }).Scratch
  return s?.ScratchLinkSafariSocket ?? null
}

export interface BleSessionHandlers {
  onPeripheral: (p: Peripheral) => void
  onNotify: (base64: string) => void
  onClose: (error?: string) => void
}

const REQUEST_TIMEOUT_MS = 10_000

export class BleSession {
  private socket: ScratchLinkSocket
  private nextId = 0
  private open = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private closed = false

  constructor(Socket: ScratchLinkSocketClass, private handlers: BleSessionHandlers) {
    this.socket = new Socket('BLE')
    this.socket.setHandleMessage((m) => this.handle(m))
    this.socket.setOnClose(() => this.shutdown())
    this.socket.setOnError(() => this.shutdown('The Bluetooth bridge reported an error'))
  }

  /** Opens the bridge and resolves once it is ready for requests. */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.setOnOpen(() => resolve())
      this.socket.open()
    })
  }

  /** Looks for peripherals with any of these services; found ones arrive through `onPeripheral`. */
  discover(services: (number | string)[]) {
    return this.request('discover', { filters: [{ services }] })
  }

  connect(id: Peripheral['id']) {
    return this.request('connect', { peripheralId: id })
  }

  /** Reads a characteristic and keeps receiving its changes through `onNotify`. */
  subscribe(serviceId: number | string, characteristicId: string) {
    return this.request('read', { serviceId, characteristicId, startNotifications: true })
  }

  write(serviceId: number | string, characteristicId: string, bytes: Uint8Array) {
    return this.request('write', { serviceId, characteristicId, message: toBase64(bytes), encoding: 'base64', withResponse: true })
  }

  close(error?: string) {
    if (this.closed) return
    try {
      if (this.socket.isOpen()) this.socket.close()
    } catch {
      // already closed
    }
    this.shutdown(error)
  }

  private shutdown(error?: string) {
    if (this.closed) return
    this.closed = true
    for (const { reject, timer } of this.open.values()) {
      clearTimeout(timer)
      reject(new Error(error ?? 'closed'))
    }
    this.open.clear()
    this.handlers.onClose(error)
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('closed'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.open.delete(id)
        reject(new Error(`${method} timed out`))
      }, REQUEST_TIMEOUT_MS)
      this.open.set(id, { resolve, reject, timer })
      this.socket.sendMessage({ jsonrpc: '2.0', id, method, params })
    })
  }

  private handle(m: JsonRpcMessage) {
    if (m.method) {
      const result = this.call(m.method, m.params ?? {})
      if (m.id !== undefined && m.id !== null) this.socket.sendMessage({ jsonrpc: '2.0', id: m.id, result: result ?? null })
      return
    }
    if (typeof m.id !== 'number') return
    const waiting = this.open.get(m.id)
    if (!waiting) return
    this.open.delete(m.id)
    clearTimeout(waiting.timer)
    if (m.error) waiting.reject(new Error(typeof m.error === 'string' ? m.error : m.error.message ?? 'Bluetooth error'))
    else waiting.resolve(m.result)
  }

  private call(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'didDiscoverPeripheral':
      case 'userDidPickPeripheral':
        if (params.peripheralId !== undefined) {
          this.handlers.onPeripheral({ id: params.peripheralId as Peripheral['id'], name: String(params.name ?? 'micro:bit') })
        }
        return null
      case 'characteristicDidChange':
        if (typeof params.message === 'string') this.handlers.onNotify(params.message)
        return null
      case 'ping':
        return 42
      default:
        return null
    }
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
