/**
 * Brickgineers brand constants (direction I). Every surface reads the display
 * name and copy from here; nothing else in `src/` spells the product name.
 *
 * Internal identifiers are deliberately NOT here: `brick-studio.*` storage
 * keys, `.brickstudio.json`, the `rover-island` package name, `brick_*` tables
 * and the live protocol all keep their existing names. No public origin or
 * domain lives in source either — index.html reads `%VITE_PUBLIC_ORIGIN%`.
 */
export const BRAND_NAME = 'Brickgineers'
export const BRAND_TAGLINE = 'A room full of possibilities'

/** One line for <meta name="description"> and app stores. */
export const BRAND_DESCRIPTION = 'Build a brick world in your browser, then step inside and explore it — on your own, with friends, or with your class.'
/** Shorter line for link previews and the web app manifest. */
export const BRAND_SHORT_DESCRIPTION = 'Build a brick world, then step inside and explore it together.'

/** Core palette. Semantic CSS tokens in src/styles.css are derived from these. */
export const BRAND_PALETTE = {
  cornflower: '#5888DA',
  coral: '#F17861',
  butter: '#F3CA74',
  ink: '#263C51',
  warmWhite: '#F8F4EB',
} as const

/**
 * Darker cornflower used wherever white text sits on blue (buttons, links on
 * white). #5888DA is 3.53:1 against white, which fails WCAG AA for text;
 * #3565BF is 5.58:1. The brand blue stays for surfaces, borders and icons.
 */
export const BRAND_PRIMARY_STRONG = '#3565BF'

/** Mark colors: blue upper lobe, coral lower lobe. */
export const BRAND_MARK_COLORS = {
  upper: BRAND_PALETTE.cornflower,
  lower: BRAND_PALETTE.coral,
  upperStud: '#8FB0EA',
  lowerStud: '#F8A896',
} as const

/** Fonts (Google Fonts import lives in src/styles.css). */
export const BRAND_FONT_DISPLAY = "'Fredoka', 'Nunito', ui-rounded, system-ui, -apple-system, sans-serif"
export const BRAND_FONT_BODY = "'Nunito', ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
