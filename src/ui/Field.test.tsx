import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, TextField } from './Field'

afterEach(cleanup)

describe('TextField', () => {
  it('labels the input with an always-visible label and wires the hint', () => {
    render(<TextField label="Class sign-in code" hint="Your teacher shares this code." />)
    const input = screen.getByLabelText('Class sign-in code')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAccessibleDescription('Your teacher shares this code.')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('Class sign-in code').tagName).toBe('LABEL')
  })

  it('marks errors, keeps the hint, and announces the message', () => {
    render(<TextField label="Username" hint="Letters, numbers, _ or -" error="Usernames cannot contain spaces." />)
    const input = screen.getByLabelText('Username')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Usernames cannot contain spaces. Letters, numbers, _ or -')
    expect(screen.getByRole('alert')).toHaveTextContent('Usernames cannot contain spaces.')
  })

  it('honours a fixed id and required', () => {
    render(<TextField id="code" label="Enrollment code" required />)
    const input = screen.getByLabelText(/Enrollment code/)
    expect(input).toHaveAttribute('id', 'code')
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('aria-required', 'true')
  })
})

describe('Field render prop', () => {
  it('supports the password pattern: input plus show/hide button share the wiring', () => {
    render(
      <Field label="Password" hint="At least 8 characters.">
        {(control) => (
          <>
            <input {...control} type="password" />
            <button type="button" aria-controls={control.id} aria-pressed={false} aria-label="Show password">Show</button>
          </>
        )}
      </Field>,
    )
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAccessibleDescription('At least 8 characters.')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-controls', input.id)
  })
})
