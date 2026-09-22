/**
 * The Robot Workshop spike lives behind `VITE_ROBOTICS_PROTOTYPE=1` (the `robotics`
 * vite mode). Without it, nothing in `src/robotics` registers parts, mounts UI or
 * touches the document; the studio is byte-for-byte the studio of `main`.
 */
let override: boolean | null = null

export function isRoboticsPrototypeEnabled(): boolean {
  if (override !== null) return override
  const env = (import.meta as { env?: Record<string, unknown> }).env
  return env?.VITE_ROBOTICS_PROTOTYPE === '1'
}

/** Tests flip the flag without touching `import.meta.env`; `null` restores the environment value. */
export function setRoboticsPrototypeOverride(value: boolean | null) {
  override = value
}
