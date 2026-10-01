import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button, Sheet } from '../ui'
import type { ClassroomInvite } from './contracts'
import { useStudentInvites, type InviteClient, type InviteSnapshot } from './inviteStore'
import { useClassroomSession, type ClassroomSessionState } from '../shell/useClassroomSession'
import './student-invites.css'

export const inviteWorldHref = (invite: Pick<ClassroomInvite, 'worldId' | 'format'>) => `${invite.format === '2d' ? '/2d/w' : '/live'}/${invite.worldId.replaceAll('-', '')}`
export function inviteActionLabel(invite: Pick<ClassroomInvite, 'ownerName'>) {
  const firstName = invite.ownerName?.trim().split(/\s+/)[0]
  return firstName ? `Go to ${firstName}’s world` : 'Go to world'
}

/** Reused by the shared panel and the default Worlds library; permissions describe the server's actual access. */
export function StudentInviteList({ state, onGo, blocked = false, search = '' }: {
  state: InviteSnapshot; onGo: (invite: ClassroomInvite) => void; blocked?: boolean; search?: string
}) {
  const needle = search.trim().toLocaleLowerCase()
  const invites = state.invites.filter(invite => `${invite.title} ${invite.ownerName}`.toLocaleLowerCase().includes(needle))
  return <>
    {state.loading && <p role="status">Loading invites…</p>}
    {state.error && <p className="student-invites-error" role="status">{state.error}</p>}
    {!state.loading && invites.length === 0 && <p className="student-invites-empty">{needle ? 'No shared worlds match that search.' : 'When a classmate invites you, their world will be here.'}</p>}
    {invites.length > 0 && <ul className="student-invite-list">{invites.map(invite => <li className="student-invite-card" key={invite.id}>
      <div className="student-invite-heading">
        <strong>{invite.title}</strong>
        {!invite.seenAt && <span className="student-invite-new">New</span>}
      </div>
      <p>{invite.ownerName || 'A classmate'} invited you</p>
      <div className="student-invite-tags">
        <span>{invite.format === '2d' ? '2D' : '3D'}</span>
        <span>{invite.canEdit ? 'You can build' : 'Just looking'}</span>
      </div>
      <Button variant="primary" disabled={blocked} onClick={() => onGo(invite)}>{inviteActionLabel(invite)}</Button>
    </li>)}</ul>}
    {blocked && <p role="status">Waiting for your current world to save…</p>}
  </>
}

export type InvitesButtonProps = {
  session?: ClassroomSessionState
  client?: InviteClient
  onGoToInviteWorld?: (href: string) => void | Promise<void>
  navigationBlocked?: boolean
}

/** Explicitly opened only; arriving invites never take focus or interrupt the game. */
export function InvitesButton({ session: override, client, onGoToInviteWorld, navigationBlocked }: InvitesButtonProps) {
  const live = useClassroomSession()
  const session = override ?? live
  const userId = session.status === 'student' && session.user?.role === 'student' ? session.user.id : null
  const { state, store } = useStudentInvites(userId, client)
  const [navigationError, setNavigationError] = useState('')
  if (!userId) return null
  const unread = state.invites.filter(invite => !invite.seenAt).length
  const arrivals = state.invites.filter(invite => state.arrivalIds.includes(invite.id))
  const open = () => {
    // A save, invite picker, or classroom modal already owns keyboard focus.
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
    setNavigationError(''); store.openPanel()
  }
  const go = (invite: ClassroomInvite) => {
    if (navigationBlocked) return
    store.closePanel()
    // Complete sheet focus restoration before a save/leave confirmation can open.
    requestAnimationFrame(() => {
      const href = inviteWorldHref(invite)
      Promise.resolve().then(() => onGoToInviteWorld ? onGoToInviteWorld(href) : window.location.assign(href)).catch(() => setNavigationError('Your world is still here. Save it, then try the invite again.'))
    })
  }
  return <>
    <Button variant="secondary" size="sm" className="shell-invites-button" icon={<Mail size={17} />} aria-haspopup="dialog" aria-expanded={state.panelOpen} onClick={open}>
      Invites{unread > 0 && <strong className="shell-invites-count" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</strong>}
    </Button>
    {arrivals.length > 0 && !state.panelOpen && <aside className="student-invite-arrival" aria-label="New invitation">
      <p role="status" aria-live="polite" aria-atomic="true">{arrivals.length === 1 ? `${arrivals[0].ownerName || 'A classmate'} invited you to a world.` : `${arrivals.length} new invites are waiting.`}</p>
      <div><Button variant="primary" size="sm" onClick={open}>See invites</Button><Button variant="quiet" size="sm" onClick={store.dismissArrival}>Later</Button></div>
    </aside>}
    {navigationError && <p className="student-invite-arrival" role="status">{navigationError}<Button variant="quiet" size="sm" onClick={() => setNavigationError('')}>Close</Button></p>}
    {state.panelOpen && <Sheet open title="Invites" description="Worlds your classmates shared with you. You can come back here anytime." onClose={store.closePanel} size="md" className="student-invites-panel" footer={<Button variant="secondary" onClick={store.closePanel}>Close</Button>}>
      <StudentInviteList state={state} onGo={go} blocked={navigationBlocked} />
    </Sheet>}
  </>
}
