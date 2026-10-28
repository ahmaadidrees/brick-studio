import { useEffect, useState } from 'react'
import { BRICK_WORDS } from '../assets/words'
import type { StudioStore } from '../store'
import { BRICK_TEMPLATES, type BrickTemplate } from '../templates'
import { createBlankBrick, createBrickFromTemplate } from './newBrick'

/**
 * "Make a new brick": start from a brick that works. Pick a template, pick a name from the word list, and the Brick
 * Workshop opens on it. With no templates yet (the starter lane fills them in) a blank brick is offered instead.
 */
export function NewBrickPicker({ store, templates = BRICK_TEMPLATES, onClose }: { store: StudioStore; templates?: readonly BrickTemplate[]; onClose: () => void }) {
  // 'blank' means the kid chose the fallback blank brick and is naming it.
  const [chosen, setChosen] = useState<BrickTemplate | 'blank' | null>(null)

  useEffect(() => {
    if (chosen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chosen, onClose])

  if (chosen) {
    return (
      <NamePicker
        existingNames={store.getState().project.design.bricks.map((b) => b.name)}
        onBack={() => setChosen(null)}
        onPick={(word) => {
          if (chosen === 'blank') createBlankBrick(store, word)
          else createBrickFromTemplate(store, chosen, word)
          onClose()
        }}
      />
    )
  }

  return (
    <div className="builder-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="builder-modal" role="dialog" aria-modal="true" aria-label="Make a new brick">
        <h2 className="builder-modal-title">Make a new brick</h2>
        <p className="builder-modal-sub">Start from a brick that works, then change it.</p>
        {templates.length === 0 ? (
          <div className="builder-template-grid">
            <p className="builder-modal-empty" role="status">Starter bricks are not ready yet. You can still start with a blank one.</p>
            <button type="button" className="builder-template" onClick={() => setChosen('blank')}>
              <strong>Blank brick</strong>
              <span>an empty brick to draw and code</span>
            </button>
          </div>
        ) : (
          <div className="builder-template-grid" role="group" aria-label="Brick templates">
            {templates.map((t) => (
              <button key={t.id} type="button" className="builder-template" onClick={() => setChosen(t)}>
                <strong>{t.label}</strong>
                <span>{t.blurb}</span>
              </button>
            ))}
          </div>
        )}
        <div className="builder-modal-actions">
          <button type="button" className="builder-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** Names come from a picked word list; kids don't type free text. */
function NamePicker({ onPick, onBack, existingNames }: { onPick: (word: string) => void; onBack: () => void; existingNames: string[] }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])
  return (
    <div className="builder-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onBack()}>
      <div className="builder-modal" role="dialog" aria-modal="true" aria-label="Pick a name for your brick">
        <h2 className="builder-modal-title">Pick a name for your brick</h2>
        <p className="builder-modal-sub">Pick a name that is not already in your level.</p>
        <div className="builder-word-grid">
          {BRICK_WORDS.map((word) => (
            <button key={word} type="button" className="builder-word" disabled={existingNames.some((name) => name.toLowerCase() === word.toLowerCase())} title={existingNames.some((name) => name.toLowerCase() === word.toLowerCase()) ? 'Already in this level — pick another name' : undefined} onClick={() => onPick(word)}>
              {word}
            </button>
          ))}
        </div>
        <div className="builder-modal-actions">
          <button type="button" className="builder-btn" onClick={onBack}>Back</button>
        </div>
      </div>
    </div>
  )
}
