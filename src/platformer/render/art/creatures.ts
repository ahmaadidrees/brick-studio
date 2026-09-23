import { Bitmap, fromRows } from './bitmap'
import { PAL } from './palette'

/*
 * Toy-workshop robots and power-ups. All original designs, drawn facing right.
 */

const C: Record<string, string> = {
  K: PAL.outline,
  M: PAL.metal,
  L: PAL.metalLight,
  d: PAL.metalShade,
  R: PAL.red,
  r: PAL.redLight,
  W: PAL.white,
  Y: PAL.gold,
  y: PAL.goldShade,
  G: PAL.green,
  g: PAL.greenShade,
  l: PAL.greenLight,
  B: PAL.boot,
  S: PAL.spike,
  s: PAL.spikeShade,
  P: PAL.brick,
  p: PAL.brickLight,
  q: PAL.brickShade,
  E: PAL.spark,
  e: PAL.sparkDeep,
  c: PAL.sparkCore,
  h: PAL.goldLight,
  o: PAL.goldDeep,
}
const rows = (r: string[]) => fromRows(r, C)

// Walker: a round wind-up robot with a red visor and a key on top.
const WALKER_TOP = [
  '................',
  '......KYYK......',
  '.....KYKKYK.....',
  '......KKKK......',
  '....KKKKKKKK....',
  '...KLLLLMMMMK...',
  '..KLLMMMMMMMMK..',
  '..KLMMKKKKKKMK..',
  '..KMMKRRRWRKMK..',
  '..KMMKRRRRRKMK..',
  '..KMMMKKKKKMMK..',
  '..KdMMMMMMMMdK..',
  '...KddddddddK...',
  '....KKKKKKKK....',
]
export const WALKER_1 = rows([...WALKER_TOP, '...KBBK..KBBK...', '...KKKK..KKKK...'])
export const WALKER_2 = rows([...WALKER_TOP, '....KBBKKBBK....', '....KKKKKKKK....'])
export const WALKER_FLAT = rows([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....KKKKKKKK....',
  '..KKLLMMMMMMKK..',
  '.KLMMKRRWRKMMMK.',
  '.KMMMKKKKKKMMMK.',
  '.KddddddddddddK.',
  '..KKKKKKKKKKKK..',
  '..KBBK....KBBK..',
])

// Flyer: the walker with a propeller instead of a key (16 x 24).
function flyer(prop: string[]): Bitmap {
  return rows([
    ...prop,
    '.......KK.......',
    '.......KK.......',
    '......KKKK......',
    '....KKKKKKKK....',
    '...KLLLLMMMMK...',
    '..KLLMMMMMMMMK..',
    '..KLMMKKKKKKMK..',
    '..KMMKRRRWRKMK..',
    '..KMMKRRRRRKMK..',
    '..KMMMKKKKKMMK..',
    '..KdMMMMMMMMdK..',
    '...KddddddddK...',
    '....KKKKKKKK....',
    '...KBBK..KBBK...',
    '...KKKK..KKKK...',
  ])
}
export const FLYER_1 = flyer([
  '................',
  '................',
  '................',
  '.KKKKKK..KKKKKK.',
  'KWWWWWWKKWWWWWWK',
  '.KKKKKK..KKKKKK.',
  '................',
  '................',
  '................',
])
export const FLYER_2 = flyer([
  '................',
  '................',
  '................',
  '....KKKKKKKK....',
  '...KWWWWWWWWK...',
  '....KKKKKKKK....',
  '................',
  '................',
  '................',
])

// Shellbug: a beetle robot with a studded green dome.
export const SHELLBUG_1 = rows([
  '................',
  '................',
  '................',
  '.....KKKKK......',
  '...KKGllGGKK....',
  '..KGllGGGGGGK...',
  '.KGGllGGGllGGK..',
  '.KGGGGGGGllGGKKK',
  '.KGGGGGGGGGGGKMK',
  'KgGGGGGGGGGGKMRK',
  'KggGGGGGGGGgKMMK',
  'KKKKKKKKKKKKKKK.',
  '.KWWWWWWWWWWK...',
  '..KKKKKKKKKK....',
  '..KBK.KBK.KBK...',
  '..KK..KK..KK....',
])
export const SHELLBUG_2 = rows([
  '................',
  '................',
  '................',
  '.....KKKKK......',
  '...KKGllGGKK....',
  '..KGllGGGGGGK...',
  '.KGGllGGGllGGK..',
  '.KGGGGGGGllGGKKK',
  '.KGGGGGGGGGGGKMK',
  'KgGGGGGGGGGGKMRK',
  'KggGGGGGGGGgKMMK',
  'KKKKKKKKKKKKKKK.',
  '.KWWWWWWWWWWK...',
  '..KKKKKKKKKK....',
  '...KBK.KBK.KBK..',
  '...KK..KK..KK...',
])

