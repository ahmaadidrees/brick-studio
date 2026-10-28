import { describe, expect, it } from 'vitest';
import { ClassroomHttpError, ClassroomService, rosterDisplayName, type Caller } from '../src/classroom';
import { shelfRoute } from '../src/classroom/shelf';

type Row = Record<string, any>;
const teacherId = '22222222-2222-4222-8222-222222222222';
const anaId = '11111111-1111-4111-8111-111111111111';
const samId = '11111111-1111-4111-8111-222222222222';
const classId = '33333333-3333-4333-8333-000000000001';
const teacher: Caller = { id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: 's', token: 't' };
const ana: Caller = { ...teacher, id: anaId, username: 'ana_k', rosterName: 'Ana Kowalski', role: 'student', classId };
const sam: Caller = { ...ana, id: samId, username: 'sam_r', rosterName: 'Sam Reyes' };

const power = (name = 'Double jump') => ({ kind: 'brickgineers-power', version: 1, id: 'dj', name, credits: ['Ana'], what: 'Jump again in the air', fits: 'brick', blocks: [{ type: 'platformer_everytick', id: 'a' }], variables: [] });

/** An in-memory stand-in for the PostgREST tables the shelf touches. */
function db(cls: Row = {}) {
  const items: Row[] = [];
  const rates = new Map<string, number>();
  const audits: Row[] = [];
  const classRow = { id: classId, teacher_id: teacherId, students_can_share: true, shelf_needs_review: true, race_heroes: 'shelf', ...cls };
  const match = (row: Row, query: URLSearchParams) => {
    for (const [key, value] of query) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      if (key === 'or') {
        const parts = value.slice(1, -1).split(',').map((p) => p.split('.eq.'));
        if (!parts.some(([k, v]) => String(row[k]) === v)) return false;
        continue;
      }
      if (!value.startsWith('eq.') || String(row[key]) !== value.slice(3)) return false;
    }
    return true;
  };
  const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname.endsWith('/rpc/brick_take_rate_limit')) {
      const n = (rates.get(body.p_key) ?? 0) + 1;
      rates.set(body.p_key, n);
      return Response.json(n <= body.p_limit);
    }
    if (url.pathname.endsWith('brick_audit_events')) { audits.push(body); return Response.json([body]); }
    if (url.pathname.endsWith('brick_shelf_items')) {
      if (method === 'POST') {
        const row = { id: crypto.randomUUID(), status: 'pending', uses: 0, what: '', created_at: new Date().toISOString(), ...body };
        items.push(row);
        return Response.json([row]);
      }
      const found = items.filter((row) => match(row, url.searchParams));
      if (method === 'PATCH') { found.forEach((row) => Object.assign(row, body)); return Response.json(found); }
      if (method === 'DELETE') { for (const row of found) items.splice(items.indexOf(row), 1); return new Response(null, { status: 204 }); }
      return Response.json(found);
    }
    throw new Error(`Unexpected ${method} ${url.pathname}`);
  };
  const service = new ClassroomService({ SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_ANON_KEY: 'a' }, fetcher as typeof fetch);
  const fail = (status: number, code: string, message: string): never => { throw new ClassroomHttpError(status, code, message); };
  const call = async (caller: Caller, method: string, rest: string[] = [], input: Row = {}) => {
    try {
      const res = await shelfRoute(service, caller, classRow, ['classes', classId, 'shelf', ...rest], method, async () => input, fail, rosterDisplayName);
      return { status: res.status, body: await res.json() as Row };
    } catch (error) {
      if (error instanceof ClassroomHttpError) return { status: error.status, body: { code: error.code } };
      throw error;
    }
  };
  return { items, audits, call, classRow };
}

