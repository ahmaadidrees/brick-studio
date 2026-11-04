import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../../ui'
import type { ClassroomStudent } from '../../classroom/contracts'
import { ConfirmDialog } from '../../classroom/ConfirmDialog'
import { RosterSection } from '../../classroom/RosterView'
import { ClassCodeCard, ClassCodeStrip, PrintableCode } from './ClassCodeCard'
import { classCode, type ClassPageClass, type ClassPageWorld } from './classPageData'
import { WorldOpenButtons } from './WorldOpenButtons'

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
}

/** "Look only" / "Build together" reads the sharing choice the student made; a quiet invite adds "3 classmates". */
function ShareChip({ world }: { world: ClassPageWorld }) {
  const count = world.visibility === 'members' ? world.members?.length ?? 0 : null
  return <>
    {world.format === 'hackable'
      ? <span className="class-chip class-chip-edit">Play together</span>
      : <span className={`class-chip class-chip-${world.canEdit ? 'edit' : 'view'}`}>{world.canEdit ? 'Build together' : 'Look only'}</span>}
    {count !== null && <span className="class-chip class-chip-group">{count} {count === 1 ? 'classmate' : 'classmates'}</span>}
  </>
}

/**
 * The class code, what students shared, then the roster. Before anyone has joined the code card is full size; once
 * the class has students it folds to one line so the roster isn't under the QR, and opens again on request.
 */
export function StudentsTab({ currentClass, students, studentsLoading, search, busy, shared, onSearch, onManageStudent, onToggleHidden, onToggleSuspend }: Props) {
  const code = classCode(currentClass)
  const sharingOff = currentClass.studentsCanShare === false
  const [suspendTarget, setSuspendTarget] = useState<ClassroomStudent | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const focusCard = useRef(false)
  const folded = !codeOpen && (studentsLoading || students.length > 0)
  useEffect(() => { setCodeOpen(false) }, [currentClass.id])
  useEffect(() => {
    if (!codeOpen || !focusCard.current) return
    focusCard.current = false
    cardRef.current?.scrollIntoView?.({ block: 'nearest' })
    cardRef.current?.focus({ preventScroll: true })
  }, [codeOpen])
  const showCode = () => { focusCard.current = true; setCodeOpen(true) }
  return <>
    {folded
      ? <ClassCodeStrip code={code} projectorHref="/class/projector" onExpand={showCode} />
      : <ClassCodeCard className={currentClass.name} code={code} projectorHref="/class/projector" cardRef={cardRef} onFold={students.length ? () => setCodeOpen(false) : undefined} />}
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
              <WorldOpenButtons world={world} />
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
      onViewCodes={showCode}
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
