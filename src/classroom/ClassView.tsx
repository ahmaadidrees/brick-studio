import { ClassInvite } from './ClassInvite'
import { useEffect, useState } from 'react'
import { Blocks, Check, Copy, RefreshCw, Settings, Users } from 'lucide-react'
import { Button, SegmentedControl } from '../ui'
import type { ClassroomClass, ClassroomWorld } from './contracts'
import { ConfirmDialog } from './ConfirmDialog'
import { SelectInput, TextInput } from './fields'
import { readForm } from './panelShared'
import { EmptyState, WorldList } from './WorldsView'

export type ClassSection = 'students' | 'worlds' | 'settings'

type ShellProps = {
  classes: ClassroomClass[]
  classId: string
  teacher: boolean
  busy: boolean
  section: ClassSection
  /** Teachers arriving for class time see the invite link and QR expanded without a click. */
  inviteExpanded?: boolean
  onClassChange: (id: string) => void
  onSectionChange: (section: ClassSection) => void
  children: React.ReactNode
}

/** Board 05 right / 13 / 14: class picker plus the teacher's Students · Shared worlds · Class settings switch. */
export function ClassShell({ classes, classId, teacher, busy, section, inviteExpanded = false, onClassChange, onSectionChange, children }: ShellProps) {
  const currentClass = classes.find(item => item.id === classId)
  return <section aria-label="My Class" className="classroom-section">
    <div className="classroom-class-navigation">
      {classes.length > 0 && <SelectInput label="Class" id="classroom-class-picker" className="classroom-class-select" value={classId} disabled={busy} onChange={event => onClassChange(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput>}
      {!classes.length && <EmptyState title={teacher ? 'Start your first class' : 'No class yet'} message={teacher ? 'Create a class, then give students its enrollment code.' : 'Your account is not in a class right now. Ask your teacher for help.'} />}
      {teacher && currentClass && <ClassInvite classroom={currentClass} defaultOpen={inviteExpanded} />}
      {teacher && currentClass && <SegmentedControl<ClassSection>
        label="Class sections"
        fullWidth
        value={section}
        onChange={onSectionChange}
        options={[
          { value: 'students', label: 'Students', icon: <Users size={16} />, disabled: busy },
          { value: 'worlds', label: 'Shared worlds', icon: <Blocks size={16} />, disabled: busy },
          { value: 'settings', label: 'Class settings', icon: <Settings size={16} />, disabled: busy },
        ]}
      />}
    </div>
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
    <small className="classroom-eyebrow">{eyebrow}</small>
    <h4>{label}</h4>
    {code ? <div className="classroom-code-row">
      {state === 'failed'
        ? <input className="ui-input classroom-code classroom-code-input" readOnly value={code} aria-label={`${label} (select to copy)`} onFocus={event => event.currentTarget.select()} />
        : <strong className="classroom-code">{code}</strong>}
      <Button variant="secondary" size="sm" icon={state === 'copied' ? <Check size={16} /> : <Copy size={16} />} aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void copy()}>{state === 'copied' ? 'Copied' : 'Copy'}</Button>
    </div> : <strong className="classroom-code classroom-code-missing">Unavailable</strong>}
    <small className="classroom-help" role={state === 'failed' ? 'status' : undefined}>{state === 'failed' ? 'Copying is blocked in this browser. Select the code above to copy it by hand.' : help}</small>
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
  onToggleShowNames: () => void
}

function StateChip({ open }: { open: boolean }) {
  return <span className={`classroom-status classroom-status-${open ? 'active' : 'suspended'}`}><span className="classroom-status-dot" aria-hidden="true" />{open ? 'Open' : 'Closed'}</span>
}

/** Board 14 left: separate code cards, enrollment and collaboration boundaries, class creation. */
export function ClassSettings({ currentClass, busy, newClassName, onNewClassName, onCreateClass, onToggleEnrollment, onRotateCode, onToggleCollaboration, onToggleShowNames }: SettingsProps) {
  const [confirmClose, setConfirmClose] = useState(false)
  useEffect(() => { setConfirmClose(false) }, [currentClass?.id, currentClass?.collaborationOpen])
  return <>
    {currentClass && <section className="classroom-card" aria-labelledby="classroom-access-title">
      <h3 id="classroom-access-title" className="classroom-card-title">Class access</h3>
      <details className="classroom-codes"><summary>Legacy codes and troubleshooting</summary>
        <CodeCard eyebrow="For new students" label="New student enrollment code" code={currentClass.code} help={currentClass.enrollmentOpen ? 'Students choose “Join a class” and enter this code to create an account.' : 'Enrollment is closed. Open it below before sharing this code.'} />
        <CodeCard eyebrow="For existing accounts" label="Returning sign-in code" code={currentClass.loginCode} help="Students choose “Student” sign in and enter this code with their username and password." />
      </details>
      <p className="classroom-help">Enrollment creates an account. Sign-in returns to an existing account.</p>
      <div className="classroom-access-row">
        <div><div className="classroom-access-title"><strong>New student enrollment</strong><StateChip open={currentClass.enrollmentOpen} /></div><small>{currentClass.enrollmentOpen ? 'Students can create new accounts with the enrollment code.' : 'New students cannot join. Existing accounts still work.'}</small></div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onToggleEnrollment}>{currentClass.enrollmentOpen ? 'Close enrollment' : 'Open enrollment'}</Button>
      </div>
      <div className="classroom-access-row">
        <div><div className="classroom-access-title"><strong>Enrollment code</strong></div><small>Replace it if it has been shared outside your class. Returning sign-in stays the same.</small></div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} disabled={busy} onClick={onRotateCode}>New enrollment code</Button>
      </div>
      <div className="classroom-access-row">
        <div><div className="classroom-access-title"><strong>Student collaboration</strong><StateChip open={currentClass.collaborationOpen} /></div><small>{currentClass.collaborationOpen ? 'Students can build together in shared worlds. Closing collaboration preserves saved worlds.' : 'Shared worlds are closed to students. Their work is preserved and you can still review it.'}</small></div>
        {currentClass.collaborationOpen
          ? <Button variant="secondary" size="sm" className="classroom-button-danger" disabled={busy} onClick={() => setConfirmClose(true)}>Close collaboration</Button>
          : <Button variant="secondary" size="sm" disabled={busy} onClick={onToggleCollaboration}>Open collaboration</Button>}
      </div>
      <div className="classroom-access-row">
        <div><div className="classroom-access-title"><strong id="classroom-show-names-label">Show names on the join screen</strong></div><small>{currentClass.showNamesOnJoin ? 'Students who enter your class code can tap their first name and last initial, then type their password.' : 'Students type their username. Nothing about your roster is shown before they sign in.'}</small></div>
        <button type="button" role="switch" className="classroom-switch" aria-checked={currentClass.showNamesOnJoin} aria-labelledby="classroom-show-names-label" disabled={busy} onClick={onToggleShowNames}>
          <span className="classroom-switch-track" aria-hidden="true"><span className="classroom-switch-knob" /></span>
          <span className="classroom-switch-state">{currentClass.showNamesOnJoin ? 'On' : 'Off'}</span>
        </button>
      </div>
      <ConfirmDialog open={confirmClose} title="Close collaboration?" description={`Shared worlds in ${currentClass.name} close to students right away.`} confirmLabel="Close now" cancelLabel="Keep open" busy={busy} onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onToggleCollaboration() }}>
        <p>Students in shared worlds will be disconnected right away. Saved worlds are preserved and you keep access.</p>
      </ConfirmDialog>
    </section>}
    <form className="classroom-card classroom-form" aria-labelledby="classroom-new-class-title" onSubmit={event => onCreateClass(readForm(event).name)}>
      <h3 id="classroom-new-class-title" className="classroom-card-title">{currentClass ? 'Add another class' : 'Create your first class'}</h3>
      <div className="classroom-inline">
        <TextInput label="New class name" id="classroom-new-class" name="name" value={newClassName} onChange={event => onNewClassName(event.target.value)} required maxLength={80} autoComplete="off" />
        <Button type="submit" variant={currentClass ? 'secondary' : 'primary'} loading={busy} loadingLabel="Creating…">Create class</Button>
      </div>
      <p className="classroom-help">Each class gets its own enrollment code and returning sign-in code.</p>
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
  const [kind, setKind] = useState<'class' | 'group'>('class')
  return <section aria-label="Class shared worlds" className="classroom-section">
    {!teacher && <div className="classroom-section-heading"><h3 className="classroom-section-title">Build with your class</h3><p>Jump into a class world and create together.</p></div>}
    <p className={`classroom-help${closed ? ' classroom-warning' : ''}`} role={closed ? 'status' : undefined}>{closed ? teacher ? 'Collaboration is closed to students. You can still open worlds to review and manage them.' : 'Your teacher has closed collaboration. Saved worlds are preserved.' : teacher ? 'Students find these worlds in My Class and choose Join world.' : 'Choose a world to build with your group.'}</p>
    {teacher && <form className="classroom-card classroom-form" aria-labelledby="classroom-create-shared-title" onSubmit={event => onCreate(readForm(event).title, kind)}>
      <h3 id="classroom-create-shared-title" className="classroom-card-title">Create shared world</h3>
      <TextInput label="Shared world name" id="classroom-shared-title" name="title" required maxLength={80} autoComplete="off" />
      <SegmentedControl<'class' | 'group'> label="Access" showLabel value={kind} onChange={setKind} options={[{ value: 'class', label: 'Whole class' }, { value: 'group', label: 'Assigned group' }]} />
      <p className="classroom-help">Starts with the build currently in your studio. For an assigned group, add students in World controls after creating it.</p>
      <div className="classroom-actions"><Button type="submit" variant="primary" loading={busy} loadingLabel="Creating…">Create from this build</Button></div>
    </form>}
    <WorldList worlds={worlds} busy={busy} joinDisabled={!teacher && closed} emptyTitle="No shared worlds yet" emptyMessage={teacher ? 'Create a whole-class or group world from your current build above.' : 'Your teacher’s class and group worlds will appear here when they’re ready for you.'} onOpen={onJoin} onManage={onManage} />
    {!teacher && <p className="classroom-preserved" role="note"><Users size={20} aria-hidden="true" /><span>Class worlds are saved to your classroom account. Your teacher can close collaboration at any time; saved worlds stay.</span></p>}
  </section>
}
