import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Blocks, CircleAlert, CircleCheck, LoaderCircle, LogOut, UserRound, Users } from 'lucide-react'
import type { BrickStudioDocument } from '../brick/brickDocument'
import { BrickMark } from '../brand'
import { Button, SegmentedControl, Sheet } from '../ui'
import { browserClassroomClient, ClassroomError, type ClassroomClient } from './client'
import type { ClassroomAuthResult, ClassroomClass, ClassroomStudent, ClassroomWorld, ClassroomWorldMember, ClassroomCheckpoint } from './contracts'
import { saveLocalBrickStudioProject } from '../brick/documentPersistence'
import type { ClassroomEntryIntent } from '../routes'
import { ENTRY_HEADLINES, EntryFooter, EntryView, type EntryFieldErrors, type EntryMode } from './EntryViews'
import { PasswordResetView, ResetFooter } from './RecoveryViews'
import { RenameWorldForm, WorldsView } from './WorldsView'
import { ClassSettings, ClassShell, SharedWorldsSection, type ClassSection } from './ClassView'
import { ManageStudentForm, RosterSection } from './RosterView'
import { WorldControls } from './GroupControls'
import { errorMessage, validatePassword, validateUsername } from './panelShared'
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
  const [fieldErrors, setFieldErrors] = useState<EntryFieldErrors>({})
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
  const detailHeading = useRef<HTMLHeadingElement>(null)
  /** Set while this panel signs the account out, so a load request cancelled by that sign-out stays silent. */
  const signingOut = useRef(false)
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
    signingOut.current = false
    setLoading(true)
    let cancelled = false
    // A 401/403 during this load clears the session (client.ts), which cancels this effect; the reason must still reach
    // the entry view so an expired session is never a silent return to sign-in.
    const sessionLost = (error: unknown) => error instanceof ClassroomError && (error.status === 401 || error.status === 403) && !client.getSession() && !signingOut.current
    Promise.all([client.request<{ worlds: ClassroomWorld[] }>('/worlds'), client.request<{ classes: ClassroomClass[] }>('/classes')]).then(([w, c]) => {
      if (cancelled) return
      setWorlds(w.worlds); setClasses(c.classes); setClassId(c.classes[0]?.id || '')
    }).catch(error => {
      if (sessionLost(error)) { setError(errorMessage(error)); setLoginMode('login'); return }
      if (!cancelled) setError(errorMessage(error))
    }).finally(() => { if (!cancelled) setLoading(false) })
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

  // Entry -----------------------------------------------------------------------------------------
  const changeMode = (mode: EntryMode) => { setLoginMode(mode); setError(''); setFieldErrors({}) }
  const authenticate = (mode: EntryMode, data: Record<string, string>) => {
    if (mode !== 'teacher-login') {
      const username = validateUsername(data.username ?? '')
      const password = mode === 'register' ? validatePassword(data.password ?? '') : ''
      if (username || password) { setError(''); setFieldErrors({ ...(username ? { username } : {}), ...(password ? { password } : {}) }); return }
    }
    setFieldErrors({})
    void run(async () => { await client.authenticate(mode, data) })
  }
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
    signingOut.current = true
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

  const reset = Boolean(auth?.user.resetRequired)
  const title = !auth ? ENTRY_HEADLINES[loginMode].title : reset ? 'Choose a new password' : tab === 'class' ? 'My Class' : 'My Worlds'
  const description = !auth ? ENTRY_HEADLINES[loginMode].lead
    : reset ? 'Your teacher reset your password. Choose one to use next time.'
    : tab === 'class' ? (teacher ? 'Manage your class and build together.' : 'Your class worlds, ready when your teacher opens them.')
    : 'Save your builds, pick up where you left off, and keep creating.'
  const availableStudents = students.filter(student => !members.some(member => member.id === student.id))
  const footer = !auth
    ? <EntryFooter mode={loginMode} busy={busy} onKeepBuilding={onClose} />
    : reset
      ? <ResetFooter busy={busy} onSignOut={() => void run(async () => { signingOut.current = true; await client.signOut() })} />
      : <>
        <span className="classroom-account"><UserRound size={18} aria-hidden="true" /><span>Signed in as <strong>{auth.user.username}</strong>{teacher && <span className="classroom-chip classroom-chip-teacher">Teacher</span>}</span></span>
        <Button variant="quiet" size="sm" icon={<LogOut size={16} />} disabled={busy} onClick={signOut}>Sign out / switch account</Button>
      </>

  return <Sheet
    open
    variant="dialog"
    size="md"
    closeOnBackdrop={false}
    onClose={onClose}
    title={title}
    description={description}
    closeLabel="Close and keep building"
    headerStart={<BrickMark size={32} title={null} className="classroom-sheet-mark" />}
    className={`classroom-sheet ${!auth || reset ? 'classroom-sheet-entry' : 'classroom-sheet-account'}`}
    footer={footer}
  >
    {error && <p className="classroom-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></p>}
    {notice && <p className="classroom-notice" role="status"><CircleCheck size={18} aria-hidden="true" /><span>{notice}</span></p>}
    {!auth
      ? <EntryView mode={loginMode} busy={busy} fieldErrors={fieldErrors} onModeChange={changeMode} onSubmit={authenticate} onGoogle={startGoogle} />
      : reset
        ? <PasswordResetView onSubmit={changePassword} />
        : <div className="classroom-account-body">
          <SegmentedControl<'worlds' | 'class'>
            label="Account sections"
            fullWidth
            value={tab}
            onChange={next => { setTab(next); closeDetails() }}
            options={[
              { value: 'worlds', label: 'My Worlds', icon: <Blocks size={16} />, disabled: busy },
              { value: 'class', label: 'My Class', icon: <Users size={16} />, disabled: busy },
            ]}
          />
          {loading && <p role="status" className="classroom-loading"><LoaderCircle className="ui-spin" size={18} aria-hidden="true" /> Loading your worlds and classes…</p>}
          {!loading && (renameWorld
            ? <RenameWorldForm world={renameWorld} busy={busy} headingRef={detailHeading} onSubmit={title => rename(renameWorld, title)} onCancel={() => setRenameWorld(null)} />
            : editingStudent
              ? <ManageStudentForm student={editingStudent} busy={busy} headingRef={detailHeading} onSubmit={values => updateStudent(editingStudent, values)} onToggleSuspend={() => toggleSuspend(editingStudent)} onCancel={() => setEditingStudent(null)} />
              : selectedWorld
                ? <WorldControls world={selectedWorld} teacher={teacher} members={members} availableStudents={availableStudents} checkpoints={checkpoints} busy={busy} headingRef={detailHeading} onBack={() => setSelectedWorld(null)} onRemoveMember={member => removeMember(selectedWorld, member)} onAddMember={userId => addMember(selectedWorld, userId)} onRestore={id => restore(selectedWorld, id)} />
                : tab === 'worlds'
                  ? <WorldsView worlds={personalWorlds} busy={busy} showSave={showSave} saveTitle={saveTitle} saveDuplicate={personalWorlds.some(world => sameTitle(world.title, saveTitle))} onToggleSave={() => setShowSave(value => !value)} onSaveTitleChange={setSaveTitle} onSave={saveBuild} onBackToBuilding={onClose} onOpen={openWorld} onRename={setRenameWorld} onDuplicate={duplicateWorld} onManage={inspectWorld} />
                  : <ClassShell classes={classes} classId={classId} teacher={teacher} busy={busy} section={classSection} onClassChange={setClassId} onSectionChange={setClassSection}>
                    {teacher && (!currentClass || classSection === 'settings') && <ClassSettings currentClass={currentClass} busy={busy} newClassName={newClassName} onNewClassName={setNewClassName} onCreateClass={createClass} onToggleEnrollment={() => currentClass && patchClass({ enrollmentOpen: !currentClass.enrollmentOpen }, currentClass.enrollmentOpen ? 'Enrollment is closed. Existing accounts still work.' : 'Enrollment is open.')} onRotateCode={() => patchClass({ rotateCode: true }, 'New enrollment code ready. The returning sign-in code did not change.')} onToggleCollaboration={() => currentClass && patchClass({ collaborationOpen: !currentClass.collaborationOpen }, currentClass.collaborationOpen ? 'Collaboration is closed. Saved worlds are preserved.' : 'Collaboration is open.')} />}
                    {teacher && currentClass && classSection === 'students' && <RosterSection currentClass={currentClass} students={students} loading={studentsLoading} search={studentSearch} busy={busy} onSearch={setStudentSearch} onManage={setEditingStudent} onViewCodes={() => setClassSection('settings')} />}
                    {currentClass && (!teacher || classSection === 'worlds') && <SharedWorldsSection currentClass={currentClass} teacher={teacher} worlds={worlds.filter(world => world.classId === classId && world.kind !== 'personal')} busy={busy} onCreate={createShared} onJoin={joinWorld} onManage={teacher ? inspectWorld : undefined} />}
                  </ClassShell>)}
        </div>}
  </Sheet>
}
