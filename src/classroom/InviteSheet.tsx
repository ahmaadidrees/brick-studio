import { useEffect, useState } from 'react'
import { Check, LoaderCircle, Users } from 'lucide-react'
import { Button, Sheet } from '../ui'
import type { ClassroomClassmate, ClassroomWorld, ClassroomWorldSharing } from './contracts'
import './invite-sheet.css'

/**
 * "Who do you want to build with?" — the one build-together sheet, shared by /worlds (card button), the editor
 * (command strip "Build together") and the live room ("Invite more"). See docs/flows/CONTRACTS-BT.md.
 *
 * Classmate tiles come first; "Everyone in class" is a chip; "Just let them look" is a switch that is OFF by
 * default (building is the default). The primary button reads back the choice: "Invite Jayden and Maya and build",
 * "Invite the class to look", "Pick someone first" (disabled) …
 */
export type InviteSheetProps = {
  world: Pick<ClassroomWorld, 'id' | 'title' | 'visibility' | 'classCanEdit' | 'members'>
  /** The owner's class name ("Period 3"). */
  className: string
  /** Active classmates (caller excluded); null while loading, [] when nobody else is enrolled. */
  classmates: ClassroomClassmate[] | null
  classmatesError?: string
  busy: boolean
  /**
   * Fired with the resulting sharing. The CALLER decides what happens next: /worlds and the editor navigate the
   * owner into the live room when `canEdit` is true; the live room just refreshes its roster.
   */
  onInvite: (sharing: ClassroomWorldSharing) => void
  /** Shown only when the world is already shared. */
  onStopSharing?: () => void
  onClose: () => void
}

/** Sentence used in the primary button and in toasts: "Jayden and Maya", "Jayden and 2 more", "the class". */
export function inviteAudienceLabel(sharing: ClassroomWorldSharing, classmates: ClassroomClassmate[]): string {
  if (sharing.visibility === 'class') return 'the class'
  const names = (sharing.members ?? []).map(id => classmates.find(mate => mate.id === id)?.displayName ?? 'a classmate')
  if (names.length === 0) return 'classmates'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} more`
}

const initialPicks = (world: InviteSheetProps['world']) => (world.visibility === 'members' ? world.members?.map(member => member.id) ?? [] : [])
const classmatesCount = (count: number) => `${count} ${count === 1 ? 'classmate' : 'classmates'}`

/**
 * Picks are kept as ids so a reopened sheet preloads the current invitees. The "Everyone in class" chip clears
 * the picks (pressed, it is the whole audience); tapping a tile turns the chip back off and picks that classmate.
 * The look-only switch starts OFF unless the world is already shared look-only.
 */
export function InviteSheet({ world, className, classmates, classmatesError, busy, onInvite, onStopSharing, onClose }: InviteSheetProps) {
  const shared = world.visibility !== 'private'
  const [everyone, setEveryone] = useState(world.visibility === 'class')
  const [picked, setPicked] = useState<string[]>(() => initialPicks(world))
  const [lookOnly, setLookOnly] = useState(shared && !world.classCanEdit)
  useEffect(() => {
    setEveryone(world.visibility === 'class')
    setPicked(initialPicks(world))
    setLookOnly(world.visibility !== 'private' && !world.classCanEdit)
  }, [world.id, world.visibility, world.members, world.classCanEdit])

  const toggleClassmate = (id: string) => {
    setEveryone(false)
    setPicked(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]))
  }
  const toggleEveryone = () => {
    setEveryone(current => !current)
    setPicked([])
  }
  const sharing: ClassroomWorldSharing = everyone ? { visibility: 'class', canEdit: !lookOnly } : { visibility: 'members', canEdit: !lookOnly, members: picked }
  const nobody = !everyone && picked.length === 0
  const label = nobody ? 'Pick someone first' : `Invite ${inviteAudienceLabel(sharing, classmates ?? [])} ${lookOnly ? 'to look' : 'and build'}`
  const classLabel = classmates ? `${className} · ${classmatesCount(classmates.length)}` : className

  return <Sheet
    open
    variant="dialog"
    size="md"
    closeLabel="Cancel"
    onClose={onClose}
    className="invite-sheet"
    title="Who do you want to build with?"
    description={`They get a note on their Worlds page and can jump into “${world.title}” with you.`}
    footer={<>
      <p className="invite-sheet-teacher">Your teacher can see it too.</p>
      <div className="invite-sheet-actions">
        {shared && onStopSharing && <Button variant="quiet" className="invite-sheet-stop" disabled={busy} onClick={onStopSharing}>Stop sharing</Button>}
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="invite-sheet-submit" loading={busy} loadingLabel="Inviting…" disabled={nobody} onClick={() => onInvite(sharing)}>{label}</Button>
      </div>
    </>}
  >
    <div className="invite-sheet-class">
      <span id="invite-sheet-roster-label" className="invite-sheet-class-name">{classLabel}</span>
      <Button variant="secondary" size="sm" className="invite-sheet-everyone" icon={<Users size={16} />} pressed={everyone} disabled={busy} onClick={toggleEveryone}>Everyone in class</Button>
    </div>

    {classmatesError
      ? <p className="invite-sheet-note" role="alert">{classmatesError}</p>
      : classmates === null
        ? <p className="invite-sheet-note" role="status"><LoaderCircle className="ui-spin" size={16} aria-hidden="true" /> Loading classmates…</p>
        : classmates.length === 0
          ? <p className="invite-sheet-note">Nobody else is in {className} yet.</p>
          : <div className="invite-sheet-roster" role="group" aria-labelledby="invite-sheet-roster-label">
            {classmates.map(classmate => {
              const selected = !everyone && picked.includes(classmate.id)
              return <button key={classmate.id} type="button" className={`invite-sheet-tile${selected ? ' invite-sheet-tile-selected' : ''}`} aria-pressed={selected} disabled={busy} onClick={() => toggleClassmate(classmate.id)}>
                <span className="invite-sheet-tile-disc" aria-hidden="true">{selected ? <Check size={16} strokeWidth={3} /> : classmate.displayName.charAt(0)}</span>
                <span className="invite-sheet-tile-name">{classmate.displayName}</span>
              </button>
            })}
          </div>}

    <div className="invite-sheet-look">
      <div className="invite-sheet-look-text">
        <strong id="invite-sheet-look-label">Just let them look</strong>
        <small>{lookOnly ? 'They can visit and walk around. Only you change the bricks.' : 'Off: they build with you, live, in the same room.'}</small>
      </div>
      <button type="button" role="switch" className="invite-sheet-switch" aria-checked={lookOnly} aria-labelledby="invite-sheet-look-label" disabled={busy} onClick={() => setLookOnly(current => !current)}>
        <span className="invite-sheet-switch-track" aria-hidden="true"><span className="invite-sheet-switch-knob" /></span>
        <span className="invite-sheet-switch-state">{lookOnly ? 'On' : 'Off'}</span>
      </button>
    </div>
  </Sheet>
}
