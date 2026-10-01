import { useEffect } from 'react'

export interface ConfirmModalProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="asset-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="asset-modal">
        <h3 className="asset-modal-title">{title}</h3>
        <p className="asset-modal-body">{message}</p>
        <div className="asset-modal-actions">
          <button type="button" className="asset-btn" onClick={onCancel} aria-label={cancelText}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`asset-btn ${danger ? 'asset-btn-danger' : 'asset-btn-primary'}`}
            onClick={onConfirm}
            aria-label={confirmText}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
