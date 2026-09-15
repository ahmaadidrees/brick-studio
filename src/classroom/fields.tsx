import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { Field } from '../ui'

type Shared = {
  /** Always visible; read back exactly as written (no required marker is appended). */
  label: string
  hint?: string
  error?: string
  id?: string
  labelAside?: ReactNode
  className?: string
}

export type TextInputProps = Shared & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  /** Leading decorative icon inside the input. */
  icon?: ReactNode
}

/**
 * Field + plain input. Native `required` stays on the input so the browser
 * still blocks empty submits, while the label text stays exactly the words
 * a student reads (the shared TextField appends a required marker).
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ label, hint, error, id, labelAside, className, icon, ...input }, ref) {
  return <Field label={label} hint={hint} error={error} id={id} labelAside={labelAside} className={className}>
    {control => <span className={['ui-input-wrap', icon && 'ui-input-has-icon'].filter(Boolean).join(' ')}>
      {icon && <span className="ui-input-icon" aria-hidden="true">{icon}</span>}
      <input ref={ref} className="ui-input" {...control} {...input} />
    </span>}
  </Field>
})

export type SelectInputProps = Shared & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>

/** Field + native select styled like the shared input; use it beyond four options. */
export function SelectInput({ label, hint, error, id, labelAside, className, children, ...select }: SelectInputProps) {
  return <Field label={label} hint={hint} error={error} id={id} labelAside={labelAside} className={className}>
    {control => <span className="classroom-select">
      <select className="ui-input classroom-select-control" {...control} {...select}>{children}</select>
      <ChevronDown className="classroom-select-icon" size={18} aria-hidden="true" />
    </span>}
  </Field>
}
