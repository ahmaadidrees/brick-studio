import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { BrickDef } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { builtInPowers, makePower, powerFromFile, whyNot, type PowerBrick } from '../powers/powers'
import { downloadPower, keepPower, makerName, myPowers, onPowersChange, rememberMakerName } from '../powers/library'
import { getLabelText } from './labels'

const credit = (credits: string[]) => (credits.length <= 1 ? `from ${credits[0] ?? 'someone'}` : `from ${credits[0]} and ${credits.slice(1).join(', ')}`)

/**
 * Code's Powers row: each power snapped onto this brick (name, who made it, On/Off, Take off), and "+ Power" to snap one
 * on from Code Lab's own, My powers or a file, or to make one from this brick's scripts.
 */
export function PowersBar({ store, brick }: { store: StudioStore; brick: BrickDef }) {
  const workspace = useStudio(store, (s) => s.project.workspaces[brick.id])
  const [open, setOpen] = useState<null | 'pick' | 'make'>(null)
  const powers = brick.powers ?? []
  useEffect(() => setOpen(null), [brick.id])
  // `workspace` is read so this re-renders when the brick's scripts change: a power's On/Off follows them.
  void workspace
  return (
    <div className="cl-powers" role="group" aria-label="Powers on this brick">
      <span className="cl-powers-title">Powers</span>
      {powers.map((p) => {
        const on = store.isPowerOn(brick.id, p.id)
        return (
          <span key={p.id} className={`cl-power${on ? '' : ' is-off'}`}>
            <span aria-hidden="true" className="cl-power-dot" />
            <span className="cl-power-name"><b>{p.name}</b> <span>{credit(p.credits)}</span></span>
            <button type="button" className="cl-power-switch" aria-pressed={on} aria-label={`${on ? 'Turn off' : 'Turn on'} ${p.name}`} onClick={() => store.setPowerOn(brick.id, p.id, !on)}>{on ? 'On' : 'Off'}</button>
            <button type="button" className="cl-icon-btn cl-power-off" aria-label={`Take ${p.name} off`} title="Take it off" onClick={() => store.takeOffPower(brick.id, p.id)}><X size={14} /></button>
          </span>
        )
      })}
      <button type="button" className="cl-chip-btn cl-power-add" aria-expanded={open !== null} onClick={() => setOpen(open ? null : 'pick')}><Plus size={14} aria-hidden="true" /> Power</button>
      {open === 'pick' && <PowerPicker store={store} brick={brick} onMake={() => setOpen('make')} onClose={() => setOpen(null)} />}
      {open === 'make' && <PowerMaker store={store} brick={brick} onClose={() => setOpen(null)} />}
    </div>
  )
}

function PowerPicker({ store, brick, onMake, onClose }: { store: StudioStore; brick: BrickDef; onMake: () => void; onClose: () => void }) {
  const mine = useSyncExternalStore(onPowersChange, myPowers)
  const builtIn = useMemo(builtInPowers, [])
  const file = useRef<HTMLInputElement | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useCloseOnEscape(onClose)
  const snap = (p: PowerBrick) => {
    if (store.snapPower(brick.id, p)) onClose()
  }
  const open = async (f: File | undefined) => {
    if (!f) return
    const power = powerFromFile(await f.text())
    if (!power) return setNote('That file isn’t a power. Power files end in .power.json.')
    keepPower(power)
    setNote(`${power.name} is in My powers.`)
  }
  const row = (p: PowerBrick) => {
    const why = whyNot(p, brick)
    return (
      <li key={p.id}>
        <button type="button" className="cl-power-pick" disabled={!!why} title={why ?? `Snap ${p.name} onto ${brick.name}`} onClick={() => snap(p)}>
          <span aria-hidden="true" className="cl-power-dot" />
          <span className="cl-power-pick-text"><b>{p.name}</b> <span className="cl-muted">{credit(p.credits)}</span><span className="cl-power-what">{why ?? p.what}</span></span>
        </button>
      </li>
    )
  }
  return (
    <div className="cl-power-panel cl-pop" role="dialog" aria-label={`Snap a power onto ${brick.name}`}>
      <div className="cl-power-panel-head"><b>Snap a power onto {brick.name}</b><button type="button" className="cl-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
      <span className="cl-power-group">Comes with Code Lab</span>
      <ul className="cl-power-list">{builtIn.map(row)}</ul>
      <span className="cl-power-group">My powers</span>
      {mine.length ? <ul className="cl-power-list">{mine.map(row)}</ul> : <p className="cl-muted cl-power-empty">Powers you make, or open from a classmate’s file, show up here.</p>}
      {note && <p className="cl-power-note" role="status">{note}</p>}
      <div className="cl-row">
        <button type="button" className="cl-btn cl-btn-sm" onClick={() => file.current?.click()}>Open a power file…</button>
        <button type="button" className="cl-btn cl-btn-sm" onClick={onMake}>Make a power from {brick.name}…</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

function PowerMaker({ store, brick, onClose }: { store: StudioStore; brick: BrickDef; onClose: () => void }) {
  const workspace = useStudio(store, (s) => s.project.workspaces[brick.id])
  const scripts = useMemo(() => getLabelText(workspace), [workspace])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [by, setBy] = useState(makerName)
  const [what, setWhat] = useState('')
  const [made, setMade] = useState<PowerBrick | null>(null)
  useCloseOnEscape(onClose)
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const ready = picked.size > 0 && name.trim() && by.trim()
  const make = () => {
    const power = makePower(store.getState().project, brick.id, { name, by, what, blockIds: [...picked] })
    rememberMakerName(by)
    keepPower(power)
    setMade(power)
  }
  if (made) {
    return (
      <div className="cl-power-panel cl-pop" role="dialog" aria-label="Power made">
        <div className="cl-power-panel-head"><b>{made.name} is in My powers</b><button type="button" className="cl-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <p className="cl-power-what">Snap it onto any brick from “+ Power”. To give it to a classmate, save it as a file and send it to them; they open it with “Open a power file…”.</p>
        <div className="cl-row"><button type="button" className="cl-btn cl-btn-primary cl-btn-sm" onClick={() => downloadPower(made)}>Save as a file</button><button type="button" className="cl-btn cl-btn-sm" onClick={onClose}>Done</button></div>
      </div>
    )
  }
  return (
    <div className="cl-power-panel cl-pop" role="dialog" aria-label={`Make a power from ${brick.name}`}>
      <div className="cl-power-panel-head"><b>Make a power from {brick.name}</b><button type="button" className="cl-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
      <span className="cl-power-group">Which scripts?</span>
      <ul className="cl-power-list cl-power-scripts">
        {scripts.map((s) => (
          <li key={s.id}><label className="cl-power-check"><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} /> <span>{s.label || 'A script with no label'}</span></label></li>
        ))}
      </ul>
      <label className="cl-power-field">Power name <input value={name} maxLength={40} placeholder="Double jump" onChange={(e) => setName(e.target.value)} /></label>
      <label className="cl-power-field">What does it let a brick do? <input value={what} maxLength={120} placeholder="Jump again in the air" onChange={(e) => setWhat(e.target.value)} /></label>
      <label className="cl-power-field">Made by <input value={by} maxLength={40} placeholder="Your name" onChange={(e) => setBy(e.target.value)} /></label>
      <div className="cl-row"><button type="button" className="cl-btn cl-btn-primary cl-btn-sm" disabled={!ready} onClick={make}>Make the power</button><button type="button" className="cl-btn cl-btn-sm" onClick={onClose}>Cancel</button></div>
    </div>
  )
}

function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
}
