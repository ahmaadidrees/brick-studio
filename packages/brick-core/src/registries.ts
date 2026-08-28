import type { CharacterId, EnvironmentId } from './types'

export type EnvironmentDescriptor = {
  id: EnvironmentId
  name: string
  description: string
  previewKey: string
}

export type CharacterDescriptor = {
  id: CharacterId
  name: string
  description: string
  previewKey: string
  customizable: boolean
}
