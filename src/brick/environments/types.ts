import type { ComponentType } from 'react'
import type { EnvironmentDescriptor } from '../registries'
import type { BrickMode } from '../types'

export type EnvironmentRenderProps = {
  compact: boolean
  reducedMotion: boolean
  mode?: BrickMode
}

export type EnvironmentSurface = {
  plateColor: string
  showStuds: boolean
  finish: 'matte' | 'clearcoat'
}

/**
 * The rig is mounted directly below Canvas; the world is mounted below Physics.
 * Keeping the slots separate lets atmosphere attachments and Rapier colliders
 * retain the lifecycle expected by the original experiments.
 */
export type EnvironmentContentModule = {
  descriptor: EnvironmentDescriptor
  Rig: ComponentType<EnvironmentRenderProps>
  World: ComponentType<EnvironmentRenderProps>
  surface: EnvironmentSurface
  respawnBelowY?: number
}

export type LazyEnvironmentRegistration = {
  descriptor: EnvironmentDescriptor
  load: () => Promise<EnvironmentContentModule>
}
