import { ChevronDown, LoaderCircle, LogIn } from 'lucide-react'
import { Button } from '../ui'
import { AccountMenu, type AccountMenuContext } from './AccountMenu'
import { currentPath, joinPath } from './navigation'
import { useClassroomSession, type ClassroomSessionState } from './useClassroomSession'
import { invitesWaitingLabel, useInviteCount } from './useInviteCount'

export type AccountChipProps = {
  /** Override the live session (gallery, tests); otherwise `useClassroomSession()`. */
  session?: ClassroomSessionState
  context?: AccountMenuContext
  /** Editor only: the "Save this build to my account" item. */
  onSaveToAccount?: () => void
  /** Opens the account menu on mount (gallery). */
  menuDefaultOpen?: boolean
  className?: string
  /** Override the fetched invite count (gallery, tests); otherwise `useInviteCount()` for signed-in students. */
  inviteCount?: number
}

/** First letter of the display name for the avatar disc. */
export function avatarInitial(name: string | undefined): string {
  const first = name?.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

/**
 * Top-right account affordance. Signed out: a quiet "Sign in" link to
 * `/join?mode=signin` (pages add `next` so sign-in returns here). Signed in:
 * avatar initial, first name + last initial and a context line (class name
 * for students, "Teacher" for teachers) opening `AccountMenu`. Under 700px
 * only the avatar shows; the name stays for screen readers. Students with
 * classmate invites they have not looked at get a coral count on the avatar.
 */
export function AccountChip({ session: override, context = 'page', onSaveToAccount, menuDefaultOpen, className, inviteCount: inviteOverride }: AccountChipProps) {
  const live = useClassroomSession()
  const session = override ?? live
  const fetchedInvites = useInviteCount(session)
  const inviteCount = inviteOverride ?? fetchedInvites
  const classes = ['shell-account-chip', className].filter(Boolean).join(' ')

  if (session.status === 'guest') {
    const href = context === 'landing' ? joinPath({ mode: 'signin' }) : joinPath({ mode: 'signin', next: currentPath() })
    return <Button variant="quiet" href={href} icon={<LogIn size={18} />} className={`${classes} shell-account-signin`}>Sign in</Button>
  }

  if (session.status === 'loading') {
    return (
      <span className={`${classes} shell-account-loading`} role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle className="ui-spin" size={18} aria-hidden="true" />
        <span className="sr-only">Signing out…</span>
      </span>
    )
  }

  const name = session.displayName ?? session.user?.username ?? ''
  const contextLine = session.status === 'teacher' ? 'Teacher' : session.className
  const invitesLabel = invitesWaitingLabel(inviteCount)
  const baseName = contextLine && contextLine !== name ? `Account: ${name}, ${contextLine}` : `Account: ${name}`
  const accessibleName = invitesLabel ? `${baseName}, ${invitesLabel}` : baseName
  return (
    <AccountMenu
      session={session}
      context={context}
      onSaveToAccount={onSaveToAccount}
      inviteCount={inviteCount}
      defaultOpen={menuDefaultOpen}
      trigger={({ ref, ...props }) => (
        <button ref={ref} type="button" className={`${classes} shell-account-trigger`} aria-label={accessibleName} title={accessibleName} {...props}>
          <span className="shell-account-avatar" aria-hidden="true">
            {avatarInitial(name)}
            {invitesLabel && <span className="shell-account-badge" aria-label={invitesLabel}>{inviteCount > 9 ? '9+' : inviteCount}</span>}
          </span>
          <span className="shell-account-text" aria-hidden="true">
            <span className="shell-account-name">{name}</span>
            {contextLine && contextLine !== name && <span className="shell-account-context">{contextLine}</span>}
          </span>
          <ChevronDown className="shell-account-chevron" size={16} aria-hidden="true" />
        </button>
      )}
    />
  )
}
