import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import './ui.css'

type MenuContextValue = {
  /** Closes the menu; `returnFocus` (default true) moves focus back to the trigger first. */
  close: (returnFocus?: boolean) => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

/** Props the trigger must spread so the menu is discoverable and keyboard-operable. */
export type MenuTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>
  id: string
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
}

export type MenuProps = {
  /** Accessible name of the popover (`aria-label`), e.g. "This build" or "Account". */
  label: string
  /** Renders the trigger; spread `props` onto a Button (or any button element). */
  trigger: (props: MenuTriggerProps, state: { open: boolean }) => ReactNode
  /** `MenuItem` and `MenuSeparator` children (any wrapper markup is fine). */
  children: ReactNode
  /** Which edge of the trigger the popover lines up with. */
  align?: 'start' | 'end'
  /** Non-interactive content above the items (an account summary). */
  header?: ReactNode
  /** Opens on mount (gallery and screenshots). */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  /** Width of the popover; defaults to 272px. */
  width?: number
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)'

function itemsIn(root: HTMLElement | null) {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : []
}

/**
 * Popover menu shared by the header menus (This build, Account) and page
 * card menus. WAI-ARIA menu button pattern: the trigger carries
 * `aria-haspopup="menu"` + `aria-expanded`; opening moves focus to the first
 * item (ArrowUp opens on the last); ArrowUp/Down cycle, Home/End jump,
 * Escape closes and returns focus to the trigger, Tab closes and lets focus
 * move on, outside pointer closes. Items are 44px tall. Reduced motion drops
 * the pop-in animation (ui.css).
 */
export function Menu({ label, trigger, children, align = 'start', header, defaultOpen = false, onOpenChange, className, width }: MenuProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [initialFocus, setInitialFocus] = useState<'first' | 'last' | null>(defaultOpen ? null : 'first')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const triggerId = useId()
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const change = useCallback((next: boolean) => {
    setOpen((current) => {
      if (current !== next) onOpenChangeRef.current?.(next)
      return next
    })
  }, [])

  const close = useCallback((returnFocus = true) => {
    if (returnFocus) triggerRef.current?.focus()
    change(false)
  }, [change])

  const openWith = useCallback((focus: 'first' | 'last' | null) => {
    setInitialFocus(focus)
    change(true)
  }, [change])

  // Focus the first/last item on open; keep the popover inside the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const popover = popoverRef.current
    if (!popover) return
    popover.style.marginLeft = ''
    popover.style.marginRight = ''
    const rect = popover.getBoundingClientRect()
    const gutter = 8
    const viewport = window.innerWidth || document.documentElement.clientWidth
    if (viewport > 0) {
      if (align === 'start' && rect.right > viewport - gutter) popover.style.marginLeft = `${Math.round(viewport - gutter - rect.right)}px`
      if (align === 'end' && rect.left < gutter) popover.style.marginRight = `${Math.round(rect.left - gutter)}px`
    }
    if (initialFocus) {
      const items = itemsIn(popover)
      const target = initialFocus === 'last' ? items[items.length - 1] : items[0]
      ;(target ?? popover).focus()
    }
  }, [open, align, initialFocus])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) change(false)
    }
    // Capture phase, like Sheet: the editor's global shortcuts never see this Escape.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null
      if (next && !containerRef.current?.contains(next)) change(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    const container = containerRef.current
    container?.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
      container?.removeEventListener('focusout', onFocusOut)
    }
  }, [open, change, close])

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown' || (event.key === 'Enter' && !open) || (event.key === ' ' && !open)) {
      event.preventDefault()
      openWith('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openWith('last')
    }
  }

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).matches('input, select, textarea')) return
    if (event.key === 'Tab') { change(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = itemsIn(event.currentTarget)
    if (!items.length) return
    event.preventDefault()
    event.stopPropagation()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => (open ? close(true) : openWith('first')),
    onKeyDown: onTriggerKeyDown,
  }

  return (
    <div ref={containerRef} className={['ui-menu', `ui-menu-${align}`, open && 'ui-menu-open', className].filter(Boolean).join(' ')}>
      {trigger(triggerProps, { open })}
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={popoverRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className="ui-menu-popover"
            style={width ? { width: `min(${width}px, calc(100vw - 16px))` } : undefined}
            onKeyDown={onMenuKeyDown}
          >
            {header && <div className="ui-menu-header">{header}</div>}
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  )
}

export type MenuItemProps = {
  label: string
  /** Second line under the label. */
  description?: string
  icon?: ReactNode
  disabled?: boolean
  /** Destructive styling (Sign out is not destructive; Delete is). */
  danger?: boolean
  /** Renders an `<a role="menuitem">`; the browser navigates, the menu closes. */
  href?: string
  /** Runs after focus has returned to the trigger and before the menu closes, so a dialog it opens restores focus correctly. */
  onSelect?: () => void
  className?: string
  /** Extra attributes, e.g. `download` for links. */
  download?: string
}

/** One menu action. Buttons by default; links when `href` is given. */
export function MenuItem({ label, description, icon, disabled = false, danger = false, href, onSelect, className, download }: MenuItemProps) {
  const menu = useContext(MenuContext)
  const id = useId()
  const labelId = `${id}-label`
  const descriptionId = description ? `${id}-description` : undefined
  const classes = ['ui-menu-item', danger && 'ui-menu-item-danger', className].filter(Boolean).join(' ')
  // The label alone is the accessible name; the description is read as the item's description.
  const naming = { 'aria-labelledby': labelId, 'aria-describedby': descriptionId }
  const content = (
    <>
      <span className="ui-menu-item-icon" aria-hidden="true">{icon}</span>
      <span className="ui-menu-item-text">
        <span id={labelId} className="ui-menu-item-label">{label}</span>
        {description && <span id={descriptionId} className="ui-menu-item-description">{description}</span>}
      </span>
    </>
  )
  const activate = () => {
    if (disabled) return
    menu?.close(true)
    onSelect?.()
  }
  if (href && !disabled) {
    return (
      <a role="menuitem" href={href} download={download} tabIndex={-1} className={classes} {...naming} onClick={() => { menu?.close(false); onSelect?.() }}>
        {content}
      </a>
    )
  }
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={classes} disabled={disabled} aria-disabled={disabled || undefined} {...naming} onClick={activate}>
      {content}
    </button>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="ui-menu-separator" />
}

/** Lets custom content inside a menu close it (e.g. a form's submit). */
export function useMenuClose() {
  return useContext(MenuContext)?.close ?? (() => undefined)
}
