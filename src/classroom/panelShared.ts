import type { FormEvent } from 'react'

/** Real account rules from docs/classroom/API.md; the server enforces the same limits. */
export const USERNAME_PATTERN = '[A-Za-z0-9][A-Za-z0-9_\\-]*'
export const USERNAME_RULE = '3–24 letters or numbers; _ and - are OK. Start with a letter or number.'
export const PASSWORD_RULE = 'At least 8 characters.'

export function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), value => alphabet[value % alphabet.length]).join('')
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

export function readForm(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
}

/** Client-side echo of the server rules so a student sees a sentence, not a browser bubble. */
export function validateUsername(username: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/.test(username) ? '' : `Usernames are ${USERNAME_RULE.charAt(0).toLowerCase()}${USERNAME_RULE.slice(1)}`
}
export function validatePassword(password: string) {
  return password.length >= 8 && password.length <= 128 ? '' : 'Passwords need 8 to 128 characters.'
}

export const formatSavedDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
