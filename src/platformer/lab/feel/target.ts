/**
 * THE swap point for the integrator. Until the Hero lane merges this returns null and FEEL.md compares the old engine
 * with the starter's Jumper stand-in. To plug the Hero in, replace the body with:
 *
 *   import { createHeroTestDesign } from '../studio/hero/heroLevel'
 *   export function heroTarget(): ComparisonTarget | null {
 *     return { name: 'Hero (open blocks)', options: { design: createHeroTestDesign() } }
 *   }
 *
 * `options.heroBrickName` defaults to 'Hero'; pass `heroCopyId` instead if the test level names the copy. If the Hero's
 * level is not one wide floor, give `designFor` the ledge/wall levels (see CodeLabHeroOptions). Then run
 * `npx vitest run src/platformer/lab/feel`: every metric must pass (the "Hero acceptance" tests), and FEEL.md is rewritten
 * with Hero numbers. Delete nothing else.
 */
import { createHeroTestDesign, HERO_STAND_Y, HERO_START_X } from '../studio/hero/heroLevel'
import type { CodeLabHeroOptions } from './adapter'
import { DROP_PX } from './metrics'

export interface ComparisonTarget {
  name: string
  options: CodeLabHeroOptions
}

export function heroTarget(): ComparisonTarget | null {
  return {
    name: 'Hero (open blocks)',
    options: {
      design: createHeroTestDesign(),
      designFor: (scenario) => {
        // Like the old engine's wall level: a tall wall just right of the Hero, who starts DROP_PX up.
        if (scenario === 'wall') return createHeroTestDesign({ heroY: HERO_STAND_Y + DROP_PX, wall: { x: HERO_START_X + 16, height: 300 } })
        // The ledge must be high: Code Lab's level bottom is a floor (DEFAULT_PHYSICS walls.bottom), so a ledge only 16
        // steps up lands the Hero on the level bottom two ticks after walking off, and every late press is a real jump.
        if (scenario === 'ledge') {
          const d = createHeroTestDesign({ floorEnd: 128 })
          return { ...d, copies: d.copies.map((c) => ({ ...c, y: c.y + DROP_PX })) }
        }
        return null
      },
    },
  }
}
