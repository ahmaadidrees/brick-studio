import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import { CharacterSheet } from './CharacterSheet'

afterEach(cleanup)

function Example() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<CharacterId>('builder')
  return <>
    <button onClick={() => setOpen(true)}>Open character</button>
    <CharacterSheet open={open} selected={selected} onSelect={setSelected} onClose={() => setOpen(false)} />
  </>
}

it('shows all four characters, supports arrow keys, and returns focus after Escape', () => {
  render(<Example />)
  const opener = screen.getByRole('button', { name: 'Open character' })
  opener.focus()
  fireEvent.click(opener)
  expect(screen.getByRole('dialog', { name: 'Character' })).toBeInTheDocument()
  const cards = screen.getAllByRole('radio')
  expect(cards).toHaveLength(4)
  const builder = screen.getByRole('radio', { name: /Builder/ })
  expect(builder).toHaveAttribute('aria-checked', 'true')
  expect(builder).toHaveFocus()
  fireEvent.keyDown(builder, { key: 'ArrowRight' })
  expect(screen.getByRole('radio', { name: /Bolt Bot/ })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('radio', { name: /Bolt Bot/ })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Character' })).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})
