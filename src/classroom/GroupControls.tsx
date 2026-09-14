import { useState, type RefObject } from 'react'
import { ArrowLeft, History, UserRoundPlus } from 'lucide-react'
import { Button } from '../ui'
import type { ClassroomCheckpoint, ClassroomStudent, ClassroomWorld, ClassroomWorldMember } from './contracts'
import { ConfirmDialog } from './ConfirmDialog'
import { SelectInput } from './fields'
import { readForm } from './panelShared'

type Props = {
  world: ClassroomWorld
  teacher: boolean
  members: ClassroomWorldMember[]
  availableStudents: ClassroomStudent[]
  checkpoints: ClassroomCheckpoint[]
  busy: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onRemoveMember: (member: ClassroomWorldMember) => void
  onAddMember: (userId: string) => void
  onRestore: (checkpointId: string) => void
}

const KIND_LABEL: Record<ClassroomWorld['kind'], string> = { personal: 'Your world', group: 'Assigned group', class: 'Whole class' }
const memberName = (member: ClassroomWorldMember) => member.rosterName || member.username

/** Board 14 right: membership for group worlds and checkpoint restore, each behind an explicit confirmation. */
export function WorldControls({ world, teacher, members, availableStudents, checkpoints, busy, headingRef, onBack, onRemoveMember, onAddMember, onRestore }: Props) {
  const [removing, setRemoving] = useState<ClassroomWorldMember | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const grouped = teacher && world.kind === 'group'
  const restoringCheckpoint = checkpoints.find(checkpoint => checkpoint.id === restoring)
  return <section className="classroom-card classroom-section" aria-labelledby="classroom-world-controls-title">
    <div><Button variant="quiet" size="sm" icon={<ArrowLeft size={16} />} disabled={busy} onClick={onBack}>Back to worlds</Button></div>
    <div className="classroom-detail-heading"><div><small className="classroom-eyebrow">{world.kind === 'personal' ? 'Manage world' : 'Shared world controls'}</small><h3 id="classroom-world-controls-title" ref={headingRef} tabIndex={-1}>{world.title}</h3></div><span className={`classroom-chip classroom-chip-${world.kind}`}>{KIND_LABEL[world.kind]}</span></div>
    {teacher && world.kind === 'class' && <p className="classroom-help">Whole-class worlds include every active student in the class. Use an assigned group to choose members.</p>}
    {grouped && <div className="classroom-subsection">
      <h4>Group members</h4>
      {members.length ? <div className="classroom-roster" role="list" aria-label="Group members">{members.map(member => <div className="classroom-row" role="listitem" key={member.id}>
        <span><strong>{memberName(member)}</strong>{member.rosterName && <small className="classroom-roster-username">{member.username}</small>}</span>
        <Button variant="secondary" size="sm" className="classroom-button-danger" disabled={busy} onClick={() => setRemoving(member)}>Remove from group</Button>
      </div>)}</div> : <p className="classroom-help">Add students so they can find and join this world in My Class.</p>}
      {availableStudents.length > 0 ? <form className="classroom-inline" onSubmit={event => onAddMember(readForm(event).userId)}>
        <SelectInput label="Add student" id="classroom-add-member" name="userId" required>{availableStudents.map(student => <option key={student.id} value={student.id}>{student.rosterName} ({student.username})</option>)}</SelectInput>
        <Button type="submit" variant="secondary" icon={<UserRoundPlus size={16} />} loading={busy} loadingLabel="Adding…">Add to group</Button>
      </form> : <p className="classroom-help">Every student in this class is already a member.</p>}
      <p className="classroom-help">Removing a member keeps their contributions.</p>
      <ConfirmDialog open={removing !== null} title={removing ? `Remove ${memberName(removing)} from this group?` : 'Remove from group?'} description="They lose access to this world until added again." confirmLabel="Remove now" cancelLabel="Keep" busy={busy} onCancel={() => setRemoving(null)} onConfirm={() => { const member = removing; setRemoving(null); if (member) onRemoveMember(member) }}>
        <p>Their bricks stay in the world. Their own saved worlds are not affected.</p>
      </ConfirmDialog>
    </div>}
    <div className="classroom-subsection">
      <h4>Restore world</h4>
      <p className="classroom-help">Choose an earlier save. A checkpoint of the current version is kept first.</p>
      {checkpoints.length ? <form className="classroom-inline" onSubmit={event => setRestoring(readForm(event).checkpointId)}>
        <SelectInput label="Checkpoint" id="classroom-checkpoint" name="checkpointId" disabled={busy}>{checkpoints.map(checkpoint => <option key={checkpoint.id} value={checkpoint.id}>Revision {checkpoint.revision} · {new Date(checkpoint.createdAt).toLocaleString()}</option>)}</SelectInput>
        <Button type="submit" variant="primary" icon={<History size={16} />} disabled={busy}>Restore selected checkpoint</Button>
      </form> : <p className="classroom-help">No earlier checkpoints yet. They’ll appear as this world is saved.</p>}
      <ConfirmDialog open={restoring !== null} title={restoringCheckpoint ? `Restore revision ${restoringCheckpoint.revision}?` : 'Restore this checkpoint?'} description={`Everyone in “${world.title}” will see the restored version.`} confirmLabel="Restore now" busy={busy} onCancel={() => setRestoring(null)} onConfirm={() => { const id = restoring; setRestoring(null); if (id) onRestore(id) }}>
        <p>Restoring replaces the current version for everyone in this world. The current version is kept as a checkpoint first, so you can come back to it.</p>
      </ConfirmDialog>
    </div>
  </section>
}
