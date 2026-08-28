export type BrickMode = 'build' | 'explore'

export type BrickBudgetProfile = 'desktop' | 'tablet' | 'phone'

export type BrickKind =
  | 'brick' | 'plate' | 'slope' | 'stair' | 'window' | 'door'
  | 'corner' | 'round' | 'cone' | 'arch' | 'invertedSlope'

export type BrickPart = {
  id: string
  name: string
  width: number
  depth: number
  height: number
  kind: BrickKind
  icon: string
}

export type BrickInstance = {
  id: string
  partId: string
  x: number
  y: number
  z: number
  rotation: 0 | 1 | 2 | 3
  color: string
}

export type BrickDraft = Omit<BrickInstance, 'id'>

export type ViewPreset = 'home' | 'selection' | 'top' | 'front' | 'right' | 'perspective'

export type EnvironmentId = 'classic' | 'toy-room' | 'brick-valley' | 'sky-island'

export type CharacterId = 'classic' | 'toy-figure' | 'cc0-hero'

export type CustomPartTemplate =
  | 'solid'
  | 'slope'
  | 'invertedSlope'
  | 'corner'
  | 'round'
  | 'cone'
  | 'stairs'
  | 'arch'
  | 'window'
  | 'door'

export type CustomPartDefinition = {
  id: string
  name: string
  template: CustomPartTemplate
  width: number
  depth: number
  height: number
  studs: 'auto' | 'full' | 'none'
}

export type PlayerProfile = {
  displayName: string
  characterId?: string
  palette?: Record<string, string>
}
