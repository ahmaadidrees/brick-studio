import React from 'react'

export interface EditorToolbarProps {
  targetName: string
  isStage: boolean
  diagnosticsCount: number
  showDiagnostics: boolean
  knobsCount: number
  onOpenVariableModal: (mode: 'variable' | 'list') => void
  onOpenProcedureModal: () => void
  onToggleDiagnostics: () => void
  onCleanUp: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  targetName,
  isStage,
  diagnosticsCount,
  showDiagnostics,
  knobsCount,
  onOpenVariableModal,
  onOpenProcedureModal,
  onToggleDiagnostics,
  onCleanUp,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  return (
    <header className="code-editor-toolbar" role="toolbar" aria-label="Code Editor Toolbar">
      {/* Target indicator */}
      <div className="code-toolbar-target-badge">
        <span className="code-target-icon">{isStage ? '🌍' : '🧱'}</span>
        <span className="code-target-label">
          {isStage ? 'Stage' : targetName}
        </span>
        {isStage && <span className="code-stage-tag">Global</span>}
      </div>

      {/* Creation Actions */}
      <div className="code-toolbar-group">
        <button
          type="button"
          className="code-toolbar-action-btn code-btn-var"
          onClick={() => onOpenVariableModal('variable')}
          title="Make a new variable (number or text)"
        >
          <span className="code-btn-icon">📊</span>
          <span>+ Variable</span>
        </button>

        <button
          type="button"
          className="code-toolbar-action-btn code-btn-list"
          onClick={() => onOpenVariableModal('list')}
          title="Make a new list"
        >
          <span className="code-btn-icon">📋</span>
          <span>+ List</span>
        </button>

        <button
          type="button"
          className="code-toolbar-action-btn code-btn-proc"
          onClick={onOpenProcedureModal}
          title="Make a custom block"
        >
          <span className="code-btn-icon">🧱</span>
          <span>+ Block</span>
        </button>
      </div>

      {/* Workspace View Controls */}
      <div className="code-toolbar-group code-toolbar-view-controls">
        <button
          type="button"
          className="code-toolbar-icon-btn"
          onClick={onCleanUp}
          title="Tidy up blocks into neat columns"
          aria-label="Tidy up blocks"
        >
          🧹 Tidy
        </button>
        <button
          type="button"
          className="code-toolbar-icon-btn"
          onClick={onZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          🔍+
        </button>
        <button
          type="button"
          className="code-toolbar-icon-btn"
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          🔍−
        </button>
        <button
          type="button"
          className="code-toolbar-icon-btn"
          onClick={onResetZoom}
          title="Reset zoom and center view"
          aria-label="Reset zoom"
        >
          🎯 Center
        </button>
      </div>

      {/* Status Badges */}
      <div className="code-toolbar-group code-toolbar-status-group">
        {knobsCount > 0 && !isStage && (
          <div className="code-knobs-pill" title={`${knobsCount} variable knob(s) appear on painted copies in Build mode`}>
            <span>🎛️ {knobsCount} Build {knobsCount === 1 ? 'Knob' : 'Knobs'}</span>
          </div>
        )}

        {diagnosticsCount > 0 && (
          <button
            type="button"
            className={`code-diagnostics-badge-btn ${showDiagnostics ? 'active' : ''}`}
            onClick={onToggleDiagnostics}
            title={`${diagnosticsCount} block notices`}
          >
            <span>⚠️ {diagnosticsCount} {diagnosticsCount === 1 ? 'Notice' : 'Notices'}</span>
          </button>
        )}
      </div>
    </header>
  )
}
