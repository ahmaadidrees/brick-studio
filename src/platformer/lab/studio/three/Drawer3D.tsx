/**
 * Hackable 3D's Bricks drawer (docs/qa/hackable-3d/D1.md; the mock's Build screen): Select, Erase and Undo; the build
 * bricks (classic parts, in the chosen colour); the code bricks (the Hero, the six that work, and the kid's own); and
 * + New brick. Picking one arms it: the Stage shows where it goes, Turn (R) turns it, Done or Esc puts it down.
 */
import { Eraser, MousePointer2, Plus, Redo2, Undo2 } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { History } from '../builder/history'
import { useStudio, type StudioStore } from '../store'
import type { BrickDef3, LevelDesign3 } from '../../kit3d/contracts3d'
import { HERO3D } from '../../kit3d/engine3d'
import { partsOf } from '../../kit3d/parts3d'
import { BUILD_PARTS_3D, COLORS_3D, build3d, type Armed3 } from './build3d'
import { CODE_BRICKS_3D, createEmpty3d } from './bricks3d'

interface Props {
  store: StudioStore
  history: History
  erasing: boolean
  onErasing: (on: boolean) => void
  onPicked?: () => void
}

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * f)).toString(16).padStart(2, '0')).join('')
}

/** A little isometric box for a part's tile: w × d studs, h plates. */
function PartIcon({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const s = 5.2
  const ox = 27
  const oy = 21
  const P = (x: number, y: number, z: number) => [ox + (x - z) * 0.866 * s - (w - d) * 0.433 * s, oy + (x + z) * 0.5 * s - y * s * 0.4 - (w + d) * 0.25 * s + 6]
  const pts = (l: number[][]) => l.map(([x, y, z]) => P(x, y, z).map((v) => v.toFixed(1)).join(',')).join(' ')
  const hh = Math.min(h, 9)
  return (
    <svg width="54" height="36" viewBox="0 0 54 36" aria-hidden="true">
      <polygon points={pts([[w, hh, 0], [w, hh, d], [w, 0, d], [w, 0, 0]])} fill={shade(color, 0.64)} />
      <polygon points={pts([[0, hh, d], [w, hh, d], [w, 0, d], [0, 0, d]])} fill={shade(color, 0.8)} />
      <polygon points={pts([[0, hh, 0], [w, hh, 0], [w, hh, d], [0, hh, d]])} fill={color} />
    </svg>
  )
}

export function Drawer3D({ store, history, erasing, onErasing, onPicked }: Props) {
  const build = build3d(store)
  useSyncExternalStore(build.subscribe, build.getVersion)
  useSyncExternalStore(history.subscribe, history.getVersion)
  const design = useStudio(store, (s) => s.project.design) as LevelDesign3
  const parts = partsOf(design)
  const armed = build.armed
  const selecting = !erasing && !armed
  const templateIds = new Set(CODE_BRICKS_3D.flatMap((e) => e.parts.map((p) => p.id)))
  const own = design.bricks.filter((b) => b.id !== HERO3D && b.remixOf !== HERO3D && !templateIds.has(b.id) && !templateIds.has(b.remixOf ?? '')) as BrickDef3[]
  const heroPlaced = design.copies.some((c) => c.brickId === HERO3D)

  const arm = (next: Armed3) => {
    onErasing(false)
    store.closeCard()
    const same = armed && JSON.stringify({ ...armed, color: 0, rotation: 0 }) === JSON.stringify({ ...next, color: 0, rotation: 0 })
    build.arm(same ? null : next)
    onPicked?.()
  }
  const isArmed = (test: (a: Armed3) => boolean) => !erasing && !!armed && test(armed)

  return (
    <section className="cl-drawer cl-panel h3d-drawer" aria-label="Bricks">
      <div className="cl-tools" role="toolbar" aria-label="Build tools">
        <button type="button" className="cl-tool" aria-pressed={selecting} title="Select (Esc)" onClick={() => { onErasing(false); build.arm(null) }}>
          <MousePointer2 size={18} aria-hidden="true" /><span>Select</span>
        </button>
        <button type="button" className="cl-tool" aria-pressed={erasing} title="Erase (E)" onClick={() => { build.arm(null); onErasing(!erasing) }}>
          <Eraser size={18} aria-hidden="true" /><span>Erase</span>
        </button>
        <span className="cl-tools-gap" />
        <button type="button" className="cl-icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={() => history.undo()}><Undo2 size={18} /></button>
        <button type="button" className="cl-icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={() => history.redo()}><Redo2 size={18} /></button>
      </div>

      <div className="h3d-drawer-body">
        <h2 className="h3d-drawer-h">Build bricks</h2>
        <div className="h3d-parts" role="group" aria-label="Build bricks">
          {BUILD_PARTS_3D.map((p) => {
            const part = parts[p.partId]
            if (!part) return null
            const on = isArmed((a) => a.kind === 'part' && a.partId === p.partId)
            return (
              <button key={p.partId} type="button" className="h3d-part" aria-pressed={on} title={part.name}
                onClick={() => arm({ kind: 'part', partId: p.partId, label: p.label, color: build.color, rotation: build.rotation })}>
                <PartIcon w={part.width} d={part.depth} h={part.height} color={build.color} />
                <span>{p.label}</span>
              </button>
            )
          })}
        </div>
        <div className="h3d-colors" role="radiogroup" aria-label="Colour">
          {COLORS_3D.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={build.color === c} aria-label={`Colour ${c}`} className="h3d-color" style={{ background: c }} onClick={() => build.setColor(c)} />
          ))}
        </div>

        <h2 className="h3d-drawer-h">Code bricks</h2>
        <div className="h3d-code-list" role="group" aria-label="Code bricks">
          <button type="button" className="h3d-code" aria-pressed={isArmed((a) => a.kind === 'code' && a.key === 'hero')} onClick={() => arm({ kind: 'code', key: 'hero', label: 'the Hero' })}
            title={heroPlaced ? 'One per world: place it again to move it' : 'Where you start'}>
            <span className="h3d-swatch" style={{ background: '#3e83d7' }} aria-hidden="true" />
            <span className="h3d-code-name">Hero</span>
            <span className="h3d-tag">{heroPlaced ? 'move' : 'start'}</span>
          </button>
          {CODE_BRICKS_3D.map((e) => (
            <button key={e.key} type="button" className="h3d-code" aria-pressed={isArmed((a) => a.kind === 'code' && a.key === e.key)} title={e.does}
              onClick={() => arm({ kind: 'code', key: e.key, label: e.label === 'Button + Door' ? 'a Button and its Door' : `a ${e.label}` })}>
              <span className="h3d-swatch" style={{ background: e.color }} aria-hidden="true" />
              <span className="h3d-code-name">{e.label}</span>
              <span className="h3d-tag">code</span>
            </button>
          ))}
          {own.map((b) => (
            <button key={b.id} type="button" className="h3d-code" aria-pressed={isArmed((a) => a.kind === 'own' && a.brickId === b.id)} onClick={() => arm({ kind: 'own', brickId: b.id, label: b.name })}>
              <span className="h3d-swatch" style={{ background: b.shape3d?.look?.color ?? '#a9b7bd' }} aria-hidden="true" />
              <span className="h3d-code-name">{b.name}</span>
              <span className="h3d-tag">mine</span>
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="h3d-new" onClick={() => { build.arm(null); onErasing(false); store.newBrick((id, name) => createEmpty3d(id, name)) }}>
        <Plus size={18} aria-hidden="true" /> New brick
      </button>
    </section>
  )
}

/** Under the world while something is armed (or Erase is on): what a click does, Turn (R) and Done. */
export function PlacingChip3D({ store, erasing, onErasing }: { store: StudioStore; erasing: boolean; onErasing: (on: boolean) => void }) {
  const build = build3d(store)
  useSyncExternalStore(build.subscribe, build.getVersion)
  const armed = build.armed
  if (!armed && !erasing) return null
  return (
    <div className="h3d-placing cl-rise" role="group" aria-label={erasing ? 'Erasing' : 'Placing'}>
      <span aria-live="polite">{erasing ? 'Erasing. Click a brick to take it away.' : placingText(armed!)}</span>
      {armed?.kind === 'part' && <button type="button" className="h3d-placing-turn" onClick={() => build.turn()}>Turn (R)</button>}
      <button type="button" className="h3d-placing-done" onClick={() => { build.arm(null); onErasing(false) }}>Done</button>
    </div>
  )
}

function placingText(armed: Armed3): string {
  if (armed.kind === 'part') return `Placing a ${armed.label}${/^\d/.test(armed.label) ? ' brick' : ''}. Click a stud to place it.`
  if (armed.kind === 'code' && armed.key === 'hero') return 'Placing the Hero. Click where it starts.'
  return `Placing ${armed.label}. Click where it goes.`
}
