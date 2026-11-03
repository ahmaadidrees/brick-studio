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
      title: 'This block is not snapped on',
      hint: "Snap it under a top block like 'when ⚑ clicked' so it runs.",
    }
  }

  if (diagnostic.code === 'block.no_type') {
    return {
      title: 'Unrecognized block',
      hint: 'This block could not be recognized. Try replacing it from the block menu.',
    }
  }

  if (diagnostic.code === 'block.unknown') {
    return {
      title: 'This block can’t run',
      hint: diagnostic.message,
    }
  }

  if (diagnostic.code === 'workspace.invalid_json' || diagnostic.code === 'workspace.invalid') {
    return {
      title: 'These blocks would not open',
      hint: 'Something went wrong. Try Undo, or open the project again.',
    }
  }

  if (diagnostic.code === 'block.nameless_input') {
    return {
      title: 'A slot lost its name',
      hint: 'Drag it from the My Blocks list into this spot again.',
    }
  }

  // Fallback with clean wording
  return {
    title: 'This block needs a look',
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
    <div className="code-diagnostics-drawer" role="region" aria-label="Blocks to check">
      <div className="code-diagnostics-header">
        <div className="code-diagnostics-title-group">
          <span className="code-diagnostics-icon">⚠️</span>
          <strong>
            {diagnostics.length} {diagnostics.length === 1 ? 'block needs' : 'blocks need'} a look
          </strong>
        </div>
        {onDismiss && (
          <button
            type="button"
            className="code-diagnostics-close"
            onClick={onDismiss}
            aria-label="Hide this list"
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
              title={hasBlockId ? 'Show me this block' : undefined}
            >
              <div className="code-diagnostic-badge">
                {d.severity === 'error' ? '🛑' : '⚠️'}
              </div>
              <div className="code-diagnostic-content">
                <span className="code-diagnostic-item-title">{title}</span>
                <span className="code-diagnostic-item-hint">{hint}</span>
              </div>
              {hasBlockId && (
                <span className="code-diagnostic-jump-tag">Show me ➔</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
