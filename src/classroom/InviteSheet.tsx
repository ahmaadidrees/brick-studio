import type { ClassroomClassmate, ClassroomWorld, ClassroomWorldSharing } from './contracts'

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

/** Placeholder until lane A lands the real sheet; the props above are the contract lanes B and C build against. */
export function InviteSheet(_props: InviteSheetProps): JSX.Element | null {
  return null
}