describe('the class shelf', () => {
  it('a student\'s power waits for the teacher; classmates do not see it until the teacher puts it on the shelf', async () => {
    const { call } = db();
    const shared = await call(ana, 'POST', [], { name: 'Double jump', what: 'Jump again in the air', payload: power() });
    expect(shared.status).toBe(201);
    expect(shared.body.item).toMatchObject({ name: 'Double jump', by: 'Ana K.', mine: true, status: 'pending' });
    expect((await call(sam, 'GET')).body.items).toEqual([]);
    expect((await call(sam, 'GET', [shared.body.item.id])).status).toBe(404);
    // the maker sees their own, waiting; the teacher sees it in the queue
    expect((await call(ana, 'GET')).body.items.map((i: Row) => i.status)).toEqual(['pending']);
    expect((await call(teacher, 'GET')).body.items.map((i: Row) => [i.by, i.status])).toEqual([['Ana K.', 'pending']]);
    // a classmate can't approve it: to them a waiting item doesn't exist at all
    expect((await call(sam, 'PATCH', [shared.body.item.id], { status: 'approved' })).status).toBe(404);
    expect((await call(teacher, 'PATCH', [shared.body.item.id], { status: 'approved' })).body.item.status).toBe('approved');
    const seen = await call(sam, 'GET', [shared.body.item.id]);
    expect(seen.status).toBe(200);
    expect(seen.body.item.payload).toMatchObject({ kind: 'brickgineers-power', name: 'Double jump' });
    expect(seen.body.item.mine).toBe(false);
  });

  it('never shows a username or full roster name, only first name and last initial', async () => {
    const { call, items } = db();
    await call(ana, 'POST', [], { name: 'Dash', payload: power('Dash') });
    const text = JSON.stringify((await call(teacher, 'GET')).body);
    expect(text).not.toContain('ana_k');
    expect(text).not.toContain('Kowalski');
    expect(items[0].author_name).toBe('Ana K.');
  });

  it('the teacher\'s own share goes straight on; with checking off, students\' do too', async () => {
    const t = db();
    expect((await t.call(teacher, 'POST', [], { name: 'Hop', payload: power('Hop') })).body.item).toMatchObject({ status: 'approved', by: 'Teacher' });
    const open = db({ shelf_needs_review: false });
    expect((await open.call(ana, 'POST', [], { name: 'Dash', payload: power('Dash') })).body.item.status).toBe('approved');
  });

  it('a hidden item disappears for classmates; the maker or the teacher can remove it, nobody else', async () => {
    const { call } = db({ shelf_needs_review: false });
    const id = (await call(ana, 'POST', [], { name: 'Dash', payload: power('Dash') })).body.item.id;
    expect((await call(sam, 'GET')).body.items).toHaveLength(1);
    await call(teacher, 'PATCH', [id], { status: 'hidden' });
    expect((await call(sam, 'GET')).body.items).toEqual([]);
    expect((await call(ana, 'GET')).body.items.map((i: Row) => i.status)).toEqual(['hidden']);
    await call(teacher, 'PATCH', [id], { status: 'approved' });
    expect((await call(sam, 'DELETE', [id])).status).toBe(403);
    expect((await call(ana, 'DELETE', [id])).body).toEqual({ removed: true });
    expect((await call(teacher, 'GET')).body.items).toEqual([]);
  });

  it('counts a classmate using it once a minute, and the maker not at all', async () => {
    const { call } = db({ shelf_needs_review: false });
    const id = (await call(ana, 'POST', [], { name: 'Dash', payload: power('Dash') })).body.item.id;
    expect((await call(sam, 'POST', [id, 'use'])).body.uses).toBe(1);
    expect((await call(sam, 'POST', [id, 'use'])).body.uses).toBe(1);
    expect((await call(ana, 'POST', [id, 'use'])).body.uses).toBe(1);
  });

  it('refuses things that are not power files, and big ones', async () => {
    const { call } = db();
    expect((await call(ana, 'POST', [], { name: 'x', payload: { kind: 'other' } })).body.code).toBe('invalid_power');
    expect((await call(ana, 'POST', [], { name: 'x', payload: { ...power(), fits: 'everything' } })).body.code).toBe('invalid_power');
    expect((await call(ana, 'POST', [], { name: 'x', payload: { ...power(), blocks: [{ notAType: 1 }] } })).body.code).toBe('invalid_power');
    const big = { ...power(), blocks: Array.from({ length: 4000 }, (_, i) => ({ type: 'motion_movesteps', id: `b${i}`, fields: { NOTE: 'x'.repeat(10) } })) };
    expect((await call(ana, 'POST', [], { name: 'x', payload: big })).status).toBe(413);
  });

  it('with sharing between students off, students cannot share and only see their own; the teacher still can', async () => {
    const { call, items } = db({ students_can_share: false, shelf_needs_review: false });
    expect((await call(ana, 'POST', [], { name: 'Dash', payload: power('Dash') })).body.code).toBe('sharing_disabled');
    await call(teacher, 'POST', [], { name: 'Hop', payload: power('Hop') });
    expect(items).toHaveLength(1);
    expect((await call(sam, 'GET')).body.items).toEqual([]);
  });

  it('the list says how the class shelf works: checking first, and which Heroes races allow', async () => {
    const { call } = db({ shelf_needs_review: false, race_heroes: 'builtin' });
    expect((await call(ana, 'GET')).body).toMatchObject({ needsReview: false, raceHeroes: 'builtin' });
  });

  it('a student can share at most 20 things in 10 minutes', async () => {
    const { call } = db();
    for (let i = 0; i < 20; i++) expect((await call(ana, 'POST', [], { name: `P${i}`, payload: power(`P${i}`) })).status).toBe(201);
    expect((await call(ana, 'POST', [], { name: 'P20', payload: power('P20') })).status).toBe(429);
  });
});
