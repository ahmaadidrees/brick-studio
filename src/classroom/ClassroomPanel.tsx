import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Blocks, Users, X } from 'lucide-react'
import type { BrickStudioDocument } from '../brick/brickDocument'
import { browserClassroomClient, type ClassroomClient } from './client'
import type { ClassroomAuthResult, ClassroomClass, ClassroomStudent, ClassroomWorld, ClassroomWorldMember, ClassroomCheckpoint } from './contracts'
import { saveLocalBrickStudioProject } from '../brick/documentPersistence'
import { PasswordField } from './PasswordField'
import './classroom.css'

type Props = {
  intent: 'save' | 'worlds' | 'class'
  getDocument: () => BrickStudioDocument
  onOpenWorld: (document: BrickStudioDocument, world: ClassroomWorld) => void | Promise<void>
  onJoinWorld: (world: ClassroomWorld) => void | Promise<void>
  onClose: () => void
  onSessionChange?: (session: ClassroomAuthResult | null) => void
  onSaved?: (world: ClassroomWorld) => void
  beforeWorldMutation?: () => Promise<boolean>
  onWorldUpdated?: (world: ClassroomWorld) => void
  client?: ClassroomClient
}
export function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), value => alphabet[value % alphabet.length]).join('')
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
}

export function ClassroomPanel({ intent, getDocument, onOpenWorld, onJoinWorld, onClose, onSessionChange, onSaved, beforeWorldMutation, onWorldUpdated, client = browserClassroomClient }: Props) {
  const auth = useSyncExternalStore(client.subscribe, client.getSession)
  const [tab, setTab] = useState(intent === 'class' ? 'class' : 'worlds')
  const [classSection, setClassSection] = useState<'students' | 'worlds' | 'settings'>('students')
  const [loginMode, setLoginMode] = useState<'login' | 'register' | 'teacher-login'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(Boolean(auth && !auth.user.resetRequired))
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [worlds, setWorlds] = useState<ClassroomWorld[]>([])
  const [classes, setClasses] = useState<ClassroomClass[]>([])
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<ClassroomStudent[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedWorld, setSelectedWorld] = useState<ClassroomWorld | null>(null)
  const [members, setMembers] = useState<ClassroomWorldMember[]>([])
  const [checkpoints, setCheckpoints] = useState<ClassroomCheckpoint[]>([])
  const [editingStudent, setEditingStudent] = useState<ClassroomStudent | null>(null)
  const [saveTitle, setSaveTitle] = useState('My build')
  const [renameWorld, setRenameWorld] = useState<ClassroomWorld | null>(null)
  const [showSave, setShowSave] = useState(intent === 'save')
  const dialog = useRef<HTMLDivElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const currentClass = classes.find(item => item.id === classId)
  const teacher = auth?.user.role === 'teacher'
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  const reload = async () => {
    const [worldResult, classResult] = await Promise.all([
      client.request<{ worlds: ClassroomWorld[] }>('/worlds'),
      client.request<{ classes: ClassroomClass[] }>('/classes'),
    ])
    setWorlds(worldResult.worlds); setClasses(classResult.classes)
    setClassId(id => classResult.classes.some(c => c.id === id) ? id : classResult.classes[0]?.id || '')
  }
  const reloadStudents = async () => {
    const result = await client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`)
    setStudents(result.students)
  }
  const closeDetails = () => { setSelectedWorld(null); setEditingStudent(null); setRenameWorld(null) }
  useEffect(() => { onSessionChange?.(auth) }, [auth, onSessionChange])
  useEffect(() => {
    setWorlds([]); setClasses([]); setStudents([]); setSelectedWorld(null); setMembers([]); setCheckpoints([]); setEditingStudent(null); setRenameWorld(null)
    if (!auth || auth.user.resetRequired) { setLoading(false); return }
    setLoading(true)
    let cancelled = false
    Promise.all([client.request<{ worlds: ClassroomWorld[] }>('/worlds'), client.request<{ classes: ClassroomClass[] }>('/classes')]).then(([w, c]) => {
      if (cancelled) return
      setWorlds(w.worlds); setClasses(c.classes); setClassId(c.classes[0]?.id || '')
    }).catch(error => { if (!cancelled) setError(message(error)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [auth, client])
  useEffect(() => {
    setStudents([]); setStudentSearch(''); setEditingStudent(null); setSelectedWorld(null); setStudentsLoading(false)
    if (!teacher || !classId || auth?.user.resetRequired) return
    let cancelled = false
    setStudentsLoading(true)
    client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`)
      .then(result => { if (!cancelled) setStudents(result.students) })
      .catch(error => { if (!cancelled) setError(message(error)) })
      .finally(() => { if (!cancelled) setStudentsLoading(false) })
    return () => { cancelled = true }
  }, [classId, teacher, client, auth])
  useEffect(() => { detailHeading.current?.focus() }, [selectedWorld?.id, editingStudent?.id, renameWorld?.id])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')
      if (!nodes?.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [onClose])
  const inspectWorld = (world: ClassroomWorld) => run(async () => {
    const [m, c] = await Promise.all([
      client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${world.id}/members`),
      client.request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${world.id}/checkpoints`),
    ])
    setSelectedWorld(world); setMembers(m.members); setCheckpoints(c.checkpoints)
  })
  const visibleStudents = students.filter(student => `${student.rosterName} ${student.username}`.toLocaleLowerCase().includes(studentSearch.trim().toLocaleLowerCase()))
  const availableStudents = students.filter(student => !members.some(member => member.id === student.id))
  const title = !auth ? 'Save, return, build together' : auth.user.resetRequired ? 'Choose your new password' : tab === 'class' ? 'My Class' : 'My Worlds'

  return <div className="classroom-backdrop"><div className={`classroom-panel${!auth ? ' classroom-panel-entry' : ''}`} ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="classroom-title">
    <header className="classroom-header"><div><span className="classroom-eyebrow">BRICK STUDIO</span><h2 id="classroom-title">{title}</h2></div><button type="button" className="classroom-close" aria-label="Close classroom" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
    <div className="classroom-body">
      {error && <p className="classroom-error" role="alert">{error}</p>}
      {notice && <p className="classroom-notice" role="status">{notice}</p>}
      {!auth ? <>
        <p className="classroom-intro">Your current build stays here while you sign in.</p>
        <nav aria-label="Sign in options">{(['register', 'login', 'teacher-login'] as const).map(mode => <button key={mode} disabled={busy} aria-pressed={loginMode === mode} onClick={() => { setLoginMode(mode); setError('') }}>{mode === 'register' ? 'Join a class' : mode === 'login' ? 'Student sign in' : 'Teacher sign in'}</button>)}</nav>
        {loginMode === 'teacher-login' && <div className="classroom-google"><button className="classroom-primary" disabled={busy} onClick={() => void run(async () => {
          const returnTo = new URL(window.location.href)
          if (returnTo.pathname === '/') {
            const saved = saveLocalBrickStudioProject(localStorage, getDocument())
            if (!saved.ok) throw new Error(saved.error.message)
            returnTo.searchParams.set('classroom', intent)
          }
          const url = await client.startGoogleTeacher(`${returnTo.pathname}${returnTo.search}${returnTo.hash}`)
          window.location.assign(url)
        })}>Continue with Google</button><small>Use your teacher Google account, or your existing email and password below.</small></div>}
        <form key={loginMode} className="classroom-auth-form" onSubmit={event => { const data = values(event); void run(async () => { await client.authenticate(loginMode, data) }) }}>
          <div className="classroom-form-grid">
            {loginMode === 'teacher-login' ? <label>Email<input name="email" type="email" autoComplete="username" required /></label> : <>
              <div className="classroom-field"><label htmlFor="classroom-class-code">{loginMode === 'register' ? 'Enrollment code' : 'Sign-in code'}</label><input id="classroom-class-code" name="classCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={32} aria-describedby="classroom-code-help" /><small id="classroom-code-help">{loginMode === 'register' ? 'Use the code your teacher gives new students.' : 'Use your class’s returning sign-in code.'}</small></div>
              <div className="classroom-field"><label htmlFor="classroom-username">{loginMode === 'register' ? 'Choose a username' : 'Username'}</label><input id="classroom-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" title="Use letters, numbers, underscores, or hyphens" aria-describedby={loginMode === 'register' ? 'classroom-username-help' : undefined} />{loginMode === 'register' && <small id="classroom-username-help">3–24 letters or numbers; _ and - are OK.</small>}</div>
            </>}
            {loginMode === 'register' && <div className="classroom-field"><label htmlFor="classroom-roster-name">Name your teacher knows</label><input id="classroom-roster-name" name="rosterName" autoComplete="off" required maxLength={80} aria-describedby="classroom-roster-help" /><small id="classroom-roster-help">Only your teacher sees this name.</small></div>}
            <PasswordField name="password" label={loginMode === 'register' ? 'Choose a password' : 'Password'} maxLength={128} autoComplete={loginMode === 'register' ? 'new-password' : 'current-password'} required minLength={loginMode === 'register' ? 8 : undefined} hint={loginMode === 'register' ? 'At least 8 characters. Remember it for next time.' : undefined} />
          </div>
          {loginMode === 'login' && <p className="classroom-help">Forgot your username or password? Ask your teacher to reset it.</p>}
          <div className="classroom-form-footer"><button className="classroom-primary" disabled={busy}>{busy ? 'Connecting…' : loginMode === 'register' ? 'Create account and join' : 'Sign in'}</button><button type="button" className="classroom-link" onClick={onClose}>Keep building as a guest</button></div>
        </form>
      </> : auth.user.resetRequired ? <>
        <p>Your teacher reset your password. Choose a new one to open your account.</p>
        <form onSubmit={event => { const data = values(event); void run(async () => {
          if (data.password !== data.confirm) throw new Error('The passwords do not match.')
          await client.changePassword(data.password)
        }) }}>
          <div className="classroom-form-grid">
            <PasswordField label="New password" name="password" maxLength={128} autoComplete="new-password" required minLength={8} hint="Use at least 8 characters." />
            <PasswordField label="Repeat new password" name="confirm" maxLength={128} autoComplete="new-password" required minLength={8} />
          </div>
          <button className="classroom-primary" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</button>
        </form>
        <button disabled={busy} onClick={() => void run(async () => { await client.signOut() })}>Sign out</button>
      </> : <>
        <div className="classroom-account"><span>Signed in as <strong>{auth.user.username}</strong></span><button disabled={busy} onClick={() => void run(async () => { if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Your world still has unsaved changes. Close this panel to retry saving or download a recovery copy before switching accounts.'); await client.signOut(); setNotice('Signed out. Private account lists have been cleared.') })}>Sign out / switch account</button></div>
        <nav aria-label="Account sections"><button disabled={busy} aria-pressed={tab === 'worlds'} onClick={() => { setTab('worlds'); closeDetails() }}>My Worlds</button><button disabled={busy} aria-pressed={tab === 'class'} onClick={() => { setTab('class'); closeDetails() }}>My Class</button></nav>
        {loading && <p role="status">Loading your worlds and classes…</p>}
        {!loading && (renameWorld ? <form className="classroom-card" onSubmit={event => { const data = values(event); void run(async () => {
          if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Resolve the pending world save before renaming.')
          const renamed = await client.request<{ world: ClassroomWorld }>(`/worlds/${renameWorld.id}`, 'PATCH', { title: data.title })
          onWorldUpdated?.(renamed.world); setRenameWorld(null); await reload()
        }) }}>
          <h3 ref={detailHeading} tabIndex={-1}>Rename world</h3>
          <label>World name<input name="title" defaultValue={renameWorld.title} required maxLength={80} /></label>
          <div className="classroom-actions"><button className="classroom-primary" disabled={busy}>Save name</button><button type="button" disabled={busy} onClick={() => setRenameWorld(null)}>Cancel</button></div>
        </form> : editingStudent ? <form className="classroom-card" onSubmit={event => { const data = values(event); void run(async () => {
          await client.request(`/classes/${classId}/students/${editingStudent.id}`, 'PATCH', { username: data.username, rosterName: data.rosterName, ...(data.temporaryPassword ? { temporaryPassword: data.temporaryPassword } : {}) })
          await reloadStudents(); setEditingStudent(null); setNotice('Student account updated.')
        }) }}>
          <h3 ref={detailHeading} tabIndex={-1}>Manage student</h3><p className="classroom-intro">{editingStudent.rosterName}</p>
          <div className="classroom-form-grid">
            <label>Username<input name="username" defaultValue={editingStudent.username} required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" title="Use letters, numbers, underscores, or hyphens" autoCapitalize="none" spellCheck={false} /></label>
            <label>Roster name<input name="rosterName" defaultValue={editingStudent.rosterName} required maxLength={80} /></label>
          </div>
          <PasswordField label="Temporary password" name="temporaryPassword" autoComplete="new-password" minLength={8} maxLength={128} placeholder="Leave blank to keep the current password" hint="At least 8 characters. Setting one signs the student out and asks them to choose a new password." />
          <button type="button" className="classroom-generate" disabled={busy} onClick={event => {
            const input = event.currentTarget.form?.elements.namedItem('temporaryPassword')
            if (input instanceof HTMLInputElement) { input.value = generateTemporaryPassword(); input.focus() }
          }}>Generate temporary password</button>
          <div className="classroom-actions"><button className="classroom-primary" disabled={busy}>Save changes</button><button type="button" disabled={busy} onClick={() => setEditingStudent(null)}>Cancel</button></div>
          <div className="classroom-access-row"><div><strong>Classroom access</strong><small>{editingStudent.suspended ? 'This student cannot access classroom features.' : 'Suspending access keeps this student’s saved work.'}</small></div><button type="button" disabled={busy} onClick={() => void run(async () => {
            await client.request(`/classes/${classId}/students/${editingStudent.id}`, 'PATCH', { suspended: !editingStudent.suspended })
            await reloadStudents(); setEditingStudent(null)
          })}>{editingStudent.suspended ? 'Reactivate access' : 'Suspend classroom access'}</button></div>
        </form> : selectedWorld ? <section className="classroom-card">
          <button className="classroom-link" disabled={busy} onClick={() => setSelectedWorld(null)}>← Back to worlds</button>
          <h3 ref={detailHeading} tabIndex={-1}>{selectedWorld.title}</h3>
          {teacher && selectedWorld.kind === 'group' && <>
            <h4>Group members</h4>
            {members.length ? members.map(member => <div className="classroom-row" key={member.id}><span>{member.rosterName || member.username}</span><button disabled={busy} onClick={() => void run(async () => {
              const result = await client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${selectedWorld.id}/members/${member.id}`, 'DELETE'); setMembers(result.members)
            })}>Remove from group</button></div>) : <p className="classroom-help">Add students so they can find and join this world in My Class.</p>}
            {availableStudents.length > 0 ? <form className="classroom-inline" onSubmit={event => { const data = values(event); void run(async () => {
              const result = await client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${selectedWorld.id}/members`, 'POST', { userId: data.userId }); setMembers(result.members)
            }) }}><label>Add student<select name="userId" required>{availableStudents.map(student => <option key={student.id} value={student.id}>{student.rosterName} ({student.username})</option>)}</select></label><button disabled={busy}>Add to group</button></form> : <p className="classroom-help">No more students to add.</p>}
            <small>Removing a member preserves their contributions.</small>
          </>}
          <h4>Restore world</h4><p className="classroom-help">Choose an earlier save. A checkpoint of the current version is kept first.</p>
          {checkpoints.length ? <form onSubmit={event => { const data = values(event); void run(async () => {
            if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Download your recovery copy and resolve the pending save before restoring.')
            const current = await client.request<{ world: ClassroomWorld }>(`/worlds/${selectedWorld.id}`)
            const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${selectedWorld.id}/restore`, 'POST', { checkpointId: data.checkpointId, expectedRevision: current.world.revision })
            setSelectedWorld(result.world); onWorldUpdated?.(result.world); await reload(); setNotice('World restored. Open the world to see the recovered version.')
          }) }}><label>Checkpoint<select name="checkpointId">{checkpoints.map(checkpoint => <option key={checkpoint.id} value={checkpoint.id}>Revision {checkpoint.revision} · {new Date(checkpoint.createdAt).toLocaleString()}</option>)}</select></label><button disabled={busy}>Restore selected checkpoint</button></form> : <p className="classroom-help">No earlier checkpoints yet. They’ll appear as this world is saved.</p>}
        </section> : tab === 'worlds' ? <>
          <div className="classroom-section-heading"><p>Your builds, ready for next time.</p><button className="classroom-primary" aria-expanded={showSave} onClick={() => setShowSave(value => !value)}>Save this build to my account</button></div>
          {showSave && <form className="classroom-inline classroom-card" onSubmit={event => { event.preventDefault(); void run(async () => {
            const result = await client.request<{ world: ClassroomWorld }>('/worlds', 'POST', { title: saveTitle, document: getDocument(), kind: 'personal' })
            onSaved?.(result.world); await reload(); setShowSave(false); setNotice('Saved to your account.')
          }) }}><label>World name<input value={saveTitle} onChange={event => setSaveTitle(event.target.value)} required maxLength={80} /></label><button className="classroom-primary" disabled={busy}>{busy ? 'Saving…' : 'Save world'}</button></form>}
          <WorldList worlds={worlds.filter(world => world.kind === 'personal' && world.ownerId === auth.user.id)} busy={busy} emptyTitle="Your first world starts here" emptyMessage="Save your current build above. Come back to My Worlds to open it on another day or device." onOpen={world => void run(async () => {
            const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`)
            if (!result.world.document) throw new Error('This world did not include a complete build.')
            await onOpenWorld(result.world.document, result.world); onClose()
          })} onRename={setRenameWorld} onDuplicate={world => void run(async () => {
            const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`)
            await client.request('/worlds', 'POST', { title: `${world.title} copy`, document: result.world.document, kind: 'personal' }); await reload()
          })} onManage={world => void inspectWorld(world)} />
        </> : <>
          {classes.length > 0 && <label className="classroom-class-select">Class<select value={classId} disabled={busy} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {!classes.length && <div className="classroom-empty"><Users size={28} aria-hidden="true" /><h3>{teacher ? 'Start your first class' : 'No class available'}</h3><p>{teacher ? 'Create a class, then give students its enrollment code.' : 'Ask your teacher for help opening your class.'}</p></div>}
          {teacher && currentClass && <nav className="classroom-subnav" aria-label="Class sections"><button disabled={busy} aria-pressed={classSection === 'students'} onClick={() => setClassSection('students')}>Students{!studentsLoading && <span className="classroom-count">{students.length}</span>}</button><button disabled={busy} aria-pressed={classSection === 'worlds'} onClick={() => setClassSection('worlds')}>Shared worlds</button><button disabled={busy} aria-pressed={classSection === 'settings'} onClick={() => setClassSection('settings')}>Class settings</button></nav>}
          {teacher && (!currentClass || classSection === 'settings') && <>
            {currentClass && <section className="classroom-card"><h3>Class access</h3>
              <div className="classroom-codes">
                <div><small>For new students</small><h4>Enrollment code</h4><strong className="classroom-code">{currentClass.code || 'Unavailable'}</strong><small>Use “Join a class” to create an account.</small></div>
                <div><small>For existing accounts</small><h4>Returning sign-in code</h4><strong className="classroom-code">{currentClass.loginCode}</strong><small>Use “Student sign in” to return.</small></div>
              </div>
              <div className="classroom-access-row"><div><strong>New student enrollment</strong><small>{currentClass.enrollmentOpen ? 'Students with the enrollment code can create accounts.' : 'New students cannot join. Existing accounts still work.'}</small></div><button disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', { enrollmentOpen: !currentClass.enrollmentOpen }); await reload() })}>{currentClass.enrollmentOpen ? 'Close enrollment' : 'Open enrollment'}</button></div>
              <div className="classroom-access-row"><div><strong>Enrollment code</strong><small>Replace it if it has been shared outside your class. Returning sign-in stays the same.</small></div><button disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', { rotateCode: true }); await reload() })}>New enrollment code</button></div>
              <div className="classroom-access-row"><div><strong>Student collaboration</strong><small>{currentClass.collaborationOpen ? 'Students can enter their shared worlds.' : 'Shared worlds are closed to students. Their work is preserved.'}</small></div><button disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', { collaborationOpen: !currentClass.collaborationOpen }); await reload() })}>{currentClass.collaborationOpen ? 'Close collaboration' : 'Open collaboration'}</button></div>
            </section>}
            <form className="classroom-inline classroom-card" onSubmit={event => { const data = values(event); void run(async () => {
              const created = await client.request<{ class: ClassroomClass }>('/classes', 'POST', { name: data.name })
              await reload(); setClassId(created.class.id); setNewClassName(''); setClassSection('settings')
            }) }}><label>New class name<input name="name" value={newClassName} onChange={event => setNewClassName(event.target.value)} required maxLength={80} /></label><button disabled={busy}>Create class</button></form>
          </>}
          {teacher && currentClass && classSection === 'students' && <section aria-label="Class students">
            <div className="classroom-section-heading"><p>Manage usernames, passwords, and access.</p><button className="classroom-link" onClick={() => setClassSection('settings')}>View class codes</button></div>
            {studentsLoading ? <p role="status">Loading students…</p> : students.length > 0 ? <>
              <label className="classroom-search">Find a student<input type="search" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Name or username" /></label>
              <div className="classroom-roster">{visibleStudents.map(student => <div className="classroom-row" key={student.id}><span><strong>{student.rosterName}</strong><small>{student.username}</small>{(student.suspended || student.resetRequired) && <span className="classroom-student-status">{student.suspended ? 'Suspended' : 'Password change required'}</span>}</span><button disabled={busy} aria-label={`Manage ${student.rosterName}`} onClick={() => setEditingStudent(student)}>Manage</button></div>)}</div>
              {!visibleStudents.length && <p className="classroom-help">No students match that name or username.</p>}
            </> : <div className="classroom-empty"><Users size={28} aria-hidden="true" /><h3>Ready for your students</h3><p>{currentClass.enrollmentOpen ? 'Give them this enrollment code and ask them to choose “Join a class.”' : 'Open enrollment in Class settings when you’re ready for students to join.'}</p>{currentClass.enrollmentOpen && <strong className="classroom-code">{currentClass.code || 'Unavailable'}</strong>}</div>}
          </section>}
          {currentClass && (!teacher || classSection === 'worlds') && <section aria-label="Class shared worlds">
            <p className="classroom-help">{currentClass.collaborationOpen ? 'Choose a world to build with your group.' : teacher ? 'Collaboration is closed to students. You can still open worlds to review and manage them.' : 'Your teacher has closed collaboration. Saved worlds are preserved.'}</p>
            {teacher && <form className="classroom-inline classroom-card" onSubmit={event => { const data = values(event); void run(async () => {
              await client.request('/worlds', 'POST', { title: data.title, document: getDocument(), classId, kind: data.kind }); await reload()
            }) }}><label>Shared world name<input name="title" required maxLength={80} /></label><label>Access<select name="kind"><option value="class">Whole class</option><option value="group">Assigned group</option></select></label><button disabled={busy}>Create from this build</button><small className="classroom-full-width">Starts with the build currently in your studio. For an assigned group, add students using World controls after creating it.</small></form>}
            <WorldList worlds={worlds.filter(world => world.classId === classId && world.kind !== 'personal')} busy={busy} joinDisabled={!teacher && !currentClass.collaborationOpen} emptyTitle="No shared worlds yet" emptyMessage={teacher ? 'Create a whole-class or group world from your current build above.' : 'Your teacher’s class and group worlds will appear here when they’re ready for you.'} onOpen={world => void run(async () => {
              if (!currentClass.collaborationOpen && !teacher) throw new Error('Your teacher has closed collaboration.')
              await onJoinWorld(world); onClose()
            })} onManage={teacher ? world => void inspectWorld(world) : undefined} />
          </section>}
        </>)}
      </>}
    </div>
  </div></div>
}

function WorldList({ worlds, busy, joinDisabled, emptyTitle, emptyMessage, onOpen, onRename, onDuplicate, onManage }: {
  worlds: ClassroomWorld[]
  busy: boolean
  joinDisabled?: boolean
  emptyTitle: string
  emptyMessage: string
  onOpen: (world: ClassroomWorld) => void
  onRename?: (world: ClassroomWorld) => void
  onDuplicate?: (world: ClassroomWorld) => void
  onManage?: (world: ClassroomWorld) => void
}) {
  return <div className="classroom-worlds">{worlds.length ? [...worlds].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(world => <article className="classroom-card classroom-world-card" key={world.id} aria-label={world.title}>
    <div className="classroom-world-heading"><span className={`classroom-world-icon classroom-world-icon-${world.kind}`} aria-hidden="true">{world.kind === 'personal' ? <Blocks size={26} /> : <Users size={26} />}</span><div><small className="classroom-world-kind">{world.kind === 'personal' ? 'Your world' : world.kind === 'group' ? 'Assigned group' : 'Whole class'}</small><h3>{world.title}</h3><small>Saved <time dateTime={world.updatedAt} title={new Date(world.updatedAt).toLocaleString()}>{new Date(world.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></small></div></div>
    <div className="classroom-actions"><button className="classroom-primary" disabled={busy || joinDisabled} onClick={() => onOpen(world)}>{world.kind === 'personal' ? 'Open' : 'Join world'}</button>{onRename && <button disabled={busy} onClick={() => onRename(world)}>Rename</button>}{onDuplicate && <button disabled={busy} onClick={() => onDuplicate(world)}>Duplicate</button>}{onManage && <button disabled={busy} onClick={() => onManage(world)}>World controls</button>}</div>
  </article>) : <div className="classroom-empty"><Blocks size={30} aria-hidden="true" /><h3>{emptyTitle}</h3><p>{emptyMessage}</p></div>}</div>
}
