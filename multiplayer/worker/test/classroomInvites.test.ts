import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrickStudioDocument } from '@brick-studio/core';
import { PLATFORMER_FORMAT, createPlatformerDocument } from '@brick-studio/platformer-core/document';
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level';
import { PROTOCOL } from '@brick-studio/platformer-core/net/protocol';
import { runInDurableObject } from 'cloudflare:test';
import { handleReleaseRequest } from '../src/classroomRoutes';
import type { Env } from '../src/index';
import type { PlatformerRoom } from '../src/platformerRoom';
import { Inbox, send, sockets, workerEnv } from './classroomFixture';
import { ClassroomService, WORLD_MEMBER_LIMIT, handleClassroomRequest, type Caller, type ClassroomAccessChange, type ClassroomEnv } from '../src/classroom';
type Row = Record<string, any>;

/** Quiet invites: a personal world with class_visibility 'members' admits only the classmates in brick_world_members. */
const teacherId = '22222222-2222-4222-8222-222222222222', otherTeacherId = '22222222-2222-4222-8222-000000000002';
const classId = '33333333-3333-4333-8333-333333333333', otherClassId = '33333333-3333-4333-8333-000000000002';
const avaId = '11111111-1111-4111-8111-00000000000a', benId = '11111111-1111-4111-8111-00000000000b', chloeId = '11111111-1111-4111-8111-00000000000c';
const cyId = '11111111-1111-4111-8111-00000000000d', pausedId = '11111111-1111-4111-8111-00000000000e';
const treehouse = '44444444-4444-4444-8444-00000000000a';
const sid = '55555555-5555-4555-8555-555555555555';
const token = `header.${btoa(JSON.stringify({ session_id: sid }))}.signature`;
const env: ClassroomEnv = { SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_ANON_KEY: 'test-anon', BRICK_TEACHER_IDS: teacherId };
const doc = createBrickStudioDocument([]);
const studentCaller = (id: string, username: string, rosterName: string, cls = classId): Caller => ({ id, username, rosterName, role: 'student', resetRequired: false, classId: cls, authVersion: 2, sessionId: sid, token });
const ava = studentCaller(avaId, 'ava_builds', 'Ava Rivera'), ben = studentCaller(benId, 'ben_k', 'Ben Kim'), chloe = studentCaller(chloeId, 'chloe_m', 'Chloe Martin');
const cy = studentCaller(cyId, 'cy_other', 'Cy Other', otherClassId);
const teacher: Caller = { id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: sid, token };
const otherTeacher: Caller = { ...teacher, id: otherTeacherId };

type Tables = { classes?: Row[]; worlds: Row[]; members?: Row[] };
const period3 = () => ({ id: classId, teacher_id: teacherId, name: 'Period 3 Makers', login_code: 'MAKERS3', enrollment_open: true, collaboration_open: true, show_names_on_join: true, students_can_share: true });
const roster = () => [
  { user_id: avaId, class_id: classId, username: 'ava_builds', roster_name: 'Ava Rivera', suspended: false },
  { user_id: benId, class_id: classId, username: 'ben_k', roster_name: 'Ben Kim', suspended: false },
  { user_id: chloeId, class_id: classId, username: 'chloe_m', roster_name: 'Chloe Martin', suspended: false },
  { user_id: pausedId, class_id: classId, username: 'pat_p', roster_name: 'Pat Paused', suspended: true },
  { user_id: cyId, class_id: otherClassId, username: 'cy_other', roster_name: 'Cy Other', suspended: false },
];
const world = (sharing: Row = {}) => ({ id: treehouse, owner_id: avaId, class_id: null, kind: 'personal', title: 'Treehouse Hideout', revision: 3, updated_at: '2026-09-16T10:00:00Z', document: doc, class_visibility: 'private', class_can_edit: false, hidden_by_teacher: false, class_shared_at: null, ...sharing });
const invited = (sharing: Row = {}) => world({ class_visibility: 'members', class_shared_at: '2026-09-15T10:00:00Z', ...sharing });
const benInvited = () => [{ world_id: treehouse, user_id: benId }];
const arrival = '2026-09-30T10:00:00.000Z';
const memberState = (row: Row) => ({ invite_id: crypto.randomUUID(), invited_at: arrival, seen_at: null, joined_at: null, ...row });

