import { CC0_HERO_DESCRIPTOR } from './cc0-hero/descriptor'
import { TOY_FIGURE_DESCRIPTOR } from './toy-figure/descriptor'
import type { LazyCharacterRegistration } from './types'

export * from './types'
export { CC0_HERO_DESCRIPTOR, TOY_FIGURE_DESCRIPTOR }

export const ADDITIVE_CHARACTER_REGISTRATIONS = [
  {
    descriptor: TOY_FIGURE_DESCRIPTOR,
    load: () => import('./toy-figure/adapter').then((loaded) => loaded.default),
  },
  {
    descriptor: CC0_HERO_DESCRIPTOR,
    load: () => import('./cc0-hero/adapter').then((loaded) => loaded.default),
  },
] as const satisfies readonly LazyCharacterRegistration[]

export const ADDITIVE_CHARACTER_BY_ID = new Map(
  ADDITIVE_CHARACTER_REGISTRATIONS.map((registration) => [registration.descriptor.id, registration]),
)
