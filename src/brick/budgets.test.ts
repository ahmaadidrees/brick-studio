import { describe, expect, it } from 'vitest'
import { BRICK_BUDGETS, getBrickBudgetProfile, type BudgetEnvironment } from './budgets'

const desktop: BudgetEnvironment = {
  width: 1366,
  height: 768,
  coarsePointer: false,
  maxTouchPoints: 0,
  userAgent: 'Mozilla/5.0 Chrome/140.0 Safari/537.36',
  platform: 'Linux x86_64',
}

describe('brick device budgets', () => {
  it('assigns desktop and Chromebook builds 250 bricks', () => {
    expect(BRICK_BUDGETS[getBrickBudgetProfile(desktop)]).toBe(250)
    expect(BRICK_BUDGETS[getBrickBudgetProfile({
      ...desktop,
      coarsePointer: true,
      maxTouchPoints: 10,
      userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 16093.68.0) Chrome/140.0',
    })]).toBe(250)
  })

  it('assigns iPad portrait and landscape builds 150 bricks', () => {
    const iPad = {
      ...desktop,
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'MacIntel',
    }
    expect(BRICK_BUDGETS[getBrickBudgetProfile({ ...iPad, width: 820, height: 1180 })]).toBe(150)
    expect(BRICK_BUDGETS[getBrickBudgetProfile({ ...iPad, width: 1180, height: 820 })]).toBe(150)
  })

  it('keeps a rotated phone at the 75-brick budget', () => {
    const phone = {
      ...desktop,
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148',
      platform: 'iPhone',
    }
    expect(BRICK_BUDGETS[getBrickBudgetProfile({ ...phone, width: 390, height: 844 })]).toBe(75)
    expect(BRICK_BUDGETS[getBrickBudgetProfile({ ...phone, width: 844, height: 390 })]).toBe(75)
  })
})
