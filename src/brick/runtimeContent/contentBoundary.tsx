import { Component, type ErrorInfo, type ReactNode } from 'react'

export type RuntimeContentBoundaryProps = {
  /** Procedural stand-in shown after a failure. It must never re-enter the failing path. */
  fallback: ReactNode
  /** A changed value (for example a newly picked selection id) clears the failure and retries. */
  resetKey?: unknown
  onError?: (error: unknown, info: ErrorInfo) => void
  children?: ReactNode
}

type RuntimeContentBoundaryState = {
  failed: boolean
  error: unknown
}

/**
 * Class boundary for the lazily loaded 3D content slots. Chunk failures are already
 * absorbed by lazySelection; this catches render-time failures inside a loaded module
 * (a rejected glTF fetch, a shader that will not compile) so one character or world
 * cannot unmount the whole studio. React boundaries work inside the R3F reconciler,
 * so the fallback takes the failed subtree's place in the same scene graph position.
 */
export class RuntimeContentBoundary extends Component<RuntimeContentBoundaryProps, RuntimeContentBoundaryState> {
  state: RuntimeContentBoundaryState = { failed: false, error: null }

  static getDerivedStateFromError(error: unknown): RuntimeContentBoundaryState {
    return { failed: true, error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(previous: RuntimeContentBoundaryProps, previousState: RuntimeContentBoundaryState) {
    // Only a changed key retries. The same failing selection stays on the fallback, so a
    // deterministic failure cannot bounce between the content and its stand-in.
    if (this.state.failed && previousState.failed && !Object.is(previous.resetKey, this.props.resetKey)) {
      this.setState({ failed: false, error: null })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
