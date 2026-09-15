import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { LoaderCircle } from 'lucide-react'
import './ui.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** Props shared by the button and anchor renderings. */
export type ButtonBaseProps = {
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
  /**
   * Toggle state: sets `aria-pressed` and the styled pressed look. Leave it
   * undefined for plain buttons (an `aria-pressed` attribute makes a toggle).
   */
  pressed?: boolean
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & ButtonBaseProps & {
  type?: 'button' | 'submit' | 'reset'
  /**
   * Renders an `<a>` with the same classes, sizes and focus ring. `disabled`
   * or `loading` links drop the href and carry `aria-disabled`.
   */
  href?: string
  target?: AnchorHTMLAttributes<HTMLAnchorElement>['target']
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>['rel']
  download?: AnchorHTMLAttributes<HTMLAnchorElement>['download']
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & ButtonBaseProps & {
  href: string
  /** A disabled link keeps its place but drops the href. */
  disabled?: boolean
}

function buttonClasses(
  { variant = 'secondary', size = 'md', iconOnly = false, fullWidth = false, loading = false, pressed }: ButtonBaseProps,
  className?: string,
) {
  return [
    'ui-button',
    `ui-button-${variant}`,
    `ui-button-${size}`,
    iconOnly && 'ui-button-icon-only',
    fullWidth && 'ui-button-full',
    loading && 'ui-button-loading',
    pressed && 'ui-button-pressed',
    className,
  ].filter(Boolean).join(' ')
}

function ButtonContent({ icon, trailingIcon, loading = false, loadingLabel, iconOnly = false, children }: ButtonBaseProps & { children?: ReactNode }) {
  return (
    <>
      {loading
        ? <LoaderCircle className="ui-spin" size={18} aria-hidden="true" />
        : icon && <span className="ui-button-icon" aria-hidden="true">{icon}</span>}
      {!iconOnly && <span className="ui-button-label">{loading && loadingLabel ? loadingLabel : children}</span>}
      {iconOnly && !loading && <span className="sr-only">{children}</span>}
      {!loading && trailingIcon && <span className="ui-button-icon ui-button-icon-trailing" aria-hidden="true">{trailingIcon}</span>}
    </>
  )
}

function warnIconOnly(iconOnly: boolean, rest: { 'aria-label'?: string; 'aria-labelledby'?: string }) {
  if (iconOnly && !rest['aria-label'] && !rest['aria-labelledby']) {
    console.warn('Button: iconOnly buttons need an aria-label')
  }
}

/**
 * A link that looks and sizes like a Button (landing CTAs, "Open the
 * classroom" after sign-in). Keyboard and focus behave like any link.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant, size, icon, trailingIcon, loading = false, loadingLabel, iconOnly = false, fullWidth, pressed, href, disabled = false, className, children, onClick, ...rest },
  ref,
) {
  warnIconOnly(iconOnly, rest)
  const inert = disabled || loading
  return (
    <a
      ref={ref}
      href={inert ? undefined : href}
      role={inert ? 'link' : undefined}
      className={buttonClasses({ variant, size, iconOnly, fullWidth, loading, pressed }, className)}
      aria-disabled={inert ? true : undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      onClick={inert ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      <ButtonContent icon={icon} trailingIcon={trailingIcon} loading={loading} loadingLabel={loadingLabel} iconOnly={iconOnly}>{children}</ButtonContent>
    </a>
  )
})

/**
 * The one button. `primary` is the single most important action on a surface,
 * `secondary` the bordered default, `quiet` for toolbars and inline actions,
 * `danger` for destructive confirmations. Minimum 44px tall at `md` (and at
 * every size on coarse pointers). Pass `href` to render a link instead.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, trailingIcon, loading = false, loadingLabel, iconOnly = false, fullWidth, pressed, type = 'button', href, target, rel, download, className, children, disabled, onClick, ...rest },
  ref,
) {
  if (href !== undefined) {
    return (
      <ButtonLink
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        target={target}
        rel={rel}
        download={download}
        variant={variant}
        size={size}
        icon={icon}
        trailingIcon={trailingIcon}
        loading={loading}
        loadingLabel={loadingLabel}
        iconOnly={iconOnly}
        fullWidth={fullWidth}
        pressed={pressed}
        disabled={disabled}
        className={className}
        onClick={onClick as unknown as ButtonLinkProps['onClick']}
        {...(rest as unknown as Omit<ButtonLinkProps, 'href'>)}
      >
        {children}
      </ButtonLink>
    )
  }
  warnIconOnly(iconOnly, rest)
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, iconOnly, fullWidth, loading, pressed }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={loading ? true : undefined}
      aria-pressed={pressed}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      <ButtonContent icon={icon} trailingIcon={trailingIcon} loading={loading} loadingLabel={loadingLabel} iconOnly={iconOnly}>{children}</ButtonContent>
    </button>
  )
})
