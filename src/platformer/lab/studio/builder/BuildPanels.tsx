import { Box, Eraser, Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ALL_CATEGORY, BRICK_DRAWER_LABELS, DrawerFab, DrawerPanel, DrawerSheet, DrawerToggle, HistoryTools, PartPicker, type DrawerItem } from '../../../../shell'
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
} from './catalog'
import type { History } from './history'
import { copyToMove, limitOf } from './limits'
import { NewBrickPicker } from './NewBrickPicker'
import { SeeInsideCard } from './SeeInsideCard'
import { CostumeThumb } from './tileArt'

const DRAWER_ID = 'p2d-brick-drawer'
const DRAWER_CATEGORIES = [{ id: ALL_CATEGORY, label: 'All' }, ...CATALOG_CATEGORIES]
const CATEGORY_LABEL = new Map(CATALOG_CATEGORIES.map((c) => [c.id as string, c.label]))

interface Props {
  store: StudioStore
  history: History
  erasing: boolean
  onErasing: (on: boolean) => void
  compact: boolean
  drawerOpen: boolean
  onDrawerOpen: (open: boolean) => void
  /** Overrides the templates the New brick picker offers (tests). */
  templates?: Parameters<typeof NewBrickPicker>[0]['templates']
}

/**
 * The Build chrome, laid out like the real 2D builder (src/platformer/ui/BuildShell.tsx): the Bricks drawer on the
 * left with search and categories, undo and redo beside it, and the Placing strip along the bottom. The See inside
 * card sits just above the strip.
 */
export function BuildPanels({ store, history, erasing, onErasing, compact, drawerOpen, onDrawerOpen, templates }: Props) {
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  const entries = useMemo(() => drawerEntries(bricks), [bricks])
  const items = useMemo<DrawerItem[]>(() => {
    const list = entries.map<DrawerItem>((e) => ({ id: e.id, name: e.name, category: e.category, thumbnail: <CostumeThumb asset={e.asset} box={40} /> }))
    const fresh: DrawerItem = { id: NEW_BRICK_ID, name: '+ New brick', category: 'mine', thumbnail: <Plus size={30} aria-hidden="true" className="builder-new-icon" /> }
    return [...list, fresh]
  }, [entries])

  const searchText = useCallback((item: DrawerItem) => `${item.id} ${CATEGORY_LABEL.get(item.category) ?? ''}`, [])
  const active = erasing ? null : activeEntryId(brushBrickId, bricks)

  const choose = (id: string) => {
    if (id === NEW_BRICK_ID) {
      setPicking(true)
      return
    }
    onErasing(false)
    if (isBrickEntry(id)) {
      store.setBrush(brickIdOf(id))
      store.selectBrick(brickIdOf(id))
    } else if (isGridEntry(id)) {
      // A standard grid brick the level already has is armed; one it does not have yet is added first (it paints by its char).
      const entry = entries.find((e) => e.id === id)
      if (entry?.brick) {
        store.setBrush(entry.brick.id)
        store.selectBrick(entry.brick.id)
      } else {
        const template = standardTemplate(gridKeyOf(id))
        if (template) store.addBrickFrom(template.brick, template.workspace)
      }
    }
  }

  const picker = (dense: boolean, onPicked?: () => void) => (
    <PartPicker
      items={items}
      categories={DRAWER_CATEGORIES}
      activeId={active}
      onChoose={(id) => {
        choose(id)
        if (id !== NEW_BRICK_ID) onPicked?.()
      }}
      labels={BRICK_DRAWER_LABELS}
      denseCatalog={dense}
      searchText={searchText}
    />
  )

  return (
    <div className={`p2d-build-shell${compact ? ' p2d-compact-shell' : ''}${!compact && !drawerOpen ? ' p2d-drawer-collapsed' : ''}`}>
      {compact ? (
        <>
          <DrawerFab labels={BRICK_DRAWER_LABELS} open={sheetOpen} onOpen={() => setSheetOpen(true)} />
          {sheetOpen && (
            <DrawerSheet labels={BRICK_DRAWER_LABELS} icon={<Box size={24} aria-hidden="true" />} onClose={closeSheet} titleId="p2d-sheet-title">
              {picker(false, closeSheet)}
            </DrawerSheet>
          )}
        </>
      ) : drawerOpen ? (
        <DrawerPanel id={DRAWER_ID} labels={BRICK_DRAWER_LABELS} icon={<Box size={27} aria-hidden="true" />} onCollapse={() => onDrawerOpen(false)}>
          {picker(true)}
        </DrawerPanel>
      ) : (
        <DrawerToggle id={DRAWER_ID} labels={BRICK_DRAWER_LABELS} onOpen={() => onDrawerOpen(true)} />
      )}

      <div className="brick-history-cluster p2d-history" role="group" aria-label="Build tools">
        <HistoryTools onUndo={() => history.undo()} onRedo={() => history.redo()} canUndo={history.canUndo} canRedo={history.canRedo} />
      </div>

      <SeeInsideCard store={store} history={history} />
      <PlacingStrip store={store} erasing={erasing} onErasing={onErasing} />

      {picking && <NewBrickPicker store={store} templates={templates} onClose={() => setPicking(false)} />}
    </div>
  )
}

/** What a click places right now, and the Erase tool. */
function PlacingStrip({ store, erasing, onErasing }: { store: StudioStore; erasing: boolean; onErasing: (on: boolean) => void }) {
  const design = useStudio(store, (s) => s.project.design)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const brick = brushBrickId ? design.bricks.find((b) => b.id === brushBrickId) : undefined
  const grid = !!brick?.grid
  const label = brick?.name ?? 'Nothing'
  const moves = brick && !grid && copyToMove(design, brick.id)
  const stdKey = brick?.grid ? standardKeyOf(brick) : undefined
  const gridHint = stdKey ? standardTemplate(stdKey)?.hint : undefined
  const hint = erasing
    ? 'Click or drag over things to remove them'
    : grid
      ? `${gridHint ? `${gridHint} · ` : ''}Click or drag to paint · right-click erases`
      : brick
        ? moves
          ? `Moves your ${brick.name} · only one per level`
          : limitOf(brick) === 1
            ? `Click to place your ${brick.name} · only one per level`
            : 'Click to place a copy · click a copy to select it · right-click erases'
        : 'Pick something from the Bricks drawer'
  return (
    <div className="p2d-strip" role="group" aria-label="Placing">
      <div className="p2d-strip-chip" aria-live="polite">
        <span className="p2d-strip-swatch" aria-hidden="true">
          {erasing ? <Eraser size={20} /> : <CostumeThumb asset={brick?.costumes[0]?.asset} box={30} />}
        </span>
        <span className="p2d-strip-text">
          <span className="p2d-strip-kicker">{erasing ? 'Erasing' : 'Placing'}</span>
          <strong>{erasing ? 'Eraser' : label}</strong>
        </span>
      </div>
      <span className="p2d-strip-hint">{hint}</span>
      <div className="p2d-strip-actions">
        <button type="button" className="p2d-strip-button" aria-pressed={erasing} onClick={() => onErasing(!erasing)} title="Eraser (E)">
          <Eraser size={18} aria-hidden="true" />
          <span>Erase</span>
        </button>
      </div>
    </div>
  )
}
