import { studentPasswordError, STUDENT_PASSWORD_RULE } from '@brick-studio/core'
import type { FormEvent } from 'react'

/** Real account rules from docs/classroom/API.md; the server enforces the same limits. */
export const USERNAME_PATTERN = '[A-Za-z0-9][A-Za-z0-9_\\-]*'
export const USERNAME_RULE = '3–24 letters or numbers; _ and - are OK. Start with a letter or number.'
export const PASSWORD_RULE = STUDENT_PASSWORD_RULE

/** Plain 4–6 letter words a teacher can read out and an 8-year-old can spell. */
export const TEMPORARY_PASSWORD_WORDS: readonly string[] = [
  'acorn', 'apple', 'badge', 'banjo', 'beach', 'berry', 'bison', 'block', 'boat', 'brick',
  'cabin', 'cactus', 'camel', 'candle', 'canoe', 'castle', 'cello', 'cherry', 'cloud', 'clover',
  'comet', 'coral', 'crane', 'crown', 'daisy', 'donut', 'drum', 'eagle', 'ember', 'falcon',
  'fern', 'flute', 'forest', 'fossil', 'frog', 'gecko', 'globe', 'goose', 'grape', 'guitar',
  'harbor', 'hippo', 'honey', 'igloo', 'island', 'jelly', 'kayak', 'kettle', 'kite', 'koala',
  'ladder', 'lemon', 'lizard', 'llama', 'mango', 'maple', 'marble', 'meadow', 'melon', 'mitten',
  'moose', 'muffin', 'noodle', 'ocean', 'olive', 'orbit', 'otter', 'panda', 'parrot', 'peach',
  'pebble', 'pepper', 'pickle', 'pillow', 'planet', 'pony', 'puffin', 'puzzle', 'rabbit', 'radish',
  'raven', 'robin', 'rocket', 'saddle', 'shell', 'spoon', 'squid', 'sunset', 'tiger', 'toast',
  'tomato', 'tulip', 'turtle', 'violin', 'wagon', 'walrus', 'waffle', 'whale', 'willow', 'zebra',
]
/** No 0 or 1, which read like o and l on a board or a sticky note. */
const TEMPORARY_PASSWORD_DIGITS = '23456789'

/** A uniform whole number below `bound` from the browser's crypto source. */
function randomBelow(bound: number) {
  const limit = Math.floor(0x1_0000_0000 / bound) * bound
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value)
  while (value[0] >= limit)
  return value[0] % bound
}

/**
 * A temporary password a teacher can read out: one plain word and three digits ("otter472"),
 * 100 × 512 choices. It is only good until the student signs in and picks their own, and the
 * server limits wrong guesses. Every result passes the server's new-password rules
 * (`studentPasswordError`: length, not easy to guess, not the username), checked here too.
 */
export function generateTemporaryPassword(username = '', random: (bound: number) => number = randomBelow) {
  for (;;) {
    const word = TEMPORARY_PASSWORD_WORDS[random(TEMPORARY_PASSWORD_WORDS.length)]
    let digits = ''
    for (let i = 0; i < 3; i++) digits += TEMPORARY_PASSWORD_DIGITS[random(TEMPORARY_PASSWORD_DIGITS.length)]
    const candidate = `${word}${digits}`
    if (!studentPasswordError(candidate, username)) return candidate
  }
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
export function validatePassword(password: string, username?: string) {
  return studentPasswordError(password, username)
}

export const formatSavedDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
