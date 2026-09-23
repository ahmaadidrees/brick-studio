import { Bitmap, fromRows, stack } from './bitmap'
import { PAL, PLAYER_COLORS } from './palette'

/*
 * The Brickgineer: a builder in a yellow hard hat and overalls. Drawn facing right. Overalls use
 * placeholder magenta so each player gets their own colour; the spark power swaps overalls and
 * shirt like a classic fire-power costume.
 */

const OVERALL = '#ff00ff'
const OVERALL_SHADE = '#aa00aa'

const C: Record<string, string> = {
  K: PAL.outline,
  Y: PAL.hat,
  h: PAL.hatLight,
  y: PAL.hatShade,
  S: PAL.skin,
  s: PAL.skinShade,
  H: PAL.hair,
  W: PAL.shirt,
  w: PAL.shirtShade,
  O: OVERALL,
  o: OVERALL_SHADE,
  B: PAL.boot,
  b: PAL.bootLight,
}

const rows = (r: string[]) => fromRows(r, C)

// ---------------------------------------------------------------------------------------------
// Small (16 x 16): an 8-row head over an 8-row body.

const SMALL_HEAD = rows([
  '.....KKKKKK.....',
  '....KhhhYYYK....',
  '...KhYYYYYYYK...',
  '..KyyyyyyyyyyK..',
  '..KHHSSSSSKSSK..',
  '..KHSSSSSSKSSSK.',
  '...KHsSSSSSSSK..',
  '....KKsssssKK...',
])

const SMALL_BODY: Record<string, string[]> = {
  stand: [
    '....KWOWWOWK....',
    '...KWWOOOOWWK...',
    '..KSKOOOOOOKSK..',
    '..KSKOOOOOOKSK..',
    '...KKOOooOOKK...',
    '....KOOKKOOK....',
    '...KBBBKKBBBK...',
    '...KKKKKKKKKK...',
  ],
  stride: [
    '....KWOWWOWK....',
    '...KWWOOOOWWKK..',
    '..KSKOOOOOOKSK..',
    '...KKOOOOOOKK...',
    '...KOOOooOOOK...',
    '..KOOKKKKKOOOK..',
    '.KBBBK...KBBBBK.',
    '.KKKKK...KKKKKK.',
  ],
  stride2: [
    '....KWOWWOWK....',
    '..KKWWOOOOWWK...',
    '..KSKOOOOOOKSK..',
    '...KKOOOOOOKK...',
    '....KOOooOOK....',
    '...KOOKKKOOK....',
    '..KBBBK.KBBBK...',
    '..KKKKK.KKKKK...',
  ],
  jump: [
    '..KKKWOWWOWKKK..',
    '.KSSKWOOOOWKSSK.',
    '..KKKOOOOOOKKK..',
    '....KOOOOOOK....',
    '...KOOooOOOOK...',
    '..KBBKKKKKBBBK..',
    '..KBBK....KBBK..',
    '..KKK......KKK..',
  ],
  skid: [
    '...KWOWWOWK.....',
    '..KWWOOOOWWK....',
    '.KSKOOOOOOKSK...',
    '..KKOOOOOOKK....',
    '...KOOooOOOK....',
    '..KOOKKKKOOOK...',
    '.KBBBK..KBBBBK..',
    '.KKKKK..KKKKKK..',
  ],
  wall: [
    '....KWOWWOWKSK..',
    '...KWWOOOOWWKSK.',
    '..KSKOOOOOOKKK..',
    '...KKOOOOOOK....',
    '....KOOooOOK....',
    '....KOOKKOOK....',
    '...KBBBKKBBBK...',
    '...KKKKKKKKKK...',
  ],
  kick: [
    '....KWOWWOWK....',
    '...KWWOOOOWWK...',
    '..KSKOOOOOOKSK..',
    '...KKOOOOOOKK...',
    '....KOOooOOOKKK.',
    '....KOOKKOOOBBBK',
    '...KBBBK..KKKKK.',
    '...KKKKK........',
  ],
}

const SMALL_DEAD = rows([
  '..KK........KK..',
  '.KSSK.KKKK.KSSK.',
  '.KSSKKhYYYKKSSK.',
  '..KSKYYYYYYKSK..',
  '..KSyyyyyyyySK..',
  '..KKHSSSSSSHKK..',
  '...KSKSSSSKSK...',
  '...KSSSssSSSK...',
  '....KSSSSSSK....',
  '...KWWOWWOWWK...',
  '..KWWWOOOOWWWK..',
  '..KKKOOOOOOKKK..',
  '....KOOooOOK....',
  '....KOOKKOOK....',
  '...KBBBKKBBBK...',
  '...KKKKKKKKKK...',
])

