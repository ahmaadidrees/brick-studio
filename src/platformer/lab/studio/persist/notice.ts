import { useSyncExternalStore } from 'react'

export interface StorageNotice {
  id: string
  type: 'corrupt' | 'newer-version' | 'quota-error' | 'error' | 'success' | 'info'
  message: string
  /** Buttons shown beside the message (e.g. "Start with this new world"). */
  actions?: Array<{ label: string; run: () => void }>
  /** Stays on screen until a kid picks an action; Dismiss only hides it. */
  sticky?: boolean
}

let currentNotice: StorageNotice | null = null
const listeners = new Set<() => void>()

export function getStorageNotice(): StorageNotice | null {
  return currentNotice
}

export function setStorageNotice(notice: StorageNotice | null): void {
  currentNotice = notice
  for (const listener of listeners) {
    listener()
  }
}

export function clearStorageNotice(): void {
  setStorageNotice(null)
}

export function subscribeStorageNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useStorageNotice(): StorageNotice | null {
  return useSyncExternalStore(subscribeStorageNotice, getStorageNotice)
}
