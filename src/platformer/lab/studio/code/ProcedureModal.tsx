import React, { useState } from 'react'
import {
  ALL_PROCEDURE_LABEL_WORDS,
  PROCEDURE_INPUT_WORDS,
  PROCEDURE_BOOLEAN_WORDS,
  PROCEDURE_LABEL_CATEGORIES,
} from './words'

export interface BlockPart {
  id: string
  type: 'label' | 'number_text' | 'boolean'
  value: string
}

export interface ProcedureData {
  proccode: string
  argumentNames: string[]
  warp: boolean
}

export interface ProcedureModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateProcedure: (data: ProcedureData) => void
}

export const ProcedureModal: React.FC<ProcedureModalProps> = ({
  isOpen,
  onClose,
  onCreateProcedure,
}) => {
  const [parts, setParts] = useState<BlockPart[]>([
    { id: 'initial_label', type: 'label', value: ALL_PROCEDURE_LABEL_WORDS[0] },
  ])
  const [warp, setWarp] = useState<boolean>(false)
  const [pickerTarget, setPickerTarget] = useState<{
    partId: string
    type: 'label' | 'number_text' | 'boolean'
  } | null>(null)
  const [activeTab, setActiveTab] = useState<string>('movement')

  if (!isOpen) return null

  // Format proccode & argumentNames
  const argumentNames: string[] = []
  const proccodeParts: string[] = []

  for (const p of parts) {
    if (p.type === 'label') {
      proccodeParts.push(p.value)
    } else if (p.type === 'number_text') {
      proccodeParts.push('%s')
      argumentNames.push(p.value)
    } else if (p.type === 'boolean') {
      proccodeParts.push('%b')
      argumentNames.push(p.value)
    }
  }

  const proccode = proccodeParts.join(' ')

  const handleAddPart = (type: 'label' | 'number_text' | 'boolean') => {
    const id = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    let defaultValue = ''
    if (type === 'label') {
      defaultValue = 'times'
    } else if (type === 'number_text') {
      defaultValue = PROCEDURE_INPUT_WORDS[argumentNames.length % PROCEDURE_INPUT_WORDS.length]
    } else {
      defaultValue = PROCEDURE_BOOLEAN_WORDS[0]
    }

    const nextParts = [...parts, { id, type, value: defaultValue }]
    setParts(nextParts)
    setPickerTarget({ partId: id, type })
  }

  const handleRemovePart = (id: string) => {
    // Keep at least one label
    if (parts.length <= 1) return
    setParts(parts.filter((p) => p.id !== id))
    if (pickerTarget?.partId === id) setPickerTarget(null)
  }

  const handleSelectWord = (word: string) => {
    if (!pickerTarget) return
    setParts(
      parts.map((p) => (p.id === pickerTarget.partId ? { ...p, value: word } : p)),
    )
    setPickerTarget(null)
  }

  const handleCreate = () => {
    onCreateProcedure({
      proccode,
      argumentNames,
      warp,
    })
    onClose()
  }

  return (
    <div
      className="code-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="procedure-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="code-modal-card procedure-card">
        {/* Header */}
        <div className="code-modal-header">
          <div className="code-modal-badge" style={{ backgroundColor: '#ff6680' }}>
            🧱
          </div>
          <h2 id="procedure-modal-title" className="code-modal-title">
            Make a Block
          </h2>
          <button
            type="button"
            className="code-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Live Block Preview */}
        <div className="code-procedure-preview-wrapper">
          <span className="code-procedure-preview-tag">Block Preview:</span>
          <div className="code-procedure-block-preview">
            <span className="code-procedure-define-text">define</span>
            {parts.map((part) => {
              if (part.type === 'label') {
                return (
                  <span
                    key={part.id}
                    className="code-preview-label-part"
                    onClick={() => setPickerTarget({ partId: part.id, type: 'label' })}
                    title="Click to pick a different word"
                  >
                    {part.value}
                  </span>
                )
              }
              if (part.type === 'number_text') {
                return (
                  <span
                    key={part.id}
                    className="code-preview-num-part"
                    onClick={() => setPickerTarget({ partId: part.id, type: 'number_text' })}
                    title="Number / text input"
                  >
                    ({part.value})
                  </span>
                )
              }
              return (
                <span
                  key={part.id}
                  className="code-preview-bool-part"
                  onClick={() => setPickerTarget({ partId: part.id, type: 'boolean' })}
                  title="Boolean condition input"
                >
                  &lt;{part.value}&gt;
                </span>
              )
            })}
            {warp && <span className="code-preview-warp-badge">⚡ warp</span>}
          </div>
        </div>

        {/* Current Block Segments Builder */}
        <div className="code-modal-section">
          <label className="code-modal-section-title">Block Parts</label>
          <div className="code-parts-list">
            {parts.map((part, index) => {
              const isTarget = pickerTarget?.partId === part.id
              return (
                <div
                  key={part.id}
                  className={`code-part-item ${isTarget ? 'highlight' : ''}`}
                >
                  <span className="code-part-badge">
                    {part.type === 'label'
                      ? 'Text'
                      : part.type === 'number_text'
                      ? 'Number / Text'
                      : 'Boolean'}
                  </span>
                  <button
                    type="button"
                    className="code-part-name-btn"
                    onClick={() => setPickerTarget({ partId: part.id, type: part.type })}
                  >
                    {part.value}
                    <span className="code-edit-icon">✏️</span>
                  </button>
                  {parts.length > 1 && (
                    <button
                      type="button"
                      className="code-part-del-btn"
                      onClick={() => handleRemovePart(part.id)}
                      aria-label={`Remove part ${index + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add Part Buttons */}
          <div className="code-add-parts-row">
            <button
              type="button"
              className="code-add-part-btn"
              onClick={() => handleAddPart('number_text')}
            >
              + Add an input (number or text)
            </button>
            <button
              type="button"
              className="code-add-part-btn"
              onClick={() => handleAddPart('boolean')}
            >
              + Add an input (boolean)
            </button>
            <button
              type="button"
              className="code-add-part-btn"
              onClick={() => handleAddPart('label')}
            >
              + Add a label
            </button>
          </div>
        </div>

        {/* Word Picker (when a part is selected to change) */}
        {pickerTarget && (
          <div className="code-modal-section code-word-picker-section">
            <div className="code-picker-header">
              <label className="code-modal-section-title">
                Pick a word for {pickerTarget.type === 'label' ? 'Label' : 'Input'}:
              </label>
              <button
                type="button"
                className="code-picker-done-btn"
                onClick={() => setPickerTarget(null)}
              >
                Done
              </button>
            </div>

            {pickerTarget.type === 'label' && (
              <div className="code-word-category-tabs">
                {PROCEDURE_LABEL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`code-category-pill ${activeTab === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            <div className="code-words-grid">
              {(pickerTarget.type === 'label'
                ? PROCEDURE_LABEL_CATEGORIES.find((c) => c.id === activeTab)?.words ??
                  ALL_PROCEDURE_LABEL_WORDS
                : pickerTarget.type === 'number_text'
                ? PROCEDURE_INPUT_WORDS
                : PROCEDURE_BOOLEAN_WORDS
              ).map((word) => (
                <button
                  key={word}
                  type="button"
                  className="code-word-btn"
                  onClick={() => handleSelectWord(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Warp Checkbox ("run without screen refresh") */}
        <div className="code-modal-section">
          <label className="code-knob-toggle-label">
            <input
              type="checkbox"
              className="code-knob-checkbox"
              checked={warp}
              onChange={(e) => setWarp(e.target.checked)}
            />
            <div className="code-knob-toggle-text">
              <strong>Run without screen refresh (warp speed)</strong>
              <p className="code-scope-desc">
                Executes all blocks in this custom block instantly within a single frame.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="code-modal-footer">
          <button
            type="button"
            className="code-btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="code-btn-primary"
            style={{ backgroundColor: '#ff6680' }}
            onClick={handleCreate}
          >
            Create Block
          </button>
        </div>
      </div>
    </div>
  )
}
