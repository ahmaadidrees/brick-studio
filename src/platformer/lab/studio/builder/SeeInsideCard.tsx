import { MoreHorizontal, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Value } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { KnobsCard } from '../workshop/KnobsCard'
import { isKnobNumber, knobRange, snapKnob } from './knobs'
import { CostumeThumb } from './tileArt'
import { knobEdit, removeCopyEdit, type History } from './history'
import { isSingleton } from './limits'
import { cellCount, removeCell, selectedCell } from './cells'
import { isCatalogBrick, originalBrickName } from './catalog'
import '../workshop/workshop.css'
import './card.css'

/** One card follows a selected brick from tuning to code and costumes. The dock supplies the code editor. */
export function SeeInsideCard({ store, history, children }: { store: StudioStore; history?: History; children?: ReactNode }) {
  const state = useStudio(store, (s) => s)
  const { selectedCopyId: copyId, project: { design }, cardTab: tab, sliderScope: scope } = state
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [small, setSmall] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches)
  const cell = selectedCell(design, copyId)
  const copy = copyId && !cell ? design.copies.find((c) => c.id === copyId) : undefined
  const brick = cell?.brick ?? design.bricks.find((b) => b.id === (copy?.brickId ?? state.selectedBrickId))
  const ranges = useRef<{ brickId: string; values: Map<string, Value> }>({ brickId: '', values: new Map() })
  useEffect(() => { setMenu(false); setConfirm(false) }, [copyId, brick?.id])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setSmall(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest('.blocklyWidgetDiv, .blocklyDropDownDiv')) return
      if (confirm) { setConfirm(false); e.stopPropagation(); return }
      if (menu) { setMenu(false); e.stopPropagation(); return }
      store.closeCard()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [store, menu, confirm])
  if (!brick || (!cell && !copy && tab !== 'code')) return null
  if (ranges.current.brickId !== brick.id) ranges.current = { brickId: brick.id, values: new Map(brick.program.variables.map((v) => [v.id, v.value])) }

  const copies = design.copies.filter((c) => c.brickId === brick.id)
  const count = cell ? cellCount(design, cell.ch) : copies.length
  const beforeCell = cell ? (design.tiles?.data.slice(0, cell.row).join('') ?? '') + (design.tiles?.data[cell.row].slice(0, cell.col) ?? '') : ''
  const selectedNumber = copy ? copies.findIndex((c) => c.id === copy.id) + 1 : cell ? beforeCell.split(cell.ch).length : undefined
  const single = isSingleton(brick)
  const knobs = brick.program.variables.filter((v) => v.showInBuild)
  const perCopy = !!copy && !single && !brick.grid && knobs.length > 0
  const thisOne = perCopy && scope === 'one'
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
  const shownTab = small && tab === 'code' ? 'sliders' : tab
  const original = originalBrickName(brick)

  return (
    <section className={`builder-inside slice-card${shownTab === 'code' ? ' slice-card-code' : ''}`} aria-label={`${brick.name} copy`}>
      <div className="builder-inside-head slice-card-head">
        <span className="builder-inside-icon" aria-hidden="true"><CostumeThumb asset={brick.costumes[0]?.asset} box={48} /></span>
        <span className="builder-inside-text">
          <strong>{brick.name}</strong>
          <span>{count} in this level{selectedNumber ? ` · copy ${selectedNumber} selected` : ''}</span>
          <span className="slice-card-badge">{brick.remixOf ? `remix of ${original ?? brick.remixOf}` : isCatalogBrick(brick) ? 'built in' : 'my brick'}</span>
          {single && <span>One per level · Place it again to move it</span>}
        </span>
        <div className="slice-card-menu-wrap">
          <button type="button" className="builder-btn" aria-label="Brick actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></button>
          {menu && <div className="slice-card-menu" role="group" aria-label="Brick actions menu">
            {store.canResetBrick(brick.id) && <button type="button" onClick={() => { setMenu(false); setConfirm(true) }}>Back to the original</button>}
            {!single && (copy || cell) && <button type="button" onClick={remove} aria-label={`Remove this ${brick.name}`}><Trash2 size={16} /> Remove this copy</button>}
            <button type="button" onClick={() => { setMenu(false); store.openWorkshop(brick.id); store.setEditorTab('code') }}>Test this brick alone</button>
          </div>}
        </div>
        <button type="button" className="builder-btn" aria-label={tab === 'code' ? 'Close code' : 'Close brick card'} onClick={() => tab === 'code' ? store.closeCode() : store.closeCard()}><X size={18} /></button>
      </div>
      <div className="slice-card-tabs" aria-label="Brick views">
        <button type="button" aria-pressed={shownTab === 'sliders'} onClick={() => tab === 'code' ? store.closeCode() : store.setCardTab('sliders')}>Sliders</button>
        <button type="button" aria-pressed={shownTab === 'code'} disabled={small} title={small ? 'Code needs a bigger screen' : 'See how this brick works'} onClick={() => store.openCode(brick.id)}><Search size={15} />{small ? 'Code needs a bigger screen' : 'See inside'}</button>
        <button type="button" aria-pressed={shownTab === 'look'} onClick={() => store.setCardTab('look')}>Look</button>
      </div>
      {shownTab === 'code' ? <>
        {isCatalogBrick(brick) && <p className="slice-remix-callout">This is the {original ?? brick.name} every level starts with. Change a block and it becomes My {original ?? brick.name}.</p>}
        {children}
      </> : <div className="slice-card-body">
        {shownTab === 'look' ? <>
          <ul className="slice-costumes" aria-label="Costumes">{brick.costumes.map((costume) => <li key={costume.name}><CostumeThumb asset={costume.asset} box={64} /><span>{costume.name}</span></li>)}</ul>
          <button type="button" className="builder-btn" onClick={() => { store.openWorkshop(brick.id); store.setEditorTab('costumes') }}>Edit costumes</button>
        </> : <>
          {perCopy && <div className="slice-scope" role="group" aria-label="Slider scope">
            <button type="button" aria-pressed={scope === 'all'} onClick={() => store.setSliderScope('all')}>All copies</button>
            <button type="button" aria-pressed={scope === 'one'} onClick={() => store.setSliderScope('one')}>Just this one</button>
          </div>}
          {single ? <KnobsCard store={store} brickId={brick.id} /> : knobs.length === 0 ? <p className="slice-card-hint">No sliders yet. See inside to show a variable as a slider.</p> : <div className="builder-knobs" role="group" aria-label="Sliders">
            {knobs.map((v) => {
              const own = !!copy && Object.prototype.hasOwnProperty.call(copy.knobs ?? {}, v.id)
              const value: Value = thisOne ? copy?.knobs?.[v.id] ?? v.value : v.value
              const start = ranges.current.values.get(v.id) ?? v.value
              return <div key={v.id} className="builder-knob slice-slider">
                <span className="builder-knob-name">{v.name}{own && <small className="slice-own">own value</small>}</span>
                {isKnobNumber(value) && isKnobNumber(start) ? <KnobSlider name={v.name} start={start} value={value} onChange={(n) => change(v.id, n)} /> : typeof value === 'boolean' ? <button type="button" className="builder-btn" aria-label={v.name} aria-pressed={value} onClick={() => change(v.id, !value)}>{value ? 'On' : 'Off'}</button> : <span className="builder-knob-value">{String(value)}</span>}
                {own && <button type="button" className="slice-reset-own" aria-label={`Use the brick's value for ${v.name}`} onClick={() => resetOwn(v.id)}>Use the brick’s value</button>}
              </div>
            })}
          </div>}
        </>}
      </div>}
      {confirm && <div className="slice-restore" role="dialog" aria-modal="true" aria-label="Back to the original?">
        <strong>Back to the original?</strong>
        <p>This restores {original ?? brick.name}’s code, sliders and costumes for every copy. Copies keep their own values where they still apply.</p>
        <button type="button" className="builder-btn" autoFocus onClick={() => setConfirm(false)}>Keep my changes</button>
        <button type="button" className="builder-btn builder-btn-primary" onClick={() => { store.resetBrickOriginal(brick.id); setConfirm(false) }}>Restore original</button>
      </div>}
    </section>
  )
}

function KnobSlider({ name, start, value, onChange }: { name: string; start: number; value: number; onChange: (n: number) => void }) {
  const r = knobRange(start, value)
  return <span className="builder-knob-control"><input type="range" aria-label={name} min={r.min} max={r.max} step={r.step} value={value} onChange={(e) => onChange(snapKnob(Number(e.target.value), r.step))} /><output className="builder-knob-value">{value}</output></span>
}
