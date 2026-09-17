import { useGLTF } from '@react-three/drei'
import { OriginalAvatar } from './OriginalAvatar'
import { NOVA_DESCRIPTOR } from './descriptors'
import { ORIGINAL_MODEL_URLS } from './model'
import type { CharacterContentModule, CharacterVisualProps } from '../types'

function Avatar(props: CharacterVisualProps) { return <OriginalAvatar {...props} id="nova" /> }
export default { descriptor: NOVA_DESCRIPTOR, Avatar, preload: () => useGLTF.preload(ORIGINAL_MODEL_URLS.nova, false, false) } satisfies CharacterContentModule
