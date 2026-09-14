import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import './ui.css'

/** Attributes a Field hands to the control it labels. Spread them onto the input. */
export type FieldControlProps = {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
}

export type FieldProps = {
  /** Always visible; never a placeholder. */
  label: string
  /** Helper text under the control (format rules, where a value is shown). */
  hint?: string
  /** Validation message; announced, shown in the danger color with an icon. */
  error?: string
  required?: boolean
  /** Fixed id for the control; a stable id is generated otherwise. */
  id?: string
  /** Optional text beside the label (e.g. "Optional"). */
  labelAside?: ReactNode
  /**
   * The control. A render function receives the id and aria wiring so any
   * input — including a password input with a show/hide button — can be
   * labelled by this Field.
   */
  children: (control: FieldControlProps) => ReactNode
  className?: string
}

/**
 * Label + control + hint/error, wired with `for`/`id` and `aria-describedby`.
 * The hint stays visible when an error appears so the format rule is not
 * lost while the user corrects the value.
 */
export function Field({ label, hint, error, required, id: fixedId, labelAside, children, className }: FieldProps) {
  const generatedId = useId()
  const id = fixedId ?? `field${generatedId}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  const control: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
  }
  return (
    <div className={['ui-field', error && 'ui-field-invalid', className].filter(Boolean).join(' ')}>
      <div className="ui-field-label-row">
        <label htmlFor={id} className="ui-field-label">{label}{required && <span className="ui-field-required" aria-hidden="true"> *</span>}</label>
        {labelAside && <span className="ui-field-aside">{labelAside}</span>}
      </div>
      {children(control)}
      {error && (
        <p id={errorId} className="ui-field-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {hint && <p id={hintId} className="ui-field-hint">{hint}</p>}
    </div>
  )
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required' | 'className'> &
  Omit<FieldProps, 'children' | 'className'> & {
    /** Applied to the wrapper; the input itself always gets `ui-input`. */
    className?: string
    inputClassName?: string
    /** Leading decorative icon inside the input. */
    icon?: ReactNode
  }

/** Field + a plain `<input>`; covers text, email, number and code inputs. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, required, id, labelAside, className, inputClassName, icon, ...input },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id} labelAside={labelAside} className={className}>
      {(control) => (
        <span className={['ui-input-wrap', icon && 'ui-input-has-icon'].filter(Boolean).join(' ')}>
          {icon && <span className="ui-input-icon" aria-hidden="true">{icon}</span>}
          <input ref={ref} className={['ui-input', inputClassName].filter(Boolean).join(' ')} required={required} {...control} {...input} />
        </span>
      )}
    </Field>
  )
})
