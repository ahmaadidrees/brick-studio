import React from 'react'
import { breadcrumb, goToDepth, isTop, proccodeWords, type LayerState } from './layers'

interface Props {
  brickName: string
  state: LayerState
  definitions: string[]
  onChange: (next: LayerState) => void
  onBack: () => void
  onOpen: (proccode: string) => void
}

/** Top view: the "My Blocks" shelf. Drilled in: breadcrumb and Back. */
export const LayerBar: React.FC<Props> = ({ brickName, state, definitions, onChange, onBack, onOpen }) => {
  if (isTop(state)) {
    if (definitions.length === 0) return null
    return (
      <nav className="layer-bar layer-shelf" aria-label="My Blocks">
        <span className="layer-shelf-title">My Blocks</span>
        {definitions.map((code) => (
          <button key={code} type="button" className="layer-chip" onClick={() => onOpen(code)} aria-label={`See inside ${proccodeWords(code)}`}>
            🔍 {proccodeWords(code)}
          </button>
        ))}
      </nav>
    )
  }
  const crumbs = breadcrumb(state, brickName)
  return (
    <nav className="layer-bar layer-crumbs" aria-label="Where you are">
      <button type="button" className="layer-back" onClick={onBack}>
        ← Back
      </button>
      <ol className="layer-trail">
        {crumbs.map((c, i) => (
          <li key={`${i}-${c}`}>
            {i < crumbs.length - 1 ? (
              <button type="button" className="layer-crumb" onClick={() => onChange(goToDepth(state, i))}>
                {c}
              </button>
            ) : (
              <span className="layer-here" aria-current="page">
                {c}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
