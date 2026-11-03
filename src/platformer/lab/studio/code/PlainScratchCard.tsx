import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as Blockly from 'blockly/core'
import { withCardContext } from './context'
import { CODE_DARK_THEME, CODE_LIGHT_THEME } from './codeTheme'
import { plainScratchFor, type PlainScratchCard as CardContent } from './plainScratch'

interface Props {
  opcode: string
  /** The block's own words, used when a card has no short name. */
  blockText: string
  /** The light editor (Code mode): the card and its blocks match it. */
  light?: boolean
  onClose: () => void
}

/** Never shrink the recipe below this: smaller blocks can't be read on a Duo. The kid zooms or scrolls instead. */
const MIN_FIT_SCALE = 0.6

/**
 * "How <block> works": an explanation plus the same behavior built from ordinary Scratch blocks, in a small read-only
 * Blockly workspace. It sits over the whole page (not inside the code panel), so the palette's categories can't cover
 * it and a Duo gets the full screen; Esc closes it and focus goes back where it was.
 */
export const PlainScratchCard: React.FC<Props> = ({ opcode, blockText, light = false, onClose }) => {
  const card: CardContent | undefined = plainScratchFor(opcode)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const host = hostRef.current
    if (!host || !card) return
    const ws = Blockly.inject(host, {
      renderer: 'zelos',
      theme: light ? CODE_LIGHT_THEME : CODE_DARK_THEME,
      readOnly: true,
      sounds: false,
      // Our own − / + buttons (Blockly's would load their pictures from blockly.com); pinch works on touch screens.
      zoom: { controls: false, wheel: false, pinch: true, startScale: 0.8, minScale: 0.4, maxScale: 1.6 },
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
    // Shrink to fit so the whole recipe shows at once, but never below a readable size; then centre it.
    const m = ws.getMetrics()
    const fit = Math.min(1, (m.viewWidth - 24) / Math.max(1, m.contentWidth), (m.viewHeight - 24) / Math.max(1, m.contentHeight))
    if (fit < 1) ws.setScale(Math.max(MIN_FIT_SCALE, ws.scale * fit))
    ws.scrollCenter()
    wsRef.current = ws
    return () => {
      wsRef.current = null
      ws.dispose()
    }
  }, [card, light])

  // Focus the close button on open, Esc closes, and focus returns to whatever had it (the block's workspace).
  useEffect(() => {
    if (!card) return
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before && before !== document.body && before.isConnected) before.focus({ preventScroll: true })
    }
  }, [card])

  if (!card) return null
  const name = card.name || blockText
  return createPortal(
    <div className={`plain-card-backdrop${light ? ' code-light' : ''}`} role="presentation" onClick={onClose}>
      <div
        className="plain-card"
        role="dialog"
        aria-modal="true"
        aria-label={`How ${name} works`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="plain-card-head">
          <h2>
            How <em>{name}</em> works
          </h2>
          <button ref={closeRef} type="button" className="plain-card-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="plain-card-text">{card.explanation}</p>
        <div className="plain-card-stage">
          <div className="plain-card-blocks" ref={hostRef} aria-label="The same thing in ordinary Scratch blocks (look only)" />
          <div className="plain-card-zoom">
            <button type="button" aria-label="Zoom out" onClick={() => wsRef.current?.zoomCenter(-1)}>−</button>
            <button type="button" aria-label="Zoom in" onClick={() => wsRef.current?.zoomCenter(1)}>+</button>
          </div>
        </div>
        <footer className="plain-card-foot">
          <span>The same thing in ordinary Scratch blocks. This is a picture to look at: drag to move around, use − and + to zoom.</span>
          <button type="button" className="plain-card-done" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
