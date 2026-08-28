import { BRICK_VALLEY_DESCRIPTOR } from './brick-valley/descriptor'
import { SKY_ISLAND_DESCRIPTOR } from './sky-island/descriptor'
import { TOY_ROOM_DESCRIPTOR } from './toy-room/descriptor'
import type { LazyEnvironmentRegistration } from './types'

export * from './types'
export { BRICK_VALLEY_DESCRIPTOR, SKY_ISLAND_DESCRIPTOR, TOY_ROOM_DESCRIPTOR }

export const ADDITIVE_ENVIRONMENT_REGISTRATIONS = [
  {
    descriptor: TOY_ROOM_DESCRIPTOR,
    load: () => import('./toy-room/adapter').then((loaded) => loaded.default),
  },
  {
    descriptor: BRICK_VALLEY_DESCRIPTOR,
    load: () => import('./brick-valley/adapter').then((loaded) => loaded.default),
  },
  {
    descriptor: SKY_ISLAND_DESCRIPTOR,
    load: () => import('./sky-island/adapter').then((loaded) => loaded.default),
  },
] as const satisfies readonly LazyEnvironmentRegistration[]

export const ADDITIVE_ENVIRONMENT_BY_ID = new Map(
  ADDITIVE_ENVIRONMENT_REGISTRATIONS.map((registration) => [registration.descriptor.id, registration]),
)
