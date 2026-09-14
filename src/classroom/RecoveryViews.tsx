import { CloudUpload, MonitorSmartphone, MoveRight } from 'lucide-react'
import { PasswordField } from './PasswordField'
import { PASSWORD_RULE, readForm } from './panelShared'

/** Board 04: forced password change after a teacher reset. Only me / change-password / logout are allowed here. */
export function PasswordResetView({ busy, onSubmit, onSignOut }: { busy: boolean; onSubmit: (password: string, confirm: string) => void; onSignOut: () => void }) {
  return <>
    <p className="classroom-lead">Your teacher reset your password. Choose one to use next time.</p>
    <form className="classroom-auth-form" onSubmit={event => { const data = readForm(event); onSubmit(data.password, data.confirm) }}>
      <div className="classroom-form-grid">
        <PasswordField label="New password" name="password" maxLength={128} autoComplete="new-password" required minLength={8} hint={PASSWORD_RULE} />
        <PasswordField label="Repeat new password" name="confirm" maxLength={128} autoComplete="new-password" required minLength={8} />
      </div>
      <div className="classroom-form-footer">
        <button className="classroom-primary" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</button>
        <button type="button" className="classroom-link" disabled={busy} onClick={onSignOut}>Sign out</button>
      </div>
    </form>
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

/** Board 04: explicit “save this build” hand-off. Always creates a new personal world; never overwrites one. */
export function SaveBuildForm({ title, busy, duplicate, onTitleChange, onSubmit, onKeepBuilding }: SaveProps) {
  return <form className="classroom-card classroom-save-form" aria-labelledby="classroom-save-title" onSubmit={event => { event.preventDefault(); onSubmit() }}>
    <h3 id="classroom-save-title">Save this build to your account</h3>
    <p className="classroom-help">Keep your world safe so you can open it on any device at school.</p>
    <div className="classroom-field"><label htmlFor="classroom-save-name">World name</label><input id="classroom-save-name" value={title} onChange={event => onTitleChange(event.target.value)} required maxLength={80} autoComplete="off" /></div>
    <div className="classroom-save-path" aria-label="Where this build is stored">
      <span className="classroom-save-chip"><MonitorSmartphone size={16} aria-hidden="true" /> Saved in this browser</span>
      <MoveRight size={18} aria-hidden="true" />
      <span className="classroom-save-chip classroom-save-chip-cloud"><CloudUpload size={16} aria-hidden="true" /> Save online</span>
    </div>
    {duplicate && <p className="classroom-warning" role="status">You already have a world named “{title.trim()}”. Saving adds a second world with that name; the existing one is not replaced.</p>}
    <div className="classroom-form-footer">
      <button className="classroom-primary" disabled={busy || !title.trim()}>{busy ? 'Saving…' : duplicate ? 'Save as a new world anyway' : 'Save world'}</button>
      <button type="button" disabled={busy} onClick={onKeepBuilding}>Keep building</button>
    </div>
  </form>
}
