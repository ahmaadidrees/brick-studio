import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Menu, MenuItem, MenuSeparator } from './Menu'

afterEach(cleanup)

function Example({ onSelect = () => undefined, defaultOpen = false }: { onSelect?: (label: string) => void; defaultOpen?: boolean }) {
  return (
    <div>
      <Menu label="This build" defaultOpen={defaultOpen} trigger={({ ref, ...props }) => <Button ref={ref} {...props}>Open</Button>}>
        <MenuItem label="Rename" onSelect={() => onSelect('Rename')} />
        <MenuItem label="Download" onSelect={() => onSelect('Download')} />
        <MenuItem label="Import" disabled onSelect={() => onSelect('Import')} />
        <MenuSeparator />
        <MenuItem label="Worlds" href="/worlds" />
      </Menu>
      <button type="button">Outside</button>
    </div>
  )
}

describe('Menu', () => {
  it('opens from the trigger, focuses the first item and closes on Escape with focus returned', () => {
    render(<Example />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'This build' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }))

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('moves with arrow keys, skipping disabled items, and wraps; Home/End jump', () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const menu = screen.getByRole('menu')
    const rename = screen.getByRole('menuitem', { name: 'Rename' })
    const download = screen.getByRole('menuitem', { name: 'Download' })
    const worlds = screen.getByRole('menuitem', { name: 'Worlds' })
    expect(screen.getByRole('menuitem', { name: 'Import' })).toBeDisabled()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(download)
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(worlds)
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rename)
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(worlds)
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(rename)
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(worlds)
  })

  it('ArrowUp on the trigger opens on the last item', () => {
    render(<Example />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Worlds' }))
  })

  it('selecting an item returns focus to the trigger, runs the action and closes', () => {
    const onSelect = vi.fn()
    render(<Example onSelect={onSelect} />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download' }))
    expect(onSelect).toHaveBeenCalledWith('Download')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on an outside pointer and renders links as menu items', () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('menuitem', { name: 'Worlds' })).toHaveAttribute('href', '/worlds')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('supports defaultOpen for previews', () => {
    render(<Example defaultOpen />)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
