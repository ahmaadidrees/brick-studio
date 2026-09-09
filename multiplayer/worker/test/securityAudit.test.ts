import { describe, expect, it } from 'vitest';
import { readClassroomBody } from '../src/classroom/readBody';

describe('bounded classroom request parsing', () => {
  it('handles UTF-8 split across chunks without corrupting student names', async () => {
    const bytes = new TextEncoder().encode('{"name":"Zoë"}');
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } });
    await expect(readClassroomBody(new Request('https://test/classroom/auth/register', { method: 'POST', body: stream }))).resolves.toEqual({ name: 'Zoë' });
  });
  it('cancels an oversized headerless stream before reading its remainder', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(1_000_001)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    await expect(readClassroomBody(new Request('https://test/classroom/auth/register', { method: 'POST', body: stream }))).rejects.toMatchObject({ status: 413, code: 'too_large' });
    expect(cancelled).toBe(true);
    expect(pulls).toBe(2);
  });
  it('rejects malformed JSON and non-object payloads', async () => {
    for (const body of ['null', '[]', '"name"', '{']) {
      await expect(readClassroomBody(new Request('https://test/classroom/auth/register', { method: 'POST', body }))).rejects.toMatchObject({ status: 400, code: 'invalid_json' });
    }
  });
});
