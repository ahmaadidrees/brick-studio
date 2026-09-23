import { useEffect, useId, useRef, useState } from 'react'
import { CloudCheck, Eye, Hammer, MoreHorizontal, Play, Square, Users } from 'lucide-react'
import { Button } from '../../ui'
import { formatSavedDate } from '../../classroom/panelShared'
import { buildingCount, classmatesLabel, isInviteOnly, isLevel2d, isShared, plateSizeOf, sharedForBuilding, type WorldsWorld } from './worldsData'

/**
 * Plate-pattern card art. There are no thumbnails, so the card shows the build
 * plate: stud density follows the world's plate size and the color follows its
 * kind (own, shared, class, group). Decorative only — the title and chips
 * carry every fact.
 */
export function PlateArt({ world }: { world: WorldsWorld }) {
  if (isLevel2d(world)) return <LevelArt />
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
 * Card art for a 2D level: a pixel side-scroller strip (sky, floor, a ? block and the hero). Decorative only; the
 * "2D world" chip says it in words.
 */
export function LevelArt() {
  const px = (x: number, y: number, w: number, h: number, fill: string) => <rect x={x * 4} y={y * 4} width={w * 4} height={h * 4} fill={fill} />
  return <div className="worlds-card-art worlds-card-art-2d" aria-hidden="true">
    <svg viewBox="0 0 100 100" role="presentation" focusable="false" shapeRendering="crispEdges" preserveAspectRatio="xMidYMid slice">
      {px(0, 0, 25, 25, '#79B8FF')}
      {px(3, 4, 6, 2, '#FFFFFF')}
      {px(15, 6, 5, 2, '#FFFFFF')}
      {px(11, 9, 4, 4, '#263C51')}
      {px(12, 10, 2, 2, '#FFC22E')}
      {px(5, 14, 3, 1, '#FFCF33')}
      {px(5, 15, 3, 1, '#F6C08C')}
      {px(5, 16, 3, 2, '#2F6FE0')}
      {px(17, 15, 3, 3, '#9AA3B8')}
      {px(0, 18, 25, 1, '#5FCF52')}
      {px(0, 19, 25, 6, '#D4884A')}
      {px(0, 21, 25, 1, '#A45D2C')}
      {px(0, 23, 25, 1, '#A45D2C')}
    </svg>
  </div>
}

/** "2D world" on every 2D card, so the two kinds of world are easy to tell apart. */
export function FormatChip({ world }: { world: WorldsWorld }) {
  if (!isLevel2d(world)) return null
  return <span className="worlds-chip-tag worlds-chip-2d"><Square size={14} aria-hidden="true" /> 2D world</span>
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

/**
 * The owner's own shared card, once there is anyone to name: "Ava P. is here" for everyone in the
 * room right now, then "Ben K. invited" for the classmates who were asked but have not arrived.
 * Two of each, then a "+N" chip. With nothing to name it falls back to the plain sharing chip, so a
 * card renders the same whether or not presence came back (`buildingNames` is absent without it).
 */
export function PresenceChips({ world }: { world: WorldsWorld }) {
  const here = world.buildingNames ?? []
  const invited = (world.members ?? []).map(member => member.displayName).filter(name => !here.includes(name))
  if (here.length === 0 && invited.length === 0) return <SharingChip world={world} />
  return <>
    {here.slice(0, 2).map(name => <span key={`here-${name}`} className="worlds-chip-tag worlds-chip-here">
      <span className="worlds-live-dot" aria-hidden="true" /> {name} is here
    </span>)}
    {here.length > 2 && <span className="worlds-chip-tag worlds-chip-here">+{here.length - 2} more</span>}
    {invited.slice(0, 2).map(name => <span key={`invited-${name}`} className="worlds-chip-tag worlds-chip-invitees">
      <Users size={14} aria-hidden="true" /> {name} invited
    </span>)}
    {invited.length > 2 && <span className="worlds-chip-tag worlds-chip-invitees">+{invited.length - 2}</span>}
  </>
}

/** "2 building now" on a classmate's or an invited world: somebody is in that room this second. */
export function BuildingChip({ world }: { world: WorldsWorld }) {
  const count = buildingCount(world)
  if (count <= 0) return null
  return <span className="worlds-chip-tag worlds-chip-building">
    <span className="worlds-live-dot" aria-hidden="true" /> {count} building now
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
      {(chip || isLevel2d(world)) && <p className="worlds-card-chips"><FormatChip world={world} />{chip}</p>}
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
