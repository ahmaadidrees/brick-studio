import { T } from '@brick-studio/platformer-core/engine/tiles'
import { Eraser, Eye, EyeOff, Flag, MousePointer2, Plus, RotateCcw, Sparkles, ZoomIn, ZoomOut, AlignLeft } from 'lucide-react'
import { characterPreviewStyle } from '../../characters/catalog'
import type { BrickDef } from '../bricks/builtins'
import type { LabDiagnostic } from '../program/types'
import type { BuildTool, LabStatus } from '../session'
import { costumeIcon, tileIcon } from './previews'

/** A brick's picture: its costume, or you. */
export function BrickIcon({ def, size = 36 }: { def: BrickDef | undefined; size?: number }) {
  if (!def) return <span className="lab-icon" style={{ width: size, height: size }} aria-hidden="true" />
  if (def.costume === 'hero') return <span className="lab-icon lab-icon-you" style={{ width: size, height: size, ...characterPreviewStyle('builder') }} aria-hidden="true" />
  const url = costumeIcon(def.costume)
  return (
    <span className="lab-icon" style={{ width: size, height: size }} aria-hidden="true">
      {url && <img src={url} alt="" width={size} height={size} />}
    </span>
  )
}

const ORIGIN_WORDS: Record<BrickDef['origin'], string> = { builtin: 'Built-in', copy: 'Your copy', mine: 'Your brick' }

/** What is open in the code panel, and what can be done with it. */
export function CodeHeader({ def, onOriginal, onSave }: { def: BrickDef; onOriginal: () => void; onSave: () => void }) {
  const you = def.id === 'you'
  const line = you
    ? 'Your moves are code too. Change them to give yourself new powers.'
    : def.origin === 'builtin'
      ? `Every ${def.name} in the level runs this. Change a block to make your own copy.`
      : def.origin === 'copy'
        ? `Your own ${def.name}. Every ${def.name} in the level runs it.`
        : `A brick you made. Every one in the level runs this.`
  return (
    <div className="lab-code-head">
      <BrickIcon def={def} size={40} />
      <div className="lab-code-title">
        <div className="lab-code-name">
          <h2>{def.name}</h2>
          {!you && <span className={`lab-chip lab-chip-${def.origin}`}>{ORIGIN_WORDS[def.origin]}</span>}
        </div>
        <p>{line}</p>
      </div>
      <div className="lab-code-actions">
        {def.origin === 'copy' && (
          <button type="button" className="lab-button" onClick={onOriginal}>
            <RotateCcw size={16} aria-hidden="true" /> Back to the original
          </button>
        )}
        {!you && (
          <button type="button" className="lab-button lab-button-strong" onClick={onSave}>
            <Sparkles size={16} aria-hidden="true" /> Save as a new brick
          </button>
        )}
      </div>
    </div>
  )
}

/** Over the blocks, bottom right: tidy up and zoom. */
export function CodeTools({ onTidy, onZoom }: { onTidy: () => void; onZoom: (steps: number) => void }) {
  return (
    <span className="lab-zoom">
      <button type="button" aria-label="Tidy up the blocks" title="Tidy up" onClick={onTidy}>
        <AlignLeft size={16} />
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => onZoom(-1)}>
        <ZoomOut size={16} />
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => onZoom(1)}>
        <ZoomIn size={16} />
      </button>
    </span>
  )
}

