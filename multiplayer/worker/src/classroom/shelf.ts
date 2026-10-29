/**
 * The class shelf (docs/qa/code-lab-layers): Code Lab power bricks a class shares with each other.
 *
 *   GET    /classroom/classes/:id/shelf              list (no payloads). Students: what is on the shelf, plus their own
 *                                                    waiting or hidden items. The teacher: everything, with status.
 *   GET    /classroom/classes/:id/shelf/:item        one item with its power file (what a classmate may see)
 *   POST   /classroom/classes/:id/shelf              share { name, what, payload }. A student's waits for the teacher
 *                                                    while the class checks first; the teacher's goes straight on.
 *   PATCH  /classroom/classes/:id/shelf/:item        teacher: { status: 'approved' | 'hidden' }
 *   DELETE /classroom/classes/:id/shelf/:item        the maker or the teacher
 *   POST   /classroom/classes/:id/shelf/:item/use    a classmate snapped it on (counts uses)
 *
 * Classmates see a maker as first name and last initial (rosterDisplayName), never a username.
 */
import type { ClassroomService, Caller } from './index';

type Row = Record<string, any>;
type Fail = (status: number, code: string, message: string) => never;

const STATUSES = ['pending', 'approved', 'hidden'] as const;
export const SHELF_PAYLOAD_MAX = 65_536;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function shelfItemView(row: Row, caller: Caller) {
  return {
    id: row.id as string,
    kind: row.kind as 'power',
    name: row.name as string,
    what: row.what as string,
    by: row.author_name as string,
    mine: row.author_id === caller.id,
    status: row.status as (typeof STATUSES)[number],
    uses: row.uses as number,
    createdAt: row.created_at as string,
  };
}

/** The power file's own shape, checked again here: the Worker never trusts a client to have validated it. */
function checkPayload(payload: unknown, fail: Fail): Row {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, 'invalid_power', 'Send a power file.');
  const p = payload as Row;
  if (p.kind !== 'brickgineers-power' || p.version !== 1 || !Array.isArray(p.blocks) || !Array.isArray(p.variables) || !Array.isArray(p.credits)) fail(400, 'invalid_power', 'That is not a power file.');
  if (p.fits !== 'brick' && p.fits !== 'stage') fail(400, 'invalid_power', 'That is not a power file.');
  if (!p.blocks.every((b: unknown) => b && typeof b === 'object' && typeof (b as Row).type === 'string')) fail(400, 'invalid_power', 'That power file is damaged.');
  if (new TextEncoder().encode(JSON.stringify(p)).byteLength > SHELF_PAYLOAD_MAX) fail(413, 'too_large', 'This power is too big for the shelf.');
  return p;
}

const text = (value: unknown, label: string, max: number, fail: Fail, required = true): string => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) fail(400, 'invalid_input', `${label} is required (up to ${max} characters).`);
  return (value as string).trim();
};

export async function shelfRoute(
  service: ClassroomService,
  caller: Caller,
  cls: Row,
  path: string[],
  method: string,
  readBody: () => Promise<Row>,
  fail: Fail,
  displayName: (rosterName: string) => string,
): Promise<Response> {
  const teacher = caller.role === 'teacher';
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const shelfOpen = () => { if (!teacher && cls.students_can_share === false) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.'); };
  const settings = { needsReview: cls.shelf_needs_review !== false, raceHeroes: (cls.race_heroes as string) || 'shelf' };

  if (path.length === 3) {
    if (method === 'GET') {
      // Students see the shelf and their own items; the class's sharing switch hides everyone else's.
      const filter = teacher
        ? `class_id=eq.${cls.id}`
        : cls.students_can_share === false
          ? `class_id=eq.${cls.id}&author_id=eq.${caller.id}`
          : `class_id=eq.${cls.id}&or=(status.eq.approved,author_id.eq.${caller.id})`;
      const rows = await service.rows('shelf_items', `${filter}&select=id,kind,name,what,author_id,author_name,status,uses,created_at&order=created_at.desc&limit=100`);
      return json({ items: rows.map((row) => shelfItemView(row, caller)), ...settings });
    }
    if (method === 'POST') {
      shelfOpen();
      await service.rate(`shelf:${caller.id}`, 20, 600);
      const input = await readBody();
      const payload = checkPayload(input.payload, fail);
      const name = text(input.name ?? payload.name, 'Name', 40, fail);
      const what = text(input.what ?? payload.what ?? '', 'What it does', 200, fail, false);
      const author = teacher ? 'Teacher' : displayName(caller.rosterName) || caller.username;
      const status = teacher || !settings.needsReview ? 'approved' : 'pending';
      const row = (await service.insert('shelf_items', { class_id: cls.id, author_id: caller.id, author_name: author, kind: 'power', name, what, payload: { ...payload, name }, status, ...(status === 'approved' && teacher ? { reviewed_at: new Date().toISOString(), reviewed_by: caller.id } : {}) }))[0];
      await service.audit(caller, 'shelf_share', cls.id, row.id);
      return json({ item: shelfItemView(row, caller) }, 201);
    }
    fail(405, 'method_not_allowed', 'Unsupported shelf action.');
  }

  const id = path[3];
  if (!uuid(id)) fail(404, 'not_found', 'That brick is not on the shelf.');
  const row = (await service.rows('shelf_items', `id=eq.${id}&class_id=eq.${cls.id}&limit=1`))[0];
  // A classmate's item that is not on the shelf (waiting or hidden) is not there, as far as other students know.
  const visible = row && (teacher || row.author_id === caller.id || (row.status === 'approved' && cls.students_can_share !== false));
  if (!visible) fail(404, 'not_found', 'That brick is not on the shelf.');

  if (path.length === 4 && method === 'GET') return json({ item: { ...shelfItemView(row, caller), payload: row.payload } });
  if (path.length === 4 && method === 'PATCH') {
    if (!teacher) fail(403, 'teacher_required', 'Only your teacher can put bricks on the shelf.');
    const input = await readBody();
    if (input.status !== 'approved' && input.status !== 'hidden') fail(400, 'invalid_input', 'status must be approved or hidden.');
    const updated = (await service.patch('shelf_items', `id=eq.${row.id}&class_id=eq.${cls.id}`, { status: input.status, reviewed_at: new Date().toISOString(), reviewed_by: caller.id }))[0];
    await service.audit(caller, input.status === 'approved' ? 'shelf_approve' : 'shelf_hide', cls.id, row.id);
    return json({ item: shelfItemView(updated, caller) });
  }
  if (path.length === 4 && method === 'DELETE') {
    if (!teacher && row.author_id !== caller.id) fail(403, 'not_yours', 'Only the person who shared it, or your teacher, can take it off the shelf.');
    await service.remove('shelf_items', `id=eq.${row.id}&class_id=eq.${cls.id}`);
    await service.audit(caller, 'shelf_remove', cls.id, row.id);
    return json({ removed: true });
  }
  if (path.length === 5 && path[4] === 'use' && method === 'POST') {
    if (row.status !== 'approved') return json({ uses: row.uses });
    // Each classmate counts once a minute at most; the count is a rough "how many use it", not a ledger.
    if (row.author_id !== caller.id && await service.takeRate(`shelf-use:${row.id}:${caller.id}`, 1, 60)) {
      const updated = (await service.patch('shelf_items', `id=eq.${row.id}&class_id=eq.${cls.id}`, { uses: (row.uses ?? 0) + 1 }))[0];
      return json({ uses: updated?.uses ?? row.uses });
    }
    return json({ uses: row.uses });
  }
  return fail(405, 'method_not_allowed', 'Unsupported shelf action.');
}
