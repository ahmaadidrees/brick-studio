import React from 'react'
import { breadcrumb, goToDepth, isTop, proccodeWords, type LayerState } from './layers'
import { scriptCount, type SectionEntry } from './sections'

interface Props {
  brickName: string
  state: LayerState
  definitions: string[]
  /** The brick's folded sections ("How I move · 23 scripts"), shown on the top view. */
  sections?: SectionEntry[]
  sectionTitle?: (id: string) => string
  onChange: (next: LayerState) => void
  onBack: () => void
  onOpen: (proccode: string) => void
  onOpenSection?: (id: string) => void
}

/** Top view: the brick's sections and the "My Blocks" shelf. In a section or drilled in: breadcrumb and Back. */
export const LayerBar: React.FC<Props> = ({ brickName, state, definitions, sections = [], sectionTitle, onChange, onBack, onOpen, onOpenSection }) => {
  if (isTop(state)) {
    if (definitions.length === 0 && sections.length === 0) return null
    const shelf = definitions.length > 0 && (
      <nav className={sections.length ? 'layer-group' : 'layer-bar layer-shelf'} aria-label="My Blocks">
        <span className="layer-shelf-title">My Blocks</span>
        {definitions.map((code) => (
          <button key={code} type="button" className="layer-chip" onClick={() => onOpen(code)} aria-label={`See inside ${proccodeWords(code)}`}>
            🔍 {proccodeWords(code)}
          </button>
        ))}
      </nav>
    )
    if (!sections.length) return shelf || null
    return (
      <div className="layer-bar layer-shelf">
        <nav className="layer-group" aria-label={`${brickName}'s folded scripts`}>
          {sections.map((s) => (
            <button key={s.id} type="button" className="layer-chip layer-section" onClick={() => onOpenSection?.(s.id)}>
              <span className="layer-section-name">{s.title}</span>
              <span className="layer-section-count"> · {scriptCount(s.count)}</span>
              <span className="layer-section-open">Show how it works</span>
            </button>
          ))}
        </nav>
        {shelf}
      </div>
    )
  }
  const crumbs = breadcrumb(state, brickName, sectionTitle)
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
