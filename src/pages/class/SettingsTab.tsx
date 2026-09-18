import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../ui'
import { ConfirmDialog } from '../../classroom/ConfirmDialog'
import { TextInput } from '../../classroom/fields'
import { readForm } from '../../classroom/panelShared'
import type { ClassPageClass } from './classPageData'

type Props = {
  currentClass: ClassPageClass
  busy: boolean
  onPatch: (body: Record<string, unknown>, notice?: string) => void
  onCreateClass: (name: string) => void
}

type SwitchRowProps = { id: string; title: string; description: string; checked: boolean; busy: boolean; onChange: () => void }

/** One labelled switch with the sentence that says what it changes for students. */
function SwitchRow({ id, title, description, checked, busy, onChange }: SwitchRowProps) {
  return <div className="class-setting-row">
    <div><div className="class-setting-title"><strong id={id}>{title}</strong></div><small>{description}</small></div>
    <button type="button" role="switch" className="classroom-switch" aria-checked={checked} aria-labelledby={id} disabled={busy} onClick={onChange}>
      <span className="classroom-switch-track" aria-hidden="true"><span className="classroom-switch-knob" /></span>
      <span className="classroom-switch-state">{checked ? 'On' : 'Off'}</span>
    </button>
  </div>
}

/** Everything that changes what the class can do, plus renaming and a new class. */
export function SettingsTab({ currentClass, busy, onPatch, onCreateClass }: Props) {
  const [confirm, setConfirm] = useState<'collaboration' | 'rotate' | null>(null)
  const sharingOn = currentClass.studentsCanShare !== false
  useEffect(() => { setConfirm(null) }, [currentClass.id, currentClass.collaborationOpen])
  return <>
    <section className="class-section" aria-labelledby="class-settings-title">
      <h2 id="class-settings-title" className="class-section-title">Class settings</h2>
      <SwitchRow
        id="class-setting-enrollment"
        title="New students can join"
        description={currentClass.enrollmentOpen ? 'Anyone with the class code can create an account in this class.' : 'New accounts are closed. Students who already joined can still sign in.'}
        checked={currentClass.enrollmentOpen}
        busy={busy}
        onChange={() => onPatch({ enrollmentOpen: !currentClass.enrollmentOpen }, currentClass.enrollmentOpen ? 'New students cannot join. Existing accounts still work.' : 'New students can join with the class code.')}
      />
      <div className="class-setting-row">
        <div><div className="class-setting-title"><strong id="class-setting-collaboration">Building together</strong></div><small>{currentClass.collaborationOpen ? 'Students can open shared worlds and build in them.' : 'Shared worlds are closed to students. Their saved work is preserved.'}</small></div>
        {currentClass.collaborationOpen
          ? <button type="button" role="switch" className="classroom-switch" aria-checked aria-labelledby="class-setting-collaboration" disabled={busy} onClick={() => setConfirm('collaboration')}>
            <span className="classroom-switch-track" aria-hidden="true"><span className="classroom-switch-knob" /></span>
            <span className="classroom-switch-state">On</span>
          </button>
          : <button type="button" role="switch" className="classroom-switch" aria-checked={false} aria-labelledby="class-setting-collaboration" disabled={busy} onClick={() => onPatch({ collaborationOpen: true }, 'Building together is open.')}>
            <span className="classroom-switch-track" aria-hidden="true"><span className="classroom-switch-knob" /></span>
            <span className="classroom-switch-state">Off</span>
          </button>}
      </div>
      <SwitchRow
        id="class-setting-sharing"
        title="Students can share their own builds"
        description={sharingOn ? 'A student can show a build to the class as look-only or build-together.' : 'Students keep their builds private. Anything already shared stops showing.'}
        checked={sharingOn}
        busy={busy}
        onChange={() => onPatch({ studentsCanShare: !sharingOn }, sharingOn ? 'Students can no longer share their builds with the class.' : 'Students can share their builds with the class.')}
      />
      <SwitchRow
        id="class-setting-names"
        title="Show names on the join screen"
        description={currentClass.showNamesOnJoin ? 'Students tap their first name and last initial, then type their password.' : 'Students type their username. Nothing about your roster shows before they sign in.'}
        checked={currentClass.showNamesOnJoin}
        busy={busy}
        onChange={() => onPatch({ showNamesOnJoin: !currentClass.showNamesOnJoin }, currentClass.showNamesOnJoin ? 'Names are hidden on the join screen.' : 'Names are shown on the join screen.')}
      />
      <div className="class-setting-row">
        <div><div className="class-setting-title"><strong>Class code</strong></div><small>Replace it if it has been shared outside your class. Students already signed in stay signed in.</small></div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} disabled={busy} onClick={() => setConfirm('rotate')}>New class code</Button>
      </div>
    </section>
    <form className="class-section class-form" aria-labelledby="class-rename-title" onSubmit={event => onPatch({ name: readForm(event).name }, 'Class renamed.')}>
      <h2 id="class-rename-title" className="class-section-title">Class name</h2>
      <TextInput label="Class name" id="class-rename" name="name" defaultValue={currentClass.name} key={currentClass.id} required maxLength={80} autoComplete="off" />
      <div className="class-actions"><Button type="submit" variant="secondary" loading={busy} loadingLabel="Saving…">Save name</Button></div>
    </form>
    <form className="class-section class-form" aria-labelledby="class-new-title" onSubmit={event => onCreateClass(readForm(event).name)}>
      <h2 id="class-new-title" className="class-section-title">New class</h2>
      <TextInput label="New class name" id="class-new" name="name" required maxLength={80} autoComplete="off" />
      <p className="class-help">Each class gets its own code, roster and settings.</p>
      <div className="class-actions"><Button type="submit" variant="secondary" loading={busy} loadingLabel="Creating…">Create class</Button></div>
    </form>
    <ConfirmDialog
      open={confirm === 'collaboration'}
      title="Close building together?"
      description={`Shared worlds in ${currentClass.name} close to students right away.`}
      confirmLabel="Close now"
      cancelLabel="Keep open"
      busy={busy}
      onCancel={() => setConfirm(null)}
      onConfirm={() => { setConfirm(null); onPatch({ collaborationOpen: false }, 'Building together is closed. Saved worlds are preserved.') }}
    >
      <p>Students in shared worlds are disconnected right away. Saved worlds stay and you keep access.</p>
    </ConfirmDialog>
    <ConfirmDialog
      open={confirm === 'rotate'}
      title="Get a new class code?"
      description="The old code stops working as soon as the new one appears."
      confirmLabel="Get a new code"
      cancelLabel="Keep this code"
      busy={busy}
      onCancel={() => setConfirm(null)}
      onConfirm={() => { setConfirm(null); onPatch({ rotateCode: true }, 'New class code ready. Show it on the projector before students join.') }}
    >
      <p>Anything printed or projected with the old code needs replacing. Students already signed in are not affected.</p>
    </ConfirmDialog>
  </>
}
