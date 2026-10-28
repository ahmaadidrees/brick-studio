import React, { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import { withCardContext } from './context'
import { CODE_DARK_THEME } from './codeTheme'
import { plainScratchFor, type PlainScratchCard as CardContent } from './plainScratch'

interface Props {
  opcode: string
  /** The block's own words, used when a card has no short name. */
  blockText: string
  onClose: () => void
}

/**
 * "How <block> works in plain Scratch": an explanation plus the same behavior built from ordinary Scratch blocks, in a
 * small read-only Blockly workspace.
 */
export const PlainScratchCard: React.FC<Props> = ({ opcode, blockText, onClose }) => {
  const card: CardContent | undefined = plainScratchFor(opcode)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !card) return
    const ws = Blockly.inject(host, {
      renderer: 'zelos',
      theme: CODE_DARK_THEME,
      readOnly: true,
      sounds: false,
      zoom: { controls: false, wheel: false, startScale: 0.8 },
      move: { scrollbars: true, drag: true, wheel: false },
      trashcan: false,
    })
    // Dropdowns check their value against the editor's options, so the card's own names are on offer while it loads.
    // (The extras exist only during this call; the real editor's menus never see them.)
    withCardContext(card.extras, () => {
      try {
        Blockly.serialization.workspaces.load(card.workspace as never, ws)
      } catch (err) {
        console.error('Could not draw the plain Scratch card:', err)
      }
    })
    Blockly.svgResize(ws)
    // Shrink to fit so the whole recipe shows at once (never bigger than the editor's own size), then centre it.
    const m = ws.getMetrics()
    const fit = Math.min(1, (m.viewWidth - 24) / Math.max(1, m.contentWidth), (m.viewHeight - 24) / Math.max(1, m.contentHeight))
    if (fit < 1) ws.setScale(Math.max(0.35, ws.scale * fit))
    ws.scrollCenter()
    return () => ws.dispose()
  }, [card])

  if (!card) return null
  const name = card.name || blockText
  return (
    <div className="plain-card-backdrop" role="presentation" onClick={onClose}>
      <div
        className="plain-card"
        role="dialog"
        aria-modal="true"
        aria-label={`How ${name} works in plain Scratch`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="plain-card-head">
          <h2>
            How <em>{name}</em> works in plain Scratch
          </h2>
          <button type="button" className="plain-card-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="plain-card-text">{card.explanation}</p>
        <div className="plain-card-blocks" ref={hostRef} aria-label="Plain Scratch blocks (read only)" />
        <footer className="plain-card-foot">
          <span>Read only: these are ordinary Scratch blocks.</span>
          <button type="button" className="plain-card-done" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  )
}
