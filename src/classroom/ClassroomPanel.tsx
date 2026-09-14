import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import type { BrickStudioDocument } from '../brick/brickDocument'
import { browserClassroomClient, type ClassroomClient } from './client'
import type { ClassroomAuthResult, ClassroomClass, ClassroomStudent, ClassroomWorld, ClassroomWorldMember, ClassroomCheckpoint } from './contracts'
import { saveLocalBrickStudioProject } from '../brick/documentPersistence'
import type { ClassroomEntryIntent } from '../routes'
import { ENTRY_HEADLINES, EntryView, type EntryMode } from './EntryViews'
import { PasswordResetView } from './RecoveryViews'
import { RenameWorldForm, WorldsView } from './WorldsView'
import { ClassSettings, ClassShell, SharedWorldsSection, type ClassSection } from './ClassView'
import { ManageStudentForm, RosterSection } from './RosterView'
import { WorldControls } from './GroupControls'
import { errorMessage, PRODUCT_NAME, validatePassword, validateUsername } from './panelShared'
import './classroom.css'

export { generateTemporaryPassword } from './panelShared'

type Props = {
  /** Entry intent from `/build?classroom=` or the studio menu; see `ClassroomEntryIntent` in routes.ts. */
  intent: ClassroomEntryIntent
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

/** Guests land on the sign-in mode their link asked for; signed-in users ignore it and see their tabs. */
function initialLoginMode(intent: ClassroomEntryIntent): EntryMode {
  if (intent === 'signin') return 'login'
  if (intent === 'teacher') return 'teacher-login'
  return 'register'
}

const sameTitle = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/**
 * Account dialog: entry, forced password change, My Worlds and My Class. This component owns every
 * request and every loading/busy/error/notice state; the views under src/classroom/ are presentation only.
 */
export function ClassroomPanel({ intent, getDocument, onOpenWorld, onJoinWorld, onClose, onSessionChange, onSaved, beforeWorldMutation, onWorldUpdated, client = browserClassroomClient }: Props) {
  const auth = useSyncExternalStore(client.subscribe, client.getSession)
  const [tab, setTab] = useState<'worlds' | 'class'>(intent === 'class' ? 'class' : 'worlds')
  const [classSection, setClassSection] = useState<ClassSection>('students')
  const [loginMode, setLoginMode] = useState<EntryMode>(initialLoginMode(intent))
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
    try { await work() } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
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
    }).catch(error => { if (!cancelled) setError(errorMessage(error)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [auth, client])
  useEffect(() => {
    setStudents([]); setStudentSearch(''); setEditingStudent(null); setSelectedWorld(null); setStudentsLoading(false)
    if (!teacher || !classId || auth?.user.resetRequired) return
    let cancelled = false
    setStudentsLoading(true)
    client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`)
      .then(result => { if (!cancelled) setStudents(result.students) })
      .catch(error => { if (!cancelled) setError(errorMessage(error)) })
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
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')
      if (!nodes?.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [onClose])

  // Entry -----------------------------------------------------------------------------------------
  const authenticate = (mode: EntryMode, data: Record<string, string>) => void run(async () => {
    if (mode !== 'teacher-login') {
      const invalid = validateUsername(data.username ?? '') || (mode === 'register' ? validatePassword(data.password ?? '') : '')
      if (invalid) throw new Error(invalid)
    }
    await client.authenticate(mode, data)
  })
  const startGoogle = () => void run(async () => {
    const returnTo = new URL(window.location.href)
    if (returnTo.pathname === '/' || returnTo.pathname === '/build') {
      returnTo.pathname = '/build'
      const saved = saveLocalBrickStudioProject(localStorage, getDocument())
      if (!saved.ok) throw new Error(saved.error.message)
      returnTo.searchParams.set('classroom', intent)
    }
    const url = await client.startGoogleTeacher(`${returnTo.pathname}${returnTo.search}${returnTo.hash}`)
    window.location.assign(url)
  })
  const changePassword = (password: string, confirm: string) => void run(async () => {
    if (password !== confirm) throw new Error('The passwords do not match.')
    await client.changePassword(password)
  })
  const signOut = () => void run(async () => {
    if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Your world still has unsaved changes. Close this panel to retry saving or download a recovery copy before switching accounts.')
    await client.signOut(); setNotice('Signed out. Private account lists have been cleared.')
  })

  // Worlds ----------------------------------------------------------------------------------------
  const personalWorlds = auth ? worlds.filter(world => world.kind === 'personal' && world.ownerId === auth.user.id) : []
  const saveBuild = () => void run(async () => {
    const result = await client.request<{ world: ClassroomWorld }>('/worlds', 'POST', { title: saveTitle.trim(), document: getDocument(), kind: 'personal' })
    onSaved?.(result.world); await reload(); setShowSave(false); setNotice('Saved to your account.')
  })
  const openWorld = (world: ClassroomWorld) => void run(async () => {
    const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`)
    if (!result.world.document) throw new Error('This world did not include a complete build.')
    await onOpenWorld(result.world.document, result.world); onClose()
  })
  const duplicateWorld = (world: ClassroomWorld) => void run(async () => {
    const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`)
    await client.request('/worlds', 'POST', { title: `${world.title} copy`, document: result.world.document, kind: 'personal' }); await reload()
    setNotice(`Duplicated “${world.title}”.`)
  })
  const rename = (world: ClassroomWorld, title: string) => void run(async () => {
    if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Resolve the pending world save before renaming.')
    const renamed = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`, 'PATCH', { title })
    onWorldUpdated?.(renamed.world); setRenameWorld(null); await reload()
  })
  const inspectWorld = (world: ClassroomWorld) => void run(async () => {
    const [m, c] = await Promise.all([
      client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${world.id}/members`),
      client.request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${world.id}/checkpoints`),
    ])
    setSelectedWorld(world); setMembers(m.members); setCheckpoints(c.checkpoints)
  })
  const removeMember = (world: ClassroomWorld, member: ClassroomWorldMember) => void run(async () => {
    const result = await client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${world.id}/members/${member.id}`, 'DELETE'); setMembers(result.members)
    setNotice(`${member.rosterName || member.username} was removed. Their contributions stay in the world.`)
  })
  const addMember = (world: ClassroomWorld, userId: string) => void run(async () => {
    const result = await client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${world.id}/members`, 'POST', { userId }); setMembers(result.members)
  })
  const restore = (world: ClassroomWorld, checkpointId: string) => void run(async () => {
    if (beforeWorldMutation && !await beforeWorldMutation()) throw new Error('Download your recovery copy and resolve the pending save before restoring.')
    const current = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`)
    const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}/restore`, 'POST', { checkpointId, expectedRevision: current.world.revision })
    setSelectedWorld(result.world); onWorldUpdated?.(result.world); await reload(); setNotice('World restored. Open the world to see the recovered version.')
  })

  // Class -----------------------------------------------------------------------------------------
  const updateStudent = (student: ClassroomStudent, values: { username: string; rosterName: string; temporaryPassword?: string }) => void run(async () => {
    await client.request(`/classes/${classId}/students/${student.id}`, 'PATCH', values)
    await reloadStudents(); setEditingStudent(null); setNotice(values.temporaryPassword ? 'Student account updated. They are signed out and will choose a new password next time.' : 'Student account updated.')
  })
  const toggleSuspend = (student: ClassroomStudent) => void run(async () => {
    await client.request(`/classes/${classId}/students/${student.id}`, 'PATCH', { suspended: !student.suspended })
    await reloadStudents(); setEditingStudent(null); setNotice(student.suspended ? `${student.rosterName} can use classroom features again.` : `${student.rosterName}’s classroom access is suspended. Their saved work is kept.`)
  })
  const createClass = (name: string) => void run(async () => {
    const created = await client.request<{ class: ClassroomClass }>('/classes', 'POST', { name })
    await reload(); setClassId(created.class.id); setNewClassName(''); setClassSection('settings')
  })
  const patchClass = (body: Record<string, unknown>, done?: string) => void run(async () => { await client.request(`/classes/${classId}`, 'PATCH', body); await reload(); if (done) setNotice(done) })
  const createShared = (title: string, kind: 'class' | 'group') => void run(async () => {
    await client.request('/worlds', 'POST', { title, document: getDocument(), classId, kind }); await reload()
    setNotice(kind === 'group' ? `“${title}” is ready. Add students in World controls so they can join.` : `“${title}” is ready for the whole class.`)
  })
  const joinWorld = (world: ClassroomWorld) => void run(async () => {
    if (currentClass && !currentClass.collaborationOpen && !teacher) throw new Error('Your teacher has closed collaboration.')
    await onJoinWorld(world); onClose()
  })

  const title = !auth ? ENTRY_HEADLINES[loginMode].title : auth.user.resetRequired ? 'Choose a new password' : tab === 'class' ? 'My Class' : 'My Worlds'
  const availableStudents = students.filter(student => !members.some(member => member.id === student.id))

  return <div className="classroom-backdrop"><div className={`classroom-panel${!auth ? ' classroom-panel-entry' : ''}`} ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="classroom-title">
    <header className="classroom-header"><div><span className="classroom-eyebrow">{PRODUCT_NAME}</span><h2 id="classroom-title">{title}</h2></div><button type="button" className="classroom-close" aria-label="Close classroom" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
    <div className="classroom-body">
      {error && <p className="classroom-error" role="alert">{error}</p>}
      {notice && <p className="classroom-notice" role="status">{notice}</p>}
      {!auth
        ? <EntryView mode={loginMode} busy={busy} onModeChange={mode => { setLoginMode(mode); setError('') }} onSubmit={authenticate} onGoogle={startGoogle} onKeepBuilding={onClose} />
        : auth.user.resetRequired
          ? <PasswordResetView busy={busy} onSubmit={changePassword} onSignOut={() => void run(async () => { await client.signOut() })} />
          : <>
            <div className="classroom-account"><span>Signed in as <strong>{auth.user.username}</strong>{teacher && <small>Teacher</small>}</span><button type="button" disabled={busy} onClick={signOut}>Sign out / switch account</button></div>
            <nav aria-label="Account sections"><button type="button" disabled={busy} aria-pressed={tab === 'worlds'} onClick={() => { setTab('worlds'); closeDetails() }}>My Worlds</button><button type="button" disabled={busy} aria-pressed={tab === 'class'} onClick={() => { setTab('class'); closeDetails() }}>My Class</button></nav>
            {loading && <p role="status" className="classroom-loading">Loading your worlds and classes…</p>}
            {!loading && (renameWorld
              ? <RenameWorldForm world={renameWorld} busy={busy} headingRef={detailHeading} onSubmit={title => rename(renameWorld, title)} onCancel={() => setRenameWorld(null)} />
              : editingStudent
                ? <ManageStudentForm student={editingStudent} busy={busy} headingRef={detailHeading} onSubmit={values => updateStudent(editingStudent, values)} onToggleSuspend={() => toggleSuspend(editingStudent)} onCancel={() => setEditingStudent(null)} />
                : selectedWorld
                  ? <WorldControls world={selectedWorld} teacher={teacher} members={members} availableStudents={availableStudents} checkpoints={checkpoints} busy={busy} headingRef={detailHeading} onBack={() => setSelectedWorld(null)} onRemoveMember={member => removeMember(selectedWorld, member)} onAddMember={userId => addMember(selectedWorld, userId)} onRestore={id => restore(selectedWorld, id)} />
                  : tab === 'worlds'
                    ? <WorldsView worlds={personalWorlds} busy={busy} showSave={showSave} saveTitle={saveTitle} saveDuplicate={personalWorlds.some(world => sameTitle(world.title, saveTitle))} onToggleSave={() => setShowSave(value => !value)} onSaveTitleChange={setSaveTitle} onSave={saveBuild} onBackToBuilding={onClose} onOpen={openWorld} onRename={setRenameWorld} onDuplicate={duplicateWorld} onManage={inspectWorld} />
                    : <ClassShell classes={classes} classId={classId} teacher={teacher} busy={busy} section={classSection} studentCount={studentsLoading ? null : students.length} onClassChange={setClassId} onSectionChange={setClassSection}>
                      {teacher && (!currentClass || classSection === 'settings') && <ClassSettings currentClass={currentClass} busy={busy} newClassName={newClassName} onNewClassName={setNewClassName} onCreateClass={createClass} onToggleEnrollment={() => currentClass && patchClass({ enrollmentOpen: !currentClass.enrollmentOpen }, currentClass.enrollmentOpen ? 'Enrollment is closed. Existing accounts still work.' : 'Enrollment is open.')} onRotateCode={() => patchClass({ rotateCode: true }, 'New enrollment code ready. The returning sign-in code did not change.')} onToggleCollaboration={() => currentClass && patchClass({ collaborationOpen: !currentClass.collaborationOpen }, currentClass.collaborationOpen ? 'Collaboration is closed. Saved worlds are preserved.' : 'Collaboration is open.')} />}
                      {teacher && currentClass && classSection === 'students' && <RosterSection currentClass={currentClass} students={students} loading={studentsLoading} search={studentSearch} busy={busy} onSearch={setStudentSearch} onManage={setEditingStudent} onViewCodes={() => setClassSection('settings')} />}
                      {currentClass && (!teacher || classSection === 'worlds') && <SharedWorldsSection currentClass={currentClass} teacher={teacher} worlds={worlds.filter(world => world.classId === classId && world.kind !== 'personal')} busy={busy} onCreate={createShared} onJoin={joinWorld} onManage={teacher ? inspectWorld : undefined} />}
                    </ClassShell>)}
          </>}
    </div>
  </div></div>
}
