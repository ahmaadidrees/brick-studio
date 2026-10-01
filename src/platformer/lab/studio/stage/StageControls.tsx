import React from 'react'
import type { StudioMode } from '../store'
import type { PlayCameraMode } from './camera'

export interface StageControlsProps {
  mode: StudioMode
  activeTool: 'select' | 'brush'
  gridSnap: boolean
  onTogglePlay: () => void
  onGreenFlag: () => void
  onSelectTool: (tool: 'select' | 'brush') => void
  onToggleGridSnap: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  /** Current Play camera choice; null when the kid has scrolled/zoomed the view by hand. */
  playCamera?: PlayCameraMode | null
  onPlayCameraChoice?: (choice: PlayCameraMode) => void
}

export function StageControls({
  mode,
  activeTool,
  gridSnap,
  onTogglePlay,
  onGreenFlag,
  onSelectTool,
  onToggleGridSnap,
  onZoomIn,
  onZoomOut,
  onResetView,
  playCamera = null,
  onPlayCameraChoice,
}: StageControlsProps) {
  const isPlay = mode === 'play'

  return (
    <div className="stage-controls-bar" role="toolbar" aria-label="Stage controls">
      <div className="stage-controls-group">
        <button
          className="stage-ctrl-btn stage-flag-btn"
          aria-label="Green flag (start scripts)"
          title="Green Flag"
          onClick={onGreenFlag}
        >
          <span className="stage-flag-icon">⚑</span>
        </button>

        {isPlay ? (
          <button
            className="stage-ctrl-btn stage-stop-btn"
            aria-label="Stop simulation"
            title="Stop"
            onClick={onTogglePlay}
          >
            <span className="stage-stop-icon">⏹</span>
            <span>Stop</span>
          </button>
        ) : (
          <button
            className="stage-ctrl-btn stage-play-btn"
            aria-label="Play simulation"
            title="Play"
            onClick={onTogglePlay}
          >
            <span className="stage-play-icon">▶</span>
            <span>Play</span>
          </button>
        )}

        <div className={`stage-mode-badge ${mode}`} aria-label={`Current mode: ${mode}`}>
          {mode.toUpperCase()}
        </div>
      </div>

      {!isPlay && (
        <div className="stage-controls-group">
          <button
            className={`stage-ctrl-btn tool-btn ${activeTool === 'brush' ? 'active' : ''}`}
            aria-label="Brush tool (paint copy)"
            title="Brush (paint copy)"
            onClick={() => onSelectTool('brush')}
          >
            🖌️ Brush
          </button>
          <button
            className={`stage-ctrl-btn tool-btn ${activeTool === 'select' ? 'active' : ''}`}
            aria-label="Select tool (move and delete)"
            title="Select & Move"
            onClick={() => onSelectTool('select')}
          >
            ↖ Select
          </button>
          <button
            className={`stage-ctrl-btn snap-btn ${gridSnap ? 'active' : ''}`}
            aria-label={`Toggle 8-step grid snap (currently ${gridSnap ? 'on' : 'off'})`}
            title="Toggle 8-step Grid Snap"
            onClick={onToggleGridSnap}
          >
            ▦ Snap 8
          </button>
        </div>
      )}

      {isPlay && onPlayCameraChoice && (
        <div className="stage-controls-group" role="group" aria-label="Camera follows">
          <button
            className={`stage-ctrl-btn tool-btn ${playCamera === 'whole' ? 'active' : ''}`}
            aria-label="Camera shows the whole level"
            aria-pressed={playCamera === 'whole'}
            title="Camera: whole level"
            onClick={() => onPlayCameraChoice('whole')}
          >
            Whole level
          </button>
          <button
            className={`stage-ctrl-btn tool-btn ${playCamera === 'follow' ? 'active' : ''}`}
            aria-label="Camera follows the selected brick"
            aria-pressed={playCamera === 'follow'}
            title="Camera follows the selected brick"
            onClick={() => onPlayCameraChoice('follow')}
          >
            Follow brick
          </button>
        </div>
      )}

      <div className="stage-controls-group zoom-group">
        <button
          className="stage-ctrl-btn zoom-btn"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={onZoomIn}
        >
          +
        </button>
        <button
          className="stage-ctrl-btn zoom-btn"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={onZoomOut}
        >
          −
        </button>
        <button
          className="stage-ctrl-btn zoom-btn reset-btn"
          aria-label="Reset view to fit"
          title="Reset View"
          onClick={onResetView}
        >
          Fit
        </button>
      </div>
    </div>
  )
}
