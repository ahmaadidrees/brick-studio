/**
 * Classroom presence copy for the live room ("Building with Ava P. and Ben K.", "Waiting for Maya L."):
 * who from the invited roster is in the room right now and who has not arrived yet. Known only in
 * classroom rooms whose owner can see the world's members; guest rooms keep the plain headcount.
 */
export type LivePresence = { building: string[]; waiting: string[] }

/** "Ava P.", "Ava P. and Ben K.", "Ava P., Ben K. and Cy D."; empty for no names. */
export function formatNameList(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The two presence lines, each only when it has names; empty when nothing is known. */
export function presenceLines(presence: LivePresence | undefined): string[] {
  if (!presence) return []
  const lines: string[] = []
  if (presence.building.length > 0) lines.push(`Building with ${formatNameList(presence.building)}`)
  if (presence.waiting.length > 0) lines.push(`Waiting for ${formatNameList(presence.waiting)}`)
  return lines
}

/** One sentence for the People chip's title: "Building with Ava P. Waiting for Ben K." */
export function describeLivePresence(presence: LivePresence | undefined): string {
  return presenceLines(presence).map(line => line.endsWith('.') ? line : `${line}.`).join(' ')
}
