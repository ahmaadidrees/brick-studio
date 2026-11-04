/**
 * Start from nothing's Build pieces (docs/qa/blank-2d): the empty stage's one button (board 1), the next-step line
 * (board 4a), Borrow a brick (board 4a) and the Stage card (size and backdrop, owner decision 2026-11-04).
 */
import { ArrowLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Sheet } from '../../../../ui'
import type { Backdrop } from '../../core/contracts'
import { BACKDROPS } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { CostumeThumb } from '../builder/tileArt'
import type { History } from '../builder/history'
import { BACKDROP_NAMES, backdropOf, STAGE_SIZES, stageCells } from './blankProject'
import { BORROW_SHELVES, BORROWABLE, borrowedBrick, type Borrowable } from './borrow'
import { hideNextStep, nextStep, nextStepHidden } from './nextStep'
import { layoutOf, resizedLayout, whatResizeLoses } from './stageLayout'
import { NewBrickSheet, type BrickKind } from '../screen/NewBrickSheet'
import './blank.css'

/** Board 1: an empty stage has one obvious action. */
export function EmptyStage({ store, onMade }: { store: StudioStore; onMade?: (brickId: string, kind?: BrickKind) => void }) {
  const empty = useStudio(store, (s) => s.project.design.bricks.length === 0)
  const [sheet, setSheet] = useState<null | 'draw' | 'look'>(null)
  return <>
    {empty && !sheet && (
      <div className="cl-blank-empty" role="region" aria-label="Your stage is empty">
        <div className="cl-blank-empty-card cl-rise">
          <span className="cl-blank-empty-icon" aria-hidden="true"><Pencil size={26} /></span>
          <h2>Your stage is empty</h2>
          <p>Draw a brick: a hero, a wall, a star, anything.</p>
          <Button variant="primary" fullWidth onClick={() => setSheet('draw')}>Draw a brick</Button>
          <button type="button" className="cl-link" onClick={() => setSheet('look')}>or pick a picture</button>
        </div>
      </div>
    )}
    <NewBrickSheet store={store} open={sheet !== null} startAt={sheet ?? 'look'} onClose={() => setSheet(null)} onMade={onMade} />
  </>
}

/** Board 4a: one dark line at the bottom of the stage, naming the next step. × hides it for good. */
export function NextStepLine({ store }: { store: StudioStore }) {
  const design = useStudio(store, (s) => s.project.design)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const mode = useStudio(store, (s) => s.mode)
  const room = useStudio(store, (s) => !!s.room)
  const cardBrickId = useStudio(store, (s) => (s.selectedCopyId ? s.selectedBrickId : null))
  const [played, setPlayed] = useState(false)
  const [hidden, setHidden] = useState(() => nextStepHidden())
  useEffect(() => { if (mode === 'play') setPlayed(true) }, [mode])
  const step = useMemo(() => nextStep(design, { brushBrickId, cardBrickId, played }), [design, brushBrickId, cardBrickId, played])
  if (hidden || !step || room) return null
  return (
    <div className="cl-blank-next cl-rise" role="status" aria-label="Next step">
      <span key={step.id}>{step.text}</span>
      <button type="button" aria-label="Hide this line" title="Hide this line" onClick={() => { hideNextStep(); setHidden(true) }}><X size={14} /></button>
    </div>
  )
}

