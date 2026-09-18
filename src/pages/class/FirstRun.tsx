import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '../../ui'
import { TextInput } from '../../classroom/fields'
import { readForm } from '../../classroom/panelShared'
import { ClassCodeCard, PrintableCode } from './ClassCodeCard'
import { classCode, type ClassPageClass } from './classPageData'

type Props = {
  /** The class just created in step 1; null until the teacher names one. */
  created: ClassPageClass | null
  busy: boolean
  onCreateClass: (name: string) => void
  onStartSharedWorld: (title: string) => void
  /** Leaves the stepper for the everyday page once the class exists. */
  onFinish: () => void
}

const STEPS = ['Name your class', 'Invite students', 'Start building'] as const

/** One row of the stepper; completed steps keep their summary so nothing disappears. */
function Step({ index, current, title, children }: { index: number; current: number; title: string; children: React.ReactNode }) {
  const done = index < current
  return <li className={`class-step${index === current ? ' class-step-active' : ''}${done ? ' class-step-done' : ''}`} aria-current={index === current ? 'step' : undefined}>
    <span className="class-step-number" aria-hidden="true">{done ? <Check size={18} /> : index + 1}</span>
    <div className="class-step-body">
      <h2 className="class-step-title">{title}</h2>
      {children}
    </div>
  </li>
}

/**
 * The teacher's first visit: three steps, no tabs. Step 2 appears as soon as
 * the class exists, so the code is on screen before students arrive.
 */
export function FirstRun({ created, busy, onCreateClass, onStartSharedWorld, onFinish }: Props) {
  const [step, setStep] = useState(0)
  const [showWorldForm, setShowWorldForm] = useState(false)
  const inviteHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (created) { setStep(1); inviteHeading.current?.focus() } }, [created])
  const code = created ? classCode(created) : ''
  return <main className="class-page-main class-first-run" aria-labelledby="class-first-run-title">
    <div className="class-first-run-intro">
      <h1 id="class-first-run-title">Set up your class</h1>
      <p>Three steps. Your students need a class code and a device — nothing else.</p>
    </div>
    <ol className="class-steps">
      <Step index={0} current={step} title={STEPS[0]}>
        {created
          ? <p className="class-step-summary">{created.name} is ready.</p>
          : <form className="class-step-form" onSubmit={event => onCreateClass(readForm(event).name)}>
            <TextInput label="Class name" id="class-first-name" name="name" required maxLength={80} autoComplete="off" placeholder="Room 12 Builders" />
            <Button type="submit" variant="primary" loading={busy} loadingLabel="Creating…">Create class</Button>
          </form>}
      </Step>
      <Step index={1} current={step} title={STEPS[1]}>
        {created
          ? <>
            <h3 className="sr-only" ref={inviteHeading} tabIndex={-1}>Invite students to {created.name}</h3>
            <ClassCodeCard className={created.name} code={code} projectorHref="/class/projector" />
            <PrintableCode className={created.name} code={code} />
            <div className="class-step-next"><Button variant="secondary" onClick={() => setStep(2)}>My students are in</Button></div>
          </>
          : <p className="class-step-summary">Your class code and QR appear here once the class has a name.</p>}
      </Step>
      <Step index={2} current={step} title={STEPS[2]}>
        {showWorldForm
          ? <form className="class-step-form" onSubmit={event => onStartSharedWorld(readForm(event).title)}>
            <TextInput label="Shared world name" id="class-first-world" name="title" required maxLength={80} autoComplete="off" placeholder="Bridge Challenge" />
            <Button type="submit" variant="primary" loading={busy} loadingLabel="Starting…">Start it</Button>
            <Button variant="quiet" onClick={() => setShowWorldForm(false)}>Cancel</Button>
          </form>
          : <div className="class-step-actions">
            <Button variant="primary" href="/build">Open the studio</Button>
            <Button variant="secondary" disabled={!created} onClick={() => setShowWorldForm(true)}>Start a shared world</Button>
          </div>}
        <p className="class-help">A shared world is one build the whole class can open together.</p>
        {created && <div className="class-step-next"><Button variant="quiet" onClick={onFinish}>Go to my class page</Button></div>}
      </Step>
    </ol>
  </main>
}
