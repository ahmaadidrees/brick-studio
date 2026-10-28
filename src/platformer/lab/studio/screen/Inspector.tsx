import { Code2, MoreHorizontal, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Value } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { KnobsCard } from '../workshop/KnobsCard'
import { formatKnob } from '../workshop/knobs'
import { isKnobNumber, knobRange, snapKnob } from '../builder/knobs'
import { CostumeThumb } from '../builder/tileArt'
import { knobEdit, removeCopyEdit, type History } from '../builder/history'
import { isSingleton } from '../builder/limits'
import { cellCount, removeCell, selectedCell } from '../builder/cells'
import { isCatalogBrick, originalBrickName } from '../builder/catalog'
import { BrickName } from './BrickName'

/**
 * Build's right column, shown while something in the level is selected: the brick's name, Sliders · Look, "Every
 * Walker / Just this one", and Open its code. Plain words only; values are rounded for display.
 */
export function Inspector({ store, history, compact = false }: { store: StudioStore; history?: History; compact?: boolean }) {
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
          <span className="cl-muted">{builtIn ? 'Built-in · ' : ''}{details}</span>
        </span>
        <div className="cl-menu-wrap">
          <button type="button" className="cl-icon-btn" aria-label="Brick actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>
          {menu && <div className="cl-menu cl-pop" role="group" aria-label="Brick actions menu">
            {store.canResetBrick(brick.id) && <button type="button" onClick={() => { setMenu(false); setConfirm(true) }}>Back to the original</button>}
            {!single && <button type="button" onClick={remove} aria-label={`Remove this ${brick.name}`}><Trash2 size={16} /> Remove this one</button>}
          </div>}
        </div>
        <button type="button" className="cl-icon-btn" aria-label="Close" title="Close (Esc)" onClick={() => store.closeCard()}><X size={18} /></button>
      </header>

      <div className="cl-tabs" role="tablist" aria-label="Brick details">
        <button type="button" role="tab" aria-selected={shownTab === 'sliders'} onClick={() => store.setCardTab('sliders')}>Sliders</button>
        <button type="button" role="tab" aria-selected={shownTab === 'look'} onClick={() => store.setCardTab('look')}>Look</button>
        <span className="cl-tabs-ind" aria-hidden="true" data-at={shownTab === 'look' ? 1 : 0} />
      </div>

      <div className="cl-inspector-body cl-fade" key={shownTab}>
        {shownTab === 'look' ? <>
          <ul className="cl-costumes" aria-label="Costumes">{brick.costumes.map((costume) => <li key={costume.name}><CostumeThumb asset={costume.asset} box={56} /><span>{costume.name}</span></li>)}</ul>
          {!compact && <button type="button" className="cl-btn" onClick={() => { store.setScreen('code', brick.id); store.setEditorTab('costumes') }}>Change costumes</button>}
        </> : <>
          {perCopy && <div className="cl-seg" role="group" aria-label="Which ones change">
            <button type="button" aria-pressed={scope === 'all'} onClick={() => store.setSliderScope('all')}>Every {brick.name}</button>
            <button type="button" aria-pressed={scope === 'one'} onClick={() => store.setSliderScope('one')}>Just this one</button>
          </div>}
          {single ? <KnobsCard store={store} brickId={brick.id} compact /> : knobs.length === 0
            ? <p className="cl-muted cl-empty">No sliders yet. In Code, make a variable and turn on “Show as a slider”.</p>
            : <div className="cl-sliders" role="group" aria-label="Sliders">
              {knobs.map((v) => {
                const own = !!copy && Object.prototype.hasOwnProperty.call(copy.knobs ?? {}, v.id)
                const value: Value = thisOne ? copy?.knobs?.[v.id] ?? v.value : v.value
                const start = ranges.current.values.get(v.id) ?? v.value
                return <div key={v.id} className="cl-slider">
                  <span className="cl-slider-name">{v.name}{own && <small className="cl-own">its own</small>}</span>
                  {isKnobNumber(value) && isKnobNumber(start)
                    ? <KnobSlider name={v.name} start={start} value={value} onChange={(n) => change(v.id, n)} />
                    : typeof value === 'boolean'
                      ? <button type="button" className="cl-btn" aria-label={v.name} aria-pressed={value} onClick={() => change(v.id, !value)}>{value ? 'On' : 'Off'}</button>
                      : <span className="cl-slider-value">{String(value)}</span>}
                  {own && <button type="button" className="cl-link" aria-label={`Use the brick's value for ${v.name}`} onClick={() => resetOwn(v.id)}>Same as the others</button>}
                </div>
              })}
            </div>}
        </>}
      </div>

      {!compact && <button type="button" className="cl-btn cl-btn-primary cl-open-code" title="Open its code (double-click a brick)" onClick={() => store.setScreen('code', brick.id)}>
        <Code2 size={17} aria-hidden="true" /> Open its code
      </button>}
      {compact && <p className="cl-note">Code needs a bigger screen. Sliders and Look work here; open this level on a laptop, Chromebook or tablet to change its code.</p>}

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

function KnobSlider({ name, start, value, onChange }: { name: string; start: number; value: number; onChange: (n: number) => void }) {
  const r = knobRange(start, value)
  return <span className="cl-slider-control">
    <input type="range" aria-label={name} min={r.min} max={r.max} step={r.step} value={value} onChange={(e) => onChange(snapKnob(Number(e.target.value), r.step))} />
    <output className="cl-slider-value">{formatKnob(value)}</output>
  </span>
}
