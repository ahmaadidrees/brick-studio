import React, { useEffect, useRef, useState } from 'react'
import { MAX_VARIABLE_NAME } from './variables'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

const Shell: React.FC<{ title: string; labelId: string; onClose: () => void; children: React.ReactNode }> = ({ title, labelId, onClose, children }) => (
  <div className="code-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="code-modal-card code-modal-card-small">
      <div className="code-modal-header">
        <div className="code-modal-badge" style={{ backgroundColor: '#ff8c1a' }}>📊</div>
        <h2 id={labelId} className="code-modal-title">{title}</h2>
        <button type="button" className="code-modal-close-btn" onClick={onClose} aria-label="Close dialog">✕</button>
      </div>
      {children}
    </div>
  </div>
)

export interface RenameVariableModalProps {
  name: string
  /** Why a name can't be used, or null. */
  problemFor: (name: string) => string | null
  onRename: (name: string) => void
  onClose: () => void
}

/** "Rename variable": the name is selected, so typing replaces it. */
export const RenameVariableModal: React.FC<RenameVariableModalProps> = ({ name, problemFor, onRename, onClose }) => {
  const [draft, setDraft] = useState(name)
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  useEscape(onClose)
  const unchanged = draft.trim() === name
  const problem = unchanged ? null : problemFor(draft)
  const submit = () => {
    if (unchanged) return onClose()
    if (!problem) onRename(draft.trim())
  }
  return (
    <Shell title={`Rename “${name}”`} labelId="rename-variable-title" onClose={onClose}>
      <form className="code-modal-section" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label className="code-modal-section-title" htmlFor="rename-variable-input">New name</label>
        <input id="rename-variable-input" ref={input} className="code-name-input" value={draft} maxLength={MAX_VARIABLE_NAME}
          autoComplete="off" spellCheck={false} onChange={(e) => setDraft(e.target.value)} aria-invalid={!!problem} aria-describedby={problem ? 'rename-variable-problem' : undefined} />
        {problem && <p id="rename-variable-problem" className="code-name-problem" role="status">{problem}</p>}
      </form>
      <div className="code-modal-footer">
        <button type="button" className="code-btn-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="code-btn-primary" disabled={!!problem} onClick={submit}>Rename</button>
      </div>
    </Shell>
  )
}

export interface VariableNoticeModalProps {
  title: string
  message: string
  /** With a confirm button, the dialog asks; without, it only tells. */
  confirmText?: string
  onConfirm?: () => void
  onClose: () => void
}

/** Ask before deleting a variable that blocks use, or say why it can't be deleted here. */
export const VariableNoticeModal: React.FC<VariableNoticeModalProps> = ({ title, message, confirmText, onConfirm, onClose }) => {
  useEscape(onClose)
  const first = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { first.current?.focus() }, [])
  return (
    <Shell title={title} labelId="variable-notice-title" onClose={onClose}>
      <p className="code-modal-section code-notice-text">{message}</p>
      <div className="code-modal-footer">
        {onConfirm ? <>
          <button type="button" ref={first} className="code-btn-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="code-btn-primary code-btn-danger" onClick={onConfirm}>{confirmText ?? 'OK'}</button>
        </> : <button type="button" ref={first} className="code-btn-primary" onClick={onClose}>OK</button>}
      </div>
    </Shell>
  )
}
