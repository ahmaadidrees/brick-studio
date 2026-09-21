import { useEffect, useId, useRef, useState } from 'react'
import { CloudCheck, Eye, Hammer, MoreHorizontal, Play, Users } from 'lucide-react'
import { Button } from '../../ui'
import { formatSavedDate } from '../../classroom/panelShared'
import { classmatesLabel, isInviteOnly, isShared, plateSizeOf, sharedForBuilding, type WorldsWorld } from './worldsData'

/**
 * Plate-pattern card art. There are no thumbnails, so the card shows the build
 * plate: stud density follows the world's plate size and the color follows its
 * kind (own, shared, class, group). Decorative only — the title and chips
 * carry every fact.
 */
export function PlateArt({ world }: { world: WorldsWorld }) {
  const plate = plateSizeOf(world)
  const studs = plate === 128 ? 7 : plate === 96 ? 6 : 5
  const step = 100 / studs
  const tone = world.kind !== 'personal' ? 'class' : isShared(world) ? 'shared' : 'own'
  return <div className={`worlds-card-art worlds-card-art-${tone}`} aria-hidden="true">
    <svg viewBox="0 0 100 100" role="presentation" focusable="false">
      <rect x="0" y="0" width="100" height="100" rx="10" className="worlds-plate" />
      {Array.from({ length: studs * studs }, (_, index) => (
        <circle key={index} className="worlds-stud" r={step * 0.22}
          cx={step * (index % studs) + step / 2} cy={step * Math.floor(index / studs) + step / 2} />
      ))}
    </svg>
  </div>
}

/**
 * On one of your own worlds: "Shared · look only" / "Shared · build together"
 * for the whole class, "Shared · 3 classmates" for a quiet invite.
 */
export function SharingChip({ world }: { world: WorldsWorld }) {
  if (!isShared(world)) return null
  return <span className="worlds-chip-tag worlds-chip-shared">
    <Users size={14} aria-hidden="true" /> Shared · {isInviteOnly(world) ? classmatesLabel(world.members?.length ?? 0) : sharedForBuilding(world) ? 'build together' : 'look only'}
  </span>
}

/** "3 classmates" beside a student's invite-only world in the teacher's list; nothing for whole-class sharing. */
export function InviteesChip({ world }: { world: WorldsWorld }) {
  if (!isInviteOnly(world) || !world.members) return null
  return <span className="worlds-chip-tag worlds-chip-invitees"><Users size={14} aria-hidden="true" /> {classmatesLabel(world.members.length)}</span>
}

export function AccessChip({ world }: { world: WorldsWorld }) {
  return world.canEdit
    ? <span className="worlds-chip-tag worlds-chip-build"><Hammer size={14} aria-hidden="true" /> Build together</span>
    : <span className="worlds-chip-tag worlds-chip-look"><Eye size={14} aria-hidden="true" /> Look only</span>
}

type MenuProps = { label: string; items: Array<{ label: string; onSelect: () => void }> }

/** The ⋯ menu on an own world: Rename, Duplicate, Checkpoints. */
export function CardMenu({ label, items }: MenuProps) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); wrap.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="worlds-menu-wrap" ref={wrap}>
    <Button variant="quiet" size="sm" iconOnly icon={<MoreHorizontal size={18} />} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>{label}</Button>
    {open && <div className="worlds-menu" id={id} role="menu" aria-label={label}>
      {items.map(item => <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.onSelect() }}>{item.label}</button>)}
    </div>}
  </div>
}

type CardProps = {
  world: WorldsWorld
  /** Actions rendered in the card footer. */
  children?: React.ReactNode
  /** Owner line for classmates' and the teacher's worlds. */
  byline?: string
  chip?: React.ReactNode
  menu?: React.ReactNode
}

export function WorldCard({ world, children, byline, chip, menu }: CardProps) {
  return <article className="worlds-card" aria-label={world.title}>
    <PlateArt world={world} />
    <div className="worlds-card-body">
      <div className="worlds-card-heading">
        <h3>{world.title}</h3>
        {menu}
      </div>
      {byline && <p className="worlds-card-owner">{byline}</p>}
      <p className="worlds-card-saved"><CloudCheck size={14} aria-hidden="true" /> <time dateTime={world.updatedAt} title={new Date(world.updatedAt).toLocaleString()}>{formatSavedDate(world.updatedAt)}</time></p>
      {chip && <p className="worlds-card-chips">{chip}</p>}
      <div className="worlds-card-actions">{children}</div>
    </div>
  </article>
}

/**
 * Open (your own world → the editor) and Join / Visit (someone else's → the live
 * room). The caller passes the destination so the two paths stay explicit.
 */
export function OpenWorldButton({ href, label, variant = 'primary', busy }: { href: string; label: string; variant?: 'primary' | 'secondary'; busy?: boolean }) {
  return <Button href={href} variant={variant} size="sm" icon={<Play size={16} />} disabled={busy}>{label}</Button>
}
