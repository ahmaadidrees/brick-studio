import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BRICK_STUDIO_FILE_EXTENSION, serializeBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import {
  downloadBrickStudioDocument,
  loadLocalBrickStudioProject,
  type BrickStudioPersistenceResult,
  type BrickStudioStorage,
} from './documentPersistence'
import {
  BRICK_STUDIO_LOG_PREFIX,
  describeBrickStudioError,
  getRecentBrickStudioErrors,
  recordBrickStudioError,
  type BrickStudioErrorEntry,
} from './errorLog'
import { captureRecoverySnapshot, type RecoverySnapshot, type RecoverySnapshotSource } from './recoverySnapshot'
import './app-error-boundary.css'

export type AppErrorBoundaryProps = {
  children?: ReactNode
  /** Storage holding the autosaved local build; defaults to this browser's localStorage. */
  storage?: () => BrickStudioStorage | null
  /**
   * Export path for a recovered document; defaults to the studio's .brickstudio.json
   * download. `filename` has no extension and differs per copy so two downloads never collide.
   */
  download?: (document: BrickStudioDocument, filename: string) => BrickStudioPersistenceResult
  /** Runs only from the Reload button. The boundary never reloads on its own. */
  reload?: () => void
}

type AppErrorBoundaryState = {
  failed: boolean
  error: unknown
  /** The world that was open when the render failed, captured before any teardown ran. */
  active: RecoverySnapshot | null
  /** Older private autosave on this device; null when absent or identical to `active`. */
  localDocument: BrickStudioDocument | null
  recent: BrickStudioErrorEntry[]
  status: string | null
}

/** Download names without the extension; the active copy carries its source so it never overwrites the local one. */
const ACTIVE_FILENAMES: Record<RecoverySnapshotSource, string> = {
  live: 'brick-studio-live-room-recovered',
  cloud: 'brick-studio-class-world-recovered',
  local: 'brick-studio-build-recovered',
}
const LOCAL_FILENAME = 'brick-studio-build'

const ACTIVE_LABELS: Record<RecoverySnapshotSource, string> = {
  live: 'Live room · captured when the studio crashed · may include changes that weren\'t saved',
  cloud: 'Class world · captured when the studio crashed · may include changes that weren\'t saved yet',
  local: 'This device · captured when the studio crashed · may include unsaved changes',
}

function defaultStorage(): BrickStudioStorage | null {
  try {
    return window.localStorage ?? null
  } catch {
    // Storage access itself can throw under strict privacy settings.
    return null
  }
}

function defaultDownload(document: BrickStudioDocument, filename: string): BrickStudioPersistenceResult {
  return downloadBrickStudioDocument(document, globalThis, filename)
}

function defaultReload() {
  window.location.reload()
}

function readLocalDocument(storage: BrickStudioStorage | null): BrickStudioDocument | null {
  if (!storage) return null
  try {
    const loaded = loadLocalBrickStudioProject(storage)
    return loaded.ok ? loaded.document : null
  } catch {
    return null
  }
}

/** Both inputs are normalized by brick-core, so their serialized forms compare exactly. */
function sameDocument(first: BrickStudioDocument, second: BrickStudioDocument | undefined): boolean {
  if (!second) return false
  try {
    return serializeBrickStudioDocument(first) === serializeBrickStudioDocument(second)
  } catch {
    return false
  }
}

