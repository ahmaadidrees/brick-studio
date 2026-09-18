import { studentPasswordError } from '@brick-studio/core'

/**
 * Live rule checklists for the /join page. The sentences are the same rules the
 * server enforces (see panelShared.validateUsername / validatePassword); this
 * module only splits them into one line per rule so a student can watch each one
 * turn green while they type.
 */

/** `pending` = nothing typed yet (grey), `ok` = green, `bad` = red. */
export type RuleState = 'pending' | 'ok' | 'bad'
export type RuleResult = { id: string; label: string; state: RuleState }

const state = (value: string, pass: boolean, known = true): RuleState =>
  value === '' || !known ? 'pending' : pass ? 'ok' : 'bad'

/** Username rules, in the order they are read out: length, characters, first character, spaces. */
export function usernameRules(username: string): RuleResult[] {
  const value = username
  return [
    { id: 'length', label: '3 to 24 characters', state: state(value, value.length >= 3 && value.length <= 24) },
    { id: 'characters', label: 'Letters, numbers, _ or - only', state: state(value, /^[A-Za-z0-9_-]+$/.test(value)) },
    { id: 'start', label: 'Starts with a letter or number', state: state(value, /^[A-Za-z0-9]/.test(value)) },
    { id: 'spaces', label: 'No spaces', state: state(value, !/\s/.test(value)) },
  ]
}

/**
 * Password rules. "Not an easy-to-guess password" defers to the shared
 * `studentPasswordError` so the common-password list lives in one place; it
 * stays grey until the length and username rules pass, because a short password
 * is already failing a rule above it.
 */
export function passwordRules(password: string, username: string): RuleResult[] {
  const longEnough = password.length >= 6 && password.length <= 128
  const differs = !username.trim() || password.trim().toLowerCase() !== username.trim().toLowerCase()
  const guessable = longEnough && differs ? studentPasswordError(password, username) === '' : false
  return [
    { id: 'length', label: 'At least 6 characters', state: state(password, longEnough) },
    { id: 'username', label: 'Different from your username', state: state(password, differs) },
    { id: 'guessable', label: 'Not an easy-to-guess password', state: state(password, guessable, longEnough && differs) },
  ]
}

export const allGreen = (rules: RuleResult[]) => rules.every(rule => rule.state === 'ok')
