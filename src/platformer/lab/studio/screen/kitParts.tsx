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
import type { BuildTools } from '../Stage'
import type { History } from '../builder/history'
import { Stage3D } from '../three/Stage3D'
import { Drawer3D, PlacingChip3D } from '../three/Drawer3D'
import { PlayHud3D, TouchControls3D } from '../three/PlayHud3D'
import { TestRoom3D } from '../three/TestRoom3D'

export interface KitParts {
  /** Over the level while it plays: hints, counters, "You made it!". */
  PlayHud: ComponentType<{ store: StudioStore }>
  /** On a touch screen while Play runs (not paused). */
  TouchControls: ComponentType<{ runtime: Runtime; store: StudioStore }>
  /** Under the level in Build. */
  BuildChip?: ComponentType<{ store: StudioStore }>
  /** The level itself, in place of the 2D Stage (Hackable 3D's three.js world). */
  Stage?: ComponentType<{ store: StudioStore; tools?: BuildTools; codeView?: boolean; onOpenCode?: () => void }>
  /** Build's left column, in place of the 2D Bricks drawer. */
  Drawer?: ComponentType<{ store: StudioStore; history: History; erasing: boolean; onErasing: (on: boolean) => void; onPicked?: () => void }>
  /** Along the bottom of the level while placing or erasing, in place of the 2D paint strip. */
  Strip?: ComponentType<{ store: StudioStore; erasing: boolean; onErasing: (on: boolean) => void }>
  /** Code's "Just this brick", in place of the 2D test room. */
  TestRoom?: ComponentType<{ store: StudioStore; brickId: string; bare?: boolean; restartKey?: number }>
}

export const KIT_PARTS: Readonly<Record<ScreensKit, KitParts>> = {
  platformer: { PlayHud: PlayFeedback, TouchControls: PlayTouchControls },
  race: { PlayHud: RaceHud, TouchControls: RaceTouch, BuildChip: LapsChip },
  // Hackable 3D (D1): its own world view, drawer, placing chip, test room and HUD (studio/three).
  '3d': { PlayHud: PlayHud3D, TouchControls: TouchControls3D, Stage: Stage3D, Drawer: Drawer3D, Strip: PlacingChip3D, TestRoom: TestRoom3D },
}

export const partsFor = (design: Pick<LevelDesign, 'kit'>): KitParts => KIT_PARTS[screensFor(design).kit]
