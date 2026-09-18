import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button, Dialog, TextField } from '../ui'

export const WORLD_TITLE_MAX_LENGTH = 80

export type RenameWorldDialogProps = {
  currentTitle: string
  onRename: (title: string) => Promise<void>
  onClose: () => void
}

/**
 * Rename an account world from the header (pencil or the This build menu).
 * A shared Dialog so builder shortcuts pause while typing; focus returns to
 * whatever opened it.
 */
export function RenameWorldDialog({ currentTitle, onRename, onClose }: RenameWorldDialogProps) {
  const formId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(currentTitle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => { input.current?.select() }, [])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = title.trim().slice(0, WORLD_TITLE_MAX_LENGTH).trim()
    if (!next) { setError('Give your world a name.'); return }
    if (next === currentTitle) { onClose(); return }
    setBusy(true)
    setError('')
    onRename(next)
      .then(() => closeRef.current())
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : 'Could not rename this world. Try again.'); setBusy(false) })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Rename world"
      description="The new name shows in My worlds and in the header."
      dismissible={!busy}
      initialFocusRef={input}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form={formId} loading={busy} loadingLabel="Saving name…">Save name</Button>
      </>}
    >
      <form id={formId} onSubmit={submit}>
        <TextField
          ref={input}
          label="World name"
          value={title}
          maxLength={WORLD_TITLE_MAX_LENGTH}
          disabled={busy}
          error={error || undefined}
          autoComplete="off"
          onChange={(event) => { setTitle(event.target.value); setError('') }}
        />
      </form>
    </Dialog>
  )
}
