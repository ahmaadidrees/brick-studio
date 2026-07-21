export function usesCompactRenderer(width: number, height: number) {
  return Math.min(width, height) < 600
}
