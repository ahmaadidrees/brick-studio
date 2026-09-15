import { useState } from 'react'
import { ChevronDown, ChevronUp, GraduationCap, KeyRound, Mail, UserRound, UserRoundPlus } from 'lucide-react'
import { BrickMark } from '../brand'
import { Button, SegmentedControl } from '../ui'
import { PasswordField } from './PasswordField'
import { TextInput } from './fields'
import { PASSWORD_RULE, USERNAME_RULE, readForm } from './panelShared'

export type EntryMode = 'login' | 'register' | 'teacher-login'
/** Client-side rule failures shown on the field itself; server rejections stay in the panel alert. */
export type EntryFieldErrors = Partial<Record<'username' | 'password', string>>

/** The student/enrollment form; the sheet footer submits it through `form=`. */
export const ENTRY_FORM_ID = 'classroom-entry-form'

export const ENTRY_MODE_LABELS: Record<EntryMode, string> = { login: 'Student', register: 'Join a class', 'teacher-login': 'Teacher' }
export const ENTRY_HEADLINES: Record<EntryMode, { title: string; lead: string }> = {
  login: { title: 'Welcome back', lead: 'Sign in to open your saved worlds.' },
  register: { title: 'Join your class', lead: 'Create an account with your teacher’s code.' },
  'teacher-login': { title: 'Teacher sign in', lead: 'Access your classroom and student worlds.' },
}

type Props = {
  mode: EntryMode
  busy: boolean
  fieldErrors: EntryFieldErrors
  onModeChange: (mode: EntryMode) => void
  onSubmit: (mode: EntryMode, values: Record<string, string>) => void
  onGoogle: () => void
}

/** Board 03: distinct student sign-in, enrollment and teacher views behind one three-way switch. */
export function EntryView({ mode, busy, fieldErrors, onModeChange, onSubmit, onGoogle }: Props) {
  return <div className="classroom-entry">
    <SegmentedControl<EntryMode>
      label="Sign in as"
      fullWidth
      value={mode}
      onChange={onModeChange}
      options={[
        { value: 'login', label: ENTRY_MODE_LABELS.login, icon: <GraduationCap size={16} />, disabled: busy },
        { value: 'register', label: ENTRY_MODE_LABELS.register, icon: <UserRoundPlus size={16} />, disabled: busy },
        { value: 'teacher-login', label: ENTRY_MODE_LABELS['teacher-login'], icon: <UserRound size={16} />, disabled: busy },
      ]}
    />
    {mode === 'login' && <StudentSignInForm key="login" busy={busy} fieldErrors={fieldErrors} onSubmit={values => onSubmit('login', values)} onJoin={() => onModeChange('register')} />}
    {mode === 'register' && <EnrollForm key="register" busy={busy} fieldErrors={fieldErrors} onSubmit={values => onSubmit('register', values)} onSignIn={() => onModeChange('login')} />}
    {mode === 'teacher-login' && <TeacherSignInForm key="teacher" busy={busy} onSubmit={values => onSubmit('teacher-login', values)} onGoogle={onGoogle} />}
    <p className="classroom-preserved" role="note"><BrickMark size={22} title={null} /><span>Your current build stays here while you sign in.</span></p>
  </div>
}

/** Sheet footer for the entry views: the guest exit is always here; student modes also submit from here. */
export function EntryFooter({ mode, busy, onKeepBuilding }: { mode: EntryMode; busy: boolean; onKeepBuilding: () => void }) {
  return <>
    <Button variant="quiet" className="classroom-footer-link" disabled={busy} onClick={onKeepBuilding}>Keep building as a guest</Button>
    {mode === 'login' && <Button type="submit" form={ENTRY_FORM_ID} variant="primary" loading={busy} loadingLabel="Signing in…">Sign in</Button>}
    {mode === 'register' && <Button type="submit" form={ENTRY_FORM_ID} variant="primary" loading={busy} loadingLabel="Creating your account…">Create account and join</Button>}
  </>
}

type StudentProps = { busy: boolean; fieldErrors: EntryFieldErrors; onSubmit: (values: Record<string, string>) => void }

// Username and password rules are checked in ClassroomPanel (validateUsername / validatePassword) and shown as a
// sentence on the field, so the inputs carry no pattern/minLength that would make the browser bubble win first.

function StudentSignInForm({ busy, fieldErrors, onSubmit, onJoin }: StudentProps & { onJoin: () => void }) {
  return <form id={ENTRY_FORM_ID} className="classroom-form" onSubmit={event => onSubmit(readForm(event))}>
    <TextInput label="Class sign-in code" name="classCode" hint="The returning sign-in code for your class." icon={<KeyRound size={18} />} autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={32} />
    <TextInput label="Username" name="username" error={fieldErrors.username} icon={<UserRound size={18} />} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={24} />
    <PasswordField name="password" label="Password" error={fieldErrors.password} maxLength={128} autoComplete="current-password" required />
    <p className="classroom-help classroom-help-center">Forgot your details? Ask your teacher.</p>
    <div className="classroom-links">
      <Button variant="quiet" size="sm" disabled={busy} onClick={onJoin}>New here? Join a class</Button>
    </div>
  </form>
}

function EnrollForm({ busy, fieldErrors, onSubmit, onSignIn }: StudentProps & { onSignIn: () => void }) {
  return <form id={ENTRY_FORM_ID} className="classroom-form" onSubmit={event => onSubmit(readForm(event))}>
    <TextInput label="Enrollment code" name="classCode" hint="The code your teacher gives new students." icon={<KeyRound size={18} />} autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={32} />
    <TextInput label="Choose a username" name="username" hint={`${USERNAME_RULE} Classmates see this name.`} error={fieldErrors.username} icon={<UserRound size={18} />} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={24} />
    <TextInput label="Name your teacher knows" name="rosterName" hint="Shown to your teacher only." autoComplete="off" required maxLength={80} />
    <PasswordField name="password" label="Choose a password" hint={`${PASSWORD_RULE} Remember it for next time.`} error={fieldErrors.password} maxLength={128} autoComplete="new-password" required />
    <div className="classroom-links">
      <Button variant="quiet" size="sm" disabled={busy} onClick={onSignIn}>Already have an account? Sign in</Button>
    </div>
  </form>
}

function TeacherSignInForm({ busy, onSubmit, onGoogle }: { busy: boolean; onSubmit: (values: Record<string, string>) => void; onGoogle: () => void }) {
  const [passwordOpen, setPasswordOpen] = useState(false)
  return <div className="classroom-teacher-entry">
    <Button variant="primary" fullWidth loading={busy} loadingLabel="Opening Google…" onClick={onGoogle}>Continue with Google</Button>
    <p className="classroom-help classroom-help-center">Use your existing teacher account. Teacher access is set up by the school, not created here.</p>
    <div className="classroom-or" aria-hidden="true"><span>or</span></div>
    <Button variant="secondary" fullWidth icon={<Mail size={18} />} trailingIcon={passwordOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />} disabled={busy} aria-expanded={passwordOpen} aria-controls="classroom-teacher-password" onClick={() => setPasswordOpen(open => !open)}>Use email and password</Button>
    {passwordOpen && <form id="classroom-teacher-password" className="classroom-form" onSubmit={event => onSubmit(readForm(event))}>
      <TextInput label="Email" name="email" type="email" autoComplete="username" required />
      <PasswordField name="password" label="Password" maxLength={128} autoComplete="current-password" required />
      <Button type="submit" variant="primary" fullWidth loading={busy} loadingLabel="Signing in…">Sign in</Button>
    </form>}
  </div>
}