function shell(hl: [number, number]): Bitmap {
  const base = [
    '................',
    '................',
    '................',
    '................',
    '.....KKKKKK.....',
    '...KKGGGGGGKK...',
    '..KGGGGGGGGGGK..',
    '.KGGGGGGGGGGGGK.',
    '.KGGGGGGGGGGGGK.',
    'KgGGGGGGGGGGGGgK',
    'KggGGGGGGGGGGggK',
    'KKKKKKKKKKKKKKKK',
    '.KWWWWWWWWWWWWK.',
    '.KWWWWWWWWWWWWK.',
    '..KKKKKKKKKKKK..',
    '................',
  ].map((r) => r.split(''))
  // Two stud highlights that move around the dome to suggest spin.
  for (const cx of hl) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const x = cx + dx
      const y = 6 + dy
      if (base[y][x] === 'G') base[y][x] = 'l'
    }
  }
  return rows(base.map((r) => r.join('')))
}
export const SHELL_FRAMES = [shell([3, 9]), shell([5, 11]), shell([7, 2]), shell([9, 5])]

// Spiky: a red hedgehog-bot. Can't be stomped.
const SPIKY_TOP = [
  '................',
  '...K...K...K....',
  '..KSK.KSK.KSK...',
  '.KSsSKSsSKSsSK..',
  'KSsKKKKKKKKsSK..',
  '.KKRrrRRRRRRKK..',
  '.KRrRRRRRRRRRK..',
  'KRRRRRRRRKWKRRK.',
  'KRRRRRRRRKKKRRRK',
  'KRRRRRRRRRRRRRK.',
  'KqRRRRRRRRRRRqK.',
  '.KqqqqqqqqqqqK..',
  '..KKKKKKKKKKKK..',
  '..KWWWWWWWWWWK..',
]
export const SPIKY_1 = rows([...SPIKY_TOP, '..KBBK...KBBK...', '..KKKK...KKKK...'])
export const SPIKY_2 = rows([...SPIKY_TOP, '...KBBK.KBBK....', '...KKKK.KKKK....'])

// Grow power-up: a smiling red brick with studs.
export const GROW = rows([
  '................',
  '...KKK....KKK...',
  '..KrrrK..KrrrK..',
  '.KKKKKKKKKKKKKK.',
  '.KrPPPPPPPPPPpK.',
  '.KPPPPPPPPPPPPK.',
  '.KPPKWPPPPKWPPK.',
  '.KPPKKPPPPKKPPK.',
  '.KPPPPPPPPPPPPK.',
  '.KPPPKPPPPKPPPK.',
  '.KPPPPKKKKPPPPK.',
  '.KqPPPPPPPPPPqK.',
  '.KqqqqqqqqqqqqK.',
  '.KKKKKKKKKKKKKK.',
  '................',
  '................',
]).crop(0, 0, 16, 16)

// Spark power-up: a charged bolt in a gear ring, two flicker frames.
const SPARK_ROWS = [
  '.....KKKKKK.....',
  '...KKMMMMMMKK...',
  '..KMMKKKKKKMMK..',
  '.KMMKeeEEeeKMMK.',
  '.KMKeEEccEEeKMK.',
  'KMMKeEcKKcEeKMMK',
  'KMKeEEcKcEEeeKMK',
  'KMKeEccccccEeKMK',
  'KMKeEEEEcKcEeKMK',
  'KMMKeEcKKcEeKMMK',
  '.KMKeEEccEEeKMK.',
  '.KMMKeeEEeeKMMK.',
  '..KMMKKKKKKMMK..',
  '...KKMMMMMMKK...',
  '.....KKKKKK.....',
  '................',
]
export const SPARK_ITEM_1 = rows(SPARK_ROWS)
export const SPARK_ITEM_2 = rows(SPARK_ROWS).recolored({ [PAL.spark]: PAL.sparkCore, [PAL.sparkDeep]: PAL.spark })

