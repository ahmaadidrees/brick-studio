import React from 'react'
import type { CopyPlacement, Value, VariableDecl } from '../../core/contracts'
import type { StudioStore } from '../store'

export interface KnobPanelProps {
  store: StudioStore
  copy: CopyPlacement
  brickName: string
  variables: VariableDecl[]
}

export function KnobPanel({ store, copy, brickName, variables }: KnobPanelProps) {
  const knobs = copy.knobs ?? {}

  const handleValueChange = (varId: string, currentVal: Value, delta: number) => {
    if (typeof currentVal === 'number') {
      const nextVal = Math.round((currentVal + delta) * 10) / 10
      store.setKnob(copy.id, varId, nextVal)
    }
  }

  const handleBooleanToggle = (varId: string, currentVal: Value) => {
    store.setKnob(copy.id, varId, !currentVal)
  }

  return (
    <div className="stage-knob-panel" aria-label="Copy settings">
      <div className="stage-knob-header">
        <span className="stage-knob-title">
          <strong>{brickName}</strong> (copy)
        </span>
        <button
          className="stage-knob-delete-btn"
          aria-label="Delete copy"
          title="Delete this copy"
          onClick={() => store.deleteCopy(copy.id)}
        >
          ✕ Delete
        </button>
      </div>

      <div className="stage-knob-coords">
        <span>X: {Math.round(copy.x)}</span>
        <span>Y: {Math.round(copy.y)}</span>
      </div>

      {variables.length > 0 ? (
        <div className="stage-knob-list">
          {variables.map((v) => {
            const val = knobs[v.id] ?? v.value
            return (
              <div key={v.id} className="stage-knob-row">
                <span className="stage-knob-label">{v.name}</span>
                {typeof val === 'boolean' ? (
                  <button
                    className={`stage-knob-toggle-btn ${val ? 'on' : 'off'}`}
                    aria-label={`Toggle ${v.name}`}
                    onClick={() => handleBooleanToggle(v.id, val)}
                  >
                    {val ? 'TRUE' : 'FALSE'}
                  </button>
                ) : typeof val === 'number' ? (
                  <div className="stage-knob-number-stepper">
                    <button
                      className="stage-knob-step-btn"
                      aria-label={`Decrease ${v.name}`}
                      onClick={() => handleValueChange(v.id, val, -1)}
                    >
                      −
                    </button>
                    <span className="stage-knob-val-text">{val}</span>
                    <button
                      className="stage-knob-step-btn"
                      aria-label={`Increase ${v.name}`}
                      onClick={() => handleValueChange(v.id, val, 1)}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    className="stage-knob-input"
                    aria-label={`Value for ${v.name}`}
                    value={String(val)}
                    onChange={(e) => store.setKnob(copy.id, v.id, e.target.value)}
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="stage-knob-empty">No build knobs on this brick.</div>
      )}
    </div>
  )
}
