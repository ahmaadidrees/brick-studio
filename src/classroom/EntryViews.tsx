import { forgetClass, readRememberedClass } from './rememberedClass'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, GraduationCap, KeyRound, Mail, UserRound, UserRoundPlus } from 'lucide-react'
import { BrickMark } from '../brand'
import { Button, SegmentedControl } from '../ui'
import { ClassroomError } from './client'
import type { ClassroomRoster, ClassroomRosterStudent } from './contracts'
import { PasswordField } from './PasswordField'
import { TextInput } from './fields'
import { PASSWORD_RULE, USERNAME_RULE, readForm } from './panelShared'

export type EntryMode = 'login' | 'register' | 'teacher-login'
/** Client-side rule failures shown on the field itself; server rejections stay in the panel alert. */
export type EntryFieldErrors = Partial<Record<'username' | 'password', string>>

/** The student/enrollment form; the sheet footer submits it through `form=`. */
export const ENTRY_FORM_ID = 'classroom-entry-form'
/** Stable id so a tapped roster name can move focus straight to the password. */
export const ENTRY_PASSWORD_ID = 'classroom-entry-password'

export const ENTRY_MODE_LABELS: Record<EntryMode, string> = { login: 'Sign in', register: 'Create account', 'teacher-login': 'Teacher' }
export const ENTRY_HEADLINES: Record<EntryMode, { title: string; lead: string }> = {
  login: { title: 'Student login', lead: 'Sign in to open your saved worlds.' },
  register: { title: 'Join your class', lead: 'Create an account with your teacher’s code.' },
  'teacher-login': { title: 'Teacher sign in', lead: 'Access your classroom and student worlds.' },
}

type ClassInfo = { code: string; name: string; canEnroll: boolean; showNames?: boolean; students?: ClassroomRosterStudent[] }

type Props = {
  mode: EntryMode
  busy: boolean
  fieldErrors: EntryFieldErrors
  /** Class code from an invite link; wins over the remembered class and survives the join/sign-in switch. */
  invitedClassCode?: string
  /** Free usernames offered by the server after a `username_taken` rejection; shown as chips on the enrollment form. */
  usernameSuggestions?: string[]
  /** Set after a `class_code_required` rejection: two accounts share the username, so sign-in needs the code. */
  requireClassCode?: boolean
  onModeChange: (mode: EntryMode) => void
  onSubmit: (mode: EntryMode, values: Record<string, string>) => void
  onGoogle: () => void
  /** Enrollment lookup: class name and whether the code can enroll. */
  onResolveClass?: (code: string) => Promise<{ name: string; canEnroll: boolean }>
  /** Sign-in lookup: the same plus the tap-your-name roster when the teacher shows names. */
  onResolveRoster?: (code: string) => Promise<ClassroomRoster>
}