/** PostgREST stand-in: eq/neq/in filters, PATCH and DELETE returning affected rows, single or batch POST, the RPCs the routes use. */
function backend(as: Caller, tables: Tables) {
  const events: ClassroomAccessChange[] = [];
  const db: Record<string, Row[]> = { classes: tables.classes ?? [period3(), { ...period3(), id: otherClassId, teacher_id: otherTeacherId, name: 'Period 4' }], students: roster(), worlds: tables.worlds, world_members: (tables.members ?? []).map(memberState), audit_events: [], checkpoints: [] };
  const matches = (row: Row, query: URLSearchParams) => [...query.entries()].every(([key, value]) => {
    if (['select', 'limit', 'offset', 'order', 'on_conflict'].includes(key)) return true;
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value.startsWith('neq.')) return String(row[key]) !== value.slice(4);
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
    throw new Error(`Unsupported filter ${key}=${value}`);
  });
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), table = url.pathname.replace('/rest/v1/brick_', ''), method = init?.method ?? 'GET';
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.replace('/rest/v1/rpc/brick_', ''), body = JSON.parse(String(init?.body));
      if (name === 'take_rate_limit') return Response.json(true);
      if (name === 'authorize_world') {
        const row = db.worlds.find(item => item.id === body.p_world_id), student = db.students.find(item => item.user_id === body.p_user_id);
        const owner = row && db.students.find(item => item.user_id === row.owner_id), cls = owner && db.classes.find(item => item.id === owner.class_id);
        if (!row || !student || !owner || student.suspended || owner.suspended || student.class_id !== owner.class_id || !cls?.collaboration_open || cls.students_can_share === false || row.hidden_by_teacher) return Response.json({ error: 'not_found' });
        const isOwner = row.owner_id === student.user_id;
        if (!isOwner && (row.class_visibility === 'private' || row.class_visibility === 'members' && !db.world_members.some(member => member.world_id === row.id && member.user_id === student.user_id))) return Response.json({ error: 'not_found' });
        return Response.json({ userId: student.user_id, username: student.username, role: 'student', worldId: row.id, classId: null, canEdit: isOwner || row.class_can_edit, isTeacher: false, isOwner, authVersion: body.p_auth_version, sessionId: body.p_session_id });
      }
      if (name === 'commit_world') { const row = db.worlds.find(item => item.id === body.p_world_id)!; return Response.json({ ...row, revision: row.revision + 1, document: body.p_document }); }
      throw new Error(`Unexpected rpc ${name}`);
    }
    if (!(table in db)) throw new Error(`Unexpected table ${table}`);
    const rows = db[table].filter(row => matches(row, url.searchParams));
    if (method === 'PATCH') { const data = JSON.parse(String(init?.body)); rows.forEach(row => Object.assign(row, data)); return Response.json(rows); }
    if (method === 'DELETE') { db[table] = db[table].filter(row => !rows.includes(row)); return Response.json(rows); }
    if (method === 'POST') { const data = JSON.parse(String(init?.body)); const inserted = (Array.isArray(data) ? data : [data]).map(item => ({ id: crypto.randomUUID(), ...item })); db[table].push(...inserted); return Response.json(inserted); }
    const limit = Number(url.searchParams.get('limit') || 1000);
    return Response.json(rows.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + limit));
  });
  vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(as);
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
  const service = new ClassroomService(env, fetcher as typeof fetch);
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await handleClassroomRequest(new Request(`https://worker.test/classroom/${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    }), env, { onAccessChanged: async event => { events.push(event); } });
    return { status: response!.status, body: await response!.json() as Row };
  };
  const members = () => db.world_members.filter(row => row.world_id === treehouse).map(row => row.user_id).sort();
  return { call, events, db, service, members, fetcher };
}
afterEach(() => {
  for (const socket of sockets.splice(0)) try { socket.close(); } catch { /* already closed */ }
  vi.restoreAllMocks();
});

describe('quiet invites: sharing a personal world with chosen classmates', () => {
  it('the owner invites classmates, sees them by display name, and replaces the set on the next save', async () => {
    const { call, db, events, members } = backend(ava, { worlds: [world()] });
    const shared = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, members: [chloeId, benId] });
    expect(shared.status).toBe(200);
    expect(shared.body.world).toMatchObject({ visibility: 'members', canEdit: true, classCanEdit: false, ownerName: 'Ava R.', sharedAt: expect.any(String), members: [{ id: benId, displayName: 'Ben K.' }, { id: chloeId, displayName: 'Chloe M.' }] });
    expect(db.worlds[0]).toMatchObject({ class_visibility: 'members', class_can_edit: false });
    expect(members()).toEqual([benId, chloeId].sort());
    const narrowed = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: true, members: [benId] });
    expect(narrowed.body.world).toMatchObject({ classCanEdit: true, members: [{ id: benId, displayName: 'Ben K.' }] });
    expect(members()).toEqual([benId]);
    // Omitting the list keeps the current invitees (changing look/build only).
    const kept = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false });
    expect(kept.body.world).toMatchObject({ classCanEdit: false, members: [{ id: benId, displayName: 'Ben K.' }] });
    expect(members()).toEqual([benId]);
    expect(db.audit_events.map(row => row.action)).toEqual(['share_world', 'share_world', 'share_world']);
    expect(events.filter(event => event.change === 'membership')).toEqual(Array(3).fill({ worldId: treehouse, reason: 'sharing_updated', change: 'membership' }));
    expect(events.filter(event => event.change === 'invitation')).toEqual([chloeId, benId].map(userId => ({ worldId: treehouse, userId, reason: 'invite_added', change: 'invitation' })));
  });
  it('unsharing, or widening to the whole class, removes the invitees', async () => {
    const unshared = backend(ava, { worlds: [invited()], members: benInvited() });
    const result = await unshared.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'private', canEdit: false });
    expect(result.body.world).toMatchObject({ visibility: 'private', sharedAt: null });
    expect(result.body.world).not.toHaveProperty('members');
    expect(unshared.members()).toEqual([]);
    expect(unshared.db.audit_events.map(row => row.action)).toEqual(['unshare_world']);
    vi.restoreAllMocks();
    const widened = backend(ava, { worlds: [invited()], members: benInvited() });
    expect((await widened.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'class', canEdit: true })).body.world).toMatchObject({ visibility: 'class', classCanEdit: true });
    expect(widened.members()).toEqual([]);
  });
  it('validates the list: same class, active, not the owner, at most the cap, at least one; a refused list changes nothing', async () => {
    const { call, db, members, events } = backend(ava, { worlds: [world()] });
    const refused = async (body: Row, code: string) => {
      const result = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, ...body });
      expect(result.status).toBe(400); expect(result.body.code).toBe(code);
    };
    await refused({ members: [cyId] }, 'invalid_member');
    await refused({ members: [pausedId] }, 'invalid_member');
    await refused({ members: [benId, avaId] }, 'invalid_member');
    await refused({ members: [benId, '11111111-1111-4111-8111-0000000000ff'] }, 'invalid_member');
    await refused({ members: ['ben'] }, 'invalid_input');
    await refused({ members: 'ben' }, 'invalid_input');
    await refused({ members: [] }, 'invalid_input');
    await refused({}, 'invalid_input');
    await refused({ members: Array.from({ length: WORLD_MEMBER_LIMIT + 1 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`) }, 'too_many_members');
    expect(db.worlds[0].class_visibility).toBe('private');
    expect(members()).toEqual([]);
    expect(events).toEqual([]);
    // Duplicates collapse.
    expect((await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, members: [benId, benId, chloeId] })).body.world.members).toHaveLength(2);
    // A refused list against a populated set leaves the set alone, including an empty one.
    await refused({ members: [] }, 'invalid_input');
    await refused({ members: [benId, cyId] }, 'invalid_member');
    expect(members()).toEqual([benId, chloeId].sort());
    expect((await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'everyone', canEdit: false })).status).toBe(400);
  });
  it('keeps the class rules on the sharing call: sharing off refuses, and only the student owner may invite', async () => {
    const off = backend(ava, { classes: [{ ...period3(), students_can_share: false }], worlds: [world()] });
    expect((await off.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, members: [benId] })).body.code).toBe('sharing_disabled');
    expect(off.members()).toEqual([]);
    vi.restoreAllMocks();
    const classmate = backend(ben, { worlds: [invited()], members: benInvited() });
    expect((await classmate.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: true, members: [chloeId] })).body.code).toBe('owner_required');
    expect(classmate.members()).toEqual([benId]);
  });
  it('an invited classmate can open, visit and (with editing) build in the world; the teacher sees it', async () => {
    const look = backend(ben, { worlds: [invited()], members: benInvited() });
    const seen = await look.call('GET', `worlds/${treehouse}`);
    expect(seen.status).toBe(200);
    expect(seen.body.world).toMatchObject({ visibility: 'members', canEdit: false, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: classId, sharedAt: '2026-09-15T10:00:00Z' });
    expect(seen.body.world).not.toHaveProperty('members');
    expect((await look.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).body.code).toBe('read_only');
    expect((await look.call('POST', `worlds/${treehouse}/copy`)).status).toBe(201);
    await expect(look.service.worldAccess(ben, treehouse, true, true)).resolves.toMatchObject({ canEdit: false, isOwner: false, ownerName: 'Ava R.', ownerClassId: classId });
    vi.restoreAllMocks();
    const build = backend(ben, { worlds: [invited({ class_can_edit: true })], members: benInvited() });
    expect((await build.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).status).toBe(200);
    await expect(build.service.worldAccess(ben, treehouse, true, true)).resolves.toMatchObject({ canEdit: true, isOwner: false });
    await expect(build.service.worldAccess(ava, treehouse, true, true)).resolves.toMatchObject({ canEdit: true, isOwner: true });
    await expect(build.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: true, isOwner: false, ownerName: 'Ava R.' });
    expect((await backend(teacher, { worlds: [invited({ class_can_edit: true })], members: benInvited() }).call('GET', `worlds/${treehouse}`)).body.world).toMatchObject({ visibility: 'members', hiddenByTeacher: false });
  });
  it('a classmate who was not invited, another class and its teacher all get not found', async () => {
    const uninvited = backend(chloe, { worlds: [invited({ class_can_edit: true })], members: benInvited() });
    expect((await uninvited.call('GET', `worlds/${treehouse}`)).status).toBe(404);
    expect((await uninvited.call('POST', `worlds/${treehouse}/copy`)).status).toBe(404);
    await expect(uninvited.service.worldAccess(chloe, treehouse, true, true)).rejects.toMatchObject({ status: 404, code: 'not_found' });
    vi.restoreAllMocks();
    const other = backend(cy, { worlds: [invited()], members: [...benInvited(), { world_id: treehouse, user_id: cyId }] });
    expect((await other.call('GET', `worlds/${treehouse}`)).status).toBe(404);
    await expect(other.service.worldAccess(otherTeacher, treehouse)).rejects.toMatchObject({ status: 404 });
  });
  it('hide, closed collaboration, sharing off and a suspended owner still apply to invitees; removal closes their access', async () => {
    const hidden = backend(ben, { worlds: [invited({ hidden_by_teacher: true })], members: benInvited() });
    expect((await hidden.call('GET', `worlds/${treehouse}`)).body.code).toBe('world_hidden');
    await expect(hidden.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: false });
    vi.restoreAllMocks();
    const closed = backend(ben, { classes: [{ ...period3(), collaboration_open: false }], worlds: [invited()], members: benInvited() });
    expect((await closed.call('GET', `worlds/${treehouse}`)).body.code).toBe('class_closed');
    vi.restoreAllMocks();
    const off = backend(ben, { classes: [{ ...period3(), students_can_share: false }], worlds: [invited()], members: benInvited() });
    expect((await off.call('GET', `worlds/${treehouse}`)).body.code).toBe('sharing_disabled');
    vi.restoreAllMocks();
    const paused = backend(ben, { worlds: [invited()], members: benInvited() });
    paused.db.students.find(row => row.user_id === avaId)!.suspended = true;
    expect((await paused.call('GET', `worlds/${treehouse}`)).status).toBe(404);
    vi.restoreAllMocks();
    // The owner drops Ben: his next re-authorization is not found, exactly as an unshare.
    const dropped = backend(ava, { worlds: [invited()], members: benInvited() });
    await dropped.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, members: [chloeId] });
    await expect(dropped.service.worldAccess(ben, treehouse, true, true)).rejects.toMatchObject({ status: 404 });
    await expect(dropped.service.worldAccess(chloe, treehouse, true, true)).resolves.toMatchObject({ canEdit: false });
  });
  it('lists the invite picker: active classmates of the caller by display name, never the caller, suspended or other classes', async () => {
    const { call } = backend(ava, { worlds: [] });
    const result = await call('GET', `classes/${classId}/classmates`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ classmates: [{ id: benId, displayName: 'Ben K.' }, { id: chloeId, displayName: 'Chloe M.' }] });
    expect((await call('GET', `classes/${otherClassId}/classmates`)).status).toBe(404);
    vi.restoreAllMocks();
    expect((await backend(teacher, { worlds: [] }).call('GET', `classes/${classId}/classmates`)).body.classmates).toHaveLength(3);
  });
});

