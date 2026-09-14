import { useEffect, useRef } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

/**
 * Shared focus behavior for the W5 sheets (scene & plate, create/resize brick,
 * color picker) until the shared Sheet/Dialog primitives land: focus the panel
 * on open, restore the opener on close, keep Tab inside the panel, and close on
 * Escape without letting the editor's shortcut layer see the key.
 */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

export function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]'))
}

export function useSheetFocus(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => {
      const previous = restoreFocusRef.current
      if (previous?.isConnected) previous.focus()
    }
  }, [open, panelRef])
}

/** Returns a keydown handler that traps Tab inside `panelRef` and calls `onEscape` on Escape. */
export function sheetKeyDownHandler(panelRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onEscape()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = focusableElements(panelRef.current)
    if (!focusable.length) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || active === panelRef.current)) {
      event.preventDefault()
      first.focus()
    }
  }
}
