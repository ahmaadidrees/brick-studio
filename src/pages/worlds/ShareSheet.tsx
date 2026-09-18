import { useEffect, useRef, useState } from 'react'
import { Button, Sheet } from '../../ui'
import { isShared, type WorldSharing, type WorldsWorld } from './worldsData'

type Props = {
  world: WorldsWorld
  className: string
  busy: boolean
  onShare: (sharing: WorldSharing) => void
  onStopSharing: () => void
  onClose: () => void
}

/**
 * "Share <title> with <class>": look-only by default, build-together as the
 * second choice, and an honest line about what the teacher can do. Reopened on
 * a world that is already shared, it also offers Stop sharing. Focus lands on
 * the first option (Sheet moves it and restores it to the opener on close).
 */
export function ShareSheet({ world, className, busy, onShare, onStopSharing, onClose }: Props) {
  const sharing = isShared(world)
  const [canEdit, setCanEdit] = useState(sharing ? Boolean(world.canEdit) : false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { setCanEdit(sharing ? Boolean(world.canEdit) : false) }, [world.id, sharing, world.canEdit])

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
      <Button variant="primary" loading={busy} loadingLabel="Sharing…" onClick={() => onShare({ visibility: 'class', canEdit })}>{sharing ? 'Save sharing' : 'Share'}</Button>
    </>}
  >
    <fieldset className="worlds-share-options">
      <legend>What can classmates do?</legend>
      <label className="worlds-share-option">
        <input ref={first} type="radio" name="worlds-share" value="look" checked={!canEdit} onChange={() => setCanEdit(false)} />
        <span><strong>Classmates can look</strong><small>They can visit and walk around. Only you can change the bricks.</small></span>
      </label>
      <label className="worlds-share-option">
        <input type="radio" name="worlds-share" value="build" checked={canEdit} onChange={() => setCanEdit(true)} />
        <span><strong>Classmates can build with me</strong><small>They can add and remove bricks while you are building together.</small></span>
      </label>
    </fieldset>
    <p className="worlds-share-note">Your teacher can see this world and can hide it from the class.</p>
  </Sheet>
}
