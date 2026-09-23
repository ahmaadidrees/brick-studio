import { ArrowLeft, ArrowRight, Eraser } from 'lucide-react'
import { CATEGORIES, PALETTE, type Category } from '../editor/palette'
import type { Editor } from '../editor/editor'
import type { Theme } from '@brick-studio/platformer-core/engine/level'
import { Art } from './art'

/** Each category is shown by a piece of its own art. */
const CATEGORY_ART: Record<Category, (theme: Theme) => string> = {
  terrain: (theme) => `g:14:${theme}`,
  blocks: () => 'q:0',
  items: () => 'grow',
  enemies: () => 'walker:1',
  gizmos: () => 'lift',
  course: () => 'goalicon',
}

interface Props {
  editor: Editor
  theme: Theme
  category: Category
  onCategory: (c: Category) => void
}

/** Build mode's one bar: what kind of thing, which thing, and the eraser. */
export function Dock({ editor, theme, category, onCategory }: Props) {
  const items = PALETTE.filter((p) => p.category === category)
  const flips = category === 'enemies' || category === 'gizmos'
  const item = editor.item
  return (
    <div className="p2d-dock" onPointerDown={(e) => e.stopPropagation()} onClickCapture={(e) => (e.target as HTMLElement).closest('button')?.blur()}>
      <div className="p2d-dock-tip" aria-live="polite">
        {editor.erasing ? (
          <>
            <b>Eraser</b> Tap or drag over things to remove them
          </>
        ) : (
          <>
            <b>{item.label}</b> {item.hint ?? ''}
          </>
        )}
      </div>
      <div className="p2d-dock-bar">
        <div className="p2d-dock-cats" role="tablist" aria-label="What to place">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === category} className="p2d-cat" onClick={() => onCategory(c.id)} title={c.label}>
              <Art k={CATEGORY_ART[c.id](theme)} box={30} />
              <span className="p2d-cat-label">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="p2d-dock-items">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className="p2d-item"
              aria-pressed={!editor.erasing && item.id === it.id}
              onClick={() => editor.select(it)}
              title={`${it.label} (${i + 1})`}
              aria-label={it.label}
            >
              <Art k={it.icon} box={40} />
            </button>
          ))}
        </div>
        <div className="p2d-dock-tools">
          {flips && (
            <button type="button" className="p2d-item p2d-tool" onClick={() => editor.flip()} aria-label={`Facing ${editor.dir < 0 ? 'left' : 'right'}. Tap to flip.`} title="Flip (R)">
              {editor.dir < 0 ? <ArrowLeft size={24} aria-hidden="true" /> : <ArrowRight size={24} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="p2d-item p2d-tool p2d-eraser" aria-pressed={editor.erasing} onClick={() => editor.setErasing(!editor.erasing)} aria-label="Eraser" title="Eraser (E)">
            <Eraser size={24} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
