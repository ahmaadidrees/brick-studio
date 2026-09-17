import type { ReactNode } from 'react'

/** Scale authored scenery around its walkable surface, keeping the plate step unchanged. */
export function ScaledEnvironment({ plateSize = 64, children }: { plateSize?: number; children: ReactNode }) {
  const scale = plateSize / 64
  return <group key={plateSize} scale={scale} position={[0, 0.18 * (scale - 1), 0]}>{children}</group>
}
