import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

afterEach(cleanup)

describe('Select', () => {
  it('labels a native select, wires the hint and keeps the accessible name plain when required', () => {
    const onChange = vi.fn()
    render(
      <Select label="Class" hint="Students see this name." required defaultValue="b" onChange={onChange}>
        <option value="a">Period 1</option>
        <option value="b">Period 2</option>
      </Select>,
    )
    const select = screen.getByLabelText('Class')
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveClass('ui-input', 'ui-select')
    expect(select).toHaveValue('b')
    expect(select).toBeRequired()
    expect(select).toHaveAccessibleDescription('Students see this name.')
    expect(select).toHaveAccessibleName('Class')
    fireEvent.change(select, { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(select).toHaveValue('a')
    expect(document.querySelector('.ui-select-icon')).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks errors and honours disabled', () => {
    render(
      <Select label="Group" error="Pick a group first." disabled>
        <option value="">Choose…</option>
      </Select>,
    )
    const select = screen.getByLabelText('Group')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a group first.')
  })
})
