import { useEffect, useState } from 'react'
import { Download, MonitorOff, RefreshCw } from 'lucide-react'
import { Button } from '../ui'
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
 * Shown by BrickStudioScene while the WebGL context is lost (board 15 "Graphics paused").
 * Unlike a plain veil it swallows pointer input over the canvas (the store has already
 * parked keyboard, touch and physics), keeps the current build exportable, and offers a
 * manual reload once the browser has had a fair chance to restore the context on its own.
 * There is deliberately no "Resume graphics": only the browser can restore the context.
 */
export function GraphicsPausedOverlay({
  reloadDelayMs = GRAPHICS_PAUSED_RELOAD_DELAY_MS,
  download = downloadBrickStudioDocument,
  reload = defaultReload,
}: GraphicsPausedOverlayProps) {
  const [offerReload, setOfferReload] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setOfferReload(true), reloadDelayMs)
    return () => window.clearTimeout(timer)
  }, [reloadDelayMs])

  const handleDownload = () => {
    const result = download(useBrickStore.getState().getDocumentSnapshot())
    setStatus(result.ok
      ? { ok: true, message: 'Downloaded a copy of this build as a .brickstudio.json file.' }
      : { ok: false, message: result.error.message })
  }

  return (
    <div className="graphics-paused" role="alert" aria-labelledby="graphics-paused-title" aria-describedby="graphics-paused-lead">
      <div className="graphics-paused__card">
        <span className="graphics-paused__icon" aria-hidden="true"><MonitorOff size={22} /></span>
        <p id="graphics-paused-title" className="graphics-paused__title">Graphics paused</p>
        <p id="graphics-paused-lead" className="graphics-paused__lead">
          Your build is preserved. The screen lost its 3D graphics, so building and moving are on hold until the browser brings them back — usually a moment.
        </p>
        <div className="graphics-paused__actions">
          <Button variant="primary" icon={<Download size={17} />} onClick={handleDownload}>Download my build</Button>
          {offerReload ? (
            <Button variant="secondary" icon={<RefreshCw size={17} />} onClick={reload}>Reload the studio</Button>
          ) : (
            <p className="graphics-paused__waiting">Waiting for the browser to restore graphics… a reload option appears if it takes too long.</p>
          )}
        </div>
        {status ? <p className={`graphics-paused__status${status.ok ? '' : ' graphics-paused__status--error'}`} role="status">{status.message}</p> : null}
      </div>
    </div>
  )
}
