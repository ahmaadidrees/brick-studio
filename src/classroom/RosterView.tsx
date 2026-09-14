import { useState, type RefObject } from 'react'
import { Users } from 'lucide-react'
import type { ClassroomClass, ClassroomStudent } from './contracts'
import { PasswordField } from './PasswordField'
import { generateTemporaryPassword, readForm, USERNAME_PATTERN, USERNAME_RULE } from './panelShared'

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
  return <section aria-label="Class students">
    <div className="classroom-section-heading"><div><h3 className="classroom-section-title">Students</h3><p>Manage usernames, passwords, and access.</p></div>{students.length > 0 && <button type="button" className="classroom-link" onClick={onViewCodes}>View class codes</button>}</div>
    {loading ? <p role="status">Loading students…</p> : students.length > 0 ? <>
      <div className="classroom-field classroom-search"><label htmlFor="classroom-student-search">Find a student</label><input id="classroom-student-search" type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Name or username" autoComplete="off" /></div>
      <div className="classroom-roster" role="list" aria-label="Students in this class">
        <div className="classroom-roster-head" aria-hidden="true"><span>Roster name</span><span>Username</span><span>Status</span><span /></div>
        {visible.map(student => <div className="classroom-row classroom-roster-row" role="listitem" key={student.id}>
          <strong>{student.rosterName}</strong>
          <span className="classroom-roster-username">{student.username}</span>
          <StudentStatusChip student={student} />
          <button type="button" disabled={busy} aria-label={`Manage ${student.rosterName}`} onClick={() => onManage(student)}>Manage</button>
        </div>)}
      </div>
      {!visible.length && <p className="classroom-help" role="status">No students match “{search.trim()}”.</p>}
    </> : <div className="classroom-empty"><Users size={28} aria-hidden="true" /><h3>Ready for your students?</h3><p>{currentClass.enrollmentOpen ? `Give them your enrollment code to join ${currentClass.name}.` : 'Open enrollment in Class settings when you’re ready for students to join.'}</p><button type="button" onClick={onViewCodes}>View class codes</button></div>}
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
  return <form className="classroom-card" onSubmit={event => { const data = readForm(event); onSubmit({ username: data.username, rosterName: data.rosterName, ...(data.temporaryPassword ? { temporaryPassword: data.temporaryPassword } : {}) }) }}>
    <div className="classroom-detail-heading"><div><small className="classroom-world-kind">Manage student</small><h3 ref={headingRef} tabIndex={-1}>{student.rosterName}</h3></div><StudentStatusChip student={student} /></div>
    <div className="classroom-form-grid">
      <div className="classroom-field"><label htmlFor="classroom-manage-username">Username</label><input id="classroom-manage-username" name="username" defaultValue={student.username} required minLength={3} maxLength={24} pattern={USERNAME_PATTERN} title={USERNAME_RULE} autoCapitalize="none" spellCheck={false} autoComplete="off" /></div>
      <div className="classroom-field"><label htmlFor="classroom-manage-roster">Roster name</label><input id="classroom-manage-roster" name="rosterName" defaultValue={student.rosterName} required maxLength={80} autoComplete="off" /></div>
    </div>
    <PasswordField label="Temporary password" name="temporaryPassword" autoComplete="new-password" minLength={8} maxLength={128} placeholder="Leave blank to keep the current password" hint="Setting this signs the student out and asks them to choose a new password." />
    <button type="button" className="classroom-generate" disabled={busy} onClick={event => {
      const input = event.currentTarget.form?.elements.namedItem('temporaryPassword')
      if (input instanceof HTMLInputElement) { input.value = generateTemporaryPassword(); input.focus() }
    }}>Generate temporary password</button>
    <div className="classroom-actions"><button className="classroom-primary" disabled={busy}>Save changes</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    <div className="classroom-access-row">
      <div><strong>Classroom access</strong><small>{student.suspended ? 'This student cannot open classroom features. Their saved work is kept.' : 'Suspending access keeps saved work.'}</small></div>
      {student.suspended
        ? <button type="button" disabled={busy} onClick={onToggleSuspend}>Reactivate access</button>
        : confirmSuspend
          ? <span className="classroom-confirm" role="group" aria-label="Confirm suspension"><button type="button" className="classroom-danger" disabled={busy} onClick={() => { setConfirmSuspend(false); onToggleSuspend() }}>Suspend now</button><button type="button" disabled={busy} onClick={() => setConfirmSuspend(false)}>Keep access</button></span>
          : <button type="button" className="classroom-danger-outline" disabled={busy} onClick={() => setConfirmSuspend(true)}>Suspend access</button>}
    </div>
    {confirmSuspend && !student.suspended && <p className="classroom-warning" role="status">{student.rosterName} will be signed out of shared worlds right away. Their saved worlds and contributions stay.</p>}
  </form>
}
