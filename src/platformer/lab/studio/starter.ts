/**
 * Starter level for Code Lab Wave 2 (step 2 of CODE-LAB-BRICK-MODEL.md).
 *
 * Demonstrates:
 * - Spinner brick (forever turn 15 degrees)
 * - Bouncer brick (forever move speed steps, if on edge bounce) with a `showInBuild` knob
 *   painted twice with different knob values (slow vs fast)
 * - Blinker brick (click to switch costume and say a message)
 * - Stage backdrop
 *
 * All bricks have pixel-art costumes (built via `costumeFromImage` / `imageFromRows`)
 * and real Blockly workspace serialization JSON that compiles cleanly.
 */

import type { BrickDef, Costume, LevelDesign, VariableDecl } from '../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../core/editor/compile'
import { costumeFromImage, imageFromRows } from './pixels'
import { STAGE_ID, type StudioProject } from './store'

// -----------------------------------------------------------------------------
// Pixel Art Palettes & Sprites (1 step = 1 art pixel)
// -----------------------------------------------------------------------------

const PALETTE: Record<string, string> = {
  '.': '',
  '#': '#0f172a',
  'Y': '#facc15',
  'O': '#fb923c',
  'W': '#ffffff',
  'G': '#22c55e',
  'g': '#15803d',
  'B': '#38bdf8',
  'b': '#0284c7',
  'P': '#c084fc',
  'p': '#7e22ce',
  'K': '#1e1b4b',
  'S': '#64748b',
}

// 16x16 Spinner: A vibrant 8-point yellow/orange star
const SPINNER_ROWS = [
  '.....######.....',
  '....#YYYYYY#....',
  '...#YYYYYYYY#...',
  '..#YYYWWWWYYY#..',
  '.#YYYYWWWWYYYY#.',
  '#YYYYYOOOOYYYYY#',
  '#YYYYOOOOOOYYYY#',
  '#YYWOOOOOOOOWYY#',
  '#YYWOOOOOOOOWYY#',
  '#YYYYOOOOOOYYYY#',
  '#YYYYYOOOOYYYYY#',
  '.#YYYYWWWWYYYY#.',
  '..#YYYWWWWYYY#..',
  '...#YYYYYYYY#...',
  '....#YYYYYY#....',
  '.....######.....',
]

// 16x16 Bouncer: A bouncy green slime with expressive eyes
const BOUNCER_ROWS = [
  '.....######.....',
  '...##GGGGGG##...',
  '..#GGGGGGGGGG#..',
  '.#GGGGGGGGGGGG#.',
  '.#GGWWGGGGWWGG#.',
  '#GG#..#GG#..#GG#',
  '#GG#..#GG#..#GG#',
  '#GGWWWWGGWWWWGG#',
  '#GGGGGGGGGGGGGG#',
  '#GGGGGGggGGGGGG#',
  '#GGGGGggggGGGGG#',
  '.#GGGGGGGGGGGG#.',
  '.#GGggggggggGG#.',
  '..#GggggggggG#..',
  '...##GGGGGG##...',
  '.....######.....',
]

// 16x16 Blinker Costume 1: Blue sparkling crystal
const BLINKER_BLUE_ROWS = [
  '......####......',
  '.....#BBBB#.....',
  '....#BBWWBB#....',
  '...#BBWWWWBB#...',
  '..#BBBWKKWBBB#..',
  '.#BBBBWKKWBBBB#.',
  '#BBBBBWKKWBBBBB#',
  '#BBbbbbbbbbbbBB#',
  '#BBbbbbbbbbbbBB#',
  '#BBBBBWKKWBBBBB#',
  '.#BBBBWKKWBBBB#.',
  '..#BBBWKKWBBB#..',
  '...#BBWWWWBB#...',
  '....#BBWWBB#....',
  '.....#BBBB#.....',
  '......####......',
]

// 16x16 Blinker Costume 2: Purple glowing crystal
const BLINKER_PURPLE_ROWS = [
  '......####......',
  '.....#PPPP#.....',
  '....#PPWWPP#....',
  '...#PPWWWWPP#...',
  '..#PPPWKKWPPP#..',
  '.#PPPPWKKWPPPP#.',
  '#PPPPPWWWWPPPPP#',
  '#PPppppppppppPP#',
  '#PPppppppppppPP#',
  '#PPPPPWWWWPPPPP#',
  '.#PPPPWKKWPPPP#.',
  '..#PPPWKKWPPP#..',
  '...#PPWWWWPP#...',
  '....#PPWWPP#....',
  '.....#PPPP#.....',
  '......####......',
]

// 32x16 Stage Backdrop: Dusk sky with distant stars
const STAGE_ROWS = [
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKK.WKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKWKKKKK',
  'KKKKKWKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKK.WKKKKKKKKKKKKK',
  'pppppppppppppppppppppppppppppppp',
  'pppppppppppppppppppppppppppppppp',
  'pppppppppppppppppppppppppppppppp',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
  'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  '################################',
  '################################',
]

export function createCostumes(): {
  spinnerCostume: Costume
  bouncerCostume: Costume
  blinkerCostumes: Costume[]
  stageCostume: Costume
} {
  const spinnerCostume = costumeFromImage('Star', imageFromRows(SPINNER_ROWS, PALETTE), { x: 8, y: 8 })
  const bouncerCostume = costumeFromImage('Slime', imageFromRows(BOUNCER_ROWS, PALETTE), { x: 8, y: 8 })
  const blinkerCostumes = [
    costumeFromImage('Blue', imageFromRows(BLINKER_BLUE_ROWS, PALETTE), { x: 8, y: 8 }),
    costumeFromImage('Purple', imageFromRows(BLINKER_PURPLE_ROWS, PALETTE), { x: 8, y: 8 }),
  ]
  const stageCostume = costumeFromImage('Sunset', imageFromRows(STAGE_ROWS, PALETTE), { x: 16, y: 8 })

  return { spinnerCostume, bouncerCostume, blinkerCostumes, stageCostume }
}

