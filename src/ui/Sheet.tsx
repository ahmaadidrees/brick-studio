import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'
import './ui.css'

export type SheetProps = {
  open: boolean
  /** Called for the close button, Escape and backdrop clicks. */
  onClose: () => void
  title: string
  /** One line under the title; becomes the dialog's aria-describedby. */
  description?: string
  children: ReactNode
  /** Persistent action row; stays visible while the body scrolls. */
  footer?: ReactNode
  /** `sheet` (default) docks right on wide screens; `dialog` centers. Both become bottom sheets on narrow/touch screens. */
  variant?: 'sheet' | 'dialog'
  size?: 'sm' | 'md' | 'lg'
  /** Element to focus on open; defaults to the panel itself. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Set false for confirmations that must be answered (Escape/backdrop do nothing). */
  dismissible?: boolean
  closeLabel?: string
  /** Extra content beside the title (a back button, a tab strip). */
  headerStart?: ReactNode
  /** Stable id so consumers can reference the panel. */
  id?: string
  className?: string
  /** Renders into `document.body` by default so the sheet stacks above lane content. */
  portal?: boolean
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.closest('[hidden], [aria-hidden="true"]')) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

function topmostDialog() {
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
  return dialogs[dialogs.length - 1] ?? null
}

/**
 * Sheet / dialog shell shared by every lane: `role="dialog"` + `aria-modal`,
 * focus moved in on open and restored on close, Tab cycled inside, Escape
 * closes only the topmost dialog (window capture phase, like the editor's
 * BrickDrawerSheet, so the global brush shortcut never sees it), a scrolling
 * body with a persistent footer, and a bottom-sheet layout under
 * `(max-width: 900px), (pointer: coarse)`. Sits at `--z-dialog`.
 */
export function Sheet({ open, onClose, title, description, children, footer, variant = 'sheet', size = 'md', initialFocusRef, dismissible = true, closeLabel = 'Close', headerStart, id: fixedId, className, portal = true }: SheetProps) {
  const generatedId = useId()
  const id = fixedId ?? `sheet${generatedId}`
  const titleId = `${id}-title`
  const descriptionId = description ? `${id}-description` : undefined
  const panel = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const fallbackTo = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Move focus in on open and put it back where it came from on close.
  useLayoutEffect(() => {
    if (!open) return
    // If the opener unmounted in this same commit, focus is already on <body>;
    // do not record that as the place to return to.
    const opener = document.activeElement
    restoreTo.current = opener instanceof HTMLElement && opener !== document.body ? opener : null
    const panelNode = panel.current
    const target = initialFocusRef?.current ?? panelNode
    target?.focus({ preventScroll: true })
    return () => {
      const previous = restoreTo.current
      const fallback = fallbackTo.current
      restoreTo.current = null
      fallbackTo.current = null
      // Another modal dialog already holds focus (it opened as this one
      // closed): leave it alone instead of yanking focus back out of it.
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && !panelNode?.contains(active) && active.closest('[role="dialog"][aria-modal="true"]')) return
      // The opener may have unmounted with its own sheet (the compact brick
      // drawer); fall back to whatever took focus on open rather than <body>.
      const candidate = previous?.isConnected ? previous : fallback?.isConnected ? fallback : null
      candidate?.focus({ preventScroll: true })
    }
    // initialFocusRef is a ref; only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A sibling sheet closing in the same commit may restore focus to its own
  // opener from a passive cleanup, after the layout effect above ran. Passive
  // mount effects run after those cleanups, so re-check and reclaim, and
  // remember what took focus as the close-time fallback.
  useEffect(() => {
    if (!open) return
    const panelNode = panel.current
    const active = document.activeElement
    if (!panelNode || !(active instanceof HTMLElement) || panelNode.contains(active)) return
    if (active !== document.body) fallbackTo.current = active
    ;(initialFocusRef?.current ?? panelNode).focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Escape closes the topmost dialog only, in the capture phase.
  useEffect(() => {
    if (!open || !dismissible) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (topmostDialog() !== panel.current) return
      event.stopPropagation()
      event.preventDefault()
      onCloseRef.current()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [open, dismissible])

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panel.current) return
    const items = focusables(panel.current)
    if (items.length === 0) {
      event.preventDefault()
      panel.current.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panel.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  const node = (
    <div className={['ui-sheet-root', `ui-sheet-${variant}`, `ui-sheet-${size}`, className].filter(Boolean).join(' ')} data-ui-sheet="">
      <div className="ui-sheet-backdrop" aria-hidden="true" onPointerDown={dismissible ? () => onClose() : undefined} />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="ui-sheet"
        onKeyDown={trapTab}
      >
        <span className="ui-sheet-grip" aria-hidden="true" />
        <header className="ui-sheet-header">
          {headerStart && <div className="ui-sheet-header-start">{headerStart}</div>}
          <div className="ui-sheet-heading">
            <h2 id={titleId} className="ui-sheet-title">{title}</h2>
            {description && <p id={descriptionId} className="ui-sheet-description">{description}</p>}
          </div>
          <Button variant="quiet" iconOnly icon={<X size={20} />} aria-label={closeLabel} onClick={onClose} className="ui-sheet-close">{closeLabel}</Button>
        </header>
        <div className="ui-sheet-body">{children}</div>
        {footer && <footer className="ui-sheet-footer">{footer}</footer>}
      </div>
    </div>
  )
  return portal && typeof document !== 'undefined' ? createPortal(node, document.body) : node
}

export type DialogProps = Omit<SheetProps, 'variant'>

/** Centered confirmation/dialog; same contract as Sheet. */
export function Dialog(props: DialogProps) {
  return <Sheet {...props} variant="dialog" size={props.size ?? 'sm'} />
}