// ---------------------------------------------------------------------------------------------
// Big (16 x 32): a 12-row head, a 10-row torso and 10 rows of legs.

const BIG_HEAD = rows([
  '......KKKKK.....',
  '....KKhhhYYKK...',
  '...KhhYYYYYYYK..',
  '..KhYYYYYYYYYYK.',
  '..KYYYYYYYYYYYK.',
  '.KyyyyyyyyyyyyyK',
  '.KKHHSSSSSSKSKK.',
  '..KHHSSSSSSKSSK.',
  '..KHSSSSSSSSSSSK',
  '..KHsSSSSSSSSSK.',
  '...KssSSSSSSSK..',
  '....KKsssssKK...',
])

const BIG_TORSO: Record<string, string[]> = {
  stand: [
    '...KWWWOWWOWK...',
    '..KWWWWOWWOWWK..',
    '..KWWWWOOOOWWK..',
    '.KWWKWOOOOOOKWK.',
    '.KWWKOOOOOOOKWK.',
    '.KSSKOOOOOOOKSK.',
    '.KSSKOOOOOOOKSK.',
    '..KKKOOOOOOOKK..',
    '....KOOOooOOK...',
    '....KOOOOOOOK...',
  ],
  swing: [
    '...KWWWOWWOWK...',
    '..KWWWWOWWOWWK..',
    '..KWWWWOOOOWWKK.',
    '..KWWKOOOOOOKWWK',
    '..KKKOOOOOOOKWSK',
    '....KOOOOOOOKSSK',
    '...KSKOOOOOOOKK.',
    '...KSKOOOOOOK...',
    '....KKOOooOOK...',
    '....KOOOOOOOK...',
  ],
  up: [
    '...KWWWOWWOWKKK.',
    '..KWWWWOWWOWKSSK',
    '..KWWWWOOOOWKSSK',
    '.KWWKWOOOOOOKKK.',
    '.KWWKOOOOOOOK...',
    '.KSSKOOOOOOOK...',
    '.KSSKOOOOOOOK...',
    '..KKKOOOOOOOK...',
    '....KOOOooOOK...',
    '....KOOOOOOOK...',
  ],
  wall: [
    '...KWWWOWWOWKSSK',
    '..KWWWWOWWOWKSSK',
    '..KWWWWOOOOWWKK.',
    '.KWWKWOOOOOOK...',
    '.KWWKOOOOOOOK...',
    '.KSSKOOOOOOOK...',
    '.KSSKOOOOOOOK...',
    '..KKKOOOOOOOK...',
    '....KOOOooOOK...',
    '....KOOOOOOOK...',
  ],
}

const BIG_LEGS: Record<string, string[]> = {
  stand: [
    '....KOOOKOOOK...',
    '....KOOOKOOOK...',
    '....KOOOKOOOK...',
    '....KoOOKOOoK...',
    '....KOOOKOOOK...',
    '....KOOOKOOOK...',
    '...KBBBBKBBBBK..',
    '..KBbBBBKBbBBBK.',
    '..KBBBBBKBBBBBK.',
    '..KKKKKKKKKKKKK.',
  ],
  stride: [
    '....KOOOOOOOK...',
    '...KOOOKKOOOK...',
    '...KOOOK.KOOOK..',
    '..KoOOK..KOOOK..',
    '..KOOOK...KOOOK.',
    '..KOOOK...KOOOK.',
    '.KBBBBK..KBBBBK.',
    'KBbBBBK..KBbBBBK',
    'KBBBBBK..KBBBBBK',
    'KKKKKKK..KKKKKKK',
  ],
  stride2: [
    '....KOOOOOOOK...',
    '....KOOOKOOOK...',
    '...KOOOKKOOOK...',
    '...KoOOK.KOOoK..',
    '...KOOOK.KOOOK..',
    '..KBBBBK.KOOOK..',
    '.KBbBBBK.KBBBBK.',
    '.KBBBBBKKBbBBBK.',
    '.KKKKKKKKBBBBBK.',
    '........KKKKKKK.',
  ],
  jump: [
    '....KOOOOOOOK...',
    '...KOOOOKOOOOK..',
    '..KOOOK..KOOOK..',
    '..KOOK....KOOOK.',
    '.KBBBK....KOOOK.',
    '.KBbBBK...KBBBK.',
    '.KBBBBK..KBbBBK.',
    '..KKKK...KBBBBK.',
    '..........KKKK..',
    '................',
  ],
  kick: [
    '....KOOOOOOOK...',
    '....KOOOKOOOOK..',
    '....KOOOKKOOOOK.',
    '....KoOOK.KOOBBK',
    '....KOOOK..KBbBK',
    '....KOOOK..KBBBK',
    '...KBBBBK...KKK.',
    '..KBbBBBK.......',
    '..KBBBBBK.......',
    '..KKKKKKK.......',
  ],
}

