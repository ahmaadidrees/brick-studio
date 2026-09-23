import { useCallback, useEffect, useState } from 'react'

/**
 * Whether a builder uses its compact layout: the drawer becomes a button and a bottom sheet. Narrow and portrait
 * screens use it; landscape touch tablets keep the docked drawer beside the canvas. The 3D studio's CSS media
 * query for the same switch is `(max-width: 900px), (pointer: coarse)` minus the tablet case.
 */
export function useCompactLayout() {
  const [queries] = useState(() => ['(max-width: 900px)', '(pointer: coarse)'].map((query) => window.matchMedia?.(query) ?? null))
  const matchesCompact = useCallback(() => {
    const touch = queries[1]?.matches ?? false
    // Landscape tablets retain a palette; narrow/portrait screens use the dock.
    const tabletPalette = touch && window.innerWidth >= 960 && window.innerHeight >= 600 && window.innerWidth > window.innerHeight
    return !tabletPalette && (queries.some((query) => query?.matches) || window.innerWidth <= 900)
  }, [queries])
  const [compact, setCompact] = useState(matchesCompact)

  useEffect(() => {
    const update = () => setCompact(matchesCompact())
    update()
    for (const query of queries) query?.addEventListener?.('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      for (const query of queries) query?.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [queries, matchesCompact])

  return compact
}
