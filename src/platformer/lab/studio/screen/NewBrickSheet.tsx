import { ArrowLeft, Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Costume } from '../../core/contracts'
import { Button, Sheet } from '../../../../ui'
import { CostumeEditor } from '../CostumeEditor'
import { useStudio, type StudioStore } from '../store'
import { CostumeThumb } from '../builder/tileArt'
import { brickLooks, finishNewBrick, freeBrickName, nameTaken, startNewBrick } from '../builder/newBrick'
import { MAX_BRICK_NAME } from './BrickName'

type Step =
  | { kind: 'look' }
  /** Drawing on a brick made for it (removed again if the kid goes back or closes the sheet). */
  | { kind: 'draw'; brickId: string }
  | { kind: 'name'; look?: { costume: Costume; name: string }; brickId?: string }

/**
 * + New brick in Build, without Code: pick a picture (or draw one), give it a name, and land back in Build with the new
 * brick armed, ready to place. Its code is still one tap away (Open its code) once it is in the level.
 */
export function NewBrickSheet({ store, open, onClose, onMade }: { store: StudioStore; open: boolean; onClose: () => void; onMade?: (brickId: string) => void }) {
  const [step, setStep] = useState<Step>({ kind: 'look' })
  const looks = useMemo(() => (open ? brickLooks() : []), [open])
  useEffect(() => { if (open) setStep({ kind: 'look' }) }, [open])

  const drawn = step.kind === 'draw' || step.kind === 'name' ? step.brickId : undefined
  const painted = useStudio(store, (s) => (drawn ? (s.project.design.bricks.find((b) => b.id === drawn)?.costumes.length ?? 0) > 0 : false))
  /** Back to the pictures (or closing): a brick made for drawing goes again. */
  const dropDrawn = () => { if (drawn) store.deleteBrick(drawn) }
  const close = () => { dropDrawn(); onClose() }
  const back = () => {
    if (step.kind === 'name' && step.brickId) return setStep({ kind: 'draw', brickId: step.brickId })
    dropDrawn()
    setStep({ kind: 'look' })
  }
  const draw = () => setStep({ kind: 'draw', brickId: startNewBrick(store, []) })
  const make = (name: string) => {
    const id = step.kind === 'name' && step.brickId ? step.brickId : startNewBrick(store, step.kind === 'name' && step.look ? [step.look.costume] : [])
    finishNewBrick(store, id, name)
    onClose()
    onMade?.(id)
  }

  const title = step.kind === 'look' ? 'New brick' : step.kind === 'draw' ? 'Draw your brick' : 'Name your brick'
  const description = step.kind === 'look' ? 'Pick a picture for it, or draw your own.' : step.kind === 'draw' ? 'Paint it, then press Next.' : 'Then tap the level to place it.'
  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      description={description}
      variant="dialog"
      size={step.kind === 'draw' ? 'lg' : 'md'}
      className={`cl-newbrick cl-newbrick-step-${step.kind}`}
      headerStart={step.kind === 'name' ? <Button variant="quiet" size="sm" iconOnly icon={<ArrowLeft size={18} />} aria-label="Back" onClick={back}>Back</Button> : undefined}
      footer={step.kind === 'draw' ? <div className="cl-newbrick-foot">
        <Button onClick={back}>Back</Button>
        <Button variant="primary" disabled={!painted} title={painted ? undefined : 'Paint something first'} onClick={() => setStep({ kind: 'name', brickId: step.brickId })}>Next</Button>
      </div> : undefined}
    >
      {step.kind === 'look' && <ul className="cl-newbrick-looks" aria-label="Pictures">
        {looks.map((look) => (
          <li key={look.id}>
            <button type="button" className="cl-newbrick-look" onClick={() => setStep({ kind: 'name', look })}>
              <CostumeThumb asset={look.costume.asset} box={48} />
              <span>{look.name}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="cl-newbrick-look cl-newbrick-own" onClick={draw}>
            <Pencil size={30} aria-hidden="true" />
            <span>Draw my own</span>
          </button>
        </li>
      </ul>}
      {step.kind === 'draw' && <div className="cl-newbrick-canvas"><CostumeEditor store={store} /></div>}
      {step.kind === 'name' && <NameStep store={store} brickId={step.brickId} look={step.look} onMake={make} />}
    </Sheet>
  )
}

function NameStep({ store, brickId, look, onMake }: { store: StudioStore; brickId?: string; look?: { costume: Costume; name: string }; onMake: (name: string) => void }) {
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const brick = brickId ? bricks.find((b) => b.id === brickId) : undefined
  const others = bricks.filter((b) => b.id !== brickId).map((b) => b.name)
  const [draft, setDraft] = useState(() => freeBrickName(look?.name ?? brick?.name ?? 'My brick', others))
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { input.current?.focus({ preventScroll: true }); input.current?.select() }, [])
  const typed = draft.trim()
  const final = typed ? freeBrickName(typed, others) : ''
  return (
    <form className="cl-newbrick-name" onSubmit={(e) => { e.preventDefault(); if (final) onMake(final) }}>
      <span className="cl-newbrick-preview" aria-hidden="true"><CostumeThumb asset={(look?.costume ?? brick?.costumes[0])?.asset} box={64} /></span>
      <label className="cl-newbrick-field">
        <span>Its name</span>
        <input ref={input} aria-label="Brick name" value={draft} maxLength={MAX_BRICK_NAME} autoComplete="off" onChange={(e) => setDraft(e.target.value)} />
      </label>
      {nameTaken(typed, others) && <p className="cl-newbrick-hint" role="status">There’s already a {typed} here, so this one will be “{final}”.</p>}
      <Button type="submit" variant="primary" disabled={!final}>Make my brick</Button>
    </form>
  )
}
