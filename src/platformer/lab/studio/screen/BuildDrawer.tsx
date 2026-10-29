import { Eraser, MousePointer2, Plus, Redo2, Undo2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { ALL_CATEGORY, BRICK_DRAWER_LABELS, PartPicker, type DrawerItem } from '../../../../shell'
import { useStudio, type StudioStore } from '../store'
import {
  CATALOG_CATEGORIES,
  NEW_BRICK_ID,
  activeEntryId,
  brickIdOf,
  drawerEntries,
  gridKeyOf,
  isBrickEntry,
  isGridEntry,
  standardKeyOf,
  standardTemplate,
} from '../builder/catalog'
import type { History } from '../builder/history'
import { copyToMove, limitOf } from '../builder/limits'
import { createNewBrick } from '../builder/newBrick'
import { CostumeThumb } from '../builder/tileArt'

const DRAWER_CATEGORIES = [{ id: ALL_CATEGORY, label: 'All' }, ...CATALOG_CATEGORIES]
const CATEGORY_LABEL = new Map(CATALOG_CATEGORIES.map((c) => [c.id as string, c.label]))

interface Props {
  store: StudioStore
  history: History
  erasing: boolean
  onErasing: (on: boolean) => void
  /** Phone: the drawer is a sheet and closes after a pick. */
  onPicked?: () => void
}

/**
 * Build's left column: Select (the default tool), Erase, undo and redo, then the Bricks drawer. Picking a brick arms
 * painting with it; Select, Esc or picking it again goes back to selecting.
 */
export function BuildDrawer({ store, history, erasing, onErasing, onPicked }: Props) {
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const entries = useMemo(() => drawerEntries(bricks), [bricks])
  const items = useMemo<DrawerItem[]>(() => {
    const list = entries.map<DrawerItem>((e) => ({ id: e.id, name: e.name, category: e.category, thumbnail: <CostumeThumb asset={e.asset} box={44} /> }))
    const fresh: DrawerItem = { id: NEW_BRICK_ID, name: 'New brick', category: 'mine', thumbnail: <Plus size={28} aria-hidden="true" className="cl-new-icon" /> }
    return [...list, fresh]
  }, [entries])
  const searchText = useCallback((item: DrawerItem) => `${item.id} ${item.name} ${CATEGORY_LABEL.get(item.category) ?? ''}`, [])
  const active = erasing ? null : activeEntryId(brushBrickId, bricks)
  const selecting = !erasing && !brushBrickId

  const choose = (id: string) => {
    if (id === NEW_BRICK_ID) return void createNewBrick(store)
    onErasing(false)
    // Picking the armed brick again puts it down: back to Select.
    if (id === active) return store.setBrush(null)
    if (isBrickEntry(id)) {
      store.setBrush(brickIdOf(id))
      store.selectBrick(brickIdOf(id))
    } else if (isGridEntry(id)) {
      // A standard grid brick the level already has is armed; one it does not have yet is added first.
      const entry = entries.find((e) => e.id === id)
      if (entry?.brick) {
        store.setBrush(entry.brick.id)
        store.selectBrick(entry.brick.id)
      } else {
        const template = standardTemplate(gridKeyOf(id))
        if (template) store.addBrickFrom(template.brick, template.workspace)
      }
    }
    onPicked?.()
  }

  return (
    <section className="cl-drawer cl-panel" aria-label="Bricks">
      <div className="cl-tools" role="toolbar" aria-label="Build tools">
        <button type="button" className="cl-tool" aria-pressed={selecting} title="Select (Esc)" onClick={() => { onErasing(false); store.setBrush(null) }}>
          <MousePointer2 size={18} aria-hidden="true" /><span>Select</span>
        </button>
        <button type="button" className="cl-tool" aria-pressed={erasing} title="Erase (E)" onClick={() => { store.setBrush(null); onErasing(!erasing) }}>
          <Eraser size={18} aria-hidden="true" /><span>Erase</span>
        </button>
        <span className="cl-tools-gap" />
        <button type="button" className="cl-icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={() => history.undo()}><Undo2 size={18} /></button>
        <button type="button" className="cl-icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={() => history.redo()}><Redo2 size={18} /></button>
      </div>
      <div className="cl-drawer-picker">
        <PartPicker items={items} categories={DRAWER_CATEGORIES} activeId={active} onChoose={choose} labels={BRICK_DRAWER_LABELS} denseCatalog searchText={searchText} />
      </div>
    </section>
  )
}

/** Along the bottom of the level, only while painting or erasing: what a click does, and Done. */
export function PaintStrip({ store, erasing, onErasing }: { store: StudioStore; erasing: boolean; onErasing: (on: boolean) => void }) {
  const design = useStudio(store, (s) => s.project.design)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const brick = brushBrickId ? design.bricks.find((b) => b.id === brushBrickId) : undefined
  if (!erasing && !brick) return null
  const grid = !!brick?.grid
  const moves = brick && !grid && copyToMove(design, brick.id)
  const stdKey = brick?.grid ? standardKeyOf(brick) : undefined
  const gridHint = stdKey ? standardTemplate(stdKey)?.hint : undefined
  const hint = erasing
    ? 'Click or drag over things to remove them'
    : grid
      ? `${gridHint ? `${gridHint} · ` : ''}Click or drag to paint`
      : moves
        ? `Click to move your ${brick!.name}: there's only one per level`
        : limitOf(brick!) === 1
          ? `Click to place your ${brick!.name}: only one per level`
          : 'Click to place one'
  return (
    <div className="cl-strip cl-rise" role="group" aria-label={erasing ? 'Erasing' : 'Painting'}>
      <span className="cl-thumb" aria-hidden="true">{erasing ? <Eraser size={20} /> : <CostumeThumb asset={brick?.costumes[0]?.asset} box={28} />}</span>
      <span className="cl-strip-text" aria-live="polite"><strong>{erasing ? 'Erasing' : `Painting ${brick!.name}`}</strong><span>{hint} · right-click erases</span></span>
      <button type="button" className="cl-btn" onClick={() => { onErasing(false); store.setBrush(null) }} title="Back to Select (Esc)">Done</button>
    </div>
  )
}
