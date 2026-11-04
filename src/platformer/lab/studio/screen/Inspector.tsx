import { ArrowUp, Code2, MoreHorizontal, RotateCw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { BrickDef, Value } from '../../core/contracts'
import { useStudio, type FinishDirection, type StudioStore } from '../store'
import { KnobsCard } from '../workshop/KnobsCard'
import { formatKnob, knobSpecFor } from '../workshop/knobs'
import { isKnobNumber, knobRange, snapKnob, type KnobRange } from '../builder/knobs'
import { CostumeThumb } from '../builder/tileArt'
import { knobEdit, removeCopyEdit, type History } from '../builder/history'
import { isSingleton } from '../builder/limits'
import { cellCount, removeCell, selectedCell } from '../builder/cells'
import { isCatalogBrick, originalBrickName } from '../builder/catalog'
import { BrickName } from './BrickName'
import { screensFor } from '../kitScreens'
import { hasJobOrCode } from '../blank/blankRules'
import { GiveJob, JobChips } from '../blank/JobCard'
import '../blank/blank.css'
import '../race/raceBuild.css'

/**
 * Build's right column, shown while something in the level is selected: the brick's name, Sliders · Look, "Every
 * Walker / Just this one", and See inside. Plain words only; values are rounded for display.
 */
export function Inspector({ store, history, compact = false, noCode = compact }: { store: StudioStore; history?: History; compact?: boolean; noCode?: boolean }) {
  const copyId = useStudio(store, (s) => s.selectedCopyId)
  const design = useStudio(store, (s) => s.project.design)
  const tab = useStudio(store, (s) => s.cardTab)
  const scope = useStudio(store, (s) => s.sliderScope)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const cell = selectedCell(design, copyId)
  const copy = copyId && !cell ? design.copies.find((c) => c.id === copyId) : undefined
  const brick = cell?.brick ?? (copy ? design.bricks.find((b) => b.id === copy.brickId) : undefined)
  // Slider ranges come from the value when the brick was selected, so dragging never moves the ends.
  const ranges = useRef<{ brickId: string; values: Map<string, Value> }>({ brickId: '', values: new Map() })
  useEffect(() => { setMenu(false); setConfirm(false) }, [copyId, brick?.id])
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.target instanceof HTMLInputElement) return
      if (confirm) { setConfirm(false); e.stopPropagation(); return }
      if (menu) { setMenu(false); e.stopPropagation(); return }
      store.closeCard()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [store, menu, confirm])
  if (!brick || (!cell && !copy)) return null
  if (ranges.current.brickId !== brick.id) ranges.current = { brickId: brick.id, values: new Map(brick.program.variables.map((v) => [v.id, v.value])) }

  const count = cell ? cellCount(design, cell.ch) : design.copies.filter((c) => c.brickId === brick.id).length
  const single = isSingleton(brick)
  const knobs = brick.program.variables.filter((v) => v.showInBuild)
  const perCopy = !!copy && !single && !brick.grid && knobs.length > 0
  const thisOne = perCopy && scope === 'one'
  const shownTab = tab === 'look' ? 'look' : 'sliders'
  const original = originalBrickName(brick)
  const builtIn = isCatalogBrick(brick)
  const details = single ? 'One per level: place it again to move it.' : `${count} in this level`
  const spec = knobSpecFor(brick)
  const finish = brick.grid?.finish !== undefined
  // A brick that points a way (a boost pad) turns like a finish line (parity bucket A).
  const pointsAWay = brick.grid?.way !== undefined
  // A game from nothing (docs/qa/blank-2d): a brick with no code asks for a job; one with a job says which.
  const fromNothing = screensFor(design).fromNothing
  const needsJob = fromNothing && !hasJobOrCode(brick)
  const isThePlayer = fromNothing && design.player === brick.id

  const remove = () => {
    setMenu(false)
    if (cell) removeCell(store, history, cell.col, cell.row)
    else if (copy && !single) {
      history?.push(removeCopyEdit(history, copy))
      store.deleteCopy(copy.id)
    }
  }
  const change = (id: string, value: Value) => {
    if (thisOne && copy) {
      history?.push(knobEdit(history, copy.id, id, copy.knobs?.[id], value))
      store.setKnob(copy.id, id, value)
    } else {
      store.setBrickSlider(brick.id, id, value)
    }
  }
  const resetOwn = (id: string) => {
    if (!copy) return
    const before = copy.knobs?.[id]
    history?.push({ undo: () => store.setKnob(copy.id, id, before), redo: () => store.setKnob(copy.id, id, undefined) })
    store.setKnob(copy.id, id, undefined)
  }

  return (
    <section className="cl-inspector cl-panel" aria-label={`${brick.name} in this level`}>
      <header className="cl-inspector-head">
        <span className="cl-thumb" aria-hidden="true"><CostumeThumb asset={brick.costumes[0]?.asset} box={36} /></span>
        <span className="cl-inspector-title">
          <BrickName store={store} brick={brick} size="md" readOnly={builtIn} />
          <span className="cl-muted">{isThePlayer ? 'The player · ' : builtIn ? 'Built-in · ' : ''}{details}</span>
        </span>
        <div className="cl-menu-wrap">
          <button type="button" className="cl-icon-btn" aria-label="Brick actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>
          {menu && <div className="cl-menu cl-pop" role="group" aria-label="Brick actions menu">
            {store.canResetBrick(brick.id) && <button type="button" onClick={() => { setMenu(false); setConfirm(true) }}>Back to the original</button>}
            {fromNothing && !brick.grid && !isThePlayer && <button type="button" onClick={() => { setMenu(false); store.setPlayer(brick.id) }}>Make this the player</button>}
            {!single && <button type="button" onClick={remove} aria-label={`Remove this ${brick.name}`}><Trash2 size={16} /> Remove this one</button>}
          </div>}
        </div>
        <button type="button" className="cl-icon-btn" aria-label="Close" title="Close (Esc)" onClick={() => store.closeCard()}><X size={18} /></button>
      </header>

      {needsJob ? <GiveJob store={store} brick={brick} noCode={noCode} /> : <>
      <div className="cl-tabs" role="tablist" aria-label="Brick details">
        <button type="button" role="tab" aria-selected={shownTab === 'sliders'} onClick={() => store.setCardTab('sliders')}>Sliders</button>
        <button type="button" role="tab" aria-selected={shownTab === 'look'} onClick={() => store.setCardTab('look')}>Look</button>
        <span className="cl-tabs-ind" aria-hidden="true" data-at={shownTab === 'look' ? 1 : 0} />
      </div>

      <div className="cl-inspector-body cl-fade" key={shownTab}>
        {shownTab === 'look' ? <>
          <ul className="cl-costumes" aria-label="Costumes">{brick.costumes.map((costume) => <li key={costume.name}><CostumeThumb asset={costume.asset} box={56} /><span>{costume.name}</span></li>)}</ul>
          {!noCode && <button type="button" className="cl-btn" onClick={() => { store.setScreen('code', brick.id); store.setEditorTab('costumes') }}>Change costumes</button>}
        </> : <>
          {fromNothing && <JobChips store={store} brick={brick} noCode={noCode} />}
          {perCopy && <div className="cl-seg" role="group" aria-label="Which ones change">
            <button type="button" aria-pressed={scope === 'all'} onClick={() => store.setSliderScope('all')}>Every {brick.name}</button>
            <button type="button" aria-pressed={scope === 'one'} onClick={() => store.setSliderScope('one')}>Just this one</button>
          </div>}
          {finish && <FinishArrow store={store} history={history} brick={brick} />}
          {pointsAWay && <WayArrow store={store} history={history} brick={brick} />}
          {single ? <KnobsCard store={store} brickId={brick.id} compact /> : (finish || pointsAWay) && knobs.length === 0 ? null : knobs.length === 0
            ? <p className="cl-muted cl-empty">No sliders yet. In Code, make a variable and turn on “Show as a slider”.</p>
            : <div className="cl-sliders" role="group" aria-label="Sliders">
              {knobs.map((v) => {
                const own = !!copy && Object.prototype.hasOwnProperty.call(copy.knobs ?? {}, v.id)
                const value: Value = thisOne ? copy?.knobs?.[v.id] ?? v.value : v.value
                const start = ranges.current.values.get(v.id) ?? v.value
                // A built-in brick's own numbers (a Computer racer's) have a fixed range; others grow from where they started.
                const fixed = spec.knobs.find((k) => k.id === v.id && k.min !== undefined && k.max !== undefined)
                return <div key={v.id} className="cl-slider">
                  <span className="cl-slider-name">{v.name}{own && <small className="cl-own">its own</small>}</span>
                  {isKnobNumber(value) && isKnobNumber(start)
                    ? <KnobSlider name={v.name} range={fixed && isKnobNumber(value) ? { min: Math.min(fixed.min!, value), max: Math.max(fixed.max!, value), step: fixed.step ?? 0.05 } : knobRange(start, value)} value={value} onChange={(n) => change(v.id, n)} />
                    : typeof value === 'boolean'
                      ? <button type="button" className="cl-btn" aria-label={v.name} aria-pressed={value} onClick={() => change(v.id, !value)}>{value ? 'On' : 'Off'}</button>
                      : <span className="cl-slider-value">{String(value)}</span>}
                  {own && <button type="button" className="cl-link" aria-label={`Use the brick's value for ${v.name}`} onClick={() => resetOwn(v.id)}>Same as the others</button>}
                </div>
              })}
            </div>}
        </>}
      </div>

      {!noCode && <button type="button" className="cl-btn cl-btn-primary cl-open-code" title="See inside: its code and costumes (or double-click the brick)" onClick={() => store.setScreen('code', brick.id)}>
        <Code2 size={17} aria-hidden="true" /> See inside
      </button>}
      </>}
      {noCode && <p className="cl-note">Code needs a bigger screen. Sliders and Look work here; open this level on a laptop, Chromebook or tablet to change its code.</p>}

      {confirm && <div className="cl-confirm cl-pop" role="dialog" aria-modal="true" aria-label="Back to the original?">
        <strong>Back to the original?</strong>
        <p>This brings back {original ?? brick.name}’s code, sliders and costumes for every copy.</p>
        <div className="cl-row">
          <button type="button" className="cl-btn" autoFocus onClick={() => setConfirm(false)}>Keep my changes</button>
          <button type="button" className="cl-btn cl-btn-primary" onClick={() => { store.resetBrickOriginal(brick.id); setConfirm(false) }}>Bring it back</button>
        </div>
      </div>}
    </section>
  )
}

