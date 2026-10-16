import type { StudioMode } from '../store'
import type { PlayCameraMode } from './camera'

export interface StageControlsProps {
  mode: StudioMode
  paused?: boolean
  onTogglePlay?: () => void
  onRestart?: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  /** Current Play camera choice; null when the kid has scrolled/zoomed the view by hand. */
  playCamera?: PlayCameraMode | null
  onPlayCameraChoice?: (choice: PlayCameraMode) => void
}

/**
 * The stage's small floating view tools: playback, zoom, fit and camera choice. Build or Play, and everything about placing, lives in the builder's own chrome, not here.
 */
export function StageControls({ mode, paused = false, onTogglePlay, onRestart, onZoomIn, onZoomOut, onResetView, playCamera = null, onPlayCameraChoice }: StageControlsProps) {
  const isPlay = mode === 'play'
  return (
    <div className="stage-view-tools" role="toolbar" aria-label="Stage view">
      {isPlay && <div className="stage-view-group" role="group" aria-label="Level playback">
        <button type="button" className="stage-view-btn" onClick={onTogglePlay} aria-label={paused ? 'Play level' : 'Pause level'}>{paused ? '▶ Play' : 'Ⅱ Pause'}</button>
        <button type="button" className="stage-view-btn" onClick={onRestart} aria-label="Restart level">↻ Restart</button>
      </div>}
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
            aria-label="Follow the Hero"
            aria-pressed={playCamera === 'follow'}
            title="Follow the Hero"
            onClick={() => onPlayCameraChoice('follow')}
          >
            Follow the Hero
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
