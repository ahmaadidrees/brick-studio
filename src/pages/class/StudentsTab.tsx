import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../../ui'
import type { ClassroomStudent } from '../../classroom/contracts'
import { ConfirmDialog } from '../../classroom/ConfirmDialog'
import { RosterSection } from '../../classroom/RosterView'
import { ClassCodeCard, PrintableCode } from './ClassCodeCard'
import { classCode, worldRoomHref, type ClassPageClass, type ClassPageWorld } from './classPageData'

type Props = {
  currentClass: ClassPageClass
  students: ClassroomStudent[]
  studentsLoading: boolean
  search: string
  busy: boolean
  /** Personal worlds students shared with this class, hidden ones included. */
  shared: ClassPageWorld[]
  onSearch: (value: string) => void
  onManageStudent: (student: ClassroomStudent, focus?: 'password') => void
  onToggleHidden: (world: ClassPageWorld) => void
  onToggleSuspend: (student: ClassroomStudent) => void
  onViewSettings: () => void
}

/** "Look only" / "Build together" reads the sharing choice the student made. */
function ShareChip({ world }: { world: ClassPageWorld }) {
  return <span className={`class-chip class-chip-${world.canEdit ? 'edit' : 'view'}`}>{world.canEdit ? 'Build together' : 'Look only'}</span>
}

/** Code card, what students shared, then the roster. */
export function StudentsTab({ currentClass, students, studentsLoading, search, busy, shared, onSearch, onManageStudent, onToggleHidden, onToggleSuspend, onViewSettings }: Props) {
  const code = classCode(currentClass)
  const sharingOff = currentClass.studentsCanShare === false
  const [suspendTarget, setSuspendTarget] = useState<ClassroomStudent | null>(null)
  return <>
    <ClassCodeCard className={currentClass.name} code={code} projectorHref="/class/projector" />
    <PrintableCode className={currentClass.name} code={code} />
    <section className="class-section" aria-labelledby="class-shared-title">
      <div className="class-section-head">
        <h2 id="class-shared-title" className="class-section-title">Shared by students</h2>
        <span className={`class-chip class-chip-${sharingOff ? 'off' : 'on'}`}>Students can share: {sharingOff ? 'Off' : 'On'}</span>
      </div>
      {shared.length
        ? <ul className="class-card-row" aria-label="Worlds students shared with this class">
          {shared.map(world => <li key={world.id} className={`class-card${world.hiddenByTeacher ? ' class-card-hidden' : ''}`}>
            <div className="class-card-head">
              <strong className="class-card-title">{world.title}</strong>
              <ShareChip world={world} />
            </div>
            <p className="class-card-owner">{world.ownerName || 'A student'}{world.hiddenByTeacher && ' · Hidden from the class'}</p>
            <div className="class-card-actions">
              <Button variant="secondary" size="sm" href={worldRoomHref(world)}>Visit</Button>
              <Button variant="quiet" size="sm" icon={world.hiddenByTeacher ? <Eye size={16} /> : <EyeOff size={16} />} disabled={busy} onClick={() => onToggleHidden(world)}>
                {world.hiddenByTeacher ? 'Show again' : 'Hide from class'}
              </Button>
            </div>
          </li>)}
        </ul>
        : <p className="class-help">{sharingOff
          ? 'Sharing is off for this class. Turn it on in Settings so students can show their own builds.'
          : 'Nothing shared yet. When a student shares a build with the class it appears here.'}</p>}
    </section>
    <RosterSection
      currentClass={currentClass}
      students={students}
      loading={studentsLoading}
      search={search}
      busy={busy}
      onSearch={onSearch}
      onManage={onManageStudent}
      onViewCodes={onViewSettings}
      actions="menu"
      onToggleSuspend={setSuspendTarget}
    />
    <ConfirmDialog
      open={suspendTarget !== null}
      title={suspendTarget?.suspended ? `Reactivate ${suspendTarget.rosterName}?` : `Suspend ${suspendTarget?.rosterName}?`}
      description={suspendTarget?.suspended ? 'They can use classroom features again right away.' : 'Classroom access pauses until you reactivate it.'}
      confirmLabel={suspendTarget?.suspended ? 'Reactivate' : 'Suspend now'}
      cancelLabel="Cancel"
      destructive={!suspendTarget?.suspended}
      busy={busy}
      onCancel={() => setSuspendTarget(null)}
      onConfirm={() => { if (suspendTarget) onToggleSuspend(suspendTarget); setSuspendTarget(null) }}
    >
      {suspendTarget && !suspendTarget.suspended && <p>{suspendTarget.rosterName} will be signed out of shared worlds right away. Their saved worlds and contributions stay.</p>}
    </ConfirmDialog>
  </>
}
