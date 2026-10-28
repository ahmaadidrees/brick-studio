import { costumeFromImage, imageFromRows } from '../pixels'
import type { BrickTemplate } from '../templates'

/** A stand-in for the starter lane's templates (BRICK_TEMPLATES is empty until it merges). Tests only. */
export const fakeTemplate: BrickTemplate = {
  id: 'fake',
  label: 'Start from Fake',
  blurb: 'does a fake thing',
  make: (id, name) => ({
    brick: {
      id,
      name,
      costumes: [costumeFromImage('c', imageFromRows(['##', '##'], { '#': '#aa3322' }))],
      sounds: [],
      program: { scripts: [], procedures: [], variables: [{ id: 'fake_speed', name: 'speed', value: 3, showInBuild: true }], lists: [] },
    },
    workspace: { blocks: { languageVersion: 0, blocks: [] }, marker: id },
  }),
}
