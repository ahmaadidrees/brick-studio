import { HeroAvatar } from './HeroAvatar'
import { CC0_HERO_DESCRIPTOR } from './descriptor'
import { preloadHeroAvatar } from './heroModel'
import type { CharacterContentModule } from '../types'

const module: CharacterContentModule = {
  descriptor: CC0_HERO_DESCRIPTOR,
  Avatar: HeroAvatar,
  preload: preloadHeroAvatar,
}

export default module
