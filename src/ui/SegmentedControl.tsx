import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import './ui.css'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
}

export type SegmentedControlProps<T extends string> = {
  /** Accessible group name (visually hidden unless `showLabel`). */
  label: string
  showLabel?: boolean
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
}

/**
 * A single-choice switch (Student / Teacher, Follow / Free look) with
 * radiogroup semantics: one tab stop, arrow keys move and select, Home/End
 * jump. Use it for 2–4 short options; use a <select> beyond that.
 */
export function SegmentedControl<T extends string>({ label, showLabel = false, options, value, onChange, size = 'md', fullWidth = false, className }: SegmentedControlProps<T>) {
  const labelId = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled)

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const position = enabled.findIndex(({ index }) => index === from)
    if (position === -1 || enabled.length === 0) return
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (position + 1) % enabled.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (position - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = enabled.length - 1
    if (next === null) return
    event.preventDefault()
    const target = enabled[next]
    onChange(target.option.value)
    buttons.current[target.index]?.focus()
  }

  const selectedIndex = options.findIndex((option) => option.value === value)
  return (
    <div className={['ui-segmented', `ui-segmented-${size}`, fullWidth && 'ui-segmented-full', className].filter(Boolean).join(' ')}>
      <span id={labelId} className={showLabel ? 'ui-segmented-label' : 'sr-only'}>{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="ui-segmented-track">
        {options.map((option, index) => {
          const selected = option.value === value
          // Roving tabindex: the selected option is the tab stop; if none is
          // selected the first enabled option is.
          const tabbable = selected || (selectedIndex === -1 && enabled[0]?.index === index)
          return (
            <button
              key={option.value}
              ref={(element) => { buttons.current[index] = element }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={tabbable ? 0 : -1}
              disabled={option.disabled}
              className={['ui-segmented-option', selected && 'ui-segmented-selected'].filter(Boolean).join(' ')}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => move(event, index)}
            >
              {option.icon && <span className="ui-segmented-icon" aria-hidden="true">{option.icon}</span>}
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