/** Board 03: student sign-in/create-account switch with a separate teacher entrance. */
export function EntryView({ mode, busy, fieldErrors, invitedClassCode, usernameSuggestions = [], requireClassCode = false, onModeChange, onSubmit, onGoogle, onResolveClass, onResolveRoster }: Props) {
  const [remembered] = useState(readRememberedClass)
  const invitedCode = invitedClassCode?.slice(0, 40) || ''
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null)
  const [editingCode, setEditingCode] = useState(false)
  const [classError, setClassError] = useState('')
  const lookup = useRef(0)
  const [draft, setDraft] = useState({ classCode: invitedCode || (mode === 'login' ? remembered?.code || '' : ''), username: '', password: '', rosterName: '' })
  const [changeClass, setChangeClass] = useState(false)
  /** Sign-in needs no code; the field opens from "I have a class code", an invite, a remembered class or an ambiguous username. */
  const [codeOpen, setCodeOpen] = useState(Boolean(invitedCode))
  const codeInput = useRef<HTMLInputElement>(null)
  const update = (name: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [name]: value }))
  const chooseMode = (next: EntryMode) => {
    // A remembered return code is not an enrollment invitation. Preserve typed
    // codes, but ask a new student for their teacher's enrollment code.
    if (next === 'register' && !invitedCode && !matched?.canEnroll && !changeClass && draft.classCode === remembered?.code) update('classCode', '')
    if (next === 'login' && !changeClass && !draft.classCode && remembered) update('classCode', remembered.code)
    onModeChange(next)
  }
  const resolve = mode === 'login' ? onResolveRoster ?? onResolveClass : onResolveClass
  useEffect(() => {
    const code = draft.classCode.trim().toUpperCase()
    const sequence = ++lookup.current
    setClassError('')
    if (!resolve || !code || mode === 'teacher-login') { setClassInfo(null); return }
    const timer = window.setTimeout(() => {
      void resolve(code).then(info => {
        if (lookup.current === sequence) { setClassInfo({ ...info, code }); setEditingCode(false) }
      }).catch((error: unknown) => {
        if (lookup.current !== sequence) return
        setClassInfo(null)
        // A wrong code is the student's to fix; anything else must not read as a wrong code.
        setClassError(error instanceof ClassroomError && error.status !== 404 ? 'The class list could not load right now. You can still sign in.' : 'Check the class code with your teacher.')
      })
    }, 500)
    return () => { window.clearTimeout(timer); lookup.current++ }
  }, [draft.classCode, mode, resolve])
  const matched = classInfo?.code === draft.classCode.trim().toUpperCase() ? classInfo : null
  const rememberedActive = Boolean(!changeClass && mode === 'login' && remembered && draft.classCode === remembered.code)
  const codeVisible = mode === 'register' || rememberedActive || codeOpen || requireClassCode || draft.classCode.trim() !== ''
  const focusCode = useRef(false)
  const openCode = () => { focusCode.current = true; setCodeOpen(true) }
  useEffect(() => { if (focusCode.current && codeInput.current) { codeInput.current.focus(); focusCode.current = false } }, [codeOpen])
  const forgetRemembered = () => { forgetClass(); setChangeClass(true); setCodeOpen(true); update('classCode', '') }
  const pickName = (student: ClassroomRosterStudent) => {
    update('username', student.username)
    document.getElementById(ENTRY_PASSWORD_ID)?.focus()
  }
  const shared = { busy, fieldErrors, draft, update }
  const roster = mode === 'login' && matched?.showNames && matched.students?.length ? matched.students : null

  return <div className="classroom-entry">
    {mode !== 'teacher-login' && codeVisible && <div hidden={Boolean(matched) && !editingCode}>
      {rememberedActive
        ? <div className="classroom-remembered-class"><input form={ENTRY_FORM_ID} type="hidden" name="classCode" value={draft.classCode} /><p>Class: <strong>{remembered!.name}</strong></p><Button variant="quiet" size="sm" disabled={busy} onClick={forgetRemembered}>Change class</Button></div>
        : <TextInput ref={codeInput} form={ENTRY_FORM_ID} label="Class code" name="classCode" value={draft.classCode} onChange={event => update('classCode', event.target.value)} hint={mode === 'login' && requireClassCode ? 'Two accounts use this username. Your class code picks yours.' : mode === 'login' ? 'Optional. Your teacher’s code shows your class list.' : 'Use your teacher’s code for sign-in or a new account.'} icon={<KeyRound size={18} />} autoComplete="off" autoCapitalize="characters" spellCheck={false} required={mode === 'register'} maxLength={32} />}
    </div>}
    {mode !== 'teacher-login' && (matched || classError) && <div className="classroom-code-context" aria-live="polite">
      {matched ? <>
        <strong>{matched.name}</strong>
        {rememberedActive
          ? <Button variant="quiet" size="sm" disabled={busy} onClick={forgetRemembered}>Change class</Button>
          : <Button variant="quiet" size="sm" onClick={() => setEditingCode(true)}>Change class code</Button>}
        {mode === 'register'
          ? <p>{matched.canEnroll ? 'Sign in or create your account in this class.' : 'Existing students can sign in. Ask your teacher for an invite if you are new.'}</p>
          : roster
            ? <p>Tap your name, then type your password.</p>
            : <p>Type your username and password to sign in.</p>}
      </> : <p>Start with your teacher’s class code. Next time, we’ll remember your class.</p>}
      {classError && <p className="classroom-help">{classError}</p>}
      {roster && <ul className="classroom-name-grid" aria-label="Tap your name">
        {roster.map(student => <li key={student.username}>
          <button type="button" className="classroom-name-tile" disabled={busy} aria-pressed={draft.username === student.username} onClick={() => pickName(student)}>
            <span className="classroom-name-tile-name">{student.displayName}</span>
            <span className="classroom-name-tile-username">{student.username}</span>
          </button>
        </li>)}
      </ul>}
    </div>}
    {mode !== 'teacher-login' && <SegmentedControl<'login' | 'register'>
      label="Student account"
      fullWidth
      value={mode}
      onChange={chooseMode}
      options={[
        { value: 'login', label: ENTRY_MODE_LABELS.login, icon: <GraduationCap size={16} />, disabled: busy },
        { value: 'register', label: ENTRY_MODE_LABELS.register, icon: <UserRoundPlus size={16} />, disabled: busy },
      ]}
    />}
    {mode === 'login' && <StudentSignInForm {...shared} onSubmit={values => onSubmit('login', values)} />}
    {mode === 'login' && !codeVisible && <div className="classroom-links classroom-code-link"><Button variant="quiet" size="sm" icon={<KeyRound size={16} />} disabled={busy} onClick={openCode}>I have a class code</Button></div>}
    {mode === 'register' && <EnrollForm {...shared} suggestions={usernameSuggestions} onSubmit={values => onSubmit('register', values)} />}
    {mode === 'teacher-login' && <TeacherSignInForm key="teacher" busy={busy} onSubmit={values => onSubmit('teacher-login', values)} onGoogle={onGoogle} />}
    <div className="classroom-links"><Button variant="quiet" size="sm" disabled={busy} onClick={() => chooseMode(mode === 'teacher-login' ? 'login' : 'teacher-login')}>{mode === 'teacher-login' ? 'Student login' : 'Teacher sign in'}</Button></div>
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

