import React, { useState } from 'react'
import type { Runtime } from '../../core'
import { submitAnswer, type AskPrompt } from '../../core/sensing'
import { PICKED_ANSWERS } from './words'

export interface AskDialogProps {
  runtime: Runtime
  prompt: AskPrompt
}

export function AskDialog({ runtime, prompt }: AskDialogProps) {
  const [selectedAnswer, setSelectedAnswer] = useState('')

  const handleSubmit = (answer: string) => {
    submitAnswer(runtime, answer)
    setSelectedAnswer('')
  }

  return (
    <div className="stage-ask-dialog" role="dialog" aria-label="Question prompt">
      <div className="stage-ask-bubble">
        <span className="stage-ask-icon">💬</span>
        <span className="stage-ask-question">{prompt.question}</span>
      </div>

      <div className="stage-ask-chips" aria-label="Picked answers">
        {PICKED_ANSWERS.map((ans) => (
          <button
            key={ans}
            type="button"
            className={`stage-ask-chip ${selectedAnswer === ans ? 'selected' : ''}`}
            aria-label={`Answer ${ans}`}
            onClick={() => {
              setSelectedAnswer(ans)
              handleSubmit(ans)
            }}
          >
            {ans}
          </button>
        ))}
      </div>

      <form
        className="stage-ask-form"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit(selectedAnswer)
        }}
      >
        <input
          type="text"
          className="stage-ask-input"
          placeholder="Pick or type answer..."
          value={selectedAnswer}
          onChange={(e) => setSelectedAnswer(e.target.value)}
          aria-label="Answer text"
        />
        <button
          type="submit"
          className="stage-ask-submit-btn"
          aria-label="Submit answer"
        >
          ✓
        </button>
      </form>
    </div>
  )
}
