/**
 * Hackable Racing's words (docs/qa/hackable-modes/R1-SCREENS.md). Short and plain, in the same voice as the
 * Platformer's (kitScreens PLATFORMER_COPY): a kid reads "track", "Car" and "race", never the studio's own words.
 */
import type { KitCopy } from '../kitScreens'
import type { KitHelp } from '../screen/StudioHelp'

/** Help's Build and Code paragraphs for a race track (screen/StudioHelp.tsx reads `help` when a kit's copy has it). */
export const RACE_HELP: KitHelp = {
  about: 'How to build, code and race your track.',
  build: [
    'Pick a track brick in Bricks, like Road, Ice or a Boost pad, then tap or click to paint the track. Drag to paint lots. Erase takes bricks away, and Undo brings them back.',
    'Tap your Car to change its sliders, like its top speed or its grip.',
  ],
  // Racing has no + Power yet (R1), so Code says nothing about it.
  power: false,
}

export const RACE_COPY: KitCopy & { help: KitHelp } = {
  projectName: 'My race track',
  player: 'Car',
  noPlayer: 'Place your Car first. Pick the Car in the Bricks drawer, then click the track.',
  // Shown after the ← → keys, like the Platformer's hint.
  controlsHint: 'steer · up is gas · down is brake',
  followLabel: 'Follow the Car',
  // Its own key: a kid who saw the Platformer's tips still sees these the first time they open a race track.
  tipsKey: 'brickgineers.hackable-race.tips.v1',
  tips: {
    build: 'Pick a track brick, then tap or click to paint the track.',
    buildPhone: 'Press Bricks, pick one, then tap the track to paint it.',
    code: 'Open the Car’s code. Switch a script off to see how it drives.',
    codeSmall: 'On a bigger screen, open the Car’s code. Switch a script off to see how it drives.',
    play: 'Press Play to race your track.',
  },
  helpPlay: 'Press Play to race. The arrow keys drive: left and right steer, up is gas and down is brake. Finish your laps before the computer racers do. On a touch screen, use the buttons on the screen. Press Build to go back.',
  help: RACE_HELP,
}
