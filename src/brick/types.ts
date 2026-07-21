export type BrickMode = 'build' | 'explore'

export type BrickKind = 'brick' | 'plate' | 'slope' | 'stair' | 'window' | 'door'

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
