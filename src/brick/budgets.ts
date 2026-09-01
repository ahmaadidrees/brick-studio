import type { BrickBudgetProfile } from './types'
import { BRICK_STUDIO_MAX_BRICKS } from './brickDocument'

export const BRICK_BUDGETS: Record<BrickBudgetProfile, number> = {
  desktop: BRICK_STUDIO_MAX_BRICKS,
  tablet: BRICK_STUDIO_MAX_BRICKS,
  phone: BRICK_STUDIO_MAX_BRICKS,
}

export type BudgetEnvironment = {
  width: number
  height: number
  coarsePointer: boolean
  maxTouchPoints: number
  userAgent: string
  platform: string
}

/**
 * Classifies device shape without changing the authoritative world capacity.
 * The profile remains useful for presentation and adaptive rendering quality;
 * every participant can still load and edit the same complete document.
 */
export function getBrickBudgetProfile(environment: BudgetEnvironment): BrickBudgetProfile {
  if (/CrOS/i.test(environment.userAgent)) return 'desktop'

  const isIPad = /iPad/i.test(environment.userAgent)
    || (environment.platform === 'MacIntel' && environment.maxTouchPoints > 1)
  if (isIPad) return 'tablet'

  const isPhone = /iPhone|iPod|Windows Phone|Android.+Mobile/i.test(environment.userAgent)
  if (isPhone) return 'phone'

  const touchDevice = environment.coarsePointer || environment.maxTouchPoints > 0
  if (!touchDevice) return 'desktop'
  return Math.min(environment.width, environment.height) < 600 ? 'phone' : 'tablet'
}

export function readBrickBudgetEnvironment(): BudgetEnvironment {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  }
}
