import React from 'react'

export interface ScriptListItem {
  id: string
  /** Short name ("Walk"), in plain words. */
  name: string
  /** The rest of its label ("speed up toward my top speed…"), or ''. */
  detail: string
  off: boolean
  /** A "when I bump" script (it runs when the brick runs into something), not an "over and over" one: it gets a tag. */
  bump: boolean
}

interface Props {
  title: string
  brickName: string
  items: readonly ScriptListItem[]
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onShowAll: () => void
}

/**
 * A section ("How I move") as a list: one row per script, with its plain-word name, what it does, and its On/Off switch.
 * Tapping a row shows that script alone at a readable size; "Show them all" shows every one at once, as before.
 */
export const ScriptList: React.FC<Props> = ({ title, brickName, items, onOpen, onToggle, onShowAll }) => (
  <section className="script-list" aria-label={`${title}: ${items.length} scripts`}>
    <p className="script-list-intro">
      Each script does one job for the {brickName}, and they take turns in this order, over and over. Tap one to see its
      blocks. Turn one off, then press Play to feel the difference.
    </p>
    <ol className="script-list-rows">
      {items.map((item) => (
        <li key={item.id} className={`script-list-row${item.off ? ' is-off' : ''}`}>
          <button
            type="button"
            className="script-list-switch"
            aria-pressed={!item.off}
            aria-label={`${item.off ? 'Turn on' : 'Turn off'}: ${item.name}`}
            onClick={() => onToggle(item.id)}
          >
            {item.off ? 'Off' : 'On'}
          </button>
          <button type="button" className="script-list-open" aria-label={item.detail ? `${item.name}: ${item.detail}` : item.name} onClick={() => onOpen(item.id)}>
            <span className="script-list-name">{item.name}</span>
            {item.detail && <span className="script-list-detail">{item.detail}</span>}
            {item.bump && <span className="script-list-when">when I bump</span>}
            <span className="script-list-go" aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ol>
    <button type="button" className="script-list-all" onClick={onShowAll}>
      Show all {items.length} at once
    </button>
  </section>
)
