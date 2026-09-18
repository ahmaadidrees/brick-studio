import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronDown, ChevronUp, KeyRound, Mail, UserRound, X } from 'lucide-react'
import { BrandLockup } from '../../brand'
import { Button } from '../../ui'
import { browserClassroomClient, ClassroomError, type ClassroomClient } from '../../classroom/client'
import type { ClassroomAuthResult, ClassroomRosterStudent } from '../../classroom/contracts'
import { PasswordField } from '../../classroom/PasswordField'
import { TextInput } from '../../classroom/fields'
import { errorMessage } from '../../classroom/panelShared'
import { PasswordResetView, RESET_FORM_ID } from '../../classroom/RecoveryViews'
import { forgetClass, readRememberedClass, rememberClass } from '../../classroom/rememberedClass'
import '../../classroom/classroom.css'
import { allGreen, passwordRules, usernameRules, type RuleResult } from './joinRules'
import { joinDestination, parseJoinQuery, type JoinMode } from './joinQuery'
import './join.css'

/** Stable id so a tapped roster name can move focus straight to the password. */
const PASSWORD_ID = 'join-password'

type ClassInfo = { code: string; name: string; canEnroll: boolean; showNames: boolean; students: ClassroomRosterStudent[] }

const HEADLINES: Record<JoinMode, { title: string; lead: string }> = {
  join: { title: 'Join your class', lead: 'Start with the code your teacher gave you.' },
  signin: { title: 'Welcome back', lead: 'Sign in to open your worlds.' },
  teacher: { title: 'Teacher sign in', lead: 'Open your class and your students’ worlds.' },
}

/** Server rejections a student can act on, in their words. Anything else keeps the server sentence. */
function describeError(error: unknown) {
  if (!(error instanceof ClassroomError)) return errorMessage(error)
  switch (error.code) {
    case 'enrollment_closed': return 'This class is not taking new accounts right now. Ask your teacher to open joining, or sign in if you already have an account.'
    case 'class_not_found': return 'We could not find a class with that code. Check it with your teacher — codes look like ROOM-42.'
    case 'invalid_credentials': return 'That username and password do not go together. Check the spelling, or ask your teacher for a new password.'
    case 'username_taken': return 'Someone already has that username. Pick one below, or try another.'
    case 'class_code_required': return 'Two accounts use that username. Type your class code so we know which one is yours.'
    case 'suspended': return 'Your account is paused. Ask your teacher to turn it back on.'
    default: return errorMessage(error)
  }
}

export type JoinExperienceProps = {
  client?: ClassroomClient
  /** Defaults to the real query string; tests pass their own. */
  search?: string
  /** Same-origin path or an external sign-in URL; defaults to a real navigation. */
  onNavigate?: (url: string) => void
}

/** `/join` — account entry as a full page: join a class, sign in, or the teacher entrance. */
export default function JoinPage(props: JoinExperienceProps = {}) {
  return <JoinExperience {...props} />
}

