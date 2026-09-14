import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

afterEach(cleanup)

const OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'guest', label: 'Guest', disabled: true },
] as const

type Value = (typeof OPTIONS)[number]['value']

function Harness({ onChange }: { onChange?: (value: Value) => void }) {
  const [value, setValue] = useState<Value>('student')
  return <SegmentedControl<Value> label="I am a" options={OPTIONS} value={value} onChange={(next) => { setValue(next); onChange?.(next) }} />
}

describe('SegmentedControl', () => {
  it('exposes a labelled radiogroup with one checked radio', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'I am a' })
    const radios = screen.getAllByRole('radio')
    expect(group).toContainElement(radios[0])
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Student' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Guest' })).toBeDisabled()
  })

  it('has a single tab stop on the selected option', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Student' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Teacher' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves and selects with arrow keys, skipping disabled options and wrapping', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const student = screen.getByRole('radio', { name: 'Student' })
    student.focus()
    fireEvent.keyDown(student, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('teacher')
    const teacher = screen.getByRole('radio', { name: 'Teacher' })
    expect(teacher).toHaveFocus()
    expect(teacher).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(teacher, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('student') // guest is disabled, wrap to the start
    expect(student).toHaveFocus()
    fireEvent.keyDown(student, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('teacher')
  })

  it('selects on click', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Teacher' }))
    expect(onChange).toHaveBeenCalledWith('teacher')
    expect(screen.getByRole('radio', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'true')
  })

  it('passes aria-describedby through to the radiogroup', () => {
    render(
      <>
        <SegmentedControl label="Plate size" aria-describedby="plate-hint" value="64" onChange={() => {}} options={[{ value: '64', label: '64' }, { value: '96', label: '96' }]} />
        <p id="plate-hint">Your creation stays centered.</p>
      </>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Plate size' })).toHaveAccessibleDescription('Your creation stays centered.')
  })
})
