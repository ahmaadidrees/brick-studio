import { useBrickStore } from './store'

export function requestExploreMode() {
  const state = useBrickStore.getState()
  if (state.bricks.length === 0) {
    useBrickStore.setState({ toast: 'Place at least one brick before entering Explore.' })
    return false
  }
  state.setMode('explore')
  return true
}
