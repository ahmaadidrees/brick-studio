import { Suspense } from 'react'
import { BlockAvatar } from '../BlockAvatar'
import { ADDITIVE_CHARACTER_BY_ID } from '../characters/index'
import type {
  CharacterContentModule,
  CharacterPalette,
  CharacterVisualProps,
  LazyCharacterRegistration,
} from '../characters/types'
import { recordBrickStudioError } from '../errorLog'
import type { CharacterDescriptor } from '../registries'
import { useBrickStore } from '../store'
import type { CharacterId } from '../types'
import { RuntimeContentBoundary } from './contentBoundary'
import { loadRuntimeRegistration, useRuntimeLazySelection } from './lazySelection'

export const CLASSIC_CHARACTER_DESCRIPTOR = {
  id: 'classic',
  name: 'Classic Builder',
  description: 'The original procedural Brick Studio explorer.',
  previewKey: 'character:classic',
  customizable: true,
} satisfies CharacterDescriptor

export const CHARACTER_UNAVAILABLE_TOAST = "Couldn't load that character, so the classic builder is filling in for now."

function ClassicAvatar({
  motion,
  reducedMotion,
  scale,
  palette,
}: CharacterVisualProps) {
  return (
    <BlockAvatar
      motion={motion}
      reducedMotion={reducedMotion}
      scale={scale}
      color={palette?.primary}
      palette={palette}
    />
  )
}

const CLASSIC_CHARACTER_CONTENT: CharacterContentModule = {
  descriptor: CLASSIC_CHARACTER_DESCRIPTOR,
  Avatar: ClassicAvatar,
}

function characterRegistration(
  characterId: CharacterId | null | undefined,
): LazyCharacterRegistration | null {
  if (!characterId || characterId === 'classic') return null
  return ADDITIVE_CHARACTER_BY_ID.get(characterId) ?? null
}

function prepareCharacter(content: CharacterContentModule) {
  content.preload?.()
}

/** Default failure handler: keep a record for the recovery screen and tell the builder. */
export function reportRuntimeCharacterFailure(error: unknown) {
  recordBrickStudioError('boundary', error, 'Character failed to load.')
  useBrickStore.setState({ toast: CHARACTER_UNAVAILABLE_TOAST })
}

export type RuntimeCharacter = {
  requestedId: CharacterId | null
  resolvedId: CharacterId
  loading: boolean
  error: unknown
  Avatar: CharacterContentModule['Avatar']
}

export function useRuntimeCharacter(
  characterId: CharacterId | null | undefined,
): RuntimeCharacter {
  const registration = characterRegistration(characterId)
  const selection = useRuntimeLazySelection(
    registration,
    CLASSIC_CHARACTER_CONTENT,
    prepareCharacter,
  )

  return {
    requestedId: characterId ?? null,
    resolvedId: selection.content.descriptor.id,
    loading: selection.loading,
    error: selection.error,
    Avatar: selection.content.Avatar,
  }
}

export type RuntimeCharacterAvatarProps = Omit<CharacterVisualProps, 'palette'> & {
  characterId: CharacterId | null | undefined
  palette?: CharacterPalette
  /** Called once per failed mount of the resolved character; defaults to a studio toast. */
  onLoadError?: (error: unknown) => void
}

/**
 * Renders inside the owning RigidBody; its fallback contains no DOM. A character module
 * that throws while rendering (typically a rejected glTF fetch surfacing through
 * useGLTF) is replaced in place by the classic avatar and reported once, instead of
 * unmounting the scene. The boundary is keyed on the resolved id because lazySelection
 * keeps the previous module rendered while the next one loads.
 */
export function RuntimeCharacterAvatar({
  characterId,
  palette,
  motion,
  compact,
  reducedMotion,
  scale,
  onLoadError = reportRuntimeCharacterFailure,
}: RuntimeCharacterAvatarProps) {
  const { Avatar, resolvedId } = useRuntimeCharacter(characterId)
  const visualProps: CharacterVisualProps = {
    motion,
    compact,
    reducedMotion,
    scale,
    palette,
  }

  return (
    <RuntimeContentBoundary
      fallback={<ClassicAvatar {...visualProps} />}
      resetKey={resolvedId}
      onError={onLoadError}
    >
      <Suspense fallback={<ClassicAvatar {...visualProps} />}>
        <Avatar {...visualProps} />
      </Suspense>
    </RuntimeContentBoundary>
  )
}

export async function preloadRuntimeCharacter(
  characterId: CharacterId | null | undefined,
): Promise<CharacterContentModule> {
  const content = await loadRuntimeCharacter(characterId)
  prepareCharacter(content)
  return content
}

/** Loads the render adapter without opting into the adapter's asset warmup. */
export async function loadRuntimeCharacter(
  characterId: CharacterId | null | undefined,
): Promise<CharacterContentModule> {
  const registration = characterRegistration(characterId)
  if (!registration) return CLASSIC_CHARACTER_CONTENT
  return loadRuntimeRegistration(registration)
}
