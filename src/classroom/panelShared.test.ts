import { describe, expect, it } from 'vitest'
import { studentPasswordError } from '@brick-studio/core'
import { TEMPORARY_PASSWORD_WORDS, generateTemporaryPassword } from './panelShared'

/*
 * A frozen copy of what the Worker checks when a teacher sets a temporary password
 * (multiplayer/worker/src/classroom/index.ts `newStudentPassword` → `studentPasswordError`
 * in packages/brick-core/src/studentPassword.ts, as of 2026-10-28). The live shared rule is
 * checked as well, so loosening the copy cannot hide a server change, and tightening the
 * server rule fails this test.
 */
const WORKER_COMMON = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '654321', 'password', 'password1', 'password123', 'qwerty', 'qwerty123', 'abc123', 'abcdef', 'letmein', 'welcome', 'iloveyou', '111111', '000000', 'monkey', 'dragon', 'football', '123abc'])
function workerRejects(value: string, username: string): boolean {
  if (value.length < 6 || value.length > 128) return true
  const key = value.trim().toLowerCase()
  return !key || WORKER_COMMON.has(key) || /^(.)\1+$/.test(key) || key === username.trim().toLowerCase()
}

describe('temporary passwords a teacher can read out', () => {
  it('always passes the server’s password rules, including “too easy to guess”', () => {
    const usernames = ['ava_builds', 'ben_k', 'sky_builder', 'kite234', 'Tiger777']
    for (let i = 0; i < 5000; i++) {
      const username = usernames[i % usernames.length]
      const password = generateTemporaryPassword(username)
      expect(studentPasswordError(password, username), password).toBe('')
      expect(workerRejects(password, username), password).toBe(false)
    }
  })

  it('is one lowercase word and three digits, with no 0 or 1 to mix up with o and l', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const password = generateTemporaryPassword()
      expect(password).toMatch(/^[a-z]{4,6}[2-9]{3}$/)
      expect(TEMPORARY_PASSWORD_WORDS).toContain(password.replace(/\d+$/, ''))
      seen.add(password)
    }
    // Varied enough that a classmate cannot guess one before it is changed.
    expect(seen.size).toBeGreaterThan(1900)
  })

  it('never hands out a password equal to the student’s username', () => {
    // A random source that first lands on the username exactly, then on something else.
    const word = TEMPORARY_PASSWORD_WORDS.indexOf('kite')
    const picks = [word, 0, 1, 2, word + 1, 3, 4, 5]
    const random = (bound: number) => { const value = picks.shift()!; expect(value).toBeLessThan(bound); return value }
    expect(generateTemporaryPassword('KITE234', random)).toBe(`${TEMPORARY_PASSWORD_WORDS[word + 1]}567`)
  })

  it('uses only short, plain words', () => {
    expect(TEMPORARY_PASSWORD_WORDS.length).toBeGreaterThanOrEqual(80)
    expect(new Set(TEMPORARY_PASSWORD_WORDS).size).toBe(TEMPORARY_PASSWORD_WORDS.length)
    for (const word of TEMPORARY_PASSWORD_WORDS) {
      expect(word).toMatch(/^[a-z]{4,6}$/)
      expect(WORKER_COMMON.has(word)).toBe(false)
    }
  })
})
