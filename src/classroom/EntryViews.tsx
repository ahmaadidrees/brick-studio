import { useState } from 'react'
import { PasswordField } from './PasswordField'
import { PASSWORD_RULE, USERNAME_PATTERN, USERNAME_RULE, readForm } from './panelShared'

export type EntryMode = 'login' | 'register' | 'teacher-login'

export const ENTRY_MODE_LABELS: Record<EntryMode, string> = { login: 'Student sign in', register: 'Join a class', 'teacher-login': 'Teacher sign in' }
export const ENTRY_HEADLINES: Record<EntryMode, { title: string; lead: string }> = {
  login: { title: 'Welcome back', lead: 'Sign in to open your saved worlds.' },
  register: { title: 'Join your class', lead: 'Create an account with your teacher’s code.' },
  'teacher-login': { title: 'Teacher sign in', lead: 'Access your classroom and student worlds.' },
}

type Props = {
  mode: EntryMode
  busy: boolean
  onModeChange: (mode: EntryMode) => void
  onSubmit: (mode: EntryMode, values: Record<string, string>) => void
  onGoogle: () => void
  onKeepBuilding: () => void
}

/** Board 03: distinct student sign-in, enrollment and teacher views over the same three-mode nav. */
export function EntryView({ mode, busy, onModeChange, onSubmit, onGoogle, onKeepBuilding }: Props) {
  return <>
    <nav className="classroom-mode-nav" aria-label="Sign in options">{(['login', 'register', 'teacher-login'] as const).map(item => <button key={item} type="button" disabled={busy} aria-pressed={mode === item} onClick={() => onModeChange(item)}>{ENTRY_MODE_LABELS[item]}</button>)}</nav>
    <p className="classroom-lead">{ENTRY_HEADLINES[mode].lead}</p>
    {mode === 'login' && <StudentSignInForm key="login" busy={busy} onSubmit={values => onSubmit('login', values)} onJoin={() => onModeChange('register')} onKeepBuilding={onKeepBuilding} />}
    {mode === 'register' && <EnrollForm key="register" busy={busy} onSubmit={values => onSubmit('register', values)} onSignIn={() => onModeChange('login')} onKeepBuilding={onKeepBuilding} />}
    {mode === 'teacher-login' && <TeacherSignInForm key="teacher" busy={busy} onSubmit={values => onSubmit('teacher-login', values)} onGoogle={onGoogle} onKeepBuilding={onKeepBuilding} />}
    <p className="classroom-preserved" role="note">Your current build stays here while you sign in.</p>
  </>
}

function KeepBuilding({ busy, onKeepBuilding }: { busy: boolean; onKeepBuilding: () => void }) {
  return <button type="button" className="classroom-link" disabled={busy} onClick={onKeepBuilding}>Keep building as a guest</button>
}

function StudentSignInForm({ busy, onSubmit, onJoin, onKeepBuilding }: { busy: boolean; onSubmit: (values: Record<string, string>) => void; onJoin: () => void; onKeepBuilding: () => void }) {
  return <form className="classroom-auth-form" onSubmit={event => onSubmit(readForm(event))}>
    <div className="classroom-form-grid">
      <div className="classroom-field"><label htmlFor="classroom-class-code">Class sign-in code</label><input id="classroom-class-code" name="classCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={32} aria-describedby="classroom-code-help" /><small id="classroom-code-help">The returning sign-in code for your class.</small></div>
      <div className="classroom-field"><label htmlFor="classroom-username">Username</label><input id="classroom-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} pattern={USERNAME_PATTERN} title={USERNAME_RULE} /></div>
      <PasswordField name="password" label="Password" maxLength={128} autoComplete="current-password" required />
    </div>
    <p className="classroom-help">Forgot your details? Ask your teacher.</p>
    <div className="classroom-form-footer">
      <button className="classroom-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="classroom-link" disabled={busy} onClick={onJoin}>New here? Join a class</button>
      <KeepBuilding busy={busy} onKeepBuilding={onKeepBuilding} />
    </div>
  </form>
}

function EnrollForm({ busy, onSubmit, onSignIn, onKeepBuilding }: { busy: boolean; onSubmit: (values: Record<string, string>) => void; onSignIn: () => void; onKeepBuilding: () => void }) {
  return <form className="classroom-auth-form" onSubmit={event => onSubmit(readForm(event))}>
    <div className="classroom-form-grid">
      <div className="classroom-field"><label htmlFor="classroom-class-code">Enrollment code</label><input id="classroom-class-code" name="classCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={32} aria-describedby="classroom-code-help" /><small id="classroom-code-help">The code your teacher gives new students.</small></div>
      <div className="classroom-field"><label htmlFor="classroom-username">Choose a username</label><input id="classroom-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} pattern={USERNAME_PATTERN} title={USERNAME_RULE} aria-describedby="classroom-username-help" /><small id="classroom-username-help">{USERNAME_RULE} Classmates see this name.</small></div>
      <div className="classroom-field"><label htmlFor="classroom-roster-name">Name your teacher knows</label><input id="classroom-roster-name" name="rosterName" autoComplete="off" required maxLength={80} aria-describedby="classroom-roster-help" /><small id="classroom-roster-help">Shown to your teacher only.</small></div>
      <PasswordField name="password" label="Choose a password" maxLength={128} autoComplete="new-password" required minLength={8} hint={`${PASSWORD_RULE} Remember it for next time.`} />
    </div>
    <div className="classroom-form-footer">
      <button className="classroom-primary" disabled={busy}>{busy ? 'Creating your account…' : 'Create account and join'}</button>
      <button type="button" className="classroom-link" disabled={busy} onClick={onSignIn}>Already have an account? Sign in</button>
      <KeepBuilding busy={busy} onKeepBuilding={onKeepBuilding} />
    </div>
  </form>
}

function TeacherSignInForm({ busy, onSubmit, onGoogle, onKeepBuilding }: { busy: boolean; onSubmit: (values: Record<string, string>) => void; onGoogle: () => void; onKeepBuilding: () => void }) {
  const [passwordOpen, setPasswordOpen] = useState(false)
  return <div className="classroom-teacher-entry">
    <div className="classroom-google">
      <button type="button" className="classroom-primary" disabled={busy} onClick={onGoogle}>{busy ? 'Opening Google…' : 'Continue with Google'}</button>
      <small>Use your existing teacher account. Teacher access is set up by the school, not created here.</small>
    </div>
    <div className="classroom-or" aria-hidden="true"><span>or</span></div>
    <button type="button" className="classroom-disclosure" disabled={busy} aria-expanded={passwordOpen} aria-controls="classroom-teacher-password" onClick={() => setPasswordOpen(open => !open)}>Use email and password</button>
    {passwordOpen && <form id="classroom-teacher-password" className="classroom-auth-form" onSubmit={event => onSubmit(readForm(event))}>
      <div className="classroom-form-grid">
        <div className="classroom-field"><label htmlFor="classroom-teacher-email">Email</label><input id="classroom-teacher-email" name="email" type="email" autoComplete="username" required /></div>
        <PasswordField name="password" label="Password" maxLength={128} autoComplete="current-password" required />
      </div>
      <div className="classroom-form-footer"><button className="classroom-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
    </form>}
    <div className="classroom-form-footer classroom-form-footer-links"><KeepBuilding busy={busy} onKeepBuilding={onKeepBuilding} /></div>
  </div>
}
