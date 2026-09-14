import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import './ui.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon (a Lucide element); decorative, the label carries the name. */
  icon?: ReactNode
  /** Trailing icon, e.g. a chevron. */
  trailingIcon?: ReactNode
  /** Shows a spinner, sets aria-busy and blocks clicks. The label stays visible. */
  loading?: boolean
  /** Replaces the label while loading ("Saving…"). */
  loadingLabel?: string
  /** Icon-only square button. Requires `aria-label`. */
  iconOnly?: boolean
  fullWidth?: boolean
  type?: 'button' | 'submit' | 'reset'
}

/**
 * The one button. `primary` is the single most important action on a surface,
 * `secondary` the bordered default, `quiet` for toolbars and inline actions,
 * `danger` for destructive confirmations. Minimum 44px tall at `md`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailingIcon, loading = false, loadingLabel, iconOnly = false, fullWidth = false, type = 'button', className, children, disabled, onClick, ...rest },
  ref,
) {
  if (iconOnly && !rest['aria-label'] && !rest['aria-labelledby']) {
    console.warn('Button: iconOnly buttons need an aria-label')
  }
  const classes = [
    'ui-button',
    `ui-button-${variant}`,
    `ui-button-${size}`,
    iconOnly && 'ui-button-icon-only',
    fullWidth && 'ui-button-full',
    loading && 'ui-button-loading',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={loading ? true : undefined}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading
        ? <LoaderCircle className="ui-spin" size={18} aria-hidden="true" />
        : icon && <span className="ui-button-icon" aria-hidden="true">{icon}</span>}
      {!iconOnly && <span className="ui-button-label">{loading && loadingLabel ? loadingLabel : children}</span>}
      {iconOnly && !loading && <span className="sr-only">{children}</span>}
      {!loading && trailingIcon && <span className="ui-button-icon ui-button-icon-trailing" aria-hidden="true">{trailingIcon}</span>}
    </button>
  )
})
