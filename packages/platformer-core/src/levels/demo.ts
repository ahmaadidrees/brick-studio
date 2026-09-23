import { joinScreens, levelFromAscii } from './ascii'
import type { LevelDesign } from '../engine/level'

/*
 * "Workshop Run", the hand-built course that ships with the POC. It is built to exercise the
 * feel: a runway, blocks to hit, enemies to stomp, a shell to kick down a line, a wall-jump
 * shaft, springs and bounce blocks, a moving platform, lava, and a gap that wants P-speed.
 * Legend in ascii.ts. Each screen is 32 columns by 22 rows.
 */

const H = 22
const W = 32

function screen(rows: Record<number, string>, width = W): string[] {
  return Array.from({ length: H }, (_, y) => {
    const r = rows[y] ?? '.'.repeat(width)
    if (r.length !== width) throw new Error(`demo row ${y} is ${r.length} wide, expected ${width}: "${r}"`)
    return r
  })
}

const GROUND = '#'.repeat(W)

// 1. Start: first blocks, a power-up, one walker.
const start = screen({
  12: '......................o.o.o.....',
  16: '...........?........B?BMB.......',
  19: '...@................g...........',
  20: GROUND,
  21: GROUND,
})

// 2. Pipes of rising height with walkers between, a shellbug after.
const pipes = screen({
  13: '....................o.o.........',
  15: '............o.o.................',
  16: '....................[]..........',
  17: '............[]......[]..........',
  18: '....[]......[]......[]..........',
  19: '....[]..g...[]..g.g.[]....k.....',
  20: GROUND,
  21: GROUND,
})

// 3. Gaps, a one-way ledge with a spark block above, a moving platform over a wide pit.
const gaps = screen({
  13: '.........F......................',
  17: '.......=====....................',
  18: '...............p................',
  19: '..........g.....................',
  20: '####..########............######',
  21: '####..########............######',
})

// 4. Checkpoint, a shell to kick into a line of walkers, and the wall-jump shaft.
const shaft = screen({
  5: '....................X...........',
  6: '....................X...........',
  7: '....................X...........',
  8: '....................X...........',
  9: '....................X...XXXXXXXX',
  10: '....................X.o.X.......',
  11: '....................X...X.......',
  12: '....................X.o.X.......',
  13: '....................X...X.......',
  14: '....................X.o.X.......',
  15: '....................X...X.......',
  16: '........BMB.........X...X.......',
  17: '........................X.......',
  18: '........................X.......',
  19: '..C...k.....g.g.g.....S.X.......',
  20: GROUND,
  21: GROUND,
})

// 5. Down from the ledge: spikies, a lava pit crossed on bounce blocks, spikes.
const lava = screen({
  9: 'XXXXXX..........................',
  13: '...........f.......f............',
  16: '...............===.....BBBB.....',
  17: '..........NN....................',
  19: '..s....s.............o.o........',
  20: '########~~~~~~~~~~~~####^^^^####',
  21: '########~~~~~~~~~~~~############',
})

// 6. A runway to fill the run meter, a wide gap, and the staircase.
const finale = screen({
  13: '................o.o.o...........',
  14: '.............................X..',
  15: '............................XX..',
  16: '.................XX........XXX..',
  17: '..........................XXXX..',
  18: '.........................XXXXX..',
  19: '........................XXXXXX..',
  20: '##############.........#########',
  21: '##############.........#########',
})

// 7. The goal.
const goal = screen(
  {
    19: '......G.................',
    20: '#'.repeat(24),
    21: '#'.repeat(24),
  },
  24,
)

export function demoLevel(): LevelDesign {
  return levelFromAscii(joinScreens(start, pipes, gaps, shaft, lava, finale, goal), 'Workshop Run')
}
