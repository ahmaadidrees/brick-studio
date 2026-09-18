import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { BrandLockup } from '../../brand'
import { Button } from '../../ui'
import type { ClassroomAuthResult } from '../../classroom/contracts'
import { signInHref } from './worldsData'

type Props = {
  session: ClassroomAuthResult | null
  /** Class name under the student's name; teachers show "Teacher". */
  contextLine: string
  onSignOut: () => void
}

/**
 * Minimal page header for `/worlds`. W2 owns `src/shell/AppHeader.tsx`
 * (`variant="page"`) and its `AccountChip`; that module does not exist yet, so
 * this local header carries the same contract — brand lockup home link on the
 * left, "Open the studio" and the account chip on the right — and is meant to
 * be deleted when the shell lands (see docs/flows/status/w4.md).
 */
export function PageHeader({ session, contextLine, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); wrap.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])

  const teacher = session?.user.role === 'teacher'
  const name = session ? displayName(session) : ''
  return <header className="worlds-header" role="banner">
    <a className="worlds-header-home" href="/" aria-label="Brickgineers home"><BrandLockup size={26} /></a>
    <div className="worlds-header-end">
      <Button href="/build" variant="secondary" size="sm" className="worlds-header-studio">Open the studio</Button>
      {session
        ? <div className="worlds-chip-wrap" ref={wrap}>
          <button type="button" className="worlds-chip" aria-expanded={open} aria-haspopup="menu" aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
            <span className="worlds-chip-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
            <span className="worlds-chip-text"><strong>{name}</strong><small>{contextLine}</small></span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {open && <div className="worlds-chip-menu" id={menuId} role="menu" aria-label="Account">
            {teacher
              ? <>
                <a role="menuitem" href="/class">My class</a>
                <a role="menuitem" href="/worlds">My worlds</a>
                <a role="menuitem" href="/class/projector">Show class code on projector</a>
              </>
              : <>
                <a role="menuitem" href="/worlds">My worlds</a>
                <a role="menuitem" href="/class">My class</a>
              </>}
            <a role="menuitem" href={signInHref()}>Switch account</a>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut() }}>Sign out</button>
          </div>}
        </div>
        : <Button href={signInHref()} variant="quiet" size="sm">Sign in</Button>}
    </div>
  </header>
}

/** First name plus last initial, the same display rule the roster uses. */
export function displayName({ user }: ClassroomAuthResult) {
  const parts = user.rosterName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return user.username
  const [first, ...rest] = parts
  return rest.length ? `${first} ${rest[rest.length - 1].charAt(0).toUpperCase()}.` : first
}
