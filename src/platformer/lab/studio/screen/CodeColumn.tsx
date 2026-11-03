import { CodeEditor } from '../CodeEditor'
import { CostumeEditor } from '../CostumeEditor'
import { SoundPanel } from '../SoundPanel'
import { STAGE_ID, useStudio, type EditorTab, type StudioStore } from '../store'
import { CostumeThumb } from '../builder/tileArt'
import { isCatalogBrick, originalBrickName } from '../builder/catalog'
import { isFreshBrick, startBrickFromTemplate } from '../builder/newBrick'
import { BRICK_TEMPLATES, type BrickTemplate } from '../templates'
import { BrickName } from './BrickName'
import { PowersBar } from './PowersBar'
import { screensFor, type KitScreens } from '../kitScreens'
import '../assets/light.css'

const TABS: ReadonlyArray<{ id: EditorTab; label: string }> = [
  { id: 'code', label: 'Code' },
  { id: 'costumes', label: 'Costumes' },
  { id: 'sounds', label: 'Sounds' },
]

/**
 * "Start from…" in a fresh brick's empty script area: the kit's `codeStarts` (the Platformer: Walker, Coin, Spring and
 * Goal). Solid bricks paint on the grid, so they are not offered here.
 */
const startFrom = new WeakMap<KitScreens, readonly BrickTemplate[]>()
function startsFor(screens: KitScreens): readonly BrickTemplate[] {
  let found = startFrom.get(screens)
  if (!found) startFrom.set(screens, found = BRICK_TEMPLATES.filter((t) => screens.codeStarts.includes(t.id)))
  return found
}

/**
 * Code's left column, Scratch's arrangement: the brick's name with a quiet remix chip, Code · Costumes · Sounds, then
 * the palette and scripts. This is the only code editor.
 */
export function CodeColumn({ store, templates: given }: { store: StudioStore; templates?: readonly BrickTemplate[] }) {
  const screens = useStudio(store, (s) => screensFor(s.project.design))
  const templates = given ?? startsFor(screens)
  const brickId = useStudio(store, (s) => s.selectedBrickId)
  const tab = useStudio(store, (s) => s.editorTab)
  const brick = useStudio(store, (s) => (brickId === STAGE_ID ? s.project.design.stage : s.project.design.bricks.find((b) => b.id === brickId)))
  if (!brick) return null
  const isStage = brick.id === STAGE_ID
  const builtIn = isCatalogBrick(brick)
  const original = originalBrickName(brick) ?? brick.remixOf
  const chip = isStage ? 'Runs the whole level' : builtIn ? 'Built-in · change a block to make it yours' : brick.remixOf ? `Your own ${original}` : null
  const fresh = !isStage && !builtIn && !brick.remixOf && isFreshBrick(brick)

  return (
    <section className="cl-code cl-panel" aria-label={`${brick.name} code`}>
      <header className="cl-code-head">
        <span className="cl-thumb" aria-hidden="true"><CostumeThumb asset={brick.costumes[0]?.asset} box={30} /></span>
        <BrickName key={brick.id} store={store} brick={brick} readOnly={builtIn || isStage} />
        {chip && <span className="cl-chip">{chip}</span>}
        <div className="cl-tabs cl-tabs-inline" role="tablist" aria-label="Brick parts">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => store.setEditorTab(t.id)}>{t.label}</button>)}
          <span className="cl-tabs-ind" aria-hidden="true" data-at={TABS.findIndex((t) => t.id === tab)} data-of={3} />
        </div>
      </header>
      {/* A kit without powers (Hackable Racing) has no "+ Power"; a power a brick already has (from a file) still shows. */}
      {!brick.grid && (screens.powers || !!brick.powers?.length) && <PowersBar store={store} brick={brick} canAdd={screens.powers} />}
      <div className="cl-code-body">
        {tab === 'code' && <CodeEditor store={store} docked />}
        {tab === 'costumes' && <CostumeEditor store={store} />}
        {tab === 'sounds' && <SoundPanel store={store} />}
        {tab === 'code' && fresh && templates.length > 0 && <div className="cl-start cl-fade" role="group" aria-label="Start from a brick that works">
          <span>Drag blocks under the hat, or start from a brick that works:</span>
          <div className="cl-row">
            {templates.map((t) => <button key={t.id} type="button" className="cl-chip-btn" title={t.blurb} onClick={() => startBrickFromTemplate(store, brick.id, t)}>{t.label}</button>)}
          </div>
        </div>}
      </div>
    </section>
  )
}
