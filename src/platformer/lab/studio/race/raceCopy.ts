/**
 * Hackable Racing's words (docs/qa/hackable-modes/R1-SCREENS.md). First drafts from the contract; lane 1 (projects and
 * words) owns this file and settles them.
 */
import type { KitCopy } from '../kitScreens'

export const RACE_COPY: KitCopy = {
  projectName: 'My race track',
  player: 'Car',
  noPlayer: 'Place your Car first. Pick the Car in the Bricks drawer, then click the track.',
  controlsHint: 'left and right steer · up is gas · down is brake',
  followLabel: 'Follow the Car',
  tipsKey: 'brickgineers.hackable-race.tips.v1',
  tips: {
    build: 'Pick a track brick, then tap or click to paint the track.',
    buildPhone: 'Press Bricks, pick one, then tap the track to paint it.',
    code: 'Open the Car’s code. Switch a script off to see how it drives.',
    codeSmall: 'On a bigger screen, open the Car’s code. Switch a script off to see how it drives.',
    play: 'Press Play to race.',
  },
  helpPlay: 'Press Play to race. The arrow keys drive: left and right steer, up is gas and down is brake. On a touch screen, use the buttons on the screen. Press Build to go back.',
}
