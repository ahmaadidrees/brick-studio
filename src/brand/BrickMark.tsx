import type { SVGAttributes } from 'react'
import { useId } from 'react'
import { BRAND_MARK_COLORS, BRAND_NAME } from './brand'

/**
 * The Brickgineers mark: two equal rounded brick lobes stacked into a B —
 * blue upper, coral lower — each with exactly two front-facing studs, aligned
 * in the same columns. Nothing is tilted and both lobes share one outline so
 * the mark reads at 16px (favicon) and at hero size alike.
 *
 * Geometry lives in `MARK` so scripts/assets/build-brand-assets.mjs can mirror
 * it for the favicon and icons (that script cannot import TSX).
 */
export const MARK = {
  viewBox: 64,
  lobe: { x: 8, width: 48, height: 24, leftRadius: 6, rightRadius: 12 },
  upperY: 7,
  lowerY: 33,
  studRadius: 4.6,
  studColumns: [22, 38] as const,
} as const

/** Rounded rectangle with a squarer left edge and a fully round right edge (the B's bowls). */
export function lobePath(x: number, y: number, width: number, height: number, leftRadius: number, rightRadius: number) {
  const right = x + width
  const bottom = y + height
  return [
    `M${x + leftRadius} ${y}`,
    `H${right - rightRadius}`,
    `A${rightRadius} ${rightRadius} 0 0 1 ${right} ${y + rightRadius}`,
    `V${bottom - rightRadius}`,
    `A${rightRadius} ${rightRadius} 0 0 1 ${right - rightRadius} ${bottom}`,
    `H${x + leftRadius}`,
    `A${leftRadius} ${leftRadius} 0 0 1 ${x} ${bottom - leftRadius}`,
    `V${y + leftRadius}`,
    `A${leftRadius} ${leftRadius} 0 0 1 ${x + leftRadius} ${y}`,
    'Z',
  ].join(' ')
}

export type BrickMarkVariant = 'color' | 'mono' | 'outline'

export type BrickMarkProps = Omit<SVGAttributes<SVGSVGElement>, 'width' | 'height'> & {
  /** Rendered width and height in CSS pixels. */
  size?: number | string
  /** `color` (default), `mono` (currentColor lobes, punched-out studs) or `outline` (stroked). */
  variant?: BrickMarkVariant
  /**
   * Accessible name. Defaults to the brand name so a bare mark still reads as
   * "Brickgineers". Pass `null` when the mark sits next to visible brand text
   * (the lockup) so screen readers do not hear the name twice.
   */
  title?: string | null
}

export function BrickMark({ size = 32, variant = 'color', title = BRAND_NAME, className, ...rest }: BrickMarkProps) {
  const titleId = useId()
  const { lobe, upperY, lowerY, studRadius, studColumns, viewBox } = MARK
  const upper = lobePath(lobe.x, upperY, lobe.width, lobe.height, lobe.leftRadius, lobe.rightRadius)
  const lower = lobePath(lobe.x, lowerY, lobe.width, lobe.height, lobe.leftRadius, lobe.rightRadius)
  const studs = (y: number, fill: string, extra?: SVGAttributes<SVGCircleElement>) =>
    studColumns.map((cx) => <circle key={cx} cx={cx} cy={y + lobe.height / 2} r={studRadius} fill={fill} {...extra} />)

  const labelled = title !== null && title !== ''
  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      width={size}
      height={size}
      className={['brand-mark', variant !== 'color' && `brand-mark-${variant}`, className].filter(Boolean).join(' ')}
      role={labelled ? 'img' : undefined}
      aria-labelledby={labelled ? titleId : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      data-variant={variant}
      {...rest}
    >
      {labelled && <title id={titleId}>{title}</title>}
      {variant === 'color' && (
        <>
          <path d={upper} fill={BRAND_MARK_COLORS.upper} />
          <path d={lower} fill={BRAND_MARK_COLORS.lower} />
          {studs(upperY, BRAND_MARK_COLORS.upperStud)}
          {studs(lowerY, BRAND_MARK_COLORS.lowerStud)}
        </>
      )}
      {variant === 'mono' && (
        <>
          <path d={upper} fill="currentColor" />
          <path d={lower} fill="currentColor" />
          {studs(upperY, 'none', { stroke: 'var(--surface, #fff)', strokeWidth: 2.2 })}
          {studs(lowerY, 'none', { stroke: 'var(--surface, #fff)', strokeWidth: 2.2 })}
        </>
      )}
      {variant === 'outline' && (
        <g fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round">
          <path d={upper} />
          <path d={lower} />
          {studs(upperY, 'none')}
          {studs(lowerY, 'none')}
        </g>
      )}
    </svg>
  )
}
