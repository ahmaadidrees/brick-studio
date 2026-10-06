import { TILE_SIZE, type LevelDesign, type TileLayer } from '../../core/contracts'
import type { StudioProject, StudioStore } from '../store'

/** An empty layer that covers the level (cols and rows capped at the contract's size limits, 400 by 60). */
export function blankTileLayer(bounds: LevelDesign['bounds']): TileLayer {
  const cols = Math.min(400, Math.max(1, Math.ceil((bounds.right - bounds.left) / TILE_SIZE)))
  const rows = Math.min(60, Math.max(1, Math.ceil((bounds.top - bounds.bottom) / TILE_SIZE)))
  return { cols, rows, data: Array.from({ length: rows }, () => '.'.repeat(cols)) }
}

/** The project with a tile layer, or the same project when it already has one (older saves have none). */
export function withTiles(project: StudioProject): StudioProject {
  if (project.design.tiles) return project
  return { ...project, design: { ...project.design, tiles: blankTileLayer(project.design.bounds) } }
}

/** Give an older save a tile layer so painting works. Runs at mount, in Build, before anything is selected. */
export function ensureTiles(store: StudioStore): void {
  const project = store.getState().project
  if (project.design.tiles) return
  // load() resets the selection; put back what the kid had armed and selected.
  const { selectedBrickId, selectedCopyId, brushBrickId, brushTile } = store.getState()
  store.load(withTiles(project))
  store.selectBrick(selectedBrickId)
  store.selectCopy(selectedCopyId)
  if (brushTile) store.setTileBrush(brushTile)
  else store.setBrush(brushBrickId)
}