// Spark shot: a small crackling orb, four frames.
export const SPARK_SHOT = [
  rows(['..KKKK..', '.KEccEK.', 'KEccccEK', 'KcccEccK', 'KccEcccK', 'KEccccEK', '.KEccEK.', '..KKKK..']),
  rows(['..KKKK..', '.KEEcEK.', 'KEcccEEK', 'KccccccK', 'KccccccK', 'KEEcccEK', '.KEcEEK.', '..KKKK..']),
  rows(['..KKKK..', '.KEccEK.', 'KEccccEK', 'KccEcccK', 'KcccEccK', 'KEccccEK', '.KEccEK.', '..KKKK..']),
  rows(['...KK...', '..KEEK..', '.KEccEK.', 'KEccccEK', 'KEccccEK', '.KEccEK.', '..KEEK..', '...KK...']),
]
export const SPARK_BURST = rows(['K..KK..K', '.KE..EK.', '.E.cc.E.', 'K.c..c.K', 'K.c..c.K', '.E.cc.E.', '.KE..EK.', 'K..KK..K'])

// Coins: four spin frames. A stud is embossed on the face.
export const COIN_FRAMES = [
  rows([
    '................',
    '.....KKKKKK.....',
    '....KhhYYYYK....',
    '...KhYYYYYYyK...',
    '...KhYYKKYYyK...',
    '...KhYKhhKYyK...',
    '...KhYKhYKYyK...',
    '...KhYKYYKYyK...',
    '...KhYYKKYYyK...',
    '...KhYYYYYYyK...',
    '...KhYYYYYYyK...',
    '...KYYYYYYyyK...',
    '....KyyyyyyK....',
    '.....KKKKKK.....',
    '................',
    '................',
  ]),
  rows([
    '................',
    '......KKKK......',
    '.....KhYYyK.....',
    '....KhYYYYyK....',
    '....KhYKKYyK....',
    '....KhKhYKyK....',
    '....KhKYYKyK....',
    '....KhKYYKyK....',
    '....KhYKKYyK....',
    '....KhYYYYyK....',
    '....KhYYYYyK....',
    '....KYYYYyyK....',
    '.....KyyyyK.....',
    '......KKKK......',
    '................',
    '................',
  ]),
  rows([
    '................',
    '.......KK.......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '......KhyK......',
    '.......KK.......',
    '................',
    '................',
  ]),
  rows([
    '................',
    '......KKKK......',
    '.....KhYYyK.....',
    '....KhYYYYyK....',
    '....KhYKKYyK....',
    '....KhKYhKyK....',
    '....KhKYYKyK....',
    '....KhKYYKyK....',
    '....KhYKKYyK....',
    '....KhYYYYyK....',
    '....KhYYYYyK....',
    '....KYYYYyyK....',
    '.....KyyyyK.....',
    '......KKKK......',
    '................',
    '................',
  ]),
]

export const SPARKLE = [
  rows(['...K...', '...h...', '.K.h.K.', 'KhhYhhK', '.K.h.K.', '...h...', '...K...']),
  rows(['.......', '...h...', '...h...', '.hhYhh.', '...h...', '...h...', '.......']),
  rows(['.......', '.......', '...h...', '..hYh..', '...h...', '.......', '.......']),
]

export const POOF = [
  new Bitmap(16, 16),
  new Bitmap(16, 16),
  new Bitmap(16, 16),
].map((b, i) => {
  const r = 3 + i * 2
  for (const [cx, cy] of [
    [5, 6],
    [11, 7],
    [8, 11],
  ])
    b.disc(cx, cy, r - i, [255, 255, 255, 255])
  return b.outlined(PAL.cloudShade)
})

export const DUST = [0, 1, 2].map((i) => {
  const b = new Bitmap(8, 8)
  b.disc(4, 4.5, 3 - i, [255, 255, 255, 255])
  return b.outlined('#d9d2c4')
})

/** Brick fragments, one 8x8 quarter of a brick, spun by the renderer. */
export const DEBRIS = rows(['.KKKKK..', 'KpPPPPK.', 'KPPPPqK.', 'KPPPqqK.', '.KKKKK..', '........', '........', '........'])
