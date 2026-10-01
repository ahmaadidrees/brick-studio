import { describe, expect, it } from 'vitest'
import { browserKeyToScratchKey } from './keys'

describe('keys mapping', () => {
  it('maps arrow keys and special keys', () => {
    expect(browserKeyToScratchKey({ key: 'ArrowLeft' })).toBe('left arrow')
    expect(browserKeyToScratchKey({ key: 'ArrowRight' })).toBe('right arrow')
    expect(browserKeyToScratchKey({ key: 'ArrowUp' })).toBe('up arrow')
    expect(browserKeyToScratchKey({ key: 'ArrowDown' })).toBe('down arrow')
    expect(browserKeyToScratchKey({ key: ' ' })).toBe('space')
    expect(browserKeyToScratchKey({ key: 'Spacebar' })).toBe('space')
    expect(browserKeyToScratchKey({ key: 'Enter' })).toBe('enter')
  })

  it('maps letters and digits case-insensitively', () => {
    expect(browserKeyToScratchKey({ key: 'a' })).toBe('a')
    expect(browserKeyToScratchKey({ key: 'A' })).toBe('a')
    expect(browserKeyToScratchKey({ key: 'z' })).toBe('z')
    expect(browserKeyToScratchKey({ key: 'Z' })).toBe('z')
    expect(browserKeyToScratchKey({ key: '0' })).toBe('0')
    expect(browserKeyToScratchKey({ key: '9' })).toBe('9')
  })

  it('returns null for unhandled keys', () => {
    expect(browserKeyToScratchKey({ key: 'Shift' })).toBeNull()
    expect(browserKeyToScratchKey({ key: 'Control' })).toBeNull()
    expect(browserKeyToScratchKey({ key: 'Alt' })).toBeNull()
  })
})
