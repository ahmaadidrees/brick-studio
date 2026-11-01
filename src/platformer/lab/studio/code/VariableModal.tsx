import React, { useEffect, useRef, useState } from 'react'
import { MAX_VARIABLE_NAME } from './variables'
import {
  VARIABLE_CATEGORIES,
  LIST_CATEGORIES,
  ALL_VARIABLE_WORDS,
  ALL_LIST_WORDS,
} from './words'

export interface VariableModalProps {
  isOpen: boolean
  mode: 'variable' | 'list'
  isStage: boolean
  onClose: () => void
  onCreateVariable: (name: string, scope: 'brick' | 'stage', showInBuild: boolean) => void
  onCreateList: (name: string, scope: 'brick' | 'stage') => void
  /** Why a name can't be used for this scope (empty, too long, already used), or null when it is fine. */
  nameProblem?: (name: string, scope: 'brick' | 'stage') => string | null
}

export const VariableModal: React.FC<VariableModalProps> = ({
  isOpen,
  mode,
  isStage,
  onClose,
  onCreateVariable,
  onCreateList,
  nameProblem = () => null,
}) => {
  const isVar = mode === 'variable'
  const categories = isVar ? VARIABLE_CATEGORIES : LIST_CATEGORIES

  // Kids type a name; the words below are suggestions that fill it in.
  const [selectedWord, setSelectedWord] = useState<string>('')
  const [tried, setTried] = useState<boolean>(false)
  const nameInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (isOpen) nameInput.current?.focus()
  }, [isOpen])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [scope, setScope] = useState<'brick' | 'stage'>(isStage ? 'stage' : 'brick')
  const [showInBuild, setShowInBuild] = useState<boolean>(false)

  if (!isOpen) return null

  const displayedWords =
    activeCategory === 'all'
      ? isVar
        ? ALL_VARIABLE_WORDS
        : ALL_LIST_WORDS
      : categories.find((c) => c.id === activeCategory)?.words ?? []

  const effectiveScope = isStage ? 'stage' : scope
  const problem = nameProblem(selectedWord, effectiveScope)
  // "Type a name first" waits until the kid tries to create; a name already used shows at once.
  const shownProblem = problem && (tried || selectedWord.trim() !== '') ? problem : null

  const handleCreate = () => {
    setTried(true)
    if (problem) return
    const name = selectedWord.trim()
    if (isVar) {
      onCreateVariable(name, effectiveScope, effectiveScope === 'brick' && showInBuild)
    } else {
      onCreateList(name, effectiveScope)
    }
    onClose()
  }

  return (
    <div
      className="code-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="variable-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="code-modal-card">
        {/* Header */}
        <div className="code-modal-header">
          <div className="code-modal-badge" style={{ backgroundColor: isVar ? '#ff8c1a' : '#ff661a' }}>
            {isVar ? '📊' : '📋'}
          </div>
          <h2 id="variable-modal-title" className="code-modal-title">
            {isVar ? 'Make a Variable' : 'Make a List'}
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

        {/* The name: typed, or filled in from a word below */}
        <form className="code-modal-section code-name-section" onSubmit={(e) => { e.preventDefault(); handleCreate() }}>
          <label className="code-modal-section-title" htmlFor="variable-name-input">Name</label>
          <input
            id="variable-name-input"
            ref={nameInput}
            className="code-name-input"
            value={selectedWord}
            maxLength={MAX_VARIABLE_NAME}
            placeholder={isVar ? 'Type a name, like lives' : 'Type a name, like treasure'}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!shownProblem}
            aria-describedby={shownProblem ? 'variable-name-problem' : undefined}
            onChange={(e) => setSelectedWord(e.target.value)}
          />
          {shownProblem && <p id="variable-name-problem" className="code-name-problem" role="status">{shownProblem}</p>}
          <p className="code-name-hint">Or pick a word:</p>
        </form>

        {/* Category Filter Pills */}
        <div className="code-word-category-tabs" role="tablist" aria-label="Word categories">
          <button
            type="button"
            className={`code-category-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
            role="tab"
            aria-selected={activeCategory === 'all'}
          >
            All Words
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`code-category-pill ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              role="tab"
              aria-selected={activeCategory === cat.id}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Word Grid */}
        <div className="code-words-grid" role="group" aria-label="Pick a word">
          {displayedWords.map((word) => {
            const isSelected = selectedWord.trim().toLowerCase() === word.toLowerCase()
            return (
              <button
                key={word}
                type="button"
                className={`code-word-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedWord(word)}
                aria-pressed={isSelected}
              >
                {word}
                {isSelected && <span className="code-word-check">✓</span>}
              </button>
            )
          })}
        </div>

        {/* Scope Options */}
        <div className="code-modal-section">
          <label className="code-modal-section-title">Who uses it</label>
          {isStage ? (
            <div className="code-modal-hint-box">
              <span>🌍 Stage variables and lists are shared for all bricks.</span>
            </div>
          ) : (
            <div className="code-scope-options" role="radiogroup" aria-label="Who uses it">
              <button
                type="button"
                className={`code-scope-card ${scope === 'brick' ? 'active' : ''}`}
                onClick={() => setScope('brick')}
                role="radio"
                aria-checked={scope === 'brick'}
              >
                <div className="code-scope-card-header">
                  <span className="code-scope-radio">{scope === 'brick' ? '●' : '○'}</span>
                  <strong>For this brick only</strong>
                </div>
                <p className="code-scope-desc">
                  Each copy placed in the level gets its own value.
                </p>
              </button>

              <button
                type="button"
                className={`code-scope-card ${scope === 'stage' ? 'active' : ''}`}
                onClick={() => setScope('stage')}
                role="radio"
                aria-checked={scope === 'stage'}
              >
                <div className="code-scope-card-header">
                  <span className="code-scope-radio">{scope === 'stage' ? '●' : '○'}</span>
                  <strong>For all bricks (shared)</strong>
                </div>
                <p className="code-scope-desc">
                  One value that every brick and the Stage share.
                </p>
              </button>
            </div>
          )}
        </div>

        {/* Show in Build Knob toggle (for brick variables only) */}
        {isVar && !isStage && scope === 'brick' && (
          <div className="code-modal-section">
            <label className="code-knob-toggle-label">
              <input
                type="checkbox"
                className="code-knob-checkbox"
                checked={showInBuild}
                onChange={(e) => setShowInBuild(e.target.checked)}
              />
              <div className="code-knob-toggle-text">
                <strong>Show as a slider</strong>
                <p className="code-scope-desc">
                  Adds an adjustable slider to this brick’s card in Build mode.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Footer Actions */}
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
            style={{ backgroundColor: isVar ? '#ff8c1a' : '#ff661a' }}
            disabled={!!shownProblem}
            onClick={handleCreate}
          >
            Create {isVar ? 'Variable' : 'List'}
          </button>
        </div>
      </div>
    </div>
  )
}
