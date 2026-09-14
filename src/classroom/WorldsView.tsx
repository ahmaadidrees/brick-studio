import { Blocks, CloudCheck, Users } from 'lucide-react'
import type { ClassroomWorld } from './contracts'
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

/** Board 05 left: personal worlds saved to the account. No thumbnails exist, so cards use the mark/icon. */
export function WorldsView({ worlds, busy, showSave, saveTitle, saveDuplicate, onToggleSave, onSaveTitleChange, onSave, onBackToBuilding, onOpen, onRename, onDuplicate, onManage }: WorldsProps) {
  return <section aria-label="Your worlds">
    <div className="classroom-section-heading">
      <div><h3 className="classroom-section-title">Your worlds</h3><p>Save your builds, pick up where you left off, and keep creating.</p></div>
      <div className="classroom-actions classroom-actions-tight">
        <button type="button" className="classroom-primary" disabled={busy} aria-expanded={showSave} aria-controls="classroom-save-form" onClick={onToggleSave}>Save current build</button>
        <button type="button" disabled={busy} onClick={onBackToBuilding}>Back to building</button>
      </div>
    </div>
    {showSave && <div id="classroom-save-form"><SaveBuildForm title={saveTitle} busy={busy} duplicate={saveDuplicate} onTitleChange={onSaveTitleChange} onSubmit={onSave} onKeepBuilding={onBackToBuilding} /></div>}
    <WorldList worlds={worlds} busy={busy} emptyTitle="Your first world starts here." emptyMessage="Save your current build to return to it on another day or device." onOpen={onOpen} onRename={onRename} onDuplicate={onDuplicate} onManage={onManage} />
  </section>
}

export function RenameWorldForm({ world, busy, onSubmit, onCancel, headingRef }: { world: ClassroomWorld; busy: boolean; onSubmit: (title: string) => void; onCancel: () => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return <form className="classroom-card" onSubmit={event => onSubmit(readForm(event).title)}>
    <h3 ref={headingRef} tabIndex={-1}>Rename world</h3>
    <div className="classroom-field"><label htmlFor="classroom-rename-title">World name</label><input id="classroom-rename-title" name="title" defaultValue={world.title} required maxLength={80} autoComplete="off" /></div>
    <div className="classroom-actions"><button className="classroom-primary" disabled={busy}>Save name</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>
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

export function WorldList({ worlds, busy, joinDisabled, emptyTitle, emptyMessage, onOpen, onRename, onDuplicate, onManage }: ListProps) {
  if (!worlds.length) return <div className="classroom-worlds"><div className="classroom-empty"><Blocks size={30} aria-hidden="true" /><h3>{emptyTitle}</h3><p>{emptyMessage}</p></div></div>
  return <div className="classroom-worlds">{[...worlds].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(world => <article className="classroom-card classroom-world-card" key={world.id} aria-label={world.title}>
    <div className="classroom-world-heading">
      <span className={`classroom-world-icon classroom-world-icon-${world.kind}`} aria-hidden="true">{world.kind === 'personal' ? <Blocks size={26} /> : <Users size={26} />}</span>
      <div>
        <small className="classroom-world-kind">{world.kind === 'personal' ? 'Your world' : world.kind === 'group' ? 'Assigned group' : 'Whole class'}</small>
        <h3>{world.title}</h3>
        <small className="classroom-world-saved"><CloudCheck size={14} aria-hidden="true" /> {world.kind === 'personal' ? 'Saved to your account' : 'Saved to the class'} · <time dateTime={world.updatedAt} title={new Date(world.updatedAt).toLocaleString()}>{formatSavedDate(world.updatedAt)}</time></small>
      </div>
    </div>
    <div className="classroom-actions">
      <button type="button" className="classroom-primary" disabled={busy || joinDisabled} onClick={() => onOpen(world)}>{world.kind === 'personal' ? 'Open' : 'Join world'}</button>
      {onRename && <button type="button" disabled={busy} onClick={() => onRename(world)}>Rename</button>}
      {onDuplicate && <button type="button" disabled={busy} onClick={() => onDuplicate(world)}>Duplicate</button>}
      {onManage && <button type="button" disabled={busy} onClick={() => onManage(world)}>{world.kind === 'personal' ? 'Manage' : 'World controls'}</button>}
    </div>
  </article>)}</div>
}
