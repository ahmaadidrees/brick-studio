import { useEffect, useState } from 'react'
import type { BrickStudioDocument } from './brickDocument'
import { downloadBrickStudioDocument, type BrickStudioPersistenceResult } from './documentPersistence'
import { useBrickStore } from './store'
import './graphics-paused.css'

export const GRAPHICS_PAUSED_RELOAD_DELAY_MS = 10_000

export type GraphicsPausedOverlayProps = {
  /** How long to wait for the browser to restore the context before offering a reload. */
  reloadDelayMs?: number
  /** Export path for the current build; defaults to the studio's .brickstudio.json download. */
  download?: (document: BrickStudioDocument) => BrickStudioPersistenceResult
  /** Runs only from the Reload button. The overlay never reloads on its own. */
  reload?: () => void
}

function defaultReload() {
  window.location.reload()
}

/**
 * Shown by BrickStudioScene while the WebGL context is lost. Unlike a plain veil it
 * swallows pointer input over the canvas (the store has already parked keyboard, touch
 * and physics), keeps the current build exportable, and offers a manual reload once the
 * browser has had a fair chance to restore the context on its own.
 */
export function GraphicsPausedOverlay({
  reloadDelayMs = GRAPHICS_PAUSED_RELOAD_DELAY_MS,
  download = downloadBrickStudioDocument,
  reload = defaultReload,
}: GraphicsPausedOverlayProps) {
  const [offerReload, setOfferReload] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setOfferReload(true), reloadDelayMs)
    return () => window.clearTimeout(timer)
  }, [reloadDelayMs])

  const handleDownload = () => {
    const result = download(useBrickStore.getState().getDocumentSnapshot())
    setStatus(result.ok ? 'Downloaded a copy of this build as a .brickstudio.json file.' : result.error.message)
  }

  return (
    <div className="graphics-paused" role="alert" aria-labelledby="graphics-paused-title">
      <div className="graphics-paused__card">
        <p id="graphics-paused-title" className="graphics-paused__title">Graphics paused</p>
        <p className="graphics-paused__lead">
          The screen lost its 3D graphics. Building and moving are on hold until it comes back, which usually takes a moment.
        </p>
        <div className="graphics-paused__actions">
          <button type="button" className="graphics-paused__button graphics-paused__button--primary" onClick={handleDownload}>
            Download my build
          </button>
          {offerReload ? (
            <button type="button" className="graphics-paused__button" onClick={reload}>
              Reload the studio
            </button>
          ) : null}
        </div>
        {status ? <p className="graphics-paused__status" role="status">{status}</p> : null}
      </div>
    </div>
  )
}
