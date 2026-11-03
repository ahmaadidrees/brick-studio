/**
 * Each kit's React slots in the studio shell (docs/qa/hackable-modes/R1-SCREENS.md B.2): what Play shows over the level,
 * the touch buttons, and an optional chip in Build. The plain-data half of the descriptor is ../kitScreens.ts.
 */
import type { ComponentType } from 'react'
import type { LevelDesign } from '../../core/contracts'
import type { Runtime } from '../../core/runtime'
import type { StudioStore } from '../store'
import { screensFor, type ScreensKit } from '../kitScreens'
import { PlayFeedback } from '../builder/PlayFeedback'
import { PlayTouchControls } from './PlayTouchControls'
import { RaceHud } from '../race/screens/RaceHud'
import { RaceTouch } from '../race/screens/RaceTouch'
import { LapsChip } from '../race/screens/LapsChip'

export interface KitParts {
  /** Over the level while it plays: hints, counters, "You made it!". */
  PlayHud: ComponentType<{ store: StudioStore }>
  /** On a touch screen while Play runs (not paused). */
  TouchControls: ComponentType<{ runtime: Runtime; store: StudioStore }>
  /** Under the level in Build. */
  BuildChip?: ComponentType<{ store: StudioStore }>
}

export const KIT_PARTS: Readonly<Record<ScreensKit, KitParts>> = {
  platformer: { PlayHud: PlayFeedback, TouchControls: PlayTouchControls },
  race: { PlayHud: RaceHud, TouchControls: RaceTouch, BuildChip: LapsChip },
}

export const partsFor = (design: Pick<LevelDesign, 'kit'>): KitParts => KIT_PARTS[screensFor(design).kit]
