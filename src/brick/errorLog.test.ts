import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BRICK_STUDIO_ERROR_LOG_SIZE,
  clearBrickStudioErrorLog,
  describeBrickStudioError,
  getRecentBrickStudioErrors,
  installBrickStudioErrorListeners,
  recordBrickStudioError,
} from './errorLog'

afterEach(() => clearBrickStudioErrorLog())

describe('brick studio error log', () => {
  it('keeps only the most recent entries, oldest first', () => {
    for (let index = 0; index < BRICK_STUDIO_ERROR_LOG_SIZE + 3; index += 1) {
      recordBrickStudioError('boundary', new Error(`error ${index}`))
    }
    const recent = getRecentBrickStudioErrors()
    expect(recent).toHaveLength(BRICK_STUDIO_ERROR_LOG_SIZE)
    expect(recent[0].message).toBe('error 3')
    expect(recent[recent.length - 1].message).toBe(`error ${BRICK_STUDIO_ERROR_LOG_SIZE + 2}`)
  })

  it('describes non-Error values without throwing', () => {
    expect(describeBrickStudioError(new Error('boom'))).toBe('boom')
    expect(describeBrickStudioError('plain text')).toBe('plain text')
    expect(describeBrickStudioError({ message: 'object message' })).toBe('object message')
    expect(describeBrickStudioError(null, 'fallback')).toBe('fallback')
    expect(describeBrickStudioError(undefined)).toBe('Something went wrong.')
  })

  it('logs window errors and unhandled rejections with the studio prefix and records them', () => {
    const logger = { error: vi.fn() }
    const uninstall = installBrickStudioErrorListeners(window, logger)
    const failure = new Error('Could not load /brick-hero.glb')
    window.dispatchEvent(new ErrorEvent('error', { error: failure, message: failure.message }))
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown }
    rejection.reason = 'socket closed'
    window.dispatchEvent(rejection)

    expect(logger.error).toHaveBeenNthCalledWith(1, '[brick-studio] Uncaught error:', failure)
    expect(logger.error).toHaveBeenNthCalledWith(2, '[brick-studio] Unhandled promise rejection:', 'socket closed')
    expect(getRecentBrickStudioErrors().map((entry) => [entry.source, entry.message])).toEqual([
      ['window', 'Could not load /brick-hero.glb'],
      ['unhandledrejection', 'socket closed'],
    ])

    uninstall()
    // No `error` payload: vitest would otherwise treat a real one as an unhandled test error.
    window.dispatchEvent(new ErrorEvent('error', { message: 'after uninstall' }))
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(getRecentBrickStudioErrors()).toHaveLength(2)
  })
})
