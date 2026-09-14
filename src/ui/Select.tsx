import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { Field, type FieldProps } from './Field'
import './ui.css'

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'required' | 'className'> &
  Omit<FieldProps, 'children' | 'className'> & {
    /** Applied to the wrapper; the select itself always gets `ui-input ui-select`. */
    className?: string
    selectClassName?: string
    /** `<option>` / `<optgroup>` children. */
    children: ReactNode
  }

/**
 * Field + a native `<select>` styled like the shared input, with a chevron.
 * Use it beyond the 2–4 options a SegmentedControl handles; the native
 * picker keeps keyboard, screen-reader and touch behaviour for free.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, requiredMark, id, labelAside, className, selectClassName, children, ...select },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} requiredMark={requiredMark} id={id} labelAside={labelAside} className={className}>
      {(control) => (
        <span className="ui-select-wrap">
          <select ref={ref} className={['ui-input', 'ui-select', selectClassName].filter(Boolean).join(' ')} required={required} {...control} {...select}>
            {children}
          </select>
          <ChevronDown className="ui-select-icon" size={18} aria-hidden="true" />
        </span>
      )}
    </Field>
  )
})
