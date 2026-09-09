export function capacityFixtureBrick(index: number, sequence: number, run: string) {
  return { id: `${run}_${index}_${sequence}`, partId: 'brick_1x1', x: (index % 10) * 2, y: 0, z: Math.floor(index / 10) * 2 + (sequence - 1) * 8, rotation: 0 as const, color: '#ff0000' };
}
