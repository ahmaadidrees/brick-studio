import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { BrickStudioDocument } from '../brick/brickDocument'
import { browserClassroomClient, type ClassroomClient } from './client'
import type { ClassroomAuthResult, ClassroomClass, ClassroomStudent, ClassroomWorld, ClassroomWorldMember, ClassroomCheckpoint } from './contracts'
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
function values(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string> }

export function ClassroomPanel({ intent, getDocument, onOpenWorld, onJoinWorld, onClose, onSessionChange, onSaved, beforeWorldMutation, onWorldUpdated, client = browserClassroomClient }: Props) {
  const auth = useSyncExternalStore(client.subscribe, client.getSession)
  const [tab, setTab] = useState(intent === 'class' ? 'class' : 'worlds')
  const [loginMode, setLoginMode] = useState<'login' | 'register' | 'teacher-login'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [worlds, setWorlds] = useState<ClassroomWorld[]>([])
  const [classes, setClasses] = useState<ClassroomClass[]>([])
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<ClassroomStudent[]>([])
  const [selectedWorld, setSelectedWorld] = useState<ClassroomWorld | null>(null)
  const [members, setMembers] = useState<ClassroomWorldMember[]>([])
  const [checkpoints, setCheckpoints] = useState<ClassroomCheckpoint[]>([])
  const [editingStudent, setEditingStudent] = useState<ClassroomStudent | null>(null)
  const [saveTitle, setSaveTitle] = useState('My build')
  const [renameWorld, setRenameWorld] = useState<ClassroomWorld | null>(null)
  const [showSave, setShowSave] = useState(intent === 'save')
  const dialog = useRef<HTMLDivElement>(null)
  const currentClass = classes.find(item => item.id === classId)
  const teacher = auth?.user.role === 'teacher'
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await work() } catch (error) { setError(message(error)) } finally { setBusy(false) } }
  const reload = async () => {
    const [worldResult, classResult] = await Promise.all([client.request<{ worlds: ClassroomWorld[] }>('/worlds'), client.request<{ classes: ClassroomClass[] }>('/classes')])
    setWorlds(worldResult.worlds); setClasses(classResult.classes)
    setClassId(id => classResult.classes.some(c => c.id === id) ? id : classResult.classes[0]?.id || '')
  }
  useEffect(() => { onSessionChange?.(auth) }, [auth, onSessionChange])
  useEffect(() => {
    setWorlds([]); setClasses([]); setStudents([]); setSelectedWorld(null); setMembers([]); setCheckpoints([])
    if (!auth || auth.user.resetRequired) return
    let cancelled = false
    Promise.all([client.request<{ worlds: ClassroomWorld[] }>('/worlds'), client.request<{ classes: ClassroomClass[] }>('/classes')]).then(([w, c]) => {
      if (cancelled) return
      setWorlds(w.worlds); setClasses(c.classes); setClassId(c.classes[0]?.id || '')
    }).catch(error => { if (!cancelled) setError(message(error)) })
    return () => { cancelled = true }
  }, [auth, client])
  useEffect(() => {
    setStudents([])
    if (!teacher || !classId || auth?.user.resetRequired) return
    let cancelled = false
    client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`).then(result => { if (!cancelled) setStudents(result.students) }).catch(error => { if (!cancelled) setError(message(error)) })
    return () => { cancelled = true }
  }, [classId, teacher, client, auth])
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
    const [m, c] = await Promise.all([client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${world.id}/members`), client.request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${world.id}/checkpoints`)])
    setSelectedWorld(world); setMembers(m.members); setCheckpoints(c.checkpoints)
  })
  return <div className="classroom-backdrop"><div className="classroom-panel" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="classroom-title">
    <header><div><span className="classroom-eyebrow">BRICK STUDIO</span><h2 id="classroom-title">{auth ? 'Your building space' : 'Keep building. Come back anytime.'}</h2></div><button type="button" aria-label="Close classroom" onClick={onClose}>×</button></header>
    {error && <p className="classroom-error" role="alert">{error}</p>}
    {notice && <p className="classroom-notice" role="status">{notice}</p>}
    {!auth ? <>
      <p>Your current build stays here while you sign in. You can keep building without an account.</p>
      <nav aria-label="Sign in options">{(['register', 'login', 'teacher-login'] as const).map(mode => <button key={mode} aria-pressed={loginMode === mode} onClick={() => { setLoginMode(mode); setError('') }}>{mode === 'register' ? 'Join a class' : mode === 'login' ? 'Student sign in' : 'Teacher sign in'}</button>)}</nav>
      <form onSubmit={event => { const data = values(event); void run(async () => { await client.authenticate(loginMode, data) }) }}>
        {loginMode === 'teacher-login' ? <label>Email<input name="email" type="email" autoComplete="username" required /></label> : <><label>Class code<input name="classCode" autoComplete="off" required maxLength={32} /></label><label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" title="Use letters, numbers, underscores, or hyphens" /></label></>}
        {loginMode === 'register' && <label>Name your teacher knows<input name="rosterName" autoComplete="off" required maxLength={80} /><small>Only your teacher sees this name.</small></label>}
        <label>{loginMode === 'register' ? 'Choose a password' : 'Password'}<input name="password" type="password" maxLength={128} autoComplete={loginMode === 'register' ? 'new-password' : 'current-password'} required minLength={loginMode === 'register' ? 8 : undefined} /></label>
        <button className="classroom-primary" disabled={busy}>{busy ? 'Connecting…' : loginMode === 'register' ? 'Create account and join' : 'Sign in'}</button>
      </form><button className="classroom-link" onClick={onClose}>Keep building as a guest</button>
    </> : auth.user.resetRequired ? <>
      <p>Your teacher reset your password. Choose a new one before opening your account.</p>
      <form onSubmit={event => { const data = values(event); void run(async () => { if (data.password !== data.confirm) throw new Error('The passwords do not match.'); await client.changePassword(data.password) }) }}><label>New password<input name="password" type="password" maxLength={128} autoComplete="new-password" required minLength={8} /></label><label>Repeat new password<input name="confirm" type="password" maxLength={128} autoComplete="new-password" required minLength={8} /></label><button className="classroom-primary" disabled={busy}>Set new password</button></form>
      <button onClick={() => void run(async () => { await client.signOut() })}>Sign out</button>
    </> : <>
      <div className="classroom-account"><span>Signed in as <strong>{auth.user.username}</strong></span><button disabled={busy} onClick={() => void run(async () => { await beforeWorldMutation?.(); await client.signOut(); setNotice('Signed out. Private account lists have been cleared.') })}>Sign out / switch account</button></div>
      <nav aria-label="Account sections"><button aria-pressed={tab === 'worlds'} onClick={() => setTab('worlds')}>My Worlds</button><button aria-pressed={tab === 'class'} onClick={() => setTab('class')}>My Class</button></nav>
      {tab === 'worlds' ? <>
        <button className="classroom-primary" onClick={() => setShowSave(value => !value)}>Save this build to my account</button>
        {showSave && <form onSubmit={event => { event.preventDefault(); void run(async () => { const result = await client.request<{ world: ClassroomWorld }>('/worlds', 'POST', { title: saveTitle, document: getDocument(), kind: 'personal' }); onSaved?.(result.world); await reload(); setShowSave(false); setNotice('Saved to your account.'); }) }}><label>World name<input value={saveTitle} onChange={event => setSaveTitle(event.target.value)} required maxLength={80} /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save world'}</button></form>}
        <WorldList worlds={worlds.filter(world => world.kind === 'personal' && world.ownerId === auth.user.id)} busy={busy} onOpen={world => void run(async () => { const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`); if (!result.world.document) throw new Error('This world did not include a complete build.'); await onOpenWorld(result.world.document, result.world); onClose() })} onRename={setRenameWorld} onDuplicate={world => void run(async () => { const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`); await client.request('/worlds', 'POST', { title: `${world.title} copy`, document: result.world.document, kind: 'personal' }); await reload() })} onManage={world => void inspectWorld(world)} />
      </> : <>
        {classes.length > 0 && <label>Class<select value={classId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {!classes.length && <p>{teacher ? 'Create your first class to invite students.' : 'No class is available for this account. Ask your teacher for help.'}</p>}
        {teacher && <>
          <form className="classroom-inline" onSubmit={event => { const data = values(event); void run(async () => { await client.request('/classes', 'POST', { name: data.name }); await reload() }) }}><label>New class name<input name="name" required maxLength={80} /></label><button disabled={busy}>Create class</button></form>
          {currentClass && <section className="classroom-card"><h3>Class access</h3><p>Enrollment code: <strong>{currentClass.code || 'Unavailable'}</strong> · Returning sign-in code: <strong>{currentClass.loginCode}</strong></p><div className="classroom-actions"><button disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', { enrollmentOpen: !currentClass.enrollmentOpen }); await reload() })}>{currentClass.enrollmentOpen ? 'Close enrollment' : 'Open enrollment'}</button><button disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', { rotateCode: true }); await reload() })}>New enrollment code</button><button disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', { collaborationOpen: !currentClass.collaborationOpen }); await reload() })}>{currentClass.collaborationOpen ? 'Close collaboration' : 'Open collaboration'}</button></div><small>Existing accounts and saved work remain when enrollment or collaboration closes.</small></section>}
          <h3>Students</h3>{students.map(student => <div className="classroom-row" key={student.id}><span><strong>{student.rosterName}</strong><small>{student.username}{student.suspended ? ' · Suspended' : ''}{student.resetRequired ? ' · Password change required' : ''}</small></span><button onClick={() => setEditingStudent(student)}>Manage</button></div>)}
        </>}
        {currentClass && <><h3>Shared worlds</h3><p>{currentClass.collaborationOpen ? 'Choose a world to build with your group.' : teacher ? 'Collaboration is closed to students. You can still open worlds to review and manage them.' : 'Your teacher has closed collaboration. Saved worlds are preserved.'}</p>{teacher && <form className="classroom-inline" onSubmit={event => { const data = values(event); void run(async () => { await client.request('/worlds', 'POST', { title: data.title, document: getDocument(), classId, kind: data.kind }); await reload() }) }}><label>Shared world name<input name="title" required maxLength={80} /></label><label>Access<select name="kind"><option value="class">Whole class</option><option value="group">Assigned group</option></select></label><button disabled={busy}>Create from this build</button></form>}
        <WorldList worlds={worlds.filter(world => world.classId === classId && world.kind !== 'personal')} busy={busy} onOpen={world => void run(async () => { if (!currentClass.collaborationOpen && !teacher) throw new Error('Your teacher has closed collaboration.'); await onJoinWorld(world); onClose() })} onManage={teacher ? world => void inspectWorld(world) : undefined} /></>}
      </>}
      {renameWorld && <form className="classroom-card" onSubmit={event => { const data = values(event); void run(async () => { if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Resolve the pending world save before renaming.'); const renamed = await client.request<{ world: ClassroomWorld }>(`/worlds/${renameWorld.id}`, 'PATCH', { title: data.title }); onWorldUpdated?.(renamed.world); setRenameWorld(null); await reload() }) }}><label>World name<input name="title" defaultValue={renameWorld.title} required maxLength={80} /></label><button disabled={busy}>Save name</button><button type="button" onClick={() => setRenameWorld(null)}>Cancel</button></form>}
      {editingStudent && <form className="classroom-card" onSubmit={event => { const data = values(event); void run(async () => { await client.request(`/classes/${classId}/students/${editingStudent.id}`, 'PATCH', { username: data.username, rosterName: data.rosterName, ...(data.temporaryPassword ? { temporaryPassword: data.temporaryPassword } : {}) }); const result = await client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`); setStudents(result.students); setEditingStudent(null); setNotice('Student account updated.') }) }}><h3>Manage student</h3><label>Username<input name="username" defaultValue={editingStudent.username} required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" title="Use letters, numbers, underscores, or hyphens" /></label><label>Roster name<input name="rosterName" defaultValue={editingStudent.rosterName} required maxLength={80} /></label><label>Temporary password<input name="temporaryPassword" autoComplete="new-password" minLength={8} placeholder="Leave empty to keep current password" /></label><button type="button" onClick={event => { const input = event.currentTarget.form?.elements.namedItem('temporaryPassword'); if (input instanceof HTMLInputElement) { input.value = generateTemporaryPassword(); input.focus() } }}>Generate temporary password</button><small>Setting a temporary password signs the student out and requires a new password.</small><div className="classroom-actions"><button disabled={busy}>Save changes</button><button type="button" disabled={busy} onClick={() => void run(async () => { await client.request(`/classes/${classId}/students/${editingStudent.id}`, 'PATCH', { suspended: !editingStudent.suspended }); const result = await client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`); setStudents(result.students); setEditingStudent(null) })}>{editingStudent.suspended ? 'Reactivate access' : 'Suspend classroom access'}</button><button type="button" onClick={() => setEditingStudent(null)}>Cancel</button></div></form>}
      {selectedWorld && <section className="classroom-card"><h3>{selectedWorld.title}</h3><button onClick={() => setSelectedWorld(null)}>Close world controls</button>{teacher && selectedWorld.kind === 'group' && <><h4>Group members</h4>{members.map(member => <div className="classroom-row" key={member.id}><span>{member.rosterName || member.username}</span><button disabled={busy} onClick={() => void run(async () => { const result = await client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${selectedWorld.id}/members/${member.id}`, 'DELETE'); setMembers(result.members) })}>Remove from group</button></div>)}<form className="classroom-inline" onSubmit={event => { const data = values(event); void run(async () => { const result = await client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${selectedWorld.id}/members`, 'POST', { userId: data.userId }); setMembers(result.members) }) }}><label>Add student<select name="userId" required>{students.filter(student => !members.some(member => member.id === student.id)).map(student => <option key={student.id} value={student.id}>{student.rosterName} ({student.username})</option>)}</select></label><button disabled={busy}>Add to group</button></form><small>Removing a member preserves their contributions.</small></>}
      <h4>Restore world</h4><p>Restoring preserves a checkpoint of the current version first.</p>{checkpoints.length ? <form onSubmit={event => { const data = values(event); void run(async () => { if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Download your recovery copy and resolve the pending save before restoring.'); const current = await client.request<{ world: ClassroomWorld }>(`/worlds/${selectedWorld.id}`); const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${selectedWorld.id}/restore`, 'POST', { checkpointId: data.checkpointId, expectedRevision: current.world.revision }); setSelectedWorld(result.world); onWorldUpdated?.(result.world); await reload(); setNotice('World restored. Open the world to see the recovered version.') }) }}><label>Checkpoint<select name="checkpointId">{checkpoints.map(checkpoint => <option key={checkpoint.id} value={checkpoint.id}>Revision {checkpoint.revision} · {new Date(checkpoint.createdAt).toLocaleString()}</option>)}</select></label><button disabled={busy}>Restore selected checkpoint</button></form> : <p>No earlier checkpoints yet.</p>}</section>}
    </>}
  </div></div>
}
function WorldList({ worlds, busy, onOpen, onRename, onDuplicate, onManage }: { worlds: ClassroomWorld[]; busy: boolean; onOpen: (world: ClassroomWorld) => void; onRename?: (world: ClassroomWorld) => void; onDuplicate?: (world: ClassroomWorld) => void; onManage?: (world: ClassroomWorld) => void }) {
  return <div className="classroom-worlds">{worlds.length ? worlds.map(world => <article className="classroom-card" key={world.id}><h3>{world.title}</h3><small>Saved {new Date(world.updatedAt).toLocaleString()} · Revision {world.revision}</small><div className="classroom-actions"><button className="classroom-primary" disabled={busy} onClick={() => onOpen(world)}>{world.kind === 'personal' ? 'Open' : 'Join world'}</button>{onRename && <button disabled={busy} onClick={() => onRename(world)}>Rename</button>}{onDuplicate && <button disabled={busy} onClick={() => onDuplicate(world)}>Duplicate</button>}{onManage && <button disabled={busy} onClick={() => onManage(world)}>World controls</button>}</div></article>) : <p>No saved worlds here yet.</p>}</div>
}
