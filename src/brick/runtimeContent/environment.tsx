import { Suspense, type ReactNode } from 'react'
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
  description: 'The original Brick Studio baseplate and studio lighting.',
  previewKey: 'environment:classic',
} satisfies EnvironmentDescriptor

export const CLASSIC_ENVIRONMENT_SURFACE: EnvironmentSurface = {
  plateColor: '#e7ebed',
  showStuds: true,
  finish: 'matte',
}

export const ENVIRONMENT_UNAVAILABLE_TOAST = 'That world could not load, so Classic Studio is showing instead.'

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

/** Default failure handler shared by every environment slot. */
export function reportRuntimeEnvironmentFailure(error: unknown) {
  recordBrickStudioError('boundary', error, 'World failed to load.')
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
  resetKey,
  fallback = null,
  onError = reportRuntimeEnvironmentFailure,
  children,
}: RuntimeEnvironmentBoundaryProps) {
  return (
    <RuntimeContentBoundary resetKey={resetKey} fallback={fallback} onError={onError}>
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
    <RuntimeEnvironmentBoundary resetKey={resolvedId}>
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
    <RuntimeEnvironmentBoundary resetKey={resolvedId}>
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
