import { PIP_DESCRIPTOR, FERN_DESCRIPTOR, NOVA_DESCRIPTOR } from './original/descriptors'
import { CC0_HERO_DESCRIPTOR } from './cc0-hero/descriptor'
import { TOY_FIGURE_DESCRIPTOR } from './toy-figure/descriptor'
import type { LazyCharacterRegistration } from './types'

export * from './types'
export { CharacterStudio } from './CharacterStudio'
export type { CharacterStudioProps } from './CharacterStudio'
export { CC0_HERO_DESCRIPTOR, TOY_FIGURE_DESCRIPTOR, PIP_DESCRIPTOR, FERN_DESCRIPTOR, NOVA_DESCRIPTOR }

export const ADDITIVE_CHARACTER_REGISTRATIONS = [
  {
    descriptor: TOY_FIGURE_DESCRIPTOR,
    load: () => import('./toy-figure/adapter').then((loaded) => loaded.default),
  },
  {
    descriptor: CC0_HERO_DESCRIPTOR,
    load: () => import('./cc0-hero/adapter').then((loaded) => loaded.default),
  },
  { descriptor: PIP_DESCRIPTOR, load: () => import('./original/pip').then((loaded) => loaded.default) },
  { descriptor: FERN_DESCRIPTOR, load: () => import('./original/fern').then((loaded) => loaded.default) },
  { descriptor: NOVA_DESCRIPTOR, load: () => import('./original/nova').then((loaded) => loaded.default) },
] as const satisfies readonly LazyCharacterRegistration[]

export const ADDITIVE_CHARACTER_BY_ID = new Map(
  ADDITIVE_CHARACTER_REGISTRATIONS.map((registration) => [registration.descriptor.id, registration]),
)
