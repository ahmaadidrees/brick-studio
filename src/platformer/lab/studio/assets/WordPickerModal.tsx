import { useEffect, useRef } from 'react'

export interface WordPickerModalProps {
  title: string
  words: readonly string[]
  onSelect: (word: string) => void
  onClose: () => void
}

export function WordPickerModal({ title, words, onSelect, onClose }: WordPickerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="asset-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="asset-modal" ref={containerRef}>
        <h3 className="asset-modal-title">{title}</h3>
        <p className="asset-modal-body">Choose a word:</p>
        <div className="asset-word-grid">
          {words.map((word) => (
            <button
              key={word}
              type="button"
              className="asset-word-btn"
              onClick={() => onSelect(word)}
              aria-label={word}
            >
              {word}
            </button>
          ))}
        </div>
        <div className="asset-modal-actions">
          <button type="button" className="asset-btn" onClick={onClose} aria-label="Cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