/** Problems in the open code, worst first. Clicking one shows its block. */
export function Problems({ diagnostics, onReveal }: { diagnostics: readonly LabDiagnostic[]; onReveal: (blockId: string) => void }) {
  const shown = diagnostics.filter((d) => d.severity !== 'info' || d.code.startsWith('runtime.')).slice(0, 4)
  if (!shown.length) return null
  const rank = { error: 0, warning: 1, info: 2 }
  shown.sort((a, b) => rank[a.severity] - rank[b.severity])
  return (
    <ul className="lab-problems" aria-label="Things to fix">
      {shown.map((d, i) => (
        <li key={`${d.code}-${d.blockId}-${i}`} className={`lab-problem lab-problem-${d.severity}`}>
          <span className="lab-dot" aria-hidden="true" />
          {d.blockId ? (
            <button type="button" onClick={() => onReveal(d.blockId!)}>
              {d.message}
            </button>
          ) : (
            <span>{d.message}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The watched thing's live values: why it did what it did. */
export function LiveValues({ status, def, onToggle }: { status: LabStatus | null; def: BrickDef | undefined; onToggle: (key: string) => void }) {
  const watch = status?.watch
  return (
    <div className="lab-live" aria-live="off">
      <div className="lab-live-title">
        <BrickIcon def={def} size={24} />
        <span>{watch && def ? <>Watching <strong>{def.name}</strong></> : 'Click a thing on the stage to watch it'}</span>
      </div>
      {watch && (
        <ul className="lab-live-values">
          {watch.values.map((v) => (
            <li key={v.key} className={v.shown !== undefined ? 'lab-live-mem' : undefined}>
              <span className="lab-live-label">{v.label}</span>
              <strong className="lab-live-value">{v.value}</strong>
              {v.shown !== undefined && (
                <button type="button" aria-label={v.shown ? `Hide ${v.label} on the stage` : `Show ${v.label} on the stage`} title={v.shown ? 'Hide on the stage' : 'Show on the stage'} onClick={() => onToggle(v.key)}>
                  {v.shown ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "In this level": you first, then each brick with how many there are. */
export function ThingList({
  rows,
  open,
  onOpen,
  onAdd,
}: {
  rows: { def: BrickDef; count: number | null }[]
  open: string
  onOpen: (brick: string) => void
  onAdd: () => void
}) {
  return (
    <section className="lab-things" aria-labelledby="lab-things-title">
      <div className="lab-things-head">
        <h2 id="lab-things-title">In this level</h2>
        <button type="button" className="lab-button lab-button-strong" onClick={onAdd}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
      </div>
      <ul>
        {rows.map(({ def, count }) => (
          <li key={def.id}>
            <button type="button" className={`lab-thing${def.id === open ? ' on' : ''}`} aria-pressed={def.id === open} onClick={() => onOpen(def.id)}>
              <BrickIcon def={def} size={32} />
              <span className="lab-thing-name">
                {def.name}
                {def.origin !== 'builtin' && def.id !== 'you' && <small>{ORIGIN_WORDS[def.origin]}</small>}
              </span>
              {count !== null && <span className="lab-thing-count">×{count}</span>}
              <span className="lab-thing-see">{def.id === open ? 'Open' : 'See inside'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TILE_TOOLS: { id: string; label: string; tile: number; icon: string }[] = [
  { id: 'ground', label: 'Ground', tile: T.GROUND, icon: 'g:0:day' },
  { id: 'brick', label: 'Brick', tile: T.BRICK, icon: 'brick' },
  { id: 'hard', label: 'Block', tile: T.HARD, icon: 'hard' },
  { id: 'semi', label: 'Ledge', tile: T.SEMI, icon: 'semi:00' },
  { id: 'spikes', label: 'Spikes', tile: T.SPIKES, icon: 'spikes' },
  { id: 'lava', label: 'Lava', tile: T.LAVA, icon: 'lava:0:1' },
]

const toolIs = (a: BuildTool, b: BuildTool) => a.kind === b.kind && (a.kind !== 'tile' || (b.kind === 'tile' && a.tile === b.tile)) && (a.kind !== 'brick' || (b.kind === 'brick' && a.brick === b.brick))

/** Building: pick, paint tiles, erase, move the start. */
export function BuildTools({ tool, onTool, placing }: { tool: BuildTool; onTool: (t: BuildTool) => void; placing: BrickDef | undefined }) {
  const tools: { key: string; label: string; tool: BuildTool; icon: React.ReactNode }[] = [
    { key: 'select', label: 'Pick and move', tool: { kind: 'select' }, icon: <MousePointer2 size={18} /> },
    ...TILE_TOOLS.map((t) => ({ key: t.id, label: t.label, tool: { kind: 'tile', tile: t.tile } as BuildTool, icon: <img src={tileIcon(t.icon)} alt="" width={24} height={24} /> })),
    { key: 'erase', label: 'Erase', tool: { kind: 'erase' }, icon: <Eraser size={18} /> },
    { key: 'start', label: 'Move the start', tool: { kind: 'start' }, icon: <Flag size={18} /> },
  ]
  return (
    <div className="lab-tools" role="toolbar" aria-label="Build tools">
      {tools.map((t) => (
        <button key={t.key} type="button" className={toolIs(tool, t.tool) ? 'on' : undefined} aria-pressed={toolIs(tool, t.tool)} title={t.label} aria-label={t.label} onClick={() => onTool(t.tool)}>
          {t.icon}
        </button>
      ))}
      {placing && tool.kind === 'brick' && (
        <span className="lab-tools-placing">
          <BrickIcon def={placing} size={22} /> Click to put {placing.name}s. Pick another tool to stop.
        </span>
      )}
    </div>
  )
}

export type CodeView = 'blocks' | 'js' | 'py'

/** Blocks (the main view), or the same code as JavaScript or Python to read. */
export function ViewToggle({ view, onView }: { view: CodeView; onView: (v: CodeView) => void }) {
  const views: [CodeView, string][] = [
    ['blocks', 'Blocks'],
    ['js', 'JavaScript'],
    ['py', 'Python'],
  ]
  return (
    <div className="lab-views" role="radiogroup" aria-label="Show the code as">
      {views.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : undefined} onClick={() => onView(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}
