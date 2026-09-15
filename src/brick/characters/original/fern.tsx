import { useGLTF } from '@react-three/drei'
import { OriginalAvatar } from './OriginalAvatar'
import { FERN_DESCRIPTOR } from './descriptors'
import { ORIGINAL_MODEL_URLS } from './model'
import type { CharacterContentModule, CharacterVisualProps } from '../types'

function Avatar(props: CharacterVisualProps) { return <OriginalAvatar {...props} id="fern" /> }
export default { descriptor: FERN_DESCRIPTOR, Avatar, preload: () => useGLTF.preload(ORIGINAL_MODEL_URLS.fern, false, false) } satisfies CharacterContentModule
