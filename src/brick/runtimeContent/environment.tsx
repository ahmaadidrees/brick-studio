import { Suspense, useSyncExternalStore, type ReactNode } from 'react'
import { ADDITIVE_ENVIRONMENT_BY_ID } from '../environments/index'
import type {
  EnvironmentContentModule,
  EnvironmentRenderProps,
  EnvironmentSurface,
  LazyEnvironmentRegistration,
} from '../environments/types'
import { recordBrickStudioError } from '../errorLog'
import type { EnvironmentDescriptor } from '../registries'
import { useBrickStore } from '../store'
import type { EnvironmentId } from '../types'
import { RuntimeContentBoundary } from './contentBoundary'
import { loadRuntimeRegistration, useRuntimeLazySelection } from './lazySelection'

export const CLASSIC_ENVIRONMENT_DESCRIPTOR = {
  id: 'classic',
  name: 'Classic Studio',
  description: 'The original baseplate and studio lighting.',
  previewKey: 'environment:classic',
} satisfies EnvironmentDescriptor

export const CLASSIC_ENVIRONMENT_SURFACE: EnvironmentSurface = {
  plateColor: '#e7ebed',
  showStuds: true,
  finish: 'matte',
}

export const ENVIRONMENT_UNAVAILABLE_TOAST = 'That world could not load, so Classic Studio is showing instead.'

/**
 * Worlds that threw while rendering this session. A render failure is remembered per
 * environment id so the whole scene switches to Classic Studio coherently (rig, world,
 * surface, respawn height and the picker's status badge) instead of leaving a half
 * world behind. The saved preference is untouched, other worlds are unaffected, and the
 * failed world retries after a reload.
 */
const renderFailures = new Map<EnvironmentId, unknown>()
const renderFailureListeners = new Set<() => void>()
let renderFailureVersion = 0

function subscribeRenderFailures(listener: () => void) {
  renderFailureListeners.add(listener)
  return () => {
    renderFailureListeners.delete(listener)
  }
}

const readRenderFailureVersion = () => renderFailureVersion

function notifyRenderFailureListeners() {
  renderFailureVersion += 1
  for (const listener of renderFailureListeners) listener()
}

export function markRuntimeEnvironmentRenderFailure(environmentId: EnvironmentId, error: unknown) {
  if (environmentId === CLASSIC_ENVIRONMENT_DESCRIPTOR.id) return
  renderFailures.set(environmentId, error)
  notifyRenderFailureListeners()
}

export function runtimeEnvironmentRenderFailure(environmentId: EnvironmentId | null | undefined): unknown {
  return environmentId ? renderFailures.get(environmentId) : undefined
}

/** Test helper: forget every remembered render failure. */
export function clearRuntimeEnvironmentRenderFailures() {
  if (!renderFailures.size) return
  renderFailures.clear()
  notifyRenderFailureListeners()
}

function EmptyEnvironmentSlot(_props: EnvironmentRenderProps) {
  return null
}

const CLASSIC_ENVIRONMENT_CONTENT: EnvironmentContentModule = {
  descriptor: CLASSIC_ENVIRONMENT_DESCRIPTOR,
  Rig: EmptyEnvironmentSlot,
  World: EmptyEnvironmentSlot,
  surface: CLASSIC_ENVIRONMENT_SURFACE,
}

function environmentRegistration(
  environmentId: EnvironmentId | null | undefined,
): LazyEnvironmentRegistration | null {
  if (!environmentId || environmentId === 'classic') return null
  return ADDITIVE_ENVIRONMENT_BY_ID.get(environmentId) ?? null
}

/**
 * Default failure handler shared by every environment slot. With an environment id the
 * failure is remembered so useRuntimeEnvironment resolves that world to Classic Studio
 * as a whole; the toast then describes what actually happened.
 */
export function reportRuntimeEnvironmentFailure(error: unknown, environmentId?: EnvironmentId | null) {
  recordBrickStudioError('boundary', error, 'World failed to load.')
  if (environmentId) markRuntimeEnvironmentRenderFailure(environmentId, error)
  useBrickStore.setState({ toast: ENVIRONMENT_UNAVAILABLE_TOAST })
}

