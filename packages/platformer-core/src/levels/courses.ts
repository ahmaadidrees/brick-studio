import type { LevelDesign } from '../engine/level'
import { joinScreens, levelFromAscii } from './ascii'
import { demoLevel } from './demo'

/*
 * The courses that ship with the game. Each is text, one character per tile (legend in ascii.ts),
 * built from 32x22 screens. Every course is checked by the autoplay bot in
 * scripts/playthrough.integration.test.ts, so none has an impossible section.
 */

export interface Course {
  id: string
  title: string
  blurb: string
  level: () => LevelDesign
}

const H = 22

function screen(rows: Record<number, string>, width = 32): string[] {
  return Array.from({ length: H }, (_, y) => {
    const r = rows[y] ?? '.'.repeat(width)
    if (r.length !== width) throw new Error(`course row ${y} is ${r.length} wide, expected ${width}: "${r}"`)
    return r
  })
}

const FLOOR = '#'.repeat(32)
const CEILING = '#'.repeat(32)
const WALL = 'XX' + '.'.repeat(30)
const LEDGE = '.'.repeat(30) + 'XX'

// ---------------------------------------------------------------------------------------------
// Cave Crawl: underground. A low brick tunnel, a lava lake crossed on lifts, a climb up one-way
// ledges to get over a wall, spikes and spikies, and a staircase out.

function caveCrawl(): LevelDesign {
  const start = screen({
    0: CEILING,
    1: CEILING,
    12: '..........o.o.o.................',
    16: '.........B?BMB?B................',
    19: '...@...............g.......g....',
    20: FLOOR,
    21: FLOOR,
  })
  const tunnel = screen({
    0: CEILING,
    1: CEILING,
    15: '........o.o.o.o.o.o.o...........',
    16: '......BBbBBBBBBbBBBBBBbBBB......',
    19: '..........k.......g...g.........',
    20: FLOOR,
    21: FLOOR,
  })
  const lake = screen({
    0: CEILING,
    1: CEILING,
    13: '..............o.o.o.............',
    17: '....p........XXXX.p.............',
    18: '.............XXXX...............',
    19: '.............XXXX............C..',
    20: '####~~~~~~~~~XXXX~~~~~~~~~~#####',
    21: '####~~~~~~~~~XXXX~~~~~~~~~~#####',
  })
  const climb = screen({
    0: CEILING,
    1: CEILING,
    5: '.........................o.o.o..',
    8: '.......................=======XX',
    9: LEDGE,
    10: LEDGE,
    11: '................=====.........XX',
    12: LEDGE,
    13: LEDGE,
    14: '.........=====................XX',
    15: LEDGE,
    16: LEDGE,
    17: '...=====......................XX',
    18: LEDGE,
    19: '.....g.............g..........XX',
    20: FLOOR,
    21: FLOOR,
  })
  const spikes = screen({
    0: CEILING,
    1: CEILING,
    ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [8 + i, WALL])),
    12: 'XX..........o.o.o...............',
    16: 'XX........?.....?...............',
    19: 'XX.....s...........s............',
    20: '#########^^^#########^^^########',
    21: FLOOR,
  })
  const stairs = screen({
    0: CEILING,
    1: CEILING,
    13: '............................X...',
    14: '...........................XX...',
    15: '..........................XXX...',
    16: '.........................XXXX...',
    17: '........................XXXXX...',
    18: '.......................XXXXXX...',
    19: '.....k................XXXXXXX...',
    20: FLOOR,
    21: FLOOR,
  })
  const goal = screen(
    {
      0: '#'.repeat(24),
      1: '#'.repeat(24),
      19: '......G.................',
      20: '#'.repeat(24),
      21: '#'.repeat(24),
    },
    24,
  )
  return levelFromAscii(joinScreens(start, tunnel, lake, climb, spikes, stairs, goal), 'Cave Crawl', 'underground')
}

// ---------------------------------------------------------------------------------------------
// Spring Skies: springs and bounce blocks. Hold jump when you land on them to go high.

function springSkies(): LevelDesign {
  const start = screen({
    9: '.............o.o.o..............',
    13: '............=======.............',
    16: '......................?.M.?.....',
    19: '...@.......S........g...........',
    20: FLOOR,
    21: FLOOR,
  })
  const bridge = screen({
    13: '..........o.....o.....o.........',
    17: '........NN....NN....NN..........',
    20: '#####......................#####',
    21: '#####......................#####',
  })
  const lifts = screen({
    10: '...............o.o..............',
    12: '..........f.....................',
    17: '.....p............p.............',
    20: '####..........###..........#####',
    21: '####..........###..........#####',
  })
  const hops = screen({
    8: '........o.o.........o.o.........',
    19: '..C..S...........S..............',
    20: '######......######......########',
    21: '######......######......########',
  })
  const clouds = screen({
    9: '...............ooo..............',
    11: '..............=====.............',
    14: '........=====.........=====.....',
    17: '...=====..........f.............',
    20: '###.........................####',
    21: '###.........................####',
  })
  const finale = screen({
    10: '...................o.o.o.o......',
    14: '............................X...',
    15: '...........................XX...',
    16: '..........................XXX...',
    17: '.........................XXXX...',
    18: '........................XXXXX...',
    19: '.....g....S............XXXXXX...',
    20: FLOOR,
    21: FLOOR,
  })
  const goal = screen(
    {
      19: '......G.................',
      20: '#'.repeat(24),
      21: '#'.repeat(24),
    },
    24,
  )
  return levelFromAscii(joinScreens(start, bridge, lifts, hops, clouds, finale, goal), 'Spring Skies')
}

export const COURSES: Course[] = [
  { id: 'workshop', title: 'Workshop Run', blurb: 'Stomps, shells, a wall-jump shaft and a gap that needs full speed.', level: demoLevel },
  { id: 'caves', title: 'Cave Crawl', blurb: 'Underground: a brick tunnel, a lava lake and a climb.', level: caveCrawl },
  { id: 'skies', title: 'Spring Skies', blurb: 'Springs and bounce blocks. Hold jump when you land.', level: springSkies },
]

export const courseById = (id: string) => COURSES.find((c) => c.id === id)
