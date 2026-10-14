import { ArrowLeft, ArrowRight, Box, Eraser, Gift, Minus, Plus, RotateCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { LevelStyle, Theme } from '@brick-studio/platformer-core/engine/level'
import { ALL_CATEGORY, BRICK_DRAWER_LABELS, DrawerFab, DrawerPanel, DrawerSheet, DrawerToggle, HistoryTools, PartPicker, type DrawerItem } from '../../shell'
import type { Editor } from '../editor/editor'
import { computeLoop, LOOP_REASON_TEXT } from '@brick-studio/platformer-core/engine/laps'
import { RACE_MAX_LAPS } from '@brick-studio/platformer-core/engine/kits'
import type { Dir4 } from '@brick-studio/platformer-core/engine/raceTiles'
import { CATEGORIES, PALETTE, type PaletteItem } from '../editor/palette'
import { RACE_CATEGORIES, RACE_PALETTE, turnsWithR } from '../editor/racePalette'
import { RaceIcon } from '../race/RaceIcon'
import { Art } from './art'
import { PipePanel } from './PipePanel'

const DRAWER_ID = 'p2d-brick-drawer'
const DRAWER_CATEGORIES = [{ id: ALL_CATEGORY, label: 'All' }, ...CATEGORIES]
const RACE_DRAWER_CATEGORIES = [{ id: ALL_CATEGORY, label: 'All' }, ...RACE_CATEGORIES]
const CATEGORY_LABEL = new Map<string, string>([...CATEGORIES, ...RACE_CATEGORIES].map((c) => [c.id, c.label]))

/** Which way a race brick in hand points: boost pads by the editor, the grid and the finish line by the track's settings. */
function raceDir(editor: Editor, item: PaletteItem): Dir4 {
  if (item.id === 'race-boost') return editor.boostDir
  if (item.id === 'race-start') return editor.raceSettings.startDir
  if (item.id === 'race-finish') return editor.raceSettings.finishDir
  if (item.id === 'race-walker') return editor.walkerAxis
  return 0
}
const DIR_WORDS = ['right', 'down', 'left', 'up']

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
  const race = editor.race
  const palette = race ? RACE_PALETTE : PALETTE
  const items = useMemo<DrawerItem[]>(
    () =>
      (race ? RACE_PALETTE : PALETTE).map((it) => ({
        id: it.id,
        name: it.label,
        category: it.category,
        thumbnail: race ? <RaceIcon k={it.icon} box={40} className="p2d-part-art" /> : <Art k={themedIcon(it.icon, theme)} box={40} look={look} className="p2d-part-art" />,
      })),
    [theme, look, race],
  )
  // Search matches a brick's name, its category's name and the category's older name (critters were "enemies").
  const searchText = useCallback((item: DrawerItem) => `${item.id} ${item.category} ${CATEGORY_LABEL.get(item.category as never) ?? ''}`, [])
  const choose = (id: string) => {
    const item = palette.find((p) => p.id === id)
    if (item) editor.select(item)
  }
  const picker = (dense: boolean, onPicked?: () => void) => (
    <PartPicker
      items={items}
      categories={race ? RACE_DRAWER_CATEGORIES : DRAWER_CATEGORIES}
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
      {!race && <PipePanel editor={editor} />}
      {race && <LoopChip editor={editor} />}
      <PlacingStrip editor={editor} theme={theme} look={look} touch={touch} />
    </div>
  )
}

/** What a click (or tap) does right now, and the two tools that change it: flip and erase. */
function PlacingStrip({ editor, theme, look, touch }: { editor: Editor; theme: Theme; look: LevelStyle; touch: boolean }) {
  const item = editor.item
  const erasing = editor.erasing
  const race = editor.race
  const flips = !race && !erasing && (item.category === 'enemies' || item.category === 'gizmos')
  const turns = race && !erasing && turnsWithR(item)
  const laps = race ? editor.raceSettings.laps : 0
  const hint = editor.linkingPipe ? 'Choose another pipe, or an empty spot for its exit · Esc cancels' : editor.selectedPipe ? 'Pipe selected · choose an exit in Pipe settings' : erasing
    ? `${touch ? 'Tap' : 'Click'} or drag over things to remove them`
    : (item.hint ?? (touch ? 'Tap or drag to place' : 'Click or drag to place · right-click erases'))
  return (
    <div className="p2d-strip" role="group" aria-label="Placing">
      <div className="p2d-strip-chip" aria-live="polite">
        <span className="p2d-strip-swatch" aria-hidden="true">
          {erasing ? <Eraser size={20} /> : race ? <RaceIcon k={item.icon} box={30} dir={raceDir(editor, item)} /> : <Art k={themedIcon(item.icon, theme)} box={30} look={look} />}
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
        {turns && (
          <button type="button" className="p2d-strip-button" onClick={() => editor.turn()} title="Turn (R)" aria-label={`Points ${DIR_WORDS[raceDir(editor, item)]}. Turn`}>
            <RotateCw size={18} aria-hidden="true" />
            <span>Turn</span>
          </button>
        )}
        {race && (
          <span className="p2d-strip-laps" role="group" aria-label="Laps">
            <span>Laps</span>
            <button type="button" className="p2d-strip-button p2d-strip-icon" aria-label="Fewer laps" disabled={laps <= 1} onClick={() => editor.setRace({ laps: laps - 1 })}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <output aria-live="polite">{laps}</output>
            <button type="button" className="p2d-strip-button p2d-strip-icon" aria-label="More laps" disabled={laps >= RACE_MAX_LAPS} onClick={() => editor.setRace({ laps: laps + 1 })}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </span>
        )}
        {race && (
          <button
            type="button"
            className="p2d-strip-button"
            aria-pressed={editor.raceSettings.items}
            onClick={() => editor.setRace({ items: !editor.raceSettings.items })}
            title={editor.raceSettings.items ? 'Items on: ? blocks hand out items' : 'Items off: pure racing, ? blocks give nothing'}
          >
            <Gift size={18} aria-hidden="true" />
            <span>Items {editor.raceSettings.items ? 'on' : 'off'}</span>
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

/** Race tracks: whether laps count yet, and if not, why. Checked whenever the track changes. */
function LoopChip({ editor }: { editor: Editor }) {
  const w = editor.world
  const design = { ...w.design, race: editor.raceSettings }
  const loop = computeLoop(design)
  return (
    <div className={`p2d-loop-chip${loop.ok ? '' : ' p2d-loop-bad'}`} role="status">
      <span className="p2d-loop-dot" aria-hidden="true" />
      <span>
        <strong>{loop.ok ? 'Laps work' : 'Laps don’t count yet'}</strong>
        <small>{loop.ok ? `The road loops back to the finish · ${loop.length} bricks round` : LOOP_REASON_TEXT[loop.reason]}</small>
      </span>
    </div>
  )
}
