import type { CharacterDescriptor } from '../../registries'

export const PIP_DESCRIPTOR = { id: 'pip', name: 'Pip', description: 'A sunny pocket robot, ready to build something brilliant.', previewKey: 'character:pip', customizable: true } as const satisfies CharacterDescriptor
export const FERN_DESCRIPTOR = { id: 'fern', name: 'Fern', description: 'A woodland pathfinder with a fox cap and a curious spirit.', previewKey: 'character:fern', customizable: true } as const satisfies CharacterDescriptor
export const NOVA_DESCRIPTOR = { id: 'nova', name: 'Nova', description: 'A friendly comet creature exploring a whole new world.', previewKey: 'character:nova', customizable: true } as const satisfies CharacterDescriptor
export type OriginalCharacterId = 'pip' | 'fern' | 'nova'
