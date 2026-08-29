import { Suspense } from 'react'
import { BlockAvatar } from '../BlockAvatar'
import { ADDITIVE_CHARACTER_BY_ID } from '../characters/index'
import type {
  CharacterContentModule,
  CharacterPalette,
  CharacterVisualProps,
  LazyCharacterRegistration,
} from '../characters/types'
import type { CharacterDescriptor } from '../registries'
import type { CharacterId } from '../types'
import { loadRuntimeRegistration, useRuntimeLazySelection } from './lazySelection'

export const CLASSIC_CHARACTER_DESCRIPTOR = {
  id: 'classic',
  name: 'Classic Builder',
  description: 'The original procedural Brick Studio explorer.',
  previewKey: 'character:classic',
  customizable: true,
} satisfies CharacterDescriptor

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
}

/** Renders inside the owning RigidBody; its fallback contains no DOM. */
export function RuntimeCharacterAvatar({
  characterId,
  palette,
  motion,
  compact,
  reducedMotion,
  scale,
}: RuntimeCharacterAvatarProps) {
  const { Avatar } = useRuntimeCharacter(characterId)
  const visualProps: CharacterVisualProps = {
    motion,
    compact,
    reducedMotion,
    scale,
    palette,
  }

  return (
    <Suspense fallback={<ClassicAvatar {...visualProps} />}>
      <Avatar {...visualProps} />
    </Suspense>
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
