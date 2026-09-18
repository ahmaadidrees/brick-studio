import { useState, type RefObject } from 'react'
import { Settings2 } from 'lucide-react'
import { Button, SegmentedControl } from '../../ui'
import type { ClassroomCheckpoint, ClassroomStudent, ClassroomWorldMember } from '../../classroom/contracts'
import { TextInput } from '../../classroom/fields'
import { readForm } from '../../classroom/panelShared'
import { WorldControls } from '../../classroom/GroupControls'
import { worldRoomHref, type ClassPageClass, type ClassPageWorld } from './classPageData'

type Props = {
  currentClass: ClassPageClass
  worlds: ClassPageWorld[]
  students: ClassroomStudent[]
  busy: boolean
  selected: ClassPageWorld | null
  members: ClassroomWorldMember[]
  checkpoints: ClassroomCheckpoint[]
  headingRef: RefObject<HTMLHeadingElement | null>
  onCreate: (title: string, kind: 'class' | 'group') => void
  onSelect: (world: ClassPageWorld) => void
  onBack: () => void
  onAddMember: (userId: string) => void
  onRemoveMember: (member: ClassroomWorldMember) => void
  onRestore: (checkpointId: string) => void
}

const KIND_LABEL: Record<'class' | 'group', string> = { class: 'Whole class', group: 'Assigned group' }

/** Worlds the teacher started, plus the form that starts another one. */
export function WorldsTab({ currentClass, worlds, students, busy, selected, members, checkpoints, headingRef, onCreate, onSelect, onBack, onAddMember, onRemoveMember, onRestore }: Props) {
  const [kind, setKind] = useState<'class' | 'group'>('class')
  const available = students.filter(student => !members.some(member => member.id === student.id))
  if (selected) return <WorldControls
    world={selected}
    teacher
    members={members}
    availableStudents={available}
    checkpoints={checkpoints}
    busy={busy}
    headingRef={headingRef}
    onBack={onBack}
    onRemoveMember={onRemoveMember}
    onAddMember={onAddMember}
    onRestore={onRestore}
  />
  return <>
    <section className="class-section" aria-labelledby="class-worlds-title">
      <div className="class-section-head">
        <h2 id="class-worlds-title" className="class-section-title">Worlds you started</h2>
      </div>
      {!currentClass.collaborationOpen && <p className="class-help class-warning" role="status">Collaboration is closed to students. You can still open these worlds to review and manage them.</p>}
      {worlds.length
        ? <ul className="class-card-row" aria-label="Worlds you started for this class">
          {worlds.map(world => <li key={world.id} className="class-card">
            <div className="class-card-head">
              <strong className="class-card-title">{world.title}</strong>
              <span className={`class-chip class-chip-${world.kind}`}>{KIND_LABEL[world.kind === 'group' ? 'group' : 'class']}</span>
            </div>
            <p className="class-card-owner">Saved {new Date(world.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · revision {world.revision}</p>
            <div className="class-card-actions">
              <Button variant="secondary" size="sm" href={worldRoomHref(world)}>Join</Button>
              <Button variant="quiet" size="sm" icon={<Settings2 size={16} />} disabled={busy} aria-label={`World controls for ${world.title}`} onClick={() => onSelect(world)}>World controls</Button>
            </div>
          </li>)}
        </ul>
        : <p className="class-help">No shared worlds yet. Start one below and students will find it in My worlds.</p>}
    </section>
    <form className="class-section class-form" aria-labelledby="class-start-world-title" onSubmit={event => onCreate(readForm(event).title, kind)}>
      <h2 id="class-start-world-title" className="class-section-title">Start a shared world</h2>
      <TextInput label="Shared world name" id="class-shared-title" name="title" required maxLength={80} autoComplete="off" />
      <SegmentedControl<'class' | 'group'> label="Who can build in it" showLabel value={kind} onChange={setKind} options={[{ value: 'class', label: 'Whole class' }, { value: 'group', label: 'Assigned group' }]} />
      <p className="class-help">It starts empty. Open it to build, or let students fill it. For a group, add students in World controls afterwards.</p>
      <div className="class-actions"><Button type="submit" variant="primary" loading={busy} loadingLabel="Starting…">Start a shared world</Button></div>
    </form>
  </>
}
