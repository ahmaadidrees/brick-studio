import { ArrowLeft, CloudCheck, Play, Save } from 'lucide-react'
import { BrickMark } from '../brand'
import { Button } from '../ui'
import type { ClassroomWorld } from './contracts'
import { TextInput } from './fields'
import { formatSavedDate, readForm } from './panelShared'
import { SaveBuildForm } from './RecoveryViews'

type WorldsProps = {
  worlds: ClassroomWorld[]
  busy: boolean
  showSave: boolean
  saveTitle: string
  saveDuplicate: boolean
  onToggleSave: () => void
  onSaveTitleChange: (title: string) => void
  onSave: () => void
  onBackToBuilding: () => void
  onOpen: (world: ClassroomWorld) => void
  onRename: (world: ClassroomWorld) => void
  onDuplicate: (world: ClassroomWorld) => void
  onManage: (world: ClassroomWorld) => void
}

/** Board 05 left: personal worlds saved to the account. No thumbnails exist, so cards use the mark. */
export function WorldsView({ worlds, busy, showSave, saveTitle, saveDuplicate, onToggleSave, onSaveTitleChange, onSave, onBackToBuilding, onOpen, onRename, onDuplicate, onManage }: WorldsProps) {
  return <section aria-label="Your worlds" className="classroom-section">
    <div className="classroom-actions classroom-actions-lead">
      <Button variant="primary" icon={<Save size={18} />} disabled={busy} aria-expanded={showSave} aria-controls="classroom-save-form" onClick={onToggleSave}>Save current build</Button>
      <Button variant="secondary" icon={<ArrowLeft size={18} />} disabled={busy} onClick={onBackToBuilding}>Back to building</Button>
    </div>
    {showSave && <div id="classroom-save-form"><SaveBuildForm title={saveTitle} busy={busy} duplicate={saveDuplicate} onTitleChange={onSaveTitleChange} onSubmit={onSave} onKeepBuilding={onBackToBuilding} /></div>}
    <WorldList worlds={worlds} busy={busy} emptyTitle="Your first world starts here." emptyMessage="Save your current build to return to it on another day or device." onOpen={onOpen} onRename={onRename} onDuplicate={onDuplicate} onManage={onManage} />
  </section>
}

export function RenameWorldForm({ world, busy, onSubmit, onCancel, headingRef }: { world: ClassroomWorld; busy: boolean; onSubmit: (title: string) => void; onCancel: () => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return <form className="classroom-card classroom-form" onSubmit={event => onSubmit(readForm(event).title)}>
    <div className="classroom-detail-heading"><div><small className="classroom-eyebrow">Rename world</small><h3 ref={headingRef} tabIndex={-1}>{world.title}</h3></div></div>
    <TextInput label="World name" id="classroom-rename-title" name="title" defaultValue={world.title} required maxLength={80} autoComplete="off" />
    <div className="classroom-actions"><Button type="submit" variant="primary" loading={busy} loadingLabel="Saving…">Save name</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>
}

export function EmptyState({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return <div className="classroom-empty">
    <BrickMark size={44} variant="outline" title={null} className="classroom-empty-mark" />
    <div className="classroom-empty-text"><h3>{title}</h3><p>{message}</p>{children}</div>
  </div>
}

type ListProps = {
  worlds: ClassroomWorld[]
  busy: boolean
  joinDisabled?: boolean
  emptyTitle: string
  emptyMessage: string
  onOpen: (world: ClassroomWorld) => void
  onRename?: (world: ClassroomWorld) => void
  onDuplicate?: (world: ClassroomWorld) => void
  onManage?: (world: ClassroomWorld) => void
}

const KIND_LABEL: Record<ClassroomWorld['kind'], string> = { personal: 'Your world', group: 'Assigned group', class: 'Whole class' }

export function WorldList({ worlds, busy, joinDisabled, emptyTitle, emptyMessage, onOpen, onRename, onDuplicate, onManage }: ListProps) {
  if (!worlds.length) return <EmptyState title={emptyTitle} message={emptyMessage} />
  return <div className="classroom-worlds">{[...worlds].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(world => <article className="classroom-world-card" key={world.id} aria-label={world.title}>
    <div className={`classroom-world-art classroom-world-art-${world.kind}`} aria-hidden="true"><BrickMark size={44} variant={world.kind === 'personal' ? 'color' : 'mono'} title={null} /></div>
    <div className="classroom-world-body">
      <div className="classroom-world-heading"><h3>{world.title}</h3><span className={`classroom-chip classroom-chip-${world.kind}`}>{KIND_LABEL[world.kind]}</span></div>
      <small className="classroom-world-saved"><CloudCheck size={14} aria-hidden="true" /> {world.kind === 'personal' ? 'Saved to your account' : 'Saved to the class'} · <time dateTime={world.updatedAt} title={new Date(world.updatedAt).toLocaleString()}>{formatSavedDate(world.updatedAt)}</time></small>
    </div>
    <div className="classroom-actions classroom-world-actions">
      <Button variant="primary" size="sm" icon={<Play size={16} />} disabled={busy || joinDisabled} onClick={() => onOpen(world)}>{world.kind === 'personal' ? 'Open' : 'Join world'}</Button>
      {onRename && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRename(world)}>Rename</Button>}
      {onDuplicate && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDuplicate(world)}>Duplicate</Button>}
      {onManage && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onManage(world)}>{world.kind === 'personal' ? 'Manage' : 'World controls'}</Button>}
    </div>
  </article>)}</div>
}