/**
 * Last line of defense for the whole studio. A render error anywhere below this
 * boundary swaps the app for a calm recovery screen instead of an empty page, keeps
 * a validated copy of the world that was actually open, and leaves any older private
 * autosave downloadable as a clearly separate file.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    failed: false,
    error: null,
    active: null,
    localDocument: null,
    recent: [],
    status: null,
  }

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    // This runs synchronously in React's render phase, before the failing subtree is
    // unmounted and before any cleanup effect runs. Live rooms and cloud worlds
    // suspend the private local autosave, and their teardown (client dispose, leave)
    // can put an older build back into the global store, so this is the last moment
    // the active world's document is guaranteed to still be in memory. Capturing it
    // any later would risk exporting whatever the reset store happens to hold.
    return { failed: true, error, status: null, active: captureRecoverySnapshot() }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    recordBrickStudioError('boundary', error, 'The studio hit an unexpected error.')
    console.error(`${BRICK_STUDIO_LOG_PREFIX} Recovered from a fatal render error:`, error, info.componentStack)
    const storage = (this.props.storage ?? defaultStorage)()
    const localDocument = readLocalDocument(storage)
    // The older private save is a separate artifact: only offer it when it exists and
    // is not byte-for-byte the world captured above.
    this.setState((state) => ({
      localDocument: localDocument && !sameDocument(localDocument, state.active?.document) ? localDocument : null,
      recent: getRecentBrickStudioErrors(),
    }))
  }

  private download(document: BrickStudioDocument, filename: string, description: string) {
    const result = (this.props.download ?? defaultDownload)(document, filename)
    this.setState({
      status: result.ok
        ? `${description} was downloaded as ${filename}${BRICK_STUDIO_FILE_EXTENSION}. Import it after reloading if anything is missing.`
        : result.error.message,
    })
  }

  private handleDownloadActive = () => {
    const { active } = this.state
    if (!active) return
    this.download(active.document, ACTIVE_FILENAMES[active.source], 'The world you were in')
  }

  private handleDownloadLocal = () => {
    const { localDocument } = this.state
    if (!localDocument) return
    this.download(localDocument, LOCAL_FILENAME, 'The build saved on this device')
  }

  private handleReload = () => {
    const reload = this.props.reload ?? defaultReload
    reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    const { error, active, localDocument, recent, status } = this.state
    const summary = describeBrickStudioError(error, 'Something unexpected happened.')
    const lead = active
      ? 'We captured the world you were in just before the studio closed. Download a copy to keep it safe, then reload to jump back in.'
      : localDocument
        ? 'A build saved on this device can be downloaded below. Keep a copy, then reload to jump back in.'
        : 'Reload to jump back into the studio.'

    return (
      <div className="app-recovery" role="alert" aria-labelledby="app-recovery-title">
        <section className="app-recovery__card">
          <p className="app-recovery__eyebrow">Brick Studio</p>
          <h1 id="app-recovery-title" className="app-recovery__title">Oops! The studio tripped over a brick.</h1>
          <p className="app-recovery__lead">{lead}</p>
          <p className="app-recovery__error">
            <span>What happened:</span> {summary}
          </p>
          <div className="app-recovery__actions">
            {active ? (
              <div className="app-recovery__option">
                <button
                  type="button"
                  className="app-recovery__button app-recovery__button--primary"
                  aria-describedby="app-recovery-active-hint"
                  onClick={this.handleDownloadActive}
                >
                  Download the world I was in
                </button>
                <p id="app-recovery-active-hint" className="app-recovery__hint">{ACTIVE_LABELS[active.source]}</p>
              </div>
            ) : null}
            {localDocument ? (
              <div className="app-recovery__option">
                <button
                  type="button"
                  className={active ? 'app-recovery__button' : 'app-recovery__button app-recovery__button--primary'}
                  aria-describedby="app-recovery-local-hint"
                  onClick={this.handleDownloadLocal}
                >
                  {active ? 'Download older build saved on this device' : 'Download build saved on this device'}
                </button>
                <p id="app-recovery-local-hint" className="app-recovery__hint">
                  {active
                    ? 'Build saved on this device earlier · kept separate from the world above'
                    : 'Build saved on this device · the world you were in could not be captured'}
                </p>
              </div>
            ) : null}
            <button type="button" className="app-recovery__button" onClick={this.handleReload}>
              Reload
            </button>
          </div>
          {status ? <p className="app-recovery__status" role="status">{status}</p> : null}
          {recent.length > 1 ? (
            <details className="app-recovery__log">
              <summary>Recent errors ({recent.length})</summary>
              <ol>
                {recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <code>{entry.source}</code> {entry.message}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
      </div>
    )
  }
}
