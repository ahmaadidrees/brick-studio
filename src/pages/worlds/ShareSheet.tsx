import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Button, Sheet } from '../../ui'
import { classmatesLabel, isInviteOnly, isShared, sharedForBuilding, type Classmate, type WorldSharing, type WorldsWorld } from './worldsData'

type Props = {
  world: WorldsWorld
  className: string
  busy: boolean
  /** Active classmates for the invite picker; null while loading, an empty list when there is nobody to pick. */
  classmates: Classmate[] | null
  /** Set when the classmates could not be loaded; the whole-class choice still works. */
  classmatesError?: string
  onShare: (sharing: WorldSharing) => void
  onStopSharing: () => void
  onClose: () => void
}

type Audience = 'class' | 'members'

/**
 * "Share <title> with <class>": who sees it (everyone in the class, or only
 * the classmates you tap), then what they can do (look only by default, build
 * together as the second choice), and an honest line about what the teacher
 * can do. Reopened on a world that is already shared, it comes back with the
 * current audience and picks and also offers Stop sharing. Focus lands on the
 * first option (Sheet moves it and restores it to the opener on close).
 */
export function ShareSheet({ world, className, busy, classmates, classmatesError, onShare, onStopSharing, onClose }: Props) {
  const sharing = isShared(world)
  const initialAudience: Audience = isInviteOnly(world) ? 'members' : 'class'
  const initialPicks = () => (isInviteOnly(world) ? world.members?.map(member => member.id) ?? [] : [])
  const [audience, setAudience] = useState<Audience>(initialAudience)
  const [picked, setPicked] = useState<string[]>(initialPicks)
  const [canEdit, setCanEdit] = useState(sharing ? sharedForBuilding(world) : false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setAudience(isInviteOnly(world) ? 'members' : 'class')
    setPicked(isInviteOnly(world) ? world.members?.map(member => member.id) ?? [] : [])
    setCanEdit(sharing ? sharedForBuilding(world) : false)
  }, [world.id, world.visibility, world.members, sharing, world.classCanEdit, world.canEdit])

  const toggle = (id: string) => setPicked(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]))
  const nobodyPicked = audience === 'members' && picked.length === 0
  const share = () => onShare(audience === 'members' ? { visibility: 'members', canEdit, members: picked } : { visibility: 'class', canEdit })
  const audienceWord = audience === 'members' ? 'They' : 'Classmates'

  return <Sheet
    open
    variant="dialog"
    size="sm"
    initialFocusRef={first}
    closeLabel="Cancel"
    onClose={onClose}
    className="worlds-share-sheet"
    title={`Share “${world.title}” with ${className}`}
    description="Classmates see it in their Worlds page while collaboration is open."
    footer={<>
      {sharing && <Button variant="quiet" className="worlds-stop-sharing" disabled={busy} onClick={onStopSharing}>Stop sharing</Button>}
      <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} loadingLabel="Sharing…" disabled={nobodyPicked} onClick={share}>{sharing ? 'Save sharing' : 'Share'}</Button>
    </>}
  >
    <fieldset className="worlds-share-options">
      <legend>Who can see it?</legend>
      <label className="worlds-share-option">
        <input ref={first} type="radio" name="worlds-share-audience" value="class" checked={audience === 'class'} onChange={() => setAudience('class')} />
        <span><strong>Everyone in {className}</strong><small>Every classmate finds it under Shared by classmates.</small></span>
      </label>
      <label className="worlds-share-option">
        <input type="radio" name="worlds-share-audience" value="members" checked={audience === 'members'} onChange={() => setAudience('members')} />
        <span><strong>Only these classmates</strong><small>Tap the classmates you want. Nobody else is told.</small></span>
      </label>
    </fieldset>

    {audience === 'members' && <div className="worlds-share-picker">
      <div className="worlds-share-picker-head">
        <span id="worlds-share-picker-label">Pick classmates</span>
        <span className="worlds-share-picker-count" aria-live="polite">{picked.length} picked</span>
      </div>
      {classmatesError
        ? <p className="worlds-share-picker-note" role="alert">{classmatesError}</p>
        : classmates === null
          ? <p className="worlds-share-picker-note" role="status"><LoaderCircle className="ui-spin" size={16} aria-hidden="true" /> Loading classmates…</p>
          : classmates.length === 0
            ? <p className="worlds-share-picker-note">Nobody else is in {className} yet.</p>
            : <div className="worlds-share-roster" role="group" aria-labelledby="worlds-share-picker-label">
              {classmates.map(classmate => {
                const selected = picked.includes(classmate.id)
                return <button key={classmate.id} type="button" className={`worlds-share-tile${selected ? ' worlds-share-tile-selected' : ''}`} aria-pressed={selected} onClick={() => toggle(classmate.id)}>
                  <span className="worlds-share-tile-mark" aria-hidden="true">{selected ? <Check size={14} /> : classmate.displayName.charAt(0)}</span>
                  {classmate.displayName}
                </button>
              })}
            </div>}
    </div>}

    <fieldset className="worlds-share-options">
      <legend>What can they do?</legend>
      <label className="worlds-share-option">
        <input type="radio" name="worlds-share" value="look" checked={!canEdit} onChange={() => setCanEdit(false)} />
        <span><strong>{audienceWord} can look</strong><small>They can visit and walk around. Only you can change the bricks.</small></span>
      </label>
      <label className="worlds-share-option">
        <input type="radio" name="worlds-share" value="build" checked={canEdit} onChange={() => setCanEdit(true)} />
        <span><strong>{audienceWord} can build with me</strong><small>They can add and remove bricks while you are building together.</small></span>
      </label>
    </fieldset>
    <p className="worlds-share-note">
      Your teacher can see this world and can hide it from the class.
      {audience === 'members' && picked.length > 0 && ` Right now: ${classmatesLabel(picked.length)}.`}
    </p>
  </Sheet>
}
