import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Blocks, CircleAlert, CircleCheck, LoaderCircle, Plus, Settings, Users } from 'lucide-react'
import { createBrickStudioDocument } from '@brick-studio/core'
import { Button, SegmentedControl } from '../../ui'
import type { ClassroomCheckpoint, ClassroomStudent, ClassroomWorldMember } from '../../classroom/contracts'
import { ManageStudentForm } from '../../classroom/RosterView'
import { errorMessage } from '../../classroom/panelShared'
import '../../classroom/classroom.css'
import {
  addMember, createClass, defaultClassPageClient, loadCheckpoints, loadClasses, loadMembers, loadStudents, loadWorlds,
  patchClass, patchStudent, removeMember, restoreCheckpoint, setWorldHidden, sharedByStudents, teacherWorlds,
  type ClassPageClient, type ClassPageClass, type ClassPageWorld,
} from './classPageData'
import { ClassPageHeader } from './ClassPageHeader'
import { FirstRun } from './FirstRun'
import { StudentsTab } from './StudentsTab'
import { WorldsTab } from './WorldsTab'
import { SettingsTab } from './SettingsTab'
import { createDemoClassPageClient, type DemoVariant } from './demoData'
import './class.css'

export type ClassTab = 'students' | 'worlds' | 'settings'

type Props = {
  client?: ClassPageClient
  /** Injected in tests; the page replaces the location so /class leaves no history entry. */
  navigate?: (href: string) => void
}

/**
 * Dev-only fixtures: `/class?demo=first-run` and `/class?demo=everyday` render
 * without a worker. Resolved once, because the page keys its loading effects on
 * the client identity.
 */
let resolved: ClassPageClient | null = null
function resolveClient(): ClassPageClient {
  if (resolved) return resolved
  const demo = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('demo') : null
  resolved = demo ? createDemoClassPageClient((demo === 'first-run' ? 'first-run' : 'everyday') as DemoVariant) : defaultClassPageClient
  return resolved
}

/**
 * The teacher's page. First run is a three-step stepper; every day after it is
 * the class rail plus Students / Worlds / Settings. Non-teachers never see it:
 * students go to their worlds and signed-out visitors to the teacher sign-in.
 */
