import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Field } from '../ui'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'className'> & {
  label: string
  hint?: string
  error?: string
  id?: string
}

/** Password input with an accessible Show/Hide toggle. Revealing never changes the submitted value. */
export function PasswordField({ label, hint, error, id, ...inputProps }: Props) {
  const [visible, setVisible] = useState(false)
  return <Field label={label} hint={hint} error={error} id={id} className="classroom-password-field">
    {control => <span className="classroom-password">
      <input {...inputProps} {...control} className="ui-input classroom-password-input" type={visible ? 'text' : 'password'} />
      <Button
        variant="quiet"
        size="sm"
        className="classroom-password-toggle"
        icon={visible ? <EyeOff size={16} /> : <Eye size={16} />}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-controls={control.id}
        aria-pressed={visible}
        onClick={() => setVisible(value => !value)}
      >{visible ? 'Hide' : 'Show'}</Button>
    </span>}
  </Field>
}