export function JoinExperience({
  client = browserClassroomClient,
  search = typeof window === 'undefined' ? '' : window.location.search,
  onNavigate = url => { window.location.assign(url) },
}: JoinExperienceProps) {
  const query = useMemo(() => parseJoinQuery(search), [search])
  const auth = useSyncExternalStore(client.subscribe, client.getSession)
  const [remembered, setRemembered] = useState(readRememberedClass)
  const [mode, setMode] = useState<JoinMode>(query.mode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [requireClassCode, setRequireClassCode] = useState(false)
  const [codeOpen, setCodeOpen] = useState(Boolean(query.classCode))
  const [teacherPasswordOpen, setTeacherPasswordOpen] = useState(false)
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null)
  const [classError, setClassError] = useState('')
  const [pickedName, setPickedName] = useState('')
  const [classCode, setClassCode] = useState(query.classCode || (mode === 'teacher' ? '' : remembered?.code ?? ''))
  const [username, setUsername] = useState('')
  const [rosterName, setRosterName] = useState('')
  const [password, setPassword] = useState('')
  const lookup = useRef(0)
  const redirected = useRef(false)
  const focusCode = useRef(false)
  const codeInput = useRef<HTMLInputElement>(null)

  const trimmedCode = classCode.trim().toUpperCase()
  const matched = classInfo?.code === trimmedCode ? classInfo : null
  const rememberedActive = Boolean(remembered && trimmedCode === remembered.code && !query.classCode)

  // A signed-in account never sits on this page: it goes where the link asked,
  // or to its own home. A forced password change is the one thing that happens here.
  useEffect(() => {
    if (!auth || auth.user.resetRequired || redirected.current) return
    redirected.current = true
    rememberClass(auth)
    onNavigate(joinDestination(auth.user.role, query.next))
  }, [auth, onNavigate, query.next])

  // Class lookup: the same public roster call answers both modes. The join form
  // needs the class name and whether it can enroll; sign-in also gets the names.
  const lookupClass = useCallback((code: string) => client.classRoster(code), [client])
  useEffect(() => {
    const sequence = ++lookup.current
    setClassError('')
    if (!trimmedCode || mode === 'teacher') { setClassInfo(null); return }
    const timer = window.setTimeout(() => {
      void lookupClass(trimmedCode).then(roster => {
        if (lookup.current !== sequence) return
        setClassInfo({ code: trimmedCode, name: roster.name, canEnroll: roster.canEnroll, showNames: roster.showNames, students: roster.students ?? [] })
      }).catch((failure: unknown) => {
        if (lookup.current !== sequence) return
        setClassInfo(null)
        // A wrong code is the student's to fix; a service outage must not read as one.
        setClassError(failure instanceof ClassroomError && failure.status !== 404
          ? 'The class list could not load right now. You can still sign in.'
          : 'Check the class code with your teacher.')
      })
    }, 400)
    return () => { window.clearTimeout(timer); lookup.current++ }
  }, [trimmedCode, mode, lookupClass])

  useEffect(() => { if (focusCode.current && codeInput.current) { codeInput.current.focus(); focusCode.current = false } }, [codeOpen, requireClassCode])

  const changeMode = (next: JoinMode) => {
    setMode(next); setError(''); setSuggestions([]); setRequireClassCode(false); setPassword(''); setPickedName('')
    // A remembered return code is not an invitation to enroll: a new student types their teacher's code.
    if (next === 'join' && !query.classCode && rememberedActive) setClassCode('')
    if (next === 'signin' && !classCode && remembered) setClassCode(remembered.code)
    try { window.history.replaceState(null, '', `/join?${new URLSearchParams({ mode: next, ...(query.classCode ? { classCode: query.classCode } : {}), ...(query.next ? { next: query.next } : {}) })}`) } catch { /* History is unavailable in some embeds; the page still works. */ }
  }

  const run = (work: () => Promise<void>) => {
    setBusy(true); setError('')
    void work().catch(failure => {
      if (failure instanceof ClassroomError && failure.code === 'username_taken') {
        setSuggestions(Array.isArray(failure.details.suggestions) ? failure.details.suggestions.filter((name): name is string => typeof name === 'string') : [])
      }
      if (failure instanceof ClassroomError && failure.code === 'class_code_required') { setRequireClassCode(true); focusCode.current = true; setCodeOpen(true) }
      setError(describeError(failure))
    }).finally(() => setBusy(false))
  }

  const finish = (next: ClassroomAuthResult) => { rememberClass(next); setRemembered(readRememberedClass()) }

  const usernameChecks = usernameRules(username)
  const passwordChecks = passwordRules(password, username)
  const joinReady = Boolean(trimmedCode) && Boolean(rosterName.trim()) && allGreen(usernameChecks) && allGreen(passwordChecks)

  const submitJoin = () => run(async () => {
    setSuggestions([])
    const next = await client.authenticate('register', { classCode: trimmedCode, username: username.trim(), rosterName: rosterName.trim(), password })
    finish(next)
  })
  const submitSignIn = () => run(async () => {
    const next = await client.login({ username: username.trim(), password, ...(codeVisible && trimmedCode ? { classCode: trimmedCode } : {}) })
    setRequireClassCode(false); finish(next)
  })
  const submitTeacher = (email: string, teacherPassword: string) => run(async () => {
    finish(await client.authenticate('teacher-login', { email, password: teacherPassword }))
  })
  const startGoogle = () => run(async () => {
    const url = await client.startGoogleTeacher(`/join?${new URLSearchParams({ mode: 'teacher', ...(query.next ? { next: query.next } : {}) })}`)
    onNavigate(url)
  })
  const changePassword = (nextPassword: string, confirm: string) => run(async () => {
    if (nextPassword !== confirm) throw new Error('The two passwords are different. Type the same one twice.')
    await client.changePassword(nextPassword)
  })

  const pickStudent = (student: ClassroomRosterStudent) => {
    setUsername(student.username); setPickedName(student.displayName)
    document.getElementById(PASSWORD_ID)?.focus()
  }
  const changeClass = () => {
    forgetClass(); setRemembered(null); setClassCode(''); setClassInfo(null); setPickedName(''); setUsername('')
    focusCode.current = true; setCodeOpen(true)
  }

  // Sign-in needs no class code; the field opens from the link, the button, a
  // remembered class or an ambiguous username.
  const codeVisible = mode === 'join' || codeOpen || requireClassCode || (mode === 'signin' && rememberedActive && !matched)
  const roster = mode === 'signin' && matched?.showNames && matched.students.length ? matched.students : null
  const reset = Boolean(auth?.user.resetRequired)

  const cornerLink = reset ? null
    : mode === 'join' ? <Button variant="quiet" size="sm" disabled={busy} onClick={() => changeMode('signin')}>I already have an account</Button>
    : mode === 'teacher' ? <Button variant="quiet" size="sm" disabled={busy} onClick={() => changeMode('signin')}>Sign in with username instead</Button>
    : <Button variant="quiet" size="sm" disabled={busy} onClick={() => changeMode('join')}>New here? Join with a class code</Button>

  const headline = reset ? { title: 'Choose a new password', lead: 'Your teacher reset your password. Pick one you will remember.' } : HEADLINES[mode]

  return <div className="join-page">
    <header className="join-header">
      <BrandLockup href="/" size={30} srSuffix="Home" />
      <div className="join-header-aside">{cornerLink}</div>
    </header>
    <main className="join-main">
      <div className={['join-card', roster ? 'join-card-wide' : ''].filter(Boolean).join(' ')}>
        <div className="join-headline">
          <h1>{headline.title}</h1>
          <p>{headline.lead}</p>
        </div>
        {error && <p className="join-alert" role="alert">{error}</p>}

        {reset
          ? <>
            <PasswordResetView onSubmit={changePassword} />
            <Button type="submit" form={RESET_FORM_ID} variant="primary" fullWidth className="join-submit" loading={busy} loadingLabel="Saving your password…">Set my new password</Button>
            <div className="join-links"><Button variant="quiet" size="sm" disabled={busy} onClick={() => run(() => client.signOut())}>Sign out</Button></div>
          </>
          : mode === 'teacher'
            ? <TeacherEntry busy={busy} open={teacherPasswordOpen} onToggle={() => setTeacherPasswordOpen(value => !value)} onGoogle={startGoogle} onSubmit={submitTeacher} />
            : <form className="join-form" onSubmit={event => { event.preventDefault(); if (mode === 'join') submitJoin(); else submitSignIn() }}>
              {mode === 'signin' && !codeVisible && <div className="join-links join-links-start">
                <Button variant="quiet" size="sm" icon={<KeyRound size={16} />} disabled={busy} onClick={() => { focusCode.current = true; setCodeOpen(true) }}>I have a class code</Button>
              </div>}

              {codeVisible && <TextInput
                ref={codeInput}
                label="Class code"
                name="classCode"
                value={classCode}
                onChange={event => { setClassCode(event.target.value); setPickedName('') }}
                hint={requireClassCode
                  ? 'Two accounts use this username. Your class code picks yours.'
                  : mode === 'join' ? 'Your teacher’s code, like ROOM-42.' : 'Optional. Your teacher’s code shows your class list.'}
                error={classError || undefined}
                icon={<KeyRound size={18} />}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required={mode === 'join'}
                maxLength={32}
              />}

              {matched && <div className="join-class" aria-live="polite">
                <span className="join-class-chip">{matched.name}</span>
                {rememberedActive
                  ? <Button variant="quiet" size="sm" disabled={busy} onClick={changeClass}>Not you? Change class</Button>
                  : <Button variant="quiet" size="sm" disabled={busy} onClick={() => { focusCode.current = true; setCodeOpen(true); codeInput.current?.focus() }}>Change class code</Button>}
                {mode === 'join' && !matched.canEnroll && <p className="join-note">This class is not taking new accounts. If you already have one, sign in instead.</p>}
              </div>}

              {roster && <div className="join-roster">
                <p className="join-roster-lead" id="join-roster-label">Tap your name, then type your password.</p>
                <ul className="join-name-grid" aria-labelledby="join-roster-label">
                  {roster.map(student => <li key={student.username}>
                    <button type="button" className="join-name-tile" disabled={busy} aria-pressed={username === student.username} onClick={() => pickStudent(student)}>
                      <span className="join-name-tile-name">{student.displayName}</span>
                      <span className="join-name-tile-username">{student.username}</span>
                    </button>
                  </li>)}
                </ul>
              </div>}

              <TextInput
                label={mode === 'join' ? 'Choose a username' : 'Username'}
                name="username"
                value={username}
                onChange={event => { setUsername(event.target.value); setPickedName('') }}
                hint={mode === 'join' ? 'Classmates see this name.' : undefined}
                icon={<UserRound size={18} />}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={24}
              />
              {mode === 'join' && <RuleList id="join-username-rules" label="Username rules" rules={usernameChecks} />}
              {mode === 'join' && suggestions.length > 0 && <div className="join-suggestions" role="group" aria-label="Usernames that are free">
                <span className="join-note">Free right now:</span>
                {suggestions.map(name => <button key={name} type="button" className="join-chip" aria-pressed={username === name} onClick={() => setUsername(name)}>{name}</button>)}
              </div>}

              {mode === 'join' && <TextInput label="Name your teacher knows" name="rosterName" value={rosterName} onChange={event => setRosterName(event.target.value)} hint="Shown to your teacher only." autoComplete="off" required maxLength={80} />}

              <PasswordField
                id={PASSWORD_ID}
                name="password"
                label={pickedName ? `${pickedName}, type your password` : mode === 'join' ? 'Choose a password' : 'Password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete={mode === 'join' ? 'new-password' : 'current-password'}
                required
                maxLength={128}
              />
              {mode === 'join' && <RuleList id="join-password-rules" label="Password rules" rules={passwordChecks} />}

              <Button type="submit" variant="primary" fullWidth className="join-submit" disabled={mode === 'join' && !joinReady} loading={busy} loadingLabel={mode === 'join' ? 'Creating your account…' : 'Signing you in…'}>
                {mode === 'join' ? 'Create account and join' : 'Sign in'}
              </Button>
              {mode === 'signin' && <p className="join-note join-note-center">Forgot it? Ask your teacher.</p>}
            </form>}

        {!reset && <div className="join-links join-links-footer">
          {mode !== 'teacher' && <Button variant="quiet" size="sm" disabled={busy} onClick={() => changeMode('teacher')}>I’m a teacher</Button>}
          <Button variant="quiet" size="sm" href="/build">Keep building as a guest</Button>
        </div>}
      </div>
    </main>
  </div>
}

/** One line per rule; green when it passes, red once it is broken, grey before anything is typed. */
function RuleList({ id, label, rules }: { id: string; label: string; rules: RuleResult[] }) {
  return <ul className="join-rules" id={id} aria-label={label} aria-live="polite">
    {rules.map(rule => <li key={rule.id} className={`join-rule join-rule-${rule.state}`}>
      {rule.state === 'bad' ? <X size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
      <span>{rule.label}</span>
      {rule.state !== 'pending' && <span className="sr-only">{rule.state === 'ok' ? ' — done' : ' — not yet'}</span>}
    </li>)}
  </ul>
}

function TeacherEntry({ busy, open, onToggle, onGoogle, onSubmit }: { busy: boolean; open: boolean; onToggle: () => void; onGoogle: () => void; onSubmit: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return <div className="join-teacher">
    <Button variant="primary" fullWidth className="join-submit" loading={busy} loadingLabel="Opening Google…" onClick={onGoogle}>Continue with Google</Button>
    <p className="join-note join-note-center">Use your school account. Teacher access is set up by the school, not created here.</p>
    <div className="join-or" aria-hidden="true"><span>or</span></div>
    <Button variant="secondary" fullWidth icon={<Mail size={18} />} trailingIcon={open ? <ChevronUp size={18} /> : <ChevronDown size={18} />} disabled={busy} aria-expanded={open} aria-controls="join-teacher-password" onClick={onToggle}>Use email and password</Button>
    {open && <form id="join-teacher-password" className="join-form" onSubmit={event => { event.preventDefault(); onSubmit(email, password) }}>
      <TextInput label="Email" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required />
      <PasswordField label="Password" name="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={128} />
      <Button type="submit" variant="primary" fullWidth className="join-submit" loading={busy} loadingLabel="Signing you in…">Sign in</Button>
    </form>}
  </div>
}
