import { BrandLockup } from '../../brand'
import { Button } from '../../ui'

type Props = {
  /** Display name for the signed-in teacher (first name + last initial). */
  name: string
}

/**
 * Minimal page header for `/class`: brand home link, "Open the studio" and the
 * account chip. W2 owns `src/shell/AppHeader.tsx`; when it lands this file is
 * replaced by `<AppHeader variant="page" />` (see docs/flows/status/w5.md).
 */
export function ClassPageHeader({ name }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || 'T'
  return <header className="class-header">
    <BrandLockup size={28} href="/" wordmark="wide" srSuffix="Home" />
    <div className="class-header-end">
      <Button variant="secondary" size="sm" href="/build">Open the studio</Button>
      <span className="class-account-chip">
        <span className="class-account-avatar" aria-hidden="true">{initial}</span>
        <span className="class-account-text"><strong>{name}</strong><small>Teacher</small></span>
      </span>
    </div>
  </header>
}
