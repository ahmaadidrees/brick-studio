import { useEffect, useState } from 'react'
import { Check, Copy, Users } from 'lucide-react'
import type { ClassroomClass, ClassroomWorld } from './contracts'
import { readForm } from './panelShared'
import { WorldList } from './WorldsView'

export type ClassSection = 'students' | 'worlds' | 'settings'

type ShellProps = {
  classes: ClassroomClass[]
  classId: string
  teacher: boolean
  busy: boolean
  section: ClassSection
  studentCount: number | null
  onClassChange: (id: string) => void
  onSectionChange: (section: ClassSection) => void
  children: React.ReactNode
}

/** Board 05 right / 13 / 14: class picker plus the teacher's Students · Shared worlds · Class settings sub-navigation. */
export function ClassShell({ classes, classId, teacher, busy, section, studentCount, onClassChange, onSectionChange, children }: ShellProps) {
  const currentClass = classes.find(item => item.id === classId)
  return <section aria-label="My Class">
    {classes.length > 0 && <div className="classroom-field classroom-class-select"><label htmlFor="classroom-class-picker">Class</label><select id="classroom-class-picker" value={classId} disabled={busy} onChange={event => onClassChange(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    {!classes.length && <div className="classroom-empty"><Users size={28} aria-hidden="true" /><h3>{teacher ? 'Start your first class' : 'No class yet'}</h3><p>{teacher ? 'Create a class, then give students its enrollment code.' : 'Your account is not in a class right now. Ask your teacher for help.'}</p></div>}
    {teacher && currentClass && <nav className="classroom-subnav" aria-label="Class sections">
      <button type="button" disabled={busy} aria-pressed={section === 'students'} onClick={() => onSectionChange('students')}>Students{studentCount !== null && <span className="classroom-count" aria-label={`${studentCount} students`}>{studentCount}</span>}</button>
      <button type="button" disabled={busy} aria-pressed={section === 'worlds'} onClick={() => onSectionChange('worlds')}>Shared worlds</button>
      <button type="button" disabled={busy} aria-pressed={section === 'settings'} onClick={() => onSectionChange('settings')}>Class settings</button>
    </nav>}
    {children}
  </section>
}

/** Copies a class code; when the clipboard is blocked the code stays selectable in a read-only field. */
export function CodeCard({ eyebrow, label, code, help }: { eyebrow: string; label: string; code: string | undefined; help: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => { if (state !== 'copied') return; const timer = window.setTimeout(() => setState('idle'), 2500); return () => window.clearTimeout(timer) }, [state])
  const copy = async () => {
    if (!code) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(code); setState('copied')
    } catch { setState('failed') }
  }
  return <div className="classroom-code-card">
    <small>{eyebrow}</small>
    <h4>{label}</h4>
    {code ? <div className="classroom-code-row">
      {state === 'failed'
        ? <input className="classroom-code classroom-code-input" readOnly value={code} aria-label={`${label} (select to copy)`} onFocus={event => event.currentTarget.select()} />
        : <strong className="classroom-code">{code}</strong>}
      <button type="button" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void copy()}>{state === 'copied' ? <><Check size={16} aria-hidden="true" /> Copied</> : <><Copy size={16} aria-hidden="true" /> Copy</>}</button>
    </div> : <strong className="classroom-code classroom-code-missing">Unavailable</strong>}
    <small role={state === 'failed' ? 'status' : undefined}>{state === 'failed' ? 'Copying is blocked in this browser. Select the code above to copy it by hand.' : help}</small>
  </div>
}

type SettingsProps = {
  currentClass: ClassroomClass | undefined
  busy: boolean
  newClassName: string
  onNewClassName: (value: string) => void
  onCreateClass: (name: string) => void
  onToggleEnrollment: () => void
  onRotateCode: () => void
  onToggleCollaboration: () => void
}

/** Board 14 left: separate code cards, enrollment and collaboration boundaries, class creation. */
export function ClassSettings({ currentClass, busy, newClassName, onNewClassName, onCreateClass, onToggleEnrollment, onRotateCode, onToggleCollaboration }: SettingsProps) {
  const [confirmClose, setConfirmClose] = useState(false)
  useEffect(() => { setConfirmClose(false) }, [currentClass?.id, currentClass?.collaborationOpen])
  return <>
    {currentClass && <section className="classroom-card" aria-labelledby="classroom-access-title">
      <h3 id="classroom-access-title">Class access</h3>
      <div className="classroom-codes">
        <CodeCard eyebrow="For new students" label="New student enrollment code" code={currentClass.code} help={currentClass.enrollmentOpen ? 'Students choose “Join a class” and enter this code to create an account.' : 'Enrollment is closed. Open it below before sharing this code.'} />
        <CodeCard eyebrow="For existing accounts" label="Returning sign-in code" code={currentClass.loginCode} help="Students choose “Student sign in” and enter this code with their username and password." />
      </div>
      <p className="classroom-help">Enrollment creates an account. Sign-in returns to an existing account.</p>
      <div className="classroom-access-row">
        <div><strong>New student enrollment</strong><small>{currentClass.enrollmentOpen ? 'Students can create new accounts with the enrollment code.' : 'New students cannot join. Existing accounts still work.'}</small></div>
        <button type="button" disabled={busy} onClick={onToggleEnrollment}>{currentClass.enrollmentOpen ? 'Close enrollment' : 'Open enrollment'}</button>
      </div>
      <div className="classroom-access-row">
        <div><strong>Enrollment code</strong><small>Replace it if it has been shared outside your class. Returning sign-in stays the same.</small></div>
        <button type="button" disabled={busy} onClick={onRotateCode}>New enrollment code</button>
      </div>
      <div className="classroom-access-row">
        <div><strong>Student collaboration</strong><small>{currentClass.collaborationOpen ? 'Students can build together in shared worlds. Closing collaboration preserves saved worlds.' : 'Shared worlds are closed to students. Their work is preserved and you can still review it.'}</small></div>
        {currentClass.collaborationOpen
          ? confirmClose
            ? <span className="classroom-confirm" role="group" aria-label="Confirm closing collaboration"><button type="button" className="classroom-danger" disabled={busy} onClick={() => { setConfirmClose(false); onToggleCollaboration() }}>Close now</button><button type="button" disabled={busy} onClick={() => setConfirmClose(false)}>Keep open</button></span>
            : <button type="button" className="classroom-danger-outline" disabled={busy} onClick={() => setConfirmClose(true)}>Close collaboration</button>
          : <button type="button" disabled={busy} onClick={onToggleCollaboration}>Open collaboration</button>}
      </div>
      {confirmClose && <p className="classroom-warning" role="status">Students in shared worlds will be disconnected right away. Saved worlds are preserved and you keep access.</p>}
    </section>}
    <form className="classroom-card classroom-inline" onSubmit={event => onCreateClass(readForm(event).name)}>
      <div className="classroom-field"><label htmlFor="classroom-new-class">New class name</label><input id="classroom-new-class" name="name" value={newClassName} onChange={event => onNewClassName(event.target.value)} required maxLength={80} autoComplete="off" /></div>
      <button className={currentClass ? undefined : 'classroom-primary'} disabled={busy}>Create class</button>
      <small className="classroom-full-width">Each class gets its own enrollment code and returning sign-in code.</small>
    </form>
  </>
}

type SharedProps = {
  currentClass: ClassroomClass
  teacher: boolean
  worlds: ClassroomWorld[]
  busy: boolean
  onCreate: (title: string, kind: 'class' | 'group') => void
  onJoin: (world: ClassroomWorld) => void
  onManage?: (world: ClassroomWorld) => void
}

/** Board 05 right / 14: shared class and group worlds. Students only see the honest collaboration state. */
export function SharedWorldsSection({ currentClass, teacher, worlds, busy, onCreate, onJoin, onManage }: SharedProps) {
  const closed = !currentClass.collaborationOpen
  return <section aria-label="Class shared worlds">
    {!teacher && <div className="classroom-section-heading"><div><h3 className="classroom-section-title">Build with your class</h3><p>Jump into a class world and create together.</p></div></div>}
    <p className="classroom-help" role={closed ? 'status' : undefined}>{closed ? teacher ? 'Collaboration is closed to students. You can still open worlds to review and manage them.' : 'Your teacher has closed collaboration. Saved worlds are preserved.' : teacher ? 'Students find these worlds in My Class and choose Join world.' : 'Choose a world to build with your group.'}</p>
    {teacher && <form className="classroom-inline classroom-card" aria-labelledby="classroom-create-shared-title" onSubmit={event => { const data = readForm(event); onCreate(data.title, data.kind === 'group' ? 'group' : 'class') }}>
      <h3 id="classroom-create-shared-title" className="classroom-full-width">Create shared world</h3>
      <div className="classroom-field"><label htmlFor="classroom-shared-title">Shared world name</label><input id="classroom-shared-title" name="title" required maxLength={80} autoComplete="off" /></div>
      <fieldset className="classroom-fieldset"><legend>Access</legend>
        <label className="classroom-radio"><input type="radio" name="kind" value="class" defaultChecked /> Whole class</label>
        <label className="classroom-radio"><input type="radio" name="kind" value="group" /> Assigned group</label>
      </fieldset>
      <button className="classroom-primary" disabled={busy}>Create from this build</button>
      <small className="classroom-full-width">Starts with the build currently in your studio. For an assigned group, add students in World controls after creating it.</small>
    </form>}
    <WorldList worlds={worlds} busy={busy} joinDisabled={!teacher && closed} emptyTitle="No shared worlds yet" emptyMessage={teacher ? 'Create a whole-class or group world from your current build above.' : 'Your teacher’s class and group worlds will appear here when they’re ready for you.'} onOpen={onJoin} onManage={onManage} />
    {!teacher && <p className="classroom-preserved" role="note">Class worlds are saved to your classroom account. Your teacher can close collaboration at any time; saved worlds stay.</p>}
  </section>
}