type StudentProps = { busy: boolean; fieldErrors: EntryFieldErrors; onSubmit: (values: Record<string, string>) => void; draft: { classCode: string; username: string; password: string; rosterName: string }; update: (name: 'classCode' | 'username' | 'password' | 'rosterName', value: string) => void }

// Username and password rules are checked in ClassroomPanel (validateUsername / validatePassword) and shown as a
// sentence on the field, so the inputs carry no pattern/minLength that would make the browser bubble win first.

function StudentSignInForm({ fieldErrors, onSubmit, draft, update }: StudentProps) {
  return <form id={ENTRY_FORM_ID} className="classroom-form" onSubmit={event => onSubmit(readForm(event))}>

    <TextInput label="Username" name="username" value={draft.username} onChange={event => update('username', event.target.value)} error={fieldErrors.username} icon={<UserRound size={18} />} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={24} />
    <PasswordField id={ENTRY_PASSWORD_ID} name="password" value={draft.password} onChange={event => update('password', event.target.value)} label="Password" error={fieldErrors.password} maxLength={128} autoComplete="current-password" required />
    <p className="classroom-help classroom-help-center">Forgot your details? Ask your teacher.</p>
  </form>
}

function EnrollForm({ fieldErrors, onSubmit, draft, update, suggestions }: StudentProps & { suggestions: string[] }) {
  return <form id={ENTRY_FORM_ID} className="classroom-form" onSubmit={event => onSubmit(readForm(event))}>

    <TextInput label="Choose a username" name="username" value={draft.username} onChange={event => update('username', event.target.value)} hint={`${USERNAME_RULE} Classmates see this name.`} error={fieldErrors.username} icon={<UserRound size={18} />} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={24} />
    {suggestions.length > 0 && <div className="classroom-suggestions" role="group" aria-label="Available usernames">
      <span className="classroom-help">Available:</span>
      {suggestions.map(name => <button key={name} type="button" className="classroom-chip classroom-chip-button" aria-pressed={draft.username === name} onClick={() => update('username', name)}>{name}</button>)}
    </div>}
    <TextInput label="Name your teacher knows" name="rosterName" value={draft.rosterName} onChange={event => update('rosterName', event.target.value)} hint="Shown to your teacher only." autoComplete="off" required maxLength={80} />
    <PasswordField name="password" value={draft.password} onChange={event => update('password', event.target.value)} label="Choose a password" hint={`${PASSWORD_RULE} Remember it for next time.`} error={fieldErrors.password} maxLength={128} autoComplete="new-password" required />
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
