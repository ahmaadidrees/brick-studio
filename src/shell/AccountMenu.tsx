import { FolderOpen, LogOut, Plus, Presentation, Save, UserRoundCog, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Menu, MenuItem, MenuSeparator, type MenuTriggerProps } from '../ui'
import { CLASS_PATH, NEW_BUILD_HREF, PROJECTOR_PATH, WORLDS_PATH } from './navigation'
import type { ClassroomSessionState } from './useClassroomSession'
import { invitesWaitingLabel } from './useInviteCount'

/** Which surface the menu sits on; the editor adds "Save this build to my account". */
export type AccountMenuContext = 'landing' | 'page' | 'editor'

export type AccountMenuProps = {
  session: ClassroomSessionState
  context: AccountMenuContext
  /** Editor only: opens the in-editor save sheet for the browser draft. Hidden when absent (already a cloud world). */
  onSaveToAccount?: () => void
  /** Students: classmate invites not looked at yet; "My worlds" says "N invites waiting" when > 0. */
  inviteCount?: number
  trigger: (props: MenuTriggerProps, state: { open: boolean }) => ReactNode
  defaultOpen?: boolean
  className?: string
}

/** Students: "My class" opens the class side of My worlds (W4 rail). */
export const MY_CLASS_STUDENT_PATH = `${WORLDS_PATH}?view=class`

/**
 * The account menu behind the chip. Student: My worlds, My class, Save this
 * build to my account (editor), Switch account, Sign out. Teacher: My class,
 * My worlds, Show class code on projector, Switch account, Sign out. The
 * header shows who is signed in so the items can stay short.
 */
export function AccountMenu({ session, context, onSaveToAccount, inviteCount = 0, trigger, defaultOpen, className }: AccountMenuProps) {
  const teacher = session.status === 'teacher' || session.user?.role === 'teacher'
  const contextLine = teacher ? 'Teacher' : session.className
  const name = session.displayName ?? session.user?.username ?? ''
  return (
    <Menu
      label="Account"
      align="end"
      trigger={trigger}
      defaultOpen={defaultOpen}
      className={className}
      header={
        <>
          <span className="shell-account-menu-name">{name}</span>
          {contextLine && contextLine !== name && <span className="shell-account-menu-context">{contextLine}</span>}
        </>
      }
    >
      {/*
        * Starting something new is the first thing in the menu on every page.
        * The editor is the exception: its ⋯ menu already offers New build, and
        * that one resets the build in place instead of navigating.
        */}
      {context !== 'editor' && <MenuItem icon={<Plus size={18} />} label="New build" description="Open the studio on an empty plate" href={NEW_BUILD_HREF} />}
      {teacher ? (
        <>
          <MenuItem icon={<Users size={18} />} label="My class" description="Students, worlds and settings" href={CLASS_PATH} />
          <MenuItem icon={<FolderOpen size={18} />} label="My worlds" description="Your own builds" href={WORLDS_PATH} />
          <MenuItem icon={<Presentation size={18} />} label="Show class code on projector" description="Full-screen code and QR" href={PROJECTOR_PATH} />
        </>
      ) : (
        <>
          <MenuItem icon={<FolderOpen size={18} />} label="My worlds" description={invitesWaitingLabel(inviteCount) || 'Your saved builds'} href={WORLDS_PATH} />
          <MenuItem icon={<Users size={18} />} label="My class" description="Worlds shared with your class" href={MY_CLASS_STUDENT_PATH} />
          {context === 'editor' && onSaveToAccount && (
            <MenuItem icon={<Save size={18} />} label="Save this build to my account" description="Keep it across devices" onSelect={onSaveToAccount} />
          )}
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={<UserRoundCog size={18} />} label="Switch account" onSelect={() => { void session.switchAccount() }} />
      <MenuItem icon={<LogOut size={18} />} label="Sign out" onSelect={() => { void session.signOut() }} />
    </Menu>
  )
}
