/** Student creation/reset policy. Never apply new-password rules to existing sign-ins. */
export const STUDENT_PASSWORD_MIN = 6
export const STUDENT_PASSWORD_RULE = 'At least 6 characters. No special characters needed.'
const COMMON = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '654321', 'password', 'password1', 'password123', 'qwerty', 'qwerty123', 'abc123', 'abcdef', 'letmein', 'welcome', 'iloveyou', '111111', '000000', 'monkey', 'dragon', 'football', '123abc'])
export function studentPasswordError(value: unknown, username?: string): string {
  if (typeof value !== 'string' || value.length < STUDENT_PASSWORD_MIN || value.length > 128) return 'Passwords need 6 to 128 characters.'
  const key = value.trim().toLowerCase()
  if (!key || COMMON.has(key) || /^(.)\1+$/.test(key) || (username && key === username.trim().toLowerCase())) return 'Choose a less easy-to-guess password, different from your username.'
  return ''
}
