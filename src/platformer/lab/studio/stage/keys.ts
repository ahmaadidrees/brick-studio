/**
 * Keyboard mapping from browser KeyboardEvent to Scratch key names.
 * Keys recognized by Scratch:
 * 'space', 'left arrow', 'right arrow', 'up arrow', 'down arrow', 'enter',
 * 'a'..'z', '0'..'9'.
 */
export function browserKeyToScratchKey(event: { key: string; code?: string }): string | null {
  const k = event.key
  if (k === 'ArrowLeft') return 'left arrow'
  if (k === 'ArrowRight') return 'right arrow'
  if (k === 'ArrowUp') return 'up arrow'
  if (k === 'ArrowDown') return 'down arrow'
  if (k === ' ' || k === 'Spacebar') return 'space'
  if (k === 'Enter') return 'enter'

  if (k.length === 1) {
    const lower = k.toLowerCase()
    if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
      return lower
    }
  }

  // Fallback for code if key is unidentified
  if (event.code) {
    if (event.code.startsWith('Key') && event.code.length === 4) {
      return event.code.slice(3).toLowerCase()
    }
    if (event.code.startsWith('Digit') && event.code.length === 6) {
      return event.code.slice(5)
    }
    if (event.code === 'Space') return 'space'
    if (event.code === 'Enter') return 'enter'
    if (event.code === 'ArrowLeft') return 'left arrow'
    if (event.code === 'ArrowRight') return 'right arrow'
    if (event.code === 'ArrowUp') return 'up arrow'
    if (event.code === 'ArrowDown') return 'down arrow'
  }

  return null
}
