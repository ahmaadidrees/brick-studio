import { useGLTF } from '@react-three/drei'
import { OriginalAvatar } from './OriginalAvatar'
import { PIP_DESCRIPTOR } from './descriptors'
import { ORIGINAL_MODEL_URLS } from './model'
import type { CharacterContentModule, CharacterVisualProps } from '../types'

function Avatar(props: CharacterVisualProps) { return <OriginalAvatar {...props} id="pip" /> }
export default { descriptor: PIP_DESCRIPTOR, Avatar, preload: () => useGLTF.preload(ORIGINAL_MODEL_URLS.pip, false, false) } satisfies CharacterContentModule
