import React from 'react'
import type { Diagnostic } from '../../core/editor/compile'

export interface DiagnosticsListProps {
  diagnostics: Diagnostic[]
  onSelectBlock?: (blockId: string) => void
  onDismiss?: () => void
}

/**
 * Translates compiler diagnostics into clear, friendly kid words.
 */
export function formatKidDiagnostic(diagnostic: Diagnostic): { title: string; hint: string } {
  if (diagnostic.code === 'block.disconnected') {
    return {
      title: "Block isn't connected",
      hint: "Snap this block under a hat block like 'when ⚑ clicked' to make it run!",
    }
  }

  if (diagnostic.code === 'block.no_type') {
    return {
      title: 'Unrecognized block',
      hint: 'This block could not be recognized. Try replacing it from the block menu.',
    }
  }

  if (diagnostic.code === 'workspace.invalid_json' || diagnostic.code === 'workspace.invalid') {
    return {
      title: 'Could not load blocks',
      hint: 'Something went wrong loading this workspace.',
    }
  }

  // Fallback with clean wording
  return {
    title: 'Block needs attention',
    hint: diagnostic.message,
  }
}

export const DiagnosticsList: React.FC<DiagnosticsListProps> = ({
  diagnostics,
  onSelectBlock,
  onDismiss,
}) => {
  if (!diagnostics || diagnostics.length === 0) return null

  return (
    <div className="code-diagnostics-drawer" role="region" aria-label="Block diagnostics">
      <div className="code-diagnostics-header">
        <div className="code-diagnostics-title-group">
          <span className="code-diagnostics-icon">⚠️</span>
          <strong>
            {diagnostics.length} {diagnostics.length === 1 ? 'block needs' : 'blocks need'} attention
          </strong>
        </div>
        {onDismiss && (
          <button
            type="button"
            className="code-diagnostics-close"
            onClick={onDismiss}
            aria-label="Hide notices"
          >
            ✕
          </button>
        )}
      </div>

      <div className="code-diagnostics-items">
        {diagnostics.map((d, index) => {
          const { title, hint } = formatKidDiagnostic(d)
          const hasBlockId = Boolean(d.blockId)

          return (
            <button
              key={`${d.blockId ?? index}-${index}`}
              type="button"
              className={`code-diagnostic-item ${hasBlockId ? 'clickable' : ''}`}
              onClick={() => {
                if (d.blockId && onSelectBlock) {
                  onSelectBlock(d.blockId)
                }
              }}
              title={hasBlockId ? 'Click to highlight and jump to this block' : undefined}
            >
              <div className="code-diagnostic-badge">
                {d.severity === 'error' ? '🛑' : '⚠️'}
              </div>
              <div className="code-diagnostic-content">
                <span className="code-diagnostic-item-title">{title}</span>
                <span className="code-diagnostic-item-hint">{hint}</span>
              </div>
              {hasBlockId && (
                <span className="code-diagnostic-jump-tag">Jump to block ➔</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