/** Under the drawer in a game from nothing: the Stage card's row and Borrow a brick. */
export function DrawerExtras({ store, onBorrow, onStage }: { store: StudioStore; onBorrow: () => void; onStage: () => void }) {
  const design = useStudio(store, (s) => s.project.design)
  const cells = stageCells(design)
  const size = STAGE_SIZES.find((z) => z.cols === cells.cols && z.rows === cells.rows)?.label ?? `${cells.cols} × ${cells.rows}`
  return (
    <div className="cl-blank-extras">
      <button type="button" className="cl-blank-row" onClick={onStage}>
        <span className={`cl-blank-swatch is-${backdropOf(design)}`} aria-hidden="true" />
        <span className="cl-blank-row-text"><strong>Stage</strong><small>{size} · {BACKDROP_NAMES[backdropOf(design)]}</small></span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <button type="button" className="cl-blank-row" onClick={onBorrow}>
        <span className="cl-blank-row-text"><strong>Borrow a brick</strong><small>From the Platformer or Racing</small></span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

/** Board 4a: borrow a kit's brick. The copy comes with its code and joins My bricks, armed to place. */
export function BorrowPanel({ store, onBack, onBorrowed }: { store: StudioStore; onBack: () => void; onBorrowed?: () => void }) {
  const pictures = useMemo(() => new Map(BORROWABLE.map((item) => [item.id, item.make().brick.costumes[0]?.asset])), [])
  const borrow = (item: Borrowable) => {
    const design = store.getState().project.design
    const made = borrowedBrick(design, item)
    if (item.needs) store.ensureStageData(item.needs.variables ?? [], item.needs.lists ?? [])
    const id = store.addBrickFrom(made.brick, made.workspace)
    // A brick that moves with the keys, borrowed into a game with no player yet, becomes the player.
    if (item.player && !store.getState().project.design.player) store.setPlayer(id)
    store.setBrush(id)
    store.selectBrick(id)
    onBorrowed?.()
    onBack()
  }
  return (
    <section className="cl-blank-borrow" aria-label="Borrow a brick">
      <header>
        <button type="button" className="cl-icon-btn" aria-label="Back to My bricks" onClick={onBack}><ArrowLeft size={18} /></button>
        <h2>Borrow a brick</h2>
      </header>
      <p className="cl-muted">Your copy comes with its code. Change it however you like.</p>
      {BORROW_SHELVES.map((shelf) => (
        <div key={shelf.id} className="cl-blank-shelf">
          <h3>{shelf.label}</h3>
          <ul>
            {BORROWABLE.filter((item) => item.shelf === shelf.id).map((item) => (
              <li key={item.id}>
                <button type="button" className="cl-blank-tile" aria-label={`Borrow the ${item.name}: ${item.what}`} onClick={() => borrow(item)}>
                  <CostumeThumb asset={pictures.get(item.id)} box={32} />
                  <span>{item.name}</span>
                  <small>{item.what}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** The Stage card: how big the stage is and what is behind everything. Each change is one undo step. */
export function StageCard({ store, history, open, onClose }: { store: StudioStore; history?: History; open: boolean; onClose: () => void }) {
  const design = useStudio(store, (s) => s.project.design)
  const cells = stageCells(design)
  const backdrop = backdropOf(design)
  const [asking, setAsking] = useState<{ cols: number; rows: number; cells: number; moved: number } | null>(null)
  useEffect(() => { if (!open) setAsking(null) }, [open])
  const resize = (cols: number, rows: number, sure = false) => {
    const d = store.getState().project.design
    const loses = whatResizeLoses(d, cols, rows)
    if (!sure && (loses.cells > 0 || loses.moved > 0)) return setAsking({ cols, rows, ...loses })
    setAsking(null)
    const before = layoutOf(d)
    const after = resizedLayout(d, cols, rows)
    history?.push({ undo: () => store.setStageLayout(before), redo: () => store.setStageLayout(after) })
    store.setStageLayout(after)
  }
  const paint = (next: Backdrop) => {
    const now = backdropOf(store.getState().project.design)
    if (now === next) return
    history?.push({ undo: () => store.setBackdrop(now), redo: () => store.setBackdrop(next) })
    store.setBackdrop(next)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Stage" description="How big your stage is, and what is behind everything." variant="dialog" size="md" className="cl-blank-stagecard">
      <fieldset className="cl-blank-field">
        <legend>Size</legend>
        <div className="cl-blank-choices">
          {STAGE_SIZES.map((z) => (
            <button key={z.id} type="button" className="cl-blank-choice" aria-pressed={z.cols === cells.cols && z.rows === cells.rows} onClick={() => resize(z.cols, z.rows)}>
              <span className="cl-blank-size" aria-hidden="true" style={{ aspectRatio: `${z.cols} / ${z.rows}` }} />
              <strong>{z.label}</strong><small>{z.what}</small>
            </button>
          ))}
        </div>
        {asking && <div className="cl-blank-ask" role="alert">
          <p>A smaller stage {asking.cells > 0 ? `loses ${asking.cells} painted ${asking.cells === 1 ? 'square' : 'squares'}` : ''}{asking.cells > 0 && asking.moved > 0 ? ' and ' : ''}{asking.moved > 0 ? `moves ${asking.moved} ${asking.moved === 1 ? 'brick' : 'bricks'} back inside` : ''}. Undo brings them back.</p>
          <div className="cl-row">
            <Button onClick={() => setAsking(null)}>Keep this size</Button>
            <Button variant="primary" onClick={() => resize(asking.cols, asking.rows, true)}>Make it smaller</Button>
          </div>
        </div>}
      </fieldset>
      <fieldset className="cl-blank-field">
        <legend>Backdrop</legend>
        <div className="cl-blank-choices">
          {BACKDROPS.map((b) => (
            <button key={b} type="button" className="cl-blank-choice" aria-pressed={b === backdrop} onClick={() => paint(b)}>
              <span className={`cl-blank-swatch is-${b}`} aria-hidden="true" />
              <strong>{BACKDROP_NAMES[b]}</strong>
            </button>
          ))}
        </div>
        <p className="cl-muted">Want a picture instead? Open the Stage in Code and paint a backdrop in Costumes.</p>
      </fieldset>
    </Sheet>
  )
}
