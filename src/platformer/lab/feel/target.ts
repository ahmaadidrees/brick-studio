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
import type { CodeLabHeroOptions } from './adapter'

export interface ComparisonTarget {
  name: string
  options: CodeLabHeroOptions
}

export function heroTarget(): ComparisonTarget | null {
  return null
}
