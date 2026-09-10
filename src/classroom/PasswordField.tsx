import { useId, useState, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  label: string
  hint?: string
}

/** Keeps the submitted field unchanged when a student checks what they typed. */
export function PasswordField({ label, hint, ...inputProps }: Props) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className="classroom-field">
    <label htmlFor={id}>{label}</label>
    <div className="classroom-password">
      <input {...inputProps} id={id} type={visible ? 'text' : 'password'} aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
    </div>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>
}
