import { useState } from 'react'
import { Check, CloudUpload, MonitorSmartphone, MoveRight, X } from 'lucide-react'
import { Button } from '../ui'
import { passwordRules, type RuleResult } from '../pages/join/joinRules'
import { PasswordField } from './PasswordField'
import { TextInput } from './fields'
import { PASSWORD_RULE, readForm } from './panelShared'

export const RESET_FORM_ID = 'classroom-reset-form'

/** One line per rule; green when it passes, red once it is broken, grey before anything is typed. */
export function RuleList({ id, label, rules }: { id: string; label: string; rules: RuleResult[] }) {
  return <ul className="join-rules" id={id} aria-label={label} aria-live="polite" style={{ listStyle: 'none', padding: 0 }}>
    {rules.map(rule => <li key={rule.id} className={`join-rule join-rule-${rule.state}`}>
      {rule.state === 'bad' ? <X size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
      <span>{rule.label}</span>
      {rule.state !== 'pending' && <span className="sr-only">{rule.state === 'ok' ? ' — done' : ' — not yet'}</span>}
    </li>)}
  </ul>
}

/**
 * Board 04 left: forced password change after a teacher reset. Only me / change-password / logout are allowed here.
 * The same live rules as the join page, plus whether the two passwords match, so nothing is a surprise on submit.
 */
export function PasswordResetView({ onSubmit, username = '' }: { onSubmit: (password: string, confirm: string) => void; username?: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const rules: RuleResult[] = [
    ...passwordRules(password, username),
    { id: 'match', label: 'Both passwords match', state: confirm === '' ? 'pending' : confirm === password ? 'ok' : 'bad' },
  ]
  return <form id={RESET_FORM_ID} className="classroom-form" onSubmit={event => { const data = readForm(event); onSubmit(data.password, data.confirm) }}>
    <PasswordField label="New password" name="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} autoComplete="new-password" required minLength={6} hint={PASSWORD_RULE} />
    <PasswordField label="Repeat new password" name="confirm" value={confirm} onChange={event => setConfirm(event.target.value)} maxLength={128} autoComplete="new-password" required minLength={6} />
    <RuleList id="classroom-reset-rules" label="New password rules" rules={rules} />
  </form>
}

export function ResetFooter({ busy, onSignOut }: { busy: boolean; onSignOut: () => void }) {
  return <>
    <Button variant="quiet" className="classroom-footer-link" disabled={busy} onClick={onSignOut}>Sign out</Button>
    <Button type="submit" form={RESET_FORM_ID} variant="primary" loading={busy} loadingLabel="Updating…">Set new password</Button>
  </>
}

type SaveProps = {
  title: string
  busy: boolean
  /** A personal world with this name already exists; the button says so before anything is sent. */
  duplicate: boolean
  onTitleChange: (title: string) => void
  onSubmit: () => void
  onKeepBuilding: () => void
}

/** Board 04 middle: explicit “save this build” hand-off. Always creates a new personal world; never overwrites one. */
export function SaveBuildForm({ title, busy, duplicate, onTitleChange, onSubmit, onKeepBuilding }: SaveProps) {
  return <form className="classroom-card classroom-save-form" aria-labelledby="classroom-save-title" onSubmit={event => { event.preventDefault(); onSubmit() }}>
    <div>
      <h3 id="classroom-save-title" className="classroom-card-title">Save this build to your account</h3>
      <p className="classroom-help">Keep your world safe so you can open it on any device at school.</p>
    </div>
    <TextInput label="Project name" id="classroom-save-name" value={title} onChange={event => onTitleChange(event.target.value)} required maxLength={80} autoComplete="off" />
    <div className="classroom-save-path" aria-label="Where this build is stored">
      <span className="classroom-save-chip"><MonitorSmartphone size={16} aria-hidden="true" /> On this computer only</span>
      <MoveRight size={18} aria-hidden="true" />
      <span className="classroom-save-chip classroom-save-chip-cloud"><CloudUpload size={16} aria-hidden="true" /> Save online</span>
    </div>
    {duplicate && <p className="classroom-warning" role="status">You already have a world named “{title.trim()}”. Saving adds a second world with that name; the existing one is not replaced.</p>}
    <div className="classroom-actions classroom-actions-stack">
      <Button type="submit" variant="primary" fullWidth disabled={!title.trim()} loading={busy} loadingLabel="Saving…">{duplicate ? 'Save as a new world anyway' : 'Save world'}</Button>
      <Button variant="secondary" fullWidth disabled={busy} onClick={onKeepBuilding}>Keep building</Button>
    </div>
  </form>
}