export type RuntimeEnvironment = {
  requestedId: EnvironmentId | null
  resolvedId: EnvironmentId
  loading: boolean
  error: unknown
  Rig: EnvironmentContentModule['Rig']
  World: EnvironmentContentModule['World']
  surface: EnvironmentSurface
  respawnBelowY?: number
}

/** Resolves metadata and both R3F-safe slots as one coherent selection. */
export function useRuntimeEnvironment(
  environmentId: EnvironmentId | null | undefined,
): RuntimeEnvironment {
  const registration = environmentRegistration(environmentId)
  const selection = useRuntimeLazySelection(registration, CLASSIC_ENVIRONMENT_CONTENT)
  const content = selection.content
  useSyncExternalStore(subscribeRenderFailures, readRenderFailureVersion, readRenderFailureVersion)
  const renderFailure = runtimeEnvironmentRenderFailure(environmentId)
  if (renderFailure !== undefined) {
    return {
      requestedId: environmentId ?? null,
      resolvedId: CLASSIC_ENVIRONMENT_CONTENT.descriptor.id,
      loading: false,
      error: renderFailure,
      Rig: CLASSIC_ENVIRONMENT_CONTENT.Rig,
      World: CLASSIC_ENVIRONMENT_CONTENT.World,
      surface: CLASSIC_ENVIRONMENT_CONTENT.surface,
      respawnBelowY: CLASSIC_ENVIRONMENT_CONTENT.respawnBelowY,
    }
  }

  return {
    requestedId: environmentId ?? null,
    resolvedId: content.descriptor.id,
    loading: selection.loading,
    error: selection.error,
    Rig: content.Rig,
    World: content.World,
    surface: content.surface,
    respawnBelowY: content.respawnBelowY,
  }
}

export type RuntimeEnvironmentBoundaryProps = {
  /** The world rendering inside; a render failure is remembered against this id. */
  environmentId?: EnvironmentId | null
  /** Usually the resolved environment id: only a different world retries the slot. */
  resetKey?: unknown
  /** Procedural stand-in for the slot. The classic module renders nothing, so null is the default. */
  fallback?: ReactNode
  onError?: (error: unknown) => void
  children?: ReactNode
}

/**
 * Keeps a world that throws while rendering from unmounting the scene. Chunk failures
 * are handled earlier by lazySelection, which already falls back to Classic Studio.
 */
export function RuntimeEnvironmentBoundary({
  environmentId,
  resetKey,
  fallback = null,
  onError,
  children,
}: RuntimeEnvironmentBoundaryProps) {
  const handleError = onError ?? ((error: unknown) => reportRuntimeEnvironmentFailure(error, environmentId))
  return (
    <RuntimeContentBoundary resetKey={resetKey} fallback={fallback} onError={handleError}>
      {children}
    </RuntimeContentBoundary>
  )
}

export type RuntimeEnvironmentSlotProps = EnvironmentRenderProps & {
  environmentId: EnvironmentId | null | undefined
}

/** Mount directly below Canvas, outside Physics. */
export function RuntimeEnvironmentRig({
  environmentId,
  compact,
  reducedMotion,
}: RuntimeEnvironmentSlotProps) {
  const { Rig, resolvedId } = useRuntimeEnvironment(environmentId)
  return (
    <RuntimeEnvironmentBoundary environmentId={resolvedId} resetKey={resolvedId}>
      <Suspense fallback={null}>
        <Rig compact={compact} reducedMotion={reducedMotion} />
      </Suspense>
    </RuntimeEnvironmentBoundary>
  )
}

/** Mount below Physics so environment colliders join the active world. */
export function RuntimeEnvironmentWorld({
  environmentId,
  compact,
  reducedMotion,
}: RuntimeEnvironmentSlotProps) {
  const { World, resolvedId } = useRuntimeEnvironment(environmentId)
  return (
    <RuntimeEnvironmentBoundary environmentId={resolvedId} resetKey={resolvedId}>
      <Suspense fallback={null}>
        <World compact={compact} reducedMotion={reducedMotion} />
      </Suspense>
    </RuntimeEnvironmentBoundary>
  )
}

export async function preloadRuntimeEnvironment(
  environmentId: EnvironmentId | null | undefined,
): Promise<EnvironmentContentModule> {
  const registration = environmentRegistration(environmentId)
  return registration ? loadRuntimeRegistration(registration) : CLASSIC_ENVIRONMENT_CONTENT
}
