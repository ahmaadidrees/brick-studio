import type { ComponentType } from 'react'
import type { MotionSnapshotRef } from '../avatarMotion'
import type { CharacterDescriptor } from '../registries'

export type CharacterPalette = Record<string, string>

export type CharacterVisualProps = {
  motion: MotionSnapshotRef
  reducedMotion?: boolean
  compact?: boolean
  scale?: number
  palette?: CharacterPalette
}

export type CharacterContentModule = {
  descriptor: CharacterDescriptor
  Avatar: ComponentType<CharacterVisualProps>
  preload?: () => void
}

export type LazyCharacterRegistration = {
  descriptor: CharacterDescriptor
  load: () => Promise<CharacterContentModule>
}