export default function ClassPage({ client = resolveClient(), navigate = href => window.location.replace(href) }: Props) {
  const session = useSyncExternalStore(client.subscribe, client.getSession)
  const teacher = session?.user.role === 'teacher'
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [classes, setClasses] = useState<ClassPageClass[]>([])
  const [worlds, setWorlds] = useState<ClassPageWorld[]>([])
  const [classId, setClassId] = useState('')
  const [tab, setTab] = useState<ClassTab>('students')
  const [students, setStudents] = useState<ClassroomStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editingStudent, setEditingStudent] = useState<ClassroomStudent | null>(null)
  const [selectedWorld, setSelectedWorld] = useState<ClassPageWorld | null>(null)
  const [members, setMembers] = useState<ClassroomWorldMember[]>([])
  const [checkpoints, setCheckpoints] = useState<ClassroomCheckpoint[]>([])
  /** Stays on the stepper until the teacher leaves it, even though the class now exists. */
  const [firstRunDone, setFirstRunDone] = useState(false)
  const [createdClass, setCreatedClass] = useState<ClassPageClass | null>(null)
  const studentFocus = useRef<'password' | null>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)

  const currentClass = classes.find(item => item.id === classId)

  useEffect(() => {
    if (!session) navigate('/join?mode=teacher&next=/class')
    else if (session.user.role !== 'teacher') navigate('/worlds')
  }, [session, navigate])

  const refresh = useCallback(async () => {
    const [nextClasses, nextWorlds] = await Promise.all([loadClasses(client), loadWorlds(client)])
    setClasses(nextClasses); setWorlds(nextWorlds)
    setClassId(id => nextClasses.some(item => item.id === id) ? id : nextClasses[0]?.id || '')
  }, [client])

  useEffect(() => {
    if (!teacher) return
    let cancelled = false
    setLoading(true)
    refresh().catch(failure => { if (!cancelled) setError(errorMessage(failure)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [teacher, refresh])

  useEffect(() => {
    setStudents([]); setSearch(''); setEditingStudent(null)
    if (!teacher || !classId) return
    let cancelled = false
    setStudentsLoading(true)
    loadStudents(client, classId)
      .then(result => { if (!cancelled) setStudents(result) })
      .catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
      .finally(() => { if (!cancelled) setStudentsLoading(false) })
    return () => { cancelled = true }
  }, [client, classId, teacher])

  useEffect(() => {
    if (editingStudent && studentFocus.current === 'password') { document.querySelector<HTMLInputElement>('input[name="temporaryPassword"]')?.focus(); studentFocus.current = null }
    else if (editingStudent || selectedWorld) detailHeading.current?.focus()
  }, [editingStudent, selectedWorld])

  const run = (work: () => Promise<void>) => void (async () => {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  })()

  const onCreateClass = (name: string) => run(async () => {
    const created = await createClass(client, name)
    await refresh(); setClassId(created.id); setCreatedClass(created)
    if (firstRunDone || classes.length) { setTab('settings'); setNotice(`${created.name} is ready.`) }
  })
  const onPatch = (body: Record<string, unknown>, message?: string) => run(async () => {
    await patchClass(client, classId, body); await refresh(); if (message) setNotice(message)
  })
  const onToggleHidden = (world: ClassPageWorld) => run(async () => {
    await setWorldHidden(client, world.id, !world.hiddenByTeacher); await refresh()
    setNotice(world.hiddenByTeacher ? `“${world.title}” is back in the class list.` : `“${world.title}” is hidden from the class. The student keeps their build.`)
  })
  const onManageStudent = (student: ClassroomStudent, focus?: 'password') => { studentFocus.current = focus ?? null; setEditingStudent(student) }
  const onUpdateStudent = (student: ClassroomStudent, values: { username: string; rosterName: string; temporaryPassword?: string }) => run(async () => {
    await patchStudent(client, classId, student.id, values)
    setStudents(await loadStudents(client, classId)); setEditingStudent(null)
    setNotice(values.temporaryPassword ? 'Student account updated. They are signed out and will choose a new password next time.' : 'Student account updated.')
  })
  const onToggleSuspend = (student: ClassroomStudent) => run(async () => {
    await patchStudent(client, classId, student.id, { suspended: !student.suspended })
    setStudents(await loadStudents(client, classId)); setEditingStudent(null)
    setNotice(student.suspended ? `${student.rosterName} can use classroom features again.` : `${student.rosterName}’s classroom access is suspended. Their saved work is kept.`)
  })
  const onCreateWorld = (title: string, kind: 'class' | 'group') => run(async () => {
    await client.request('/worlds', 'POST', { title, classId, kind, document: createBrickStudioDocument([]) })
    await refresh(); setFirstRunDone(true); setTab('worlds')
    setNotice(kind === 'group' ? `“${title}” is ready. Add students in World controls so they can join.` : `“${title}” is ready for the whole class.`)
  })
  const onSelectWorld = (world: ClassPageWorld) => run(async () => {
    const [nextMembers, nextCheckpoints] = await Promise.all([
      world.kind === 'personal' ? Promise.resolve([] as ClassroomWorldMember[]) : loadMembers(client, world.id),
      loadCheckpoints(client, world.id),
    ])
    setSelectedWorld(world); setMembers(nextMembers); setCheckpoints(nextCheckpoints)
  })

  if (!session || !teacher) return <main className="class-page-redirect" role="status">Taking you to the right page…</main>

  const firstRun = !loading && (classes.length === 0 || (!firstRunDone && createdClass !== null && classes.length === 1))
  const name = session.user.rosterName || session.user.username
  const shared = currentClass ? sharedByStudents(worlds, currentClass.id, session.user.id) : []

  return <div className="class-page">
    <ClassPageHeader name={name} />
    {error && <p className="class-banner class-banner-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></p>}
    {notice && <p className="class-banner class-banner-notice" role="status"><CircleCheck size={18} aria-hidden="true" /><span>{notice}</span></p>}
    {loading
      ? <main className="class-page-main"><p role="status" className="class-loading"><LoaderCircle className="ui-spin" size={18} aria-hidden="true" /> Loading your classes…</p></main>
      : firstRun
        ? <FirstRun created={createdClass} busy={busy} onCreateClass={onCreateClass} onStartSharedWorld={title => onCreateWorld(title, 'class')} onFinish={() => setFirstRunDone(true)} />
        : <div className="class-page-body">
          <nav className="class-rail" aria-label="Classes">
            <h2 className="class-rail-title">Classes</h2>
            <ul className="class-rail-list">
              {classes.map(item => <li key={item.id}>
                <button type="button" className={`class-rail-item${item.id === classId ? ' class-rail-item-current' : ''}`} aria-current={item.id === classId ? 'true' : undefined} disabled={busy} onClick={() => { setClassId(item.id); setEditingStudent(null); setSelectedWorld(null) }}>{item.name}</button>
              </li>)}
            </ul>
            <Button variant="quiet" size="sm" icon={<Plus size={16} />} onClick={() => { setTab('settings'); setEditingStudent(null); setSelectedWorld(null) }}>New class</Button>
            <hr className="class-rail-divider" />
            <Button variant="quiet" size="sm" href="/worlds">My worlds</Button>
          </nav>
          <main className="class-page-main" aria-labelledby="class-name-title">
            {currentClass ? <>
              <div className="class-head">
                <h1 id="class-name-title">{currentClass.name}</h1>
                <div className="class-head-chips">
                  <span className={`class-chip class-chip-${currentClass.enrollmentOpen ? 'on' : 'off'}`}>Enrollment {currentClass.enrollmentOpen ? 'open' : 'closed'}</span>
                  <span className={`class-chip class-chip-${currentClass.collaborationOpen ? 'on' : 'off'}`}>Collaboration {currentClass.collaborationOpen ? 'open' : 'closed'}</span>
                  {typeof currentClass.buildingNow === 'number' && <span className="class-chip class-chip-live">{currentClass.buildingNow} building now</span>}
                </div>
              </div>
              <SegmentedControl<ClassTab>
                label="Class sections"
                fullWidth
                className="class-tabs"
                value={tab}
                onChange={next => { setTab(next); setEditingStudent(null); setSelectedWorld(null) }}
                options={[
                  { value: 'students', label: 'Students', icon: <Users size={16} />, disabled: busy },
                  { value: 'worlds', label: 'Worlds', icon: <Blocks size={16} />, disabled: busy },
                  { value: 'settings', label: 'Settings', icon: <Settings size={16} />, disabled: busy },
                ]}
              />
              {editingStudent
                ? <ManageStudentForm student={editingStudent} busy={busy} headingRef={detailHeading} onSubmit={values => onUpdateStudent(editingStudent, values)} onToggleSuspend={() => onToggleSuspend(editingStudent)} onCancel={() => setEditingStudent(null)} />
                : tab === 'students'
                  ? <StudentsTab currentClass={currentClass} students={students} studentsLoading={studentsLoading} search={search} busy={busy} shared={shared} onSearch={setSearch} onManageStudent={onManageStudent} onToggleHidden={onToggleHidden} onViewSettings={() => setTab('settings')} />
                  : tab === 'worlds'
                    ? <WorldsTab
                      currentClass={currentClass}
                      worlds={teacherWorlds(worlds, currentClass.id)}
                      students={students}
                      busy={busy}
                      selected={selectedWorld}
                      members={members}
                      checkpoints={checkpoints}
                      headingRef={detailHeading}
                      onCreate={onCreateWorld}
                      onSelect={onSelectWorld}
                      onBack={() => setSelectedWorld(null)}
                      onAddMember={userId => selectedWorld && run(async () => { setMembers(await addMember(client, selectedWorld.id, userId)) })}
                      onRemoveMember={member => selectedWorld && run(async () => {
                        setMembers(await removeMember(client, selectedWorld.id, member.id))
                        setNotice(`${member.rosterName || member.username} was removed. Their contributions stay in the world.`)
                      })}
                      onRestore={checkpointId => selectedWorld && run(async () => {
                        const restored = await restoreCheckpoint(client, selectedWorld, checkpointId)
                        setSelectedWorld(restored); await refresh(); setNotice('World restored. Open it to see the recovered version.')
                      })}
                    />
                    : <SettingsTab currentClass={currentClass} busy={busy} onPatch={onPatch} onCreateClass={onCreateClass} />}
            </> : <p className="class-help" role="status">Pick a class from the list, or create one in Settings.</p>}
          </main>
        </div>}
  </div>
}
