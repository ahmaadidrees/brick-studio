import { useRef } from 'react'

interface Props {
  canUndo: boolean
  canRedo: boolean
  diagnosticsCount: number
  showDiagnostics: boolean
  onUndo: () => void
  onRedo: () => void
  onToggleDiagnostics: () => void
  onCleanUp: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

/** The dock's only toolbar. Creation lives in its corresponding block palette. */
export function DockedEditorToolbar(props: Props) {
  const menu = useRef<HTMLDetailsElement>(null)
  const run = (action: () => void) => {
    action()
    if (menu.current) menu.current.open = false
  }
  return (
    <header className="code-editor-toolbar code-editor-toolbar-compact" role="toolbar" aria-label="Code Editor Toolbar">
      <button type="button" className="code-toolbar-icon-btn" disabled={!props.canUndo} onClick={props.onUndo} aria-label="Undo code" title="Undo code (Ctrl+Z)">↩ Undo</button>
      <button type="button" className="code-toolbar-icon-btn" disabled={!props.canRedo} onClick={props.onRedo} aria-label="Redo code" title="Redo code (Ctrl+Shift+Z)">↪ Redo</button>
      {props.diagnosticsCount > 0 && <button type="button" className="code-diagnostics-badge-btn" aria-pressed={props.showDiagnostics} onClick={props.onToggleDiagnostics}>{props.diagnosticsCount} {props.diagnosticsCount === 1 ? 'notice' : 'notices'}</button>}
      <details ref={menu} className="code-view-options" onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          event.stopPropagation()
          menu.current.open = false
          menu.current.querySelector('summary')?.focus()
        }
      }}>
        <summary aria-label="Code view options" title="Code view options">⋯</summary>
        <div className="code-view-options-panel" role="group" aria-label="Code view actions">
          <button type="button" onClick={() => run(props.onCleanUp)}>Tidy blocks</button>
          <button type="button" onClick={() => run(props.onResetZoom)}>Center code</button>
          <button type="button" onClick={() => run(props.onZoomIn)}>Zoom in</button>
          <button type="button" onClick={() => run(props.onZoomOut)}>Zoom out</button>
        </div>
      </details>
    </header>
  )
}