function KnobSlider({ name, range: r, value, onChange }: { name: string; range: KnobRange; value: number; onChange: (n: number) => void }) {
  return <span className="cl-slider-control">
    <input type="range" aria-label={name} min={r.min} max={r.max} step={r.step} value={value} onChange={(e) => onChange(snapKnob(Number(e.target.value), r.step))} />
    <output className="cl-slider-value">{formatKnob(value)}</output>
  </span>
}

/** Grid steps a finish arrow can point, in turning order (clockwise from up), and their plain words. */
const FINISH_TURN: readonly FinishDirection[] = [0, 90, 180, -90]
const FINISH_WAY: Readonly<Record<FinishDirection, string>> = { 0: 'up', 90: 'right', 180: 'down', [-90]: 'left' }
const finishIndex = (direction: number) => ((Math.round(direction / 90) % 4) + 4) % 4

/** The finish line's arrow: which way cars cross it for a lap to count. Turning it is one undo step. */
function FinishArrow({ store, history, brick }: { store: StudioStore; history?: History; brick: BrickDef }) {
  const now = FINISH_TURN[finishIndex(brick.grid?.finish ?? 90)]
  const next = FINISH_TURN[(finishIndex(now) + 1) % 4]
  const turn = () => {
    history?.push({ undo: () => store.setFinishDirection(brick.id, now), redo: () => store.setFinishDirection(brick.id, next) })
    store.setFinishDirection(brick.id, next)
  }
  return <div className="cl-finish" role="group" aria-label="Finish line arrow">
    <span className="cl-slider-name">Cars cross it going {FINISH_WAY[now]}</span>
    <span className="cl-slider-control">
      <ArrowUp size={28} aria-hidden="true" className="cl-finish-arrow" style={{ transform: `rotate(${now}deg)` }} />
      <button type="button" className="cl-btn" aria-label={`Turn the arrow (it points ${FINISH_WAY[now]})`} onClick={turn}><RotateCw size={16} aria-hidden="true" /> Turn</button>
    </span>
    <small className="cl-muted">Laps count when cars cross the line this way.</small>
  </div>
}

/** A boost pad's way (`grid.way`): the pad's arrow, and Turn. Cars boost only when they drive that way. */
function WayArrow({ store, history, brick }: { store: StudioStore; history?: History; brick: BrickDef }) {
  const now = FINISH_TURN[finishIndex(brick.grid?.way ?? 90)]
  const next = FINISH_TURN[(finishIndex(now) + 1) % 4]
  const turn = () => {
    history?.push({ undo: () => store.setGridWay(brick.id, now), redo: () => store.setGridWay(brick.id, next) })
    store.setGridWay(brick.id, next)
  }
  return <div className="cl-finish" role="group" aria-label="Boost pad arrow">
    <span className="cl-slider-name">It boosts cars going {FINISH_WAY[now]}</span>
    <span className="cl-slider-control">
      <ArrowUp size={28} aria-hidden="true" className="cl-finish-arrow" style={{ transform: `rotate(${now}deg)` }} />
      <button type="button" className="cl-btn" aria-label={`Turn the arrow (it points ${FINISH_WAY[now]})`} onClick={turn}><RotateCw size={16} aria-hidden="true" /> Turn</button>
    </span>
    <small className="cl-muted">Cars driving another way get no boost.</small>
  </div>
}