describe('durable recipient invitation state', () => {
  it.each(['members', 'class'] as const)('routes a %s personal-world resend to a kicked 2D account and admits only that recipient', async visibility => {
    const id = crypto.randomUUID();
    const { db } = backend(ava, { worlds: [invited({ id, class_visibility: visibility, class_can_edit: true, document: createPlatformerDocument(createBlankLevel(40, 20, 'Reinvite route')) })], members: visibility === 'members' ? [{ world_id: id, user_id: benId }, { world_id: id, user_id: chloeId }] : [] });
    const routedEnv = { ...workerEnv, ...env, CLASSROOM_TICKET_SECRET: 'synthetic-reinvite-secret-'.repeat(3) } as Env;
    const route = (method: string, path: string, input?: unknown) => handleReleaseRequest(new Request(`https://worker.test${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) }), routedEnv);
    const open = async (caller: Caller) => {
      vi.mocked(ClassroomService.prototype.authenticate).mockResolvedValue(caller);
      const ticketResponse = await route('POST', `/classroom/worlds/${id}/platformer-ticket`);
      expect(ticketResponse.status).toBe(200);
      const { ticket } = await ticketResponse.json<{ ticket: string }>();
      const stub = routedEnv.PLATFORMER_ROOMS.get(routedEnv.PLATFORMER_ROOMS.idFromName(id.replaceAll('-', '')));
      await runInDurableObject(stub, async (instance: PlatformerRoom) => { Object.assign((instance as unknown as { env: object }).env, env); });
      const response = await handleReleaseRequest(new Request(`https://worker.test/platformer/worlds/${id}/connect?ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: 'websocket' } }), routedEnv);
      expect(response.status).toBe(101);
      const socket = response.webSocket!;
      sockets.push(socket);
      const inbox = new Inbox(socket);
      socket.accept();
      send(socket, { type: 'hello', v: PROTOCOL, name: 'Untrusted', key: 'untrusted' });
      return { socket, inbox };
    };
    const owner = await open(ava); await owner.inbox.next('welcome');
    const benJoined = await open(ben), chloeJoined = await open(chloe);
    const benWelcome = await benJoined.inbox.next('welcome'), chloeWelcome = await chloeJoined.inbox.next('welcome');
    send(owner.socket, { type: 'settings', buildLocked: true });
    send(owner.socket, { type: 'kick', num: benWelcome.you });
    expect(await benJoined.inbox.next('error')).toMatchObject({ code: 'kicked' });
    send(owner.socket, { type: 'kick', num: chloeWelcome.you });
    expect(await chloeJoined.inbox.next('error')).toMatchObject({ code: 'kicked' });
    expect(await (await open(ben)).inbox.next('error')).toMatchObject({ code: 'kicked' });
    vi.mocked(ClassroomService.prototype.authenticate).mockResolvedValue(ava);
    expect((await route('PATCH', `/classroom/worlds/${id}/sharing`, { visibility, canEdit: true, ...(visibility === 'members' ? { members: [benId, chloeId] } : {}) })).status).toBe(200);
    expect(await (await open(ben)).inbox.next('error')).toMatchObject({ code: 'kicked' });
    vi.mocked(ClassroomService.prototype.authenticate).mockResolvedValue(ava);
    for (const userIds of [[benId, cyId], [pausedId], [avaId]]) expect((await route('POST', `/classroom/worlds/${id}/invites`, { userIds })).status).toBe(400);
    const resent = await route('POST', `/classroom/worlds/${id}/invites`, { userIds: [benId] });
    expect(resent.status).toBe(200);
    const restored = await open(ben);
    expect(await restored.inbox.next('welcome')).toMatchObject({ host: false });
    send(restored.socket, { type: 'ev', cid: 'restored-locked', tick: 5, ev: { t: 'edit', ops: [{ o: 'tile', x: 2, y: 2, t: 3, c: 0 }] } });
    expect(await restored.inbox.next('reject')).toMatchObject({ reason: 'locked' });
    expect(await (await open(chloe)).inbox.next('error')).toMatchObject({ code: 'kicked' });
    expect(db.world_members).toHaveLength(visibility === 'members' ? 2 : 1);
    expect(db.worlds[0].class_visibility).toBe(visibility);
    vi.mocked(ClassroomService.prototype.authenticate).mockResolvedValue(ben);
    const recipient = await (await route('GET', '/classroom/invites')).json<{ invites: Array<{ id: string }> }>();
    expect(recipient).toMatchObject({ invites: [{ worldId: id, seenAt: null, joinedAt: null }] });
    const acknowledged = await route('PATCH', `/classroom/invites/${recipient.invites[0].id}`, { joined: true });
    expect(acknowledged.status).toBe(200);
    expect(await acknowledged.json()).toMatchObject({ invite: { worldId: id, seenAt: expect.any(String), joinedAt: expect.any(String) } });
  });
  it('preserves unchanged IDs, timestamps and acknowledgements; removed and re-added members get a new invite', async () => {
    const { call, db, events } = backend(ava, { worlds: [invited()], members: [{ ...benInvited()[0], seen_at: arrival, joined_at: arrival }] });
    const original = { ...db.world_members[0] };
    await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: true, members: [benId, chloeId] });
    expect(db.world_members.find(row => row.user_id === benId)).toEqual(original);
    const added = db.world_members.find(row => row.user_id === chloeId)!;
    expect(added).toMatchObject({ invite_id: expect.any(String), invited_at: expect.any(String), seen_at: null, joined_at: null });
    expect(added.invite_id).not.toBe(original.invite_id);
    await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, members: [chloeId] });
    await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'members', canEdit: false, members: [chloeId, benId] });
    expect(db.world_members.find(row => row.user_id === benId)).toMatchObject({ seen_at: null, joined_at: null });
    expect(db.world_members.find(row => row.user_id === benId)!.invite_id).not.toBe(original.invite_id);
    expect(db.world_members.find(row => row.user_id === chloeId)).toEqual(added);
    expect(events.filter(event => event.change === 'membership')).toHaveLength(3);
    expect(events.filter(event => event.change === 'invitation')).toEqual([chloeId, benId].map(userId => ({ worldId: treehouse, userId, reason: 'invite_added', change: 'invitation' })));
  });
  it('lists only the current recipient with current access and format using batched metadata reads', async () => {
    const second = '44444444-4444-4444-8444-00000000000b';
    const { call, db, fetcher } = backend(ben, { worlds: [invited(), invited({ id: second, title: '2D Runway', doc_format: PLATFORMER_FORMAT, class_can_edit: true })], members: [...benInvited(), { world_id: treehouse, user_id: chloeId }, { world_id: second, user_id: benId }] });
    const result = await call('GET', 'invites?presence=1');
    expect(result.status).toBe(200);
    expect(result.body.invites).toHaveLength(2);
    expect(result.body.invites.find((invite: Row) => invite.worldId === treehouse)).toEqual({ id: db.world_members[0].invite_id, worldId: treehouse, title: 'Treehouse Hideout', ownerName: 'Ava R.', format: 'brick', canEdit: false, invitedAt: arrival, seenAt: null, joinedAt: null });
    expect(result.body.invites.find((invite: Row) => invite.worldId === second)).toMatchObject({ format: '2d', canEdit: true });
    const reads = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(reads).toHaveLength(4); // class + memberships + world metadata + owner roster, independent of invite count
    expect(reads.filter(url => url.pathname.endsWith('brick_worlds'))).toHaveLength(1);
    expect(reads.find(url => url.pathname.endsWith('brick_worlds'))!.searchParams.get('select')).toContain('doc_format:document->>format');
    expect(reads.find(url => url.pathname.endsWith('brick_worlds'))!.searchParams.get('select')!.split(',')).not.toContain('document');
    expect(JSON.stringify(result.body)).not.toContain('document');
  });
  it('omits hidden, private, group, suspended-owner and other-class worlds, and closed/disabled sharing', async () => {
    for (const changes of [{ hidden_by_teacher: true }, { class_visibility: 'private' }, { kind: 'group', class_id: classId }, { owner_id: pausedId }, { owner_id: cyId }]) {
      const { call } = backend(ben, { worlds: [invited(changes)], members: benInvited() });
      expect((await call('GET', 'invites')).body.invites).toEqual([]);
      vi.restoreAllMocks();
    }
    const classWide = backend(ben, { worlds: [invited({ class_visibility: 'class' })] });
    expect((await classWide.call('GET', 'invites')).body.invites).toEqual([]); // class access does not invent invitations
    vi.restoreAllMocks();
    for (const changes of [{ collaboration_open: false }, { students_can_share: false }]) {
      const { call } = backend(ben, { classes: [{ ...period3(), ...changes }], worlds: [invited()], members: benInvited() });
      expect((await call('GET', 'invites')).body.invites).toEqual([]);
      vi.restoreAllMocks();
    }
    expect((await backend(teacher, { worlds: [invited()], members: benInvited() }).call('GET', 'invites')).body.invites).toEqual([]);
  });
  it('acknowledges only the authenticated recipient, is idempotent and rejects inaccessible or stale invites', async () => {
    const { call, db } = backend(ben, { worlds: [invited()], members: [...benInvited(), { world_id: treehouse, user_id: chloeId }] });
    const id = db.world_members[0].invite_id, otherId = db.world_members[1].invite_id;
    expect((await call('PATCH', `invites/${otherId}`, { seen: true })).status).toBe(404);
    for (const invalid of [{ seen: false }, { seen: true, joined: true }, { joined: true, canEdit: true }, {}]) expect((await call('PATCH', `invites/${id}`, invalid)).status).toBe(400);
    const seen = await call('PATCH', `invites/${id}`, { seen: true });
    expect(seen.body.invite).toMatchObject({ seenAt: expect.any(String), joinedAt: null, canEdit: false });
    const joined = await call('PATCH', `invites/${id}`, { joined: true });
    expect(joined.body.invite).toMatchObject({ seenAt: seen.body.invite.seenAt, joinedAt: expect.any(String), canEdit: false });
    expect((await call('PATCH', `invites/${id}`, { joined: true })).body).toEqual(joined.body);
    db.worlds[0].hidden_by_teacher = true;
    expect((await call('PATCH', `invites/${id}`, { seen: true })).status).toBe(404);
    db.worlds[0].hidden_by_teacher = false;
    db.world_members = db.world_members.filter(row => row.invite_id !== id);
    expect((await call('PATCH', `invites/${id}`, { joined: true })).status).toBe(404);
    expect(db.worlds[0].class_can_edit).toBe(false);
  });
  it('resends only targeted existing invitees, invalidating their old IDs while preserving other recipients', async () => {
    const { call, db, events } = backend(ava, { worlds: [invited()], members: [{ ...benInvited()[0], seen_at: arrival, joined_at: arrival }, { world_id: treehouse, user_id: chloeId, seen_at: arrival }] });
    const old = { ...db.world_members[0] }, untouched = { ...db.world_members[1] };
    const result = await call('POST', `worlds/${treehouse}/invites`, { userIds: [benId, benId] });
    expect(result.status).toBe(200);
    expect(result.body.invites).toHaveLength(1);
    expect(result.body.invites[0]).toMatchObject({ worldId: treehouse, invitedAt: expect.any(String), seenAt: null, joinedAt: null, canEdit: false });
    expect(result.body.invites[0].id).not.toBe(old.invite_id);
    expect(result.body.invites[0].invitedAt).not.toBe(arrival);
    expect(db.world_members[1]).toEqual(untouched);
    expect(db.world_members).toHaveLength(2);
    expect(events).toEqual([{ worldId: treehouse, userId: benId, reason: 'invite_resent', change: 'invitation' }]);
    expect(db.audit_events.map(row => row.action)).toEqual(['resend_world_invites']);
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(ben);
    expect((await call('PATCH', `invites/${old.invite_id}`, { joined: true })).status).toBe(404);
    expect((await call('GET', 'invites')).body.invites[0].id).toBe(result.body.invites[0].id);
  });
  it('refuses a non-owner resend, new/suspended/other-class targets and unavailable sharing without changing records', async () => {
    const { call, db } = backend(ava, { worlds: [invited()], members: [...benInvited(), { world_id: treehouse, user_id: cyId }, { world_id: treehouse, user_id: pausedId }] });
    const before = JSON.stringify(db.world_members);
    for (const userIds of [[benId, chloeId], [cyId], [pausedId], [], ['not-a-uuid']]) expect((await call('POST', `worlds/${treehouse}/invites`, { userIds })).status).toBe(400);
    expect(JSON.stringify(db.world_members)).toBe(before);
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(ben);
    expect((await call('POST', `worlds/${treehouse}/invites`, { userIds: [benId] })).body.code).toBe('owner_required');
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(ava);
    for (const [field, code] of [['collaboration_open', 'class_closed'], ['students_can_share', 'sharing_disabled']]) {
      db.classes[0][field] = false;
      expect((await call('POST', `worlds/${treehouse}/invites`, { userIds: [benId] })).body.code).toBe(code);
      db.classes[0][field] = true;
    }
    db.worlds[0].hidden_by_teacher = true;
    expect((await call('POST', `worlds/${treehouse}/invites`, { userIds: [benId] })).body.code).toBe('world_hidden');
    expect(JSON.stringify(db.world_members)).toBe(before);
  });
});
