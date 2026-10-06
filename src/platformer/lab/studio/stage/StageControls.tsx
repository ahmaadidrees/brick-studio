import type { StudioMode } from '../store'
import type { PlayCameraMode } from './camera'

export interface StageControlsProps {
  mode: StudioMode
  onGreenFlag: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  /** Current Play camera choice; null when the kid has scrolled/zoomed the view by hand. */
  playCamera?: PlayCameraMode | null
  onPlayCameraChoice?: (choice: PlayCameraMode) => void
}

/**
 * The stage's small floating view tools (top right of the level): zoom and fit, and in Play the green flag and the
 * camera choice. Build or Play, and everything about placing, lives in the builder's own chrome, not here.
 */
export function StageControls({ mode, onGreenFlag, onZoomIn, onZoomOut, onResetView, playCamera = null, onPlayCameraChoice }: StageControlsProps) {
  const isPlay = mode === 'play'
  return (
    <div className="stage-view-tools" role="toolbar" aria-label="Stage view">
      {isPlay && (
        <button type="button" className="stage-view-btn stage-view-flag" aria-label="Green flag (start scripts)" title="Green flag" onClick={onGreenFlag}>
          <span aria-hidden="true">⚑</span>
        </button>
      )}
      {isPlay && onPlayCameraChoice && (
        <div className="stage-view-group" role="group" aria-label="Camera follows">
          <button
            type="button"
            className={`stage-view-btn${playCamera === 'whole' ? ' active' : ''}`}
            aria-label="Camera shows the whole level"
            aria-pressed={playCamera === 'whole'}
            title="Camera: whole level"
            onClick={() => onPlayCameraChoice('whole')}
          >
            Whole level
          </button>
          <button
            type="button"
            className={`stage-view-btn${playCamera === 'follow' ? ' active' : ''}`}
            aria-label="Camera follows the selected brick"
            aria-pressed={playCamera === 'follow'}
            title="Camera follows the selected brick"
            onClick={() => onPlayCameraChoice('follow')}
          >
            Follow brick
          </button>
        </div>
      )}
      <div className="stage-view-group" role="group" aria-label="Zoom">
        <button type="button" className="stage-view-btn" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
          +
        </button>
        <button type="button" className="stage-view-btn" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <button type="button" className="stage-view-btn" aria-label="Reset view to fit" title="Fit the whole level" onClick={onResetView}>
          Fit
        </button>
      </div>
    </div>
  )
}
