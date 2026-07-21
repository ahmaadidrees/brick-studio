import type { BrickBudgetProfile } from './types'

export const BRICK_BUDGETS: Record<BrickBudgetProfile, number> = {
  desktop: 250,
  tablet: 150,
  phone: 75,
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
 * Desktop-class devices keep the desktop budget even when their browser window
 * is narrow. Touch devices use their shortest viewport edge so a rotated phone
 * does not accidentally receive the tablet budget.
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
