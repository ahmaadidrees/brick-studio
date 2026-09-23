import { ArrowLeft, ArrowRight, Box, Eraser } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { LevelStyle, Theme } from '@brick-studio/platformer-core/engine/level'
import { ALL_CATEGORY, BRICK_DRAWER_LABELS, DrawerFab, DrawerPanel, DrawerSheet, DrawerToggle, HistoryTools, PartPicker, type DrawerItem } from '../../shell'
import type { Editor } from '../editor/editor'
import { CATEGORIES, PALETTE } from '../editor/palette'
import { Art } from './art'

const DRAWER_ID = 'p2d-brick-drawer'
const DRAWER_CATEGORIES = [{ id: ALL_CATEGORY, label: 'All' }, ...CATEGORIES]
const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]))

/** Ground art follows the level's look; everything else looks the same in every theme. */
const themedIcon = (icon: string, theme: Theme) => icon.replace(/:day$/, `:${theme}`)

interface Props {
  editor: Editor
  theme: Theme
  /** The level's look: the drawer shows its blocks the way the level draws them. */
  look: LevelStyle
  /** Narrow and portrait screens: a button and a bottom sheet instead of the docked drawer. */
  compact: boolean
  touch: boolean
  drawerOpen: boolean
  onDrawerOpen: (open: boolean) => void
}

/**
 * Building a 2D level, laid out like the 3D studio: the Bricks drawer on the left (the same drawer, and name, as the 3D studio's),
 * Undo and Redo beside it, and a strip along the bottom saying what a click places.
 */
export function BuildShell({ editor, theme, look, compact, touch, drawerOpen, onDrawerOpen }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const items = useMemo<DrawerItem[]>(
    () => PALETTE.map((it) => ({ id: it.id, name: it.label, category: it.category, thumbnail: <Art k={themedIcon(it.icon, theme)} box={40} look={look} className="p2d-part-art" /> })),
    [theme, look],
  )
  // Search matches a brick's name, its category's name and the category's older name (critters were "enemies").
  const searchText = useCallback((item: DrawerItem) => `${item.id} ${item.category} ${CATEGORY_LABEL.get(item.category as never) ?? ''}`, [])
  const choose = (id: string) => {
    const item = PALETTE.find((p) => p.id === id)
    if (item) editor.select(item)
  }
  const picker = (dense: boolean, onPicked?: () => void) => (
    <PartPicker
      items={items}
      categories={DRAWER_CATEGORIES}
      activeId={editor.erasing ? null : editor.item.id}
      onChoose={(id) => {
        choose(id)
        onPicked?.()
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
        <HistoryTools onUndo={() => editor.undo()} onRedo={() => editor.redo()} canUndo={editor.undoStack.length > 0} canRedo={editor.redoStack.length > 0} />
      </div>
      <PlacingStrip editor={editor} theme={theme} look={look} touch={touch} />
    </div>
  )
}

/** What a click (or tap) does right now, and the two tools that change it: flip and erase. */
function PlacingStrip({ editor, theme, look, touch }: { editor: Editor; theme: Theme; look: LevelStyle; touch: boolean }) {
  const item = editor.item
  const erasing = editor.erasing
  const flips = !erasing && (item.category === 'enemies' || item.category === 'gizmos')
  const hint = erasing
    ? `${touch ? 'Tap' : 'Click'} or drag over things to remove them`
    : (item.hint ?? (touch ? 'Tap or drag to place' : 'Click or drag to place · right-click erases'))
  return (
    <div className="p2d-strip" role="group" aria-label="Placing">
      <div className="p2d-strip-chip" aria-live="polite">
        <span className="p2d-strip-swatch" aria-hidden="true">
          {erasing ? <Eraser size={20} /> : <Art k={themedIcon(item.icon, theme)} box={30} look={look} />}
        </span>
        <span className="p2d-strip-text">
          <span className="p2d-strip-kicker">{erasing ? 'Erasing' : 'Placing'}</span>
          <strong>{erasing ? 'Eraser' : item.label}</strong>
        </span>
      </div>
      <span className="p2d-strip-hint">{hint}</span>
      <div className="p2d-strip-actions">
        {flips && (
          <button type="button" className="p2d-strip-button" onClick={() => editor.flip()} title="Flip (R)" aria-label={`Facing ${editor.dir < 0 ? 'left' : 'right'}. Flip`}>
            {editor.dir < 0 ? <ArrowLeft size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
            <span>Flip</span>
          </button>
        )}
        <button type="button" className="p2d-strip-button" aria-pressed={erasing} onClick={() => editor.setErasing(!erasing)} title="Eraser (E)">
          <Eraser size={18} aria-hidden="true" />
          <span>Erase</span>
        </button>
      </div>
    </div>
  )
}
