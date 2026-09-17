import type { AnchorHTMLAttributes, HTMLAttributes } from 'react'
import { BRAND_NAME } from './brand'
import { BrickMark, type BrickMarkVariant } from './BrickMark'
import './brand.css'

export type WordmarkProps = HTMLAttributes<HTMLSpanElement> & {
  /** Font size in CSS pixels; the wordmark is real text set in Fredoka. */
  size?: number
}

/** The brand name as real, selectable text in the display face. */
export function Wordmark({ size = 22, className, style, ...rest }: WordmarkProps) {
  return (
    <span
      className={['brand-wordmark', className].filter(Boolean).join(' ')}
      style={{ fontSize: size, ...style }}
      translate="no"
      {...rest}
    >
      {BRAND_NAME}
    </span>
  )
}

type LockupOwnProps = {
  /** Mark size in px; the wordmark scales with it. */
  size?: number
  variant?: BrickMarkVariant
  /**
   * `always` shows mark + wordmark; `wide` hides the wordmark under 640px
   * (narrow headers use the mark alone, per the mobile board); `never` is the
   * bare mark with the brand name as its accessible title.
   */
  wordmark?: 'always' | 'wide' | 'never'
  /** Extra words for the accessible name (e.g. "Home" → "Brickgineers Home"); the visible text stays the name's prefix. */
  srSuffix?: string
}

export type BrandLockupProps = LockupOwnProps & (
  | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>)
  | ({ href?: undefined } & HTMLAttributes<HTMLSpanElement>)
)

/**
 * Mark + wordmark. Renders as a link when `href` is given (the header's home
 * affordance) and as inert text otherwise. The visible text carries the
 * accessible name, so the mark itself is decorative here.
 */
export function BrandLockup({ size = 32, variant = 'color', wordmark = 'always', srSuffix, className, ...rest }: BrandLockupProps) {
  const classes = ['brand-lockup', wordmark === 'wide' && 'brand-lockup-wide', className].filter(Boolean).join(' ')
  const ariaLabel = srSuffix ? `${BRAND_NAME} ${srSuffix}` : undefined
  const content = (
    <>
      <BrickMark size={size} variant={variant} title={wordmark === 'never' ? BRAND_NAME : null} />
      {wordmark !== 'never' && <Wordmark size={Math.round(size * 0.72)} />}
    </>
  )
  if ('href' in rest && rest.href) {
    const { href, ...anchor } = rest as { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>
    return <a href={href} className={classes} aria-label={ariaLabel} {...anchor}>{content}</a>
  }
  return <span className={classes} aria-label={ariaLabel} {...(rest as HTMLAttributes<HTMLSpanElement>)}>{content}</span>
}