const BIG_CROUCH = rows([
  '......KKKKK.....',
  '....KKhhhYYKK...',
  '...KhhYYYYYYYK..',
  '..KyyyyyyyyyyyK.',
  '..KKHHSSSSSKSK..',
  '...KHSSSSSSKSSK.',
  '...KHsSSSSSSSK..',
  '..KKKKssssssKK..',
  '.KWWWWOWWOWWWK..',
  '.KSKWWOOOOWWKSK.',
  '.KSKOOOOOOOOKSK.',
  '..KKOOOOooOOKK..',
  '..KOOOOOOOOOOK..',
  '.KBBBBKKKKBBBBK.',
  '.KBbBBBKKBbBBBK.',
  '.KKKKKKKKKKKKKK.',
])

export type PlayerPose =
  | 'stand'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'jump'
  | 'skid'
  | 'wall'
  | 'kick'
  | 'throw'
  | 'crouch'
  | 'dead'

export const PLAYER_POSES: PlayerPose[] = ['stand', 'walk1', 'walk2', 'walk3', 'jump', 'skid', 'wall', 'kick', 'throw', 'crouch', 'dead']

function smallPose(pose: PlayerPose): Bitmap {
  switch (pose) {
    case 'dead':
      return SMALL_DEAD
    case 'walk1':
      return stack(SMALL_HEAD, rows(SMALL_BODY.stride))
    case 'walk3':
      return stack(SMALL_HEAD, rows(SMALL_BODY.stride2))
    case 'jump':
      return stack(SMALL_HEAD, rows(SMALL_BODY.jump))
    case 'skid':
      return stack(SMALL_HEAD, rows(SMALL_BODY.skid))
    case 'wall':
      return stack(SMALL_HEAD, rows(SMALL_BODY.wall))
    case 'kick':
    case 'throw':
      return stack(SMALL_HEAD, rows(SMALL_BODY.kick))
    default:
      return stack(SMALL_HEAD, rows(SMALL_BODY.stand))
  }
}

function bigPose(pose: PlayerPose): Bitmap {
  const t = (k: string) => rows(BIG_TORSO[k])
  const l = (k: string) => rows(BIG_LEGS[k])
  switch (pose) {
    case 'crouch': {
      const out = new Bitmap(16, 32)
      out.blit(BIG_CROUCH, 0, 16)
      return out
    }
    case 'dead':
      return stack(new Bitmap(16, 16), SMALL_DEAD)
    case 'walk1':
      return stack(BIG_HEAD, t('swing'), l('stride'))
    case 'walk3':
      return stack(BIG_HEAD, t('stand'), l('stride2'))
    case 'jump':
      return stack(BIG_HEAD, t('up'), l('jump'))
    case 'skid':
      return stack(BIG_HEAD, t('swing'), l('stride2'))
    case 'wall':
      return stack(BIG_HEAD, t('wall'), l('stand'))
    case 'kick':
      return stack(BIG_HEAD, t('swing'), l('kick'))
    case 'throw':
      return stack(BIG_HEAD, t('swing'), l('stand'))
    default:
      return stack(BIG_HEAD, t('stand'), l('stand'))
  }
}

/** Colour a base sprite for a player number (1-8) and power (0 small, 1 big, 2 spark). */
export function colorPlayer(base: Bitmap, playerNum: number, spark: boolean): Bitmap {
  const [color, shade] = PLAYER_COLORS[(playerNum - 1) % PLAYER_COLORS.length]
  if (!spark) return base.recolored({ [OVERALL]: color, [OVERALL_SHADE]: shade })
  return base.recolored({ [OVERALL]: PAL.shirt, [OVERALL_SHADE]: PAL.shirtShade, [PAL.shirt]: color, [PAL.shirtShade]: shade })
}

export function playerSprite(size: 'small' | 'big', pose: PlayerPose): Bitmap {
  return size === 'small' ? smallPose(pose) : bigPose(pose)
}
