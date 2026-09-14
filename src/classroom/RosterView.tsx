import { useState, type RefObject } from 'react'
import { ChevronRight, KeyRound, RefreshCw, Search } from 'lucide-react'
import { Button } from '../ui'
import type { ClassroomClass, ClassroomStudent } from './contracts'
import { ConfirmDialog } from './ConfirmDialog'
import { PasswordField } from './PasswordField'
import { TextInput } from './fields'
import { generateTemporaryPassword, readForm, USERNAME_PATTERN, USERNAME_RULE } from './panelShared'
import { EmptyState } from './WorldsView'

export type StudentStatus = 'active' | 'reset' | 'suspended'
export const studentStatus = (student: ClassroomStudent): StudentStatus => student.suspended ? 'suspended' : student.resetRequired ? 'reset' : 'active'
const STATUS_LABELS: Record<StudentStatus, string> = { active: 'Active', reset: 'Password change required', suspended: 'Suspended' }

export function StudentStatusChip({ student }: { student: ClassroomStudent }) {
  const status = studentStatus(student)
  return <span className={`classroom-status classroom-status-${status}`}><span className="classroom-status-dot" aria-hidden="true" />{STATUS_LABELS[status]}</span>
}

type RosterProps = {
  currentClass: ClassroomClass
  students: ClassroomStudent[]
  loading: boolean
  search: string
  busy: boolean
  onSearch: (value: string) => void
  onManage: (student: ClassroomStudent) => void
  onViewCodes: () => void
}

/** Board 13: roster name, username and status per student; no grading or analytics. */
export function RosterSection({ currentClass, students, loading, search, busy, onSearch, onManage, onViewCodes }: RosterProps) {
  const query = search.trim().toLocaleLowerCase()
  const visible = students.filter(student => `${student.rosterName} ${student.username}`.toLocaleLowerCase().includes(query))
  return <section aria-label="Class students" className="classroom-section">
    <div className="classroom-section-heading">
      <div><h3 className="classroom-section-title">Students</h3><p>{loading ? 'Loading students…' : `${students.length} ${students.length === 1 ? 'student' : 'students'} in ${currentClass.name}. Manage usernames, passwords, and access.`}</p></div>
      {students.length > 0 && <Button variant="quiet" size="sm" icon={<KeyRound size={16} />} onClick={onViewCodes}>View class codes</Button>}
    </div>
    {loading ? <p role="status" className="classroom-loading">Loading students…</p> : students.length > 0 ? <>
      <TextInput label="Find a student" id="classroom-student-search" className="classroom-search" type="search" icon={<Search size={18} />} value={search} onChange={event => onSearch(event.target.value)} placeholder="Name or username" autoComplete="off" />
      <div className="classroom-roster" role="list" aria-label="Students in this class">
        <div className="classroom-roster-head" aria-hidden="true"><span>Roster name</span><span>Username</span><span>Status</span><span /></div>
        {visible.map(student => <div className="classroom-roster-row" role="listitem" key={student.id}>
          <strong>{student.rosterName}</strong>
          <span className="classroom-roster-username">{student.username}</span>
          <StudentStatusChip student={student} />
          <Button variant="secondary" size="sm" trailingIcon={<ChevronRight size={16} />} disabled={busy} aria-label={`Manage ${student.rosterName}`} onClick={() => onManage(student)}>Manage</Button>
        </div>)}
      </div>
      {!visible.length && <p className="classroom-help" role="status">No students match “{search.trim()}”.</p>}
    </> : <EmptyState title="Ready for your students?" message={currentClass.enrollmentOpen ? `Give them your enrollment code to join ${currentClass.name}.` : 'Open enrollment in Class settings when you’re ready for students to join.'}>
      <Button variant="secondary" size="sm" icon={<KeyRound size={16} />} onClick={onViewCodes}>View class codes</Button>
    </EmptyState>}
  </section>
}

type ManageProps = {
  student: ClassroomStudent
  busy: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  onSubmit: (values: { username: string; rosterName: string; temporaryPassword?: string }) => void
  onToggleSuspend: () => void
  onCancel: () => void
}

/** Board 13 right: account editing, temporary password with Generate, and the suspend/reactivate boundary. */
export function ManageStudentForm({ student, busy, headingRef, onSubmit, onToggleSuspend, onCancel }: ManageProps) {
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  return <form className="classroom-card classroom-form" onSubmit={event => { const data = readForm(event); onSubmit({ username: data.username, rosterName: data.rosterName, ...(data.temporaryPassword ? { temporaryPassword: data.temporaryPassword } : {}) }) }}>
    <div className="classroom-detail-heading"><div><small className="classroom-eyebrow">Manage student</small><h3 ref={headingRef} tabIndex={-1}>{student.rosterName}</h3></div><StudentStatusChip student={student} /></div>
    <div className="classroom-form-grid">
      <TextInput label="Username" id="classroom-manage-username" name="username" defaultValue={student.username} required minLength={3} maxLength={24} pattern={USERNAME_PATTERN} title={USERNAME_RULE} autoCapitalize="none" spellCheck={false} autoComplete="off" />
      <TextInput label="Roster name" id="classroom-manage-roster" name="rosterName" defaultValue={student.rosterName} required maxLength={80} autoComplete="off" />
    </div>
    <PasswordField label="Temporary password" name="temporaryPassword" autoComplete="new-password" minLength={8} maxLength={128} placeholder="Leave blank to keep the current password" hint="Setting this signs the student out and asks them to choose a new password." />
    <div>
      <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} disabled={busy} onClick={event => {
        const input = event.currentTarget.form?.elements.namedItem('temporaryPassword')
        if (input instanceof HTMLInputElement) { input.value = generateTemporaryPassword(); input.focus() }
      }}>Generate temporary password</Button>
    </div>
    <div className="classroom-actions"><Button type="submit" variant="primary" loading={busy} loadingLabel="Saving…">Save changes</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
    <div className="classroom-access-row">
      <div><div className="classroom-access-title"><strong>Classroom access</strong></div><small>{student.suspended ? 'This student cannot open classroom features. Their saved work is kept.' : 'Suspending access keeps saved work.'}</small></div>
      {student.suspended
        ? <Button variant="secondary" size="sm" disabled={busy} onClick={onToggleSuspend}>Reactivate access</Button>
        : <Button variant="secondary" size="sm" className="classroom-button-danger" disabled={busy} onClick={() => setConfirmSuspend(true)}>Suspend access</Button>}
    </div>
    <ConfirmDialog open={confirmSuspend && !student.suspended} title={`Suspend ${student.rosterName}?`} description="Classroom access pauses until you reactivate it." confirmLabel="Suspend now" cancelLabel="Keep access" busy={busy} onCancel={() => setConfirmSuspend(false)} onConfirm={() => { setConfirmSuspend(false); onToggleSuspend() }}>
      <p>{student.rosterName} will be signed out of shared worlds right away. Their saved worlds and contributions stay.</p>
    </ConfirmDialog>
  </form>
}
