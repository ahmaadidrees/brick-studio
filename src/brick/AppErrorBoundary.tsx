import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { BrickStudioDocument } from './brickDocument'
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
import './app-error-boundary.css'

export type AppErrorBoundaryProps = {
  children?: ReactNode
  /** Storage holding the autosaved local build; defaults to this browser's localStorage. */
  storage?: () => BrickStudioStorage | null
  /** Export path for the recovered build; defaults to the studio's .brickstudio.json download. */
  download?: (document: BrickStudioDocument) => BrickStudioPersistenceResult
  /** Runs only from the Reload button. The boundary never reloads on its own. */
  reload?: () => void
}

type AppErrorBoundaryState = {
  failed: boolean
  error: unknown
  localDocument: BrickStudioDocument | null
  recent: BrickStudioErrorEntry[]
  status: string | null
}

function defaultStorage(): BrickStudioStorage | null {
  try {
    return window.localStorage ?? null
  } catch {
    // Storage access itself can throw under strict privacy settings.
    return null
  }
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

/**
 * Last line of defense for the whole studio. A render error anywhere below this
 * boundary swaps the app for a calm recovery screen instead of an empty page, and the
 * autosaved local build stays downloadable even when the editor cannot mount.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    failed: false,
    error: null,
    localDocument: null,
    recent: [],
    status: null,
  }

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return { failed: true, error, status: null }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    recordBrickStudioError('boundary', error, 'The studio hit an unexpected error.')
    console.error(`${BRICK_STUDIO_LOG_PREFIX} Recovered from a fatal render error:`, error, info.componentStack)
    const storage = (this.props.storage ?? defaultStorage)()
    this.setState({
      localDocument: readLocalDocument(storage),
      recent: getRecentBrickStudioErrors(),
    })
  }

  private handleDownload = () => {
    const { localDocument } = this.state
    if (!localDocument) return
    const result = (this.props.download ?? downloadBrickStudioDocument)(localDocument)
    this.setState({
      status: result.ok
        ? 'Your build was downloaded as a .brickstudio.json file. Import it after reloading if anything is missing.'
        : result.error.message,
    })
  }

  private handleReload = () => {
    const reload = this.props.reload ?? defaultReload
    reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    const { error, localDocument, recent, status } = this.state
    const summary = describeBrickStudioError(error, 'Something unexpected happened.')

    return (
      <div className="app-recovery" role="alert" aria-labelledby="app-recovery-title">
        <section className="app-recovery__card">
          <p className="app-recovery__eyebrow">Brick Studio</p>
          <h1 id="app-recovery-title" className="app-recovery__title">Oops! The studio tripped over a brick.</h1>
          <p className="app-recovery__lead">
            {localDocument
              ? 'Your build is saved in this browser. Download a copy to keep it safe, then reload to jump back in.'
              : 'Reload to jump back into the studio.'}
          </p>
          <p className="app-recovery__error">
            <span>What happened:</span> {summary}
          </p>
          <div className="app-recovery__actions">
            {localDocument ? (
              <button
                type="button"
                className="app-recovery__button app-recovery__button--primary"
                onClick={this.handleDownload}
              >
                Download my build
              </button>
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
