import { expect, it } from 'vitest';
import { createBrickStudioDocument, validateBrickStudioDocument } from '@brick-studio/core';
import { capacityFixtureBrick } from '../../../scripts/classroom/capacity-fixture';

it('accepts every intermediate capacity-test layout through all60 valid placements', () => {
  const bricks = [];
  for (const sequence of [1, 2]) for (let index = 0; index < 30; index++) {
    bricks.push(capacityFixtureBrick(index, sequence, 'capacity_preflight'));
    expect(validateBrickStudioDocument(createBrickStudioDocument(bricks)), `placement ${bricks.length}`).toMatchObject({ ok: true });
  }
});
