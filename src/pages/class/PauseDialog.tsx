import { ConfirmDialog } from '../../classroom/ConfirmDialog'

export const PAUSED_NOTICE = 'Building together is paused. Saved worlds are kept.'

type PauseProps = { open: boolean; className: string; busy: boolean; onCancel: () => void; onConfirm: () => void }

/** The one confirm before pausing, shared by the header's Pause building and the Settings switch. */
export function PauseDialog({ open, className, busy, onCancel, onConfirm }: PauseProps) {
  return <ConfirmDialog
    open={open}
    title="Pause building together?"
    description={`Shared worlds in ${className} close to students right away.`}
    confirmLabel="Pause now"
    cancelLabel="Keep building"
    busy={busy}
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    <p>Students in shared worlds are disconnected. Everything they built is saved, and you can still open the worlds. Resume building brings them back.</p>
  </ConfirmDialog>
}
