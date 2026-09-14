import { useState, type RefObject } from 'react'
import type { ClassroomCheckpoint, ClassroomStudent, ClassroomWorld, ClassroomWorldMember } from './contracts'
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

/** Board 14 right: membership for group worlds and checkpoint restore, each with an explicit confirmation step. */
export function WorldControls({ world, teacher, members, availableStudents, checkpoints, busy, headingRef, onBack, onRemoveMember, onAddMember, onRestore }: Props) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const grouped = teacher && world.kind === 'group'
  return <section className="classroom-card" aria-labelledby="classroom-world-controls-title">
    <button type="button" className="classroom-link" disabled={busy} onClick={onBack}>← Back to worlds</button>
    <div className="classroom-detail-heading"><div><small className="classroom-world-kind">{world.kind === 'personal' ? 'Manage world' : 'Shared world controls'}</small><h3 id="classroom-world-controls-title" ref={headingRef} tabIndex={-1}>{world.title}</h3></div><span className="classroom-status classroom-status-kind">{KIND_LABEL[world.kind]}</span></div>
    {teacher && world.kind === 'class' && <p className="classroom-help">Whole-class worlds include every active student in the class. Use an assigned group to choose members.</p>}
    {grouped && <>
      <h4>Group members</h4>
      {members.length ? <div className="classroom-roster">{members.map(member => <div className="classroom-row" key={member.id}>
        <span><strong>{member.rosterName || member.username}</strong>{member.rosterName && <small>{member.username}</small>}</span>
        {removing === member.id
          ? <span className="classroom-confirm" role="group" aria-label={`Confirm removing ${member.rosterName || member.username}`}><button type="button" className="classroom-danger" disabled={busy} onClick={() => { setRemoving(null); onRemoveMember(member) }}>Remove now</button><button type="button" disabled={busy} onClick={() => setRemoving(null)}>Keep</button></span>
          : <button type="button" className="classroom-danger-outline" disabled={busy} onClick={() => setRemoving(member.id)}>Remove from group</button>}
      </div>)}</div> : <p className="classroom-help">Add students so they can find and join this world in My Class.</p>}
      {availableStudents.length > 0 ? <form className="classroom-inline" onSubmit={event => onAddMember(readForm(event).userId)}>
        <div className="classroom-field"><label htmlFor="classroom-add-member">Add student</label><select id="classroom-add-member" name="userId" required>{availableStudents.map(student => <option key={student.id} value={student.id}>{student.rosterName} ({student.username})</option>)}</select></div>
        <button disabled={busy}>Add to group</button>
      </form> : <p className="classroom-help">Every student in this class is already a member.</p>}
      <small>Removing a member keeps their contributions.</small>
    </>}
    <h4>Restore world</h4>
    <p className="classroom-help">Choose an earlier save. A checkpoint of the current version is kept first.</p>
    {checkpoints.length ? <form onSubmit={event => { const id = readForm(event).checkpointId; if (restoring === id) { setRestoring(null); onRestore(id) } else setRestoring(id) }}>
      <div className="classroom-field"><label htmlFor="classroom-checkpoint">Checkpoint</label><select id="classroom-checkpoint" name="checkpointId" disabled={busy} onChange={() => setRestoring(null)}>{checkpoints.map(checkpoint => <option key={checkpoint.id} value={checkpoint.id}>Revision {checkpoint.revision} · {new Date(checkpoint.createdAt).toLocaleString()}</option>)}</select></div>
      {restoring && <p className="classroom-warning" role="status">Restoring replaces the current version for everyone in this world. The current version is kept as a checkpoint first, so you can come back to it.</p>}
      <div className="classroom-actions"><button className={restoring ? 'classroom-danger' : 'classroom-primary'} disabled={busy}>{restoring ? 'Restore now' : 'Restore selected checkpoint'}</button>{restoring && <button type="button" disabled={busy} onClick={() => setRestoring(null)}>Cancel</button>}</div>
    </form> : <p className="classroom-help">No earlier checkpoints yet. They’ll appear as this world is saved.</p>}
  </section>
}
