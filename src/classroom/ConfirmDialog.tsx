import { useRef, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button, Dialog } from '../ui'

type Props = {
  open: boolean
  title: string
  /** One sentence on what happens; read as the dialog description. */
  description?: string
  /** What is preserved / what changes right away. Announced as a status. */
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  /** Destructive actions get the danger button; safe-but-irreversible ones the primary. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Explicit boundary before suspend, close collaboration, remove from group and
 * restore. Focus lands on the safe choice; Escape and the backdrop cancel.
 */
export function ConfirmDialog({ open, title, description, children, confirmLabel, cancelLabel = 'Cancel', busy = false, destructive = true, onConfirm, onCancel }: Props) {
  const cancel = useRef<HTMLButtonElement>(null)
  return <Dialog
    open={open}
    onClose={onCancel}
    title={title}
    description={description}
    initialFocusRef={cancel}
    className="classroom-confirm"
    footer={<>
      <Button ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
      <Button variant={destructive ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </>}
  >
    <div className="classroom-confirm-body">
      <span className="classroom-confirm-icon" aria-hidden="true"><TriangleAlert size={22} /></span>
      <div role="status">{children}</div>
    </div>
  </Dialog>
}
