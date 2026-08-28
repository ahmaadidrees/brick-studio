import { ToyFigureAvatar } from './ToyFigureAvatar'
import { TOY_FIGURE_DESCRIPTOR } from './descriptor'
import type { CharacterContentModule } from '../types'

const module: CharacterContentModule = {
  descriptor: TOY_FIGURE_DESCRIPTOR,
  Avatar: ToyFigureAvatar,
}

export default module
