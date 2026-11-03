import type { StudioMode } from '../store'
import type { PlayCameraMode } from './camera'

export interface StageControlsProps {
  mode: StudioMode
  codeView?: boolean
  pendingCodeChanges?: boolean
  paused?: boolean
  onTogglePlay?: () => void
  onRestart?: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  /** Current Play camera choice; null when the kid has scrolled/zoomed the view by hand. */
  playCamera?: PlayCameraMode | null
  onPlayCameraChoice?: (choice: PlayCameraMode) => void
  /** The follow camera button, naming the kit's player ("Follow the Hero", "Follow the Car"). */
  followLabel?: string
  /** The whole-level camera button: "Whole level", or "Whole track" in a race. */
  wholeLabel?: string
}

/**
 * The stage's small floating view tools: playback, zoom, fit and camera choice. Build or Play, and everything about placing, lives in the builder's own chrome, not here.
 */
export function StageControls({ mode, codeView = false, pendingCodeChanges = false, paused = false, onTogglePlay, onRestart, onZoomIn, onZoomOut, onResetView, playCamera = null, onPlayCameraChoice, followLabel = 'Follow the Hero', wholeLabel = 'Whole level' }: StageControlsProps) {
  const isPlay = mode === 'play'
  return (
    <div className={`stage-view-tools${codeView ? ' stage-view-tools-code' : ''}`} role="toolbar" aria-label="Stage view">
      {isPlay && <div className="stage-view-group" role="group" aria-label="Level playback">
        <button type="button" className="stage-view-btn" onClick={onTogglePlay} aria-label={paused ? 'Play level' : 'Pause level'}>{paused ? '▶ Play' : 'Ⅱ Pause'}</button>
        <button type="button" className="stage-view-btn" onClick={onRestart} aria-label="Restart level">↻ Restart</button>
      </div>}
      {codeView && pendingCodeChanges && <span className="stage-restart-note" role="status">Changes apply on Restart</span>}
      {isPlay && !codeView && onPlayCameraChoice && (
        <div className="stage-view-group" role="group" aria-label="Camera follows">
          <button
            type="button"
            className={`stage-view-btn${playCamera === 'whole' ? ' active' : ''}`}
            aria-label={wholeLabel === 'Whole level' ? 'Camera shows the whole level' : wholeLabel}
            aria-pressed={playCamera === 'whole'}
            title={wholeLabel === 'Whole level' ? 'Camera: whole level' : wholeLabel}
            onClick={() => onPlayCameraChoice('whole')}
          >
            {wholeLabel}
          </button>
          <button
            type="button"
            className={`stage-view-btn${playCamera === 'follow' ? ' active' : ''}`}
            aria-label={followLabel}
            aria-pressed={playCamera === 'follow'}
            title={followLabel}
            onClick={() => onPlayCameraChoice('follow')}
          >
            {followLabel}
          </button>
        </div>
      )}
      {!codeView && <div className="stage-view-group" role="group" aria-label="Zoom">
        <button type="button" className="stage-view-btn" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
          +
        </button>
        <button type="button" className="stage-view-btn" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <button type="button" className="stage-view-btn" aria-label="Reset view to fit" title="Fit the whole level" onClick={onResetView}>
          Fit
        </button>
      </div>}
    </div>
  )
}
