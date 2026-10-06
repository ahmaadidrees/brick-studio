import { Box, Eraser, Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ALL_CATEGORY, BRICK_DRAWER_LABELS, DrawerFab, DrawerPanel, DrawerSheet, DrawerToggle, HistoryTools, PartPicker, type DrawerItem } from '../../../../shell'
import { useStudio, type StudioStore } from '../store'
import {
  CATALOG_CATEGORIES,
  NEW_BRICK_ID,
  TILE_ENTRIES,
  activeEntryId,
  brickEntryId,
  brickIdOf,
  categoryForBrick,
  isBrickEntry,
  placeableBricks,
  tileEntryById,
} from './catalog'
import type { History } from './history'
import { copyToMove, limitOf } from './limits'
import { NewBrickPicker } from './NewBrickPicker'
import { SeeInsideCard } from './SeeInsideCard'
import { CostumeThumb, TileArt } from './tileArt'

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
  const brushTile = useStudio(store, (s) => s.brushTile)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  const items = useMemo<DrawerItem[]>(() => {
    const tiles = TILE_ENTRIES.map<DrawerItem>((t) => ({ id: t.id, name: t.label, category: t.category, thumbnail: <TileArt k={t.art} box={40} /> }))
    const mine = placeableBricks(bricks).map<DrawerItem>((b) => ({
      id: brickEntryId(b.id),
      name: b.name,
      category: categoryForBrick(b),
      thumbnail: <CostumeThumb asset={b.costumes[0]?.asset} box={40} />,
    }))
    const fresh: DrawerItem = { id: NEW_BRICK_ID, name: '+ New brick', category: 'mine', thumbnail: <Plus size={30} aria-hidden="true" className="builder-new-icon" /> }
    return [...tiles, ...mine, fresh]
  }, [bricks])

  const searchText = useCallback((item: DrawerItem) => `${item.id} ${CATEGORY_LABEL.get(item.category) ?? ''}`, [])
  const active = erasing ? null : activeEntryId(brushTile, brushBrickId)

  const choose = (id: string) => {
    if (id === NEW_BRICK_ID) {
      setPicking(true)
      return
    }
    onErasing(false)
    if (isBrickEntry(id)) {
      store.setBrush(brickIdOf(id))
      store.selectBrick(brickIdOf(id))
    } else {
      const tile = tileEntryById(id)
      if (tile) store.setTileBrush(tile.ch)
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
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const brushTile = useStudio(store, (s) => s.brushTile)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const tile = brushTile ? TILE_ENTRIES.find((t) => t.ch === brushTile) : undefined
  const brick = !brushTile && brushBrickId ? bricks.find((b) => b.id === brushBrickId) : undefined
  const label = tile?.label ?? brick?.name ?? 'Nothing'
  const design = useStudio(store, (s) => s.project.design)
  const moves = brick && !brushTile && copyToMove(design, brick.id)
  const hint = erasing
    ? 'Click or drag over things to remove them'
    : tile
      ? 'Click or drag to paint · right-click erases'
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
          {erasing ? <Eraser size={20} /> : tile ? <TileArt k={tile.art} box={30} /> : <CostumeThumb asset={brick?.costumes[0]?.asset} box={30} />}
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
