import { Plus } from 'lucide-react'
import { STAGE_ID, useStudio, type StudioStore } from '../store'
import { CostumeThumb } from '../builder/tileArt'
import { cellCount } from '../builder/cells'
import { isCatalogBrick } from '../builder/catalog'
import { createNewBrick } from '../builder/newBrick'

/** Code's "In this level": every brick the level uses (and the Stage), like Scratch's sprite list, plus + New brick. */
export function LevelBricks({ store }: { store: StudioStore }) {
  const design = useStudio(store, (s) => s.project.design)
  const open = useStudio(store, (s) => s.selectedBrickId)
  // Placed bricks, plus the kid's own bricks even before they are placed, so they can be found again.
  const used = design.bricks.filter((b) => !isCatalogBrick(b) || (b.grid ? cellCount(design, b.grid.char) > 0 : design.copies.some((c) => c.brickId === b.id)))
  return (
    <section className="cl-level cl-panel" aria-label="In this level">
      <h2 className="cl-h">In this level</h2>
      <div className="cl-level-grid" role="list">
        {used.map((b) => (
          <button key={b.id} type="button" role="listitem" className="cl-tile" aria-current={b.id === open ? 'true' : undefined} onClick={() => store.openCode(b.id)}>
            <CostumeThumb asset={b.costumes[0]?.asset} box={34} />
            <span>{b.name}</span>
          </button>
        ))}
        <button type="button" role="listitem" className="cl-tile" aria-current={open === STAGE_ID ? 'true' : undefined} onClick={() => store.openCode(STAGE_ID)}>
          <span className="cl-stage-swatch" aria-hidden="true" />
          <span>Stage</span>
        </button>
        <button type="button" className="cl-tile cl-tile-new" onClick={() => createNewBrick(store)}>
          <Plus size={24} aria-hidden="true" />
          <span>New brick</span>
        </button>
      </div>
    </section>
  )
}