// -----------------------------------------------------------------------------
// Blockly Workspaces
// -----------------------------------------------------------------------------

export function createSpinnerWorkspace(): WorkspaceJson {
  return {
    blocks: {
      blocks: [
        {
          type: 'event_whenflagclicked',
          id: 'hat_spinner_flag',
          next: {
            block: {
              type: 'control_forever',
              id: 'forever_spinner',
              inputs: {
                SUBSTACK: {
                  block: {
                    type: 'motion_turnright',
                    id: 'turn_spinner',
                    inputs: {
                      DEGREES: {
                        shadow: {
                          type: 'math_number',
                          id: 'turn_deg_shadow',
                          fields: { NUM: 15 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  }
}

export function createBouncerWorkspace(): WorkspaceJson {
  return {
    variables: [
      {
        id: 'speed',
        name: 'speed',
      },
    ],
    blocks: {
      blocks: [
        {
          type: 'event_whenflagclicked',
          id: 'hat_bouncer_flag',
          next: {
            block: {
              type: 'control_forever',
              id: 'forever_bouncer',
              inputs: {
                SUBSTACK: {
                  block: {
                    type: 'motion_movesteps',
                    id: 'move_bouncer',
                    inputs: {
                      STEPS: {
                        block: {
                          type: 'data_variable',
                          id: 'var_bouncer_speed',
                          fields: { VARIABLE: 'speed' },
                        },
                      },
                    },
                    next: {
                      block: {
                        type: 'motion_ifonedgebounce',
                        id: 'bounce_bouncer',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  }
}

export function createBlinkerWorkspace(): WorkspaceJson {
  return {
    blocks: {
      blocks: [
        {
          type: 'event_whenthisspriteclicked',
          id: 'hat_blinker_click',
          next: {
            block: {
              type: 'looks_nextcostume',
              id: 'looks_blinker_next',
              next: {
                block: {
                  type: 'looks_sayforsecs',
                  id: 'looks_blinker_say',
                  inputs: {
                    MESSAGE: {
                      shadow: {
                        type: 'text',
                        id: 'say_msg_shadow',
                        fields: { TEXT: 'Sparkle!' },
                      },
                    },
                    SECS: {
                      shadow: {
                        type: 'math_number',
                        id: 'say_secs_shadow',
                        fields: { NUM: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  }
}

export function createStageWorkspace(): WorkspaceJson {
  return {
    blocks: {
      blocks: [],
    },
  }
}

// -----------------------------------------------------------------------------
// Starter Project Factory
// -----------------------------------------------------------------------------

export function createStarterProject(): StudioProject {
  const { spinnerCostume, bouncerCostume, blinkerCostumes, stageCostume } = createCostumes()

  const spinnerWs = createSpinnerWorkspace()
  const bouncerWs = createBouncerWorkspace()
  const blinkerWs = createBlinkerWorkspace()
  const stageWs = createStageWorkspace()

  const bouncerSpeedVar: VariableDecl = {
    id: 'speed',
    name: 'speed',
    value: 8,
    showInBuild: true,
  }

  const spinnerCompile = compileWorkspace(spinnerWs)
  const bouncerCompile = compileWorkspace(bouncerWs, { variables: [bouncerSpeedVar] })
  const blinkerCompile = compileWorkspace(blinkerWs)
  const stageCompile = compileWorkspace(stageWs)

  const stageBrick: BrickDef = {
    id: STAGE_ID,
    name: 'Stage',
    isStage: true,
    costumes: [stageCostume],
    sounds: [],
    program: stageCompile.program,
  }

  const spinnerBrick: BrickDef = {
    id: 'brick_spinner',
    name: 'Spinner',
    costumes: [spinnerCostume],
    sounds: [],
    program: spinnerCompile.program,
  }

  const bouncerBrick: BrickDef = {
    id: 'brick_bouncer',
    name: 'Bouncer',
    costumes: [bouncerCostume],
    sounds: [],
    program: bouncerCompile.program,
  }

  const blinkerBrick: BrickDef = {
    id: 'brick_blinker',
    name: 'Blinker',
    costumes: blinkerCostumes,
    sounds: [],
    program: blinkerCompile.program,
  }

  const design: LevelDesign = {
    id: 'starter_level',
    name: 'Starter Playground',
    seed: 12345,
    bounds: { left: 0, right: 960, bottom: 0, top: 360 },
    stage: stageBrick,
    bricks: [spinnerBrick, bouncerBrick, blinkerBrick],
    copies: [
      {
        id: 'copy_spinner_1',
        brickId: 'brick_spinner',
        x: 180,
        y: 180,
      },
      // Bouncer painted twice with different knob values (slow vs fast)
      {
        id: 'copy_bouncer_slow',
        brickId: 'brick_bouncer',
        x: 320,
        y: 200,
        direction: 45,
        knobs: { speed: 5 },
      },
      {
        id: 'copy_bouncer_fast',
        brickId: 'brick_bouncer',
        x: 640,
        y: 160,
        direction: 135,
        knobs: { speed: 12 },
      },
      {
        id: 'copy_blinker_1',
        brickId: 'brick_blinker',
        x: 480,
        y: 120,
      },
    ],
  }

  const workspaces: Record<string, unknown> = {
    [STAGE_ID]: stageWs,
    brick_spinner: spinnerWs,
    brick_bouncer: bouncerWs,
    brick_blinker: blinkerWs,
  }

  return {
    design,
    workspaces,
  }
}
