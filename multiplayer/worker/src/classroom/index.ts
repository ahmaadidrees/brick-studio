import { studentPasswordError, validateBrickStudioDocument, type BrickStudioDocument } from '@brick-studio/core';
import { teacherGoogleAuthorizationUrl, validGoogleCodeVerifier } from './googleOAuth';
import { ClassroomBodyError, readClassroomBody } from './readBody';

export interface ClassroomEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  /** Trusted existing Supabase user UUIDs, never student-controlled metadata. */
  BRICK_TEACHER_IDS?: string;
}
/**
 * How a classroom mutation affects live sockets. The host Worker forwards it to
 * every affected WorldRoom, which never infers it from `reason` alone.
 * - `metadata`: the stored document/title/revision changed (rename, save, restore).
 *   Nobody loses access; rooms reload from Postgres and broadcast a snapshot.
 * - `membership`: who may be inside changed (member added, class settings, roster
 *   edits). Rooms re-authorize connected sessions in place and close only those
 *   now denied; an unavailable permission check closes them (fail closed).
 * - `revocation`: the named session(s) lost access (logout, password change or
 *   reset, suspension, member removal). Rooms close those sockets immediately.
 */
export type ClassroomAccessChangeKind = 'metadata' | 'membership' | 'revocation';
export type ClassroomAccessChange = { classId?: string; worldId?: string; userId?: string; reason: string; change: ClassroomAccessChangeKind };
export type ClassroomHandlerOptions = {
  onAccessChanged?: (event: ClassroomAccessChange) => Promise<void>;
  /** Distinct classroom accounts connected to these live rooms right now, or null when presence is unavailable. */
  liveParticipants?: (worldIds: string[]) => Promise<string[] | null>;
};
export type ClassroomSessionIdentity = { userId: string; sessionId: string; authVersion: number };
type Row = Record<string, any>;
export class ClassroomHttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Row = {}) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new ClassroomHttpError(status, code, message); };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
/** The provider's human-readable reason (GoTrue `msg`, `message` or `error_description`), bounded for display. */
const providerMessage = (data: Row | null): string | undefined => {
  const text = [data?.msg, data?.message, data?.error_description].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return text?.trim().slice(0, 200);
};
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const cleanText = (value: unknown, label: string, max = 80): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, 'invalid_input', `${label} is required (up to ${max} characters).`);
  return (value as string).trim();
};
export function normalizeUsername(value: unknown): string {
  const name = cleanText(value, 'Username', 24);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,23}$/.test(name)) fail(400, 'invalid_username', 'Use 3–24 letters, numbers, underscores or hyphens.');
  return name;
}
function password(value: unknown, minimum = 8): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > 128) fail(400, 'invalid_password', `Use a password with ${minimum}–128 characters.`);
  return value as string;
}
function newStudentPassword(value: unknown, username?: string): string {
  const error = studentPasswordError(value, username);
  if (error) fail(400, 'invalid_password', error);
  return value as string;
}
export function sessionId(token: string): string {
  try {
    const part = token.split('.')[1];
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.session_id === 'string' && uuid(payload.session_id)) return payload.session_id;
  } catch { /* Decoding is never authentication: getUser verifies the token separately. */ }
  return fail(401, 'invalid_session', 'Please sign in again.');
}
export class ClassroomService {
  private credentialLease: { userId: string; token: string; deadline: number } | null = null;
  constructor(public env: ClassroomEnv, private fetcher: typeof fetch = fetch) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) fail(503, 'classroom_unavailable', 'Classroom accounts are not configured yet. Guest building is still available.');
  }
  async request(path: string, init: RequestInit = {}, token?: string): Promise<any> {
    if (this.credentialLease && Date.now() >= this.credentialLease.deadline) fail(409, 'account_busy', 'The account update expired. Please wait a few minutes and try again.');
    const response = await this.fetcher.call(globalThis, `${this.env.SUPABASE_URL!.replace(/\/$/, '')}${path}`, {
      signal: AbortSignal.timeout(15_000), ...init,
      headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${token || this.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation', ...init.headers },
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null) as Row | null;
    if (!response.ok) {
      if (data?.code === 'P0001' && ['brick_student_quota', 'brick_world_quota'].includes(data.message)) fail(409, 'quota_exceeded', data.message === 'brick_student_quota' ? 'This class has reached its student limit. Ask your teacher for help.' : 'You have reached the saved-world limit. Ask your teacher for help.');
      if (data?.code === '23514' && /brick_(world|checkpoint)_document_size/.test(data.message || '')) fail(413, 'too_large', 'This world exceeds the storage size limit. Your previous saved version is unchanged.');
      if (data?.code === '23505') fail(409, 'already_exists', 'That username or code is already in use.');
      // Admin user writes (registration, temporary/reset passwords) carry no sign-in credentials: a 400/422 there is
      // the provider's own password policy (e.g. a stricter minimum length) and must not read as a sign-in failure.
      if (path.startsWith('/auth/v1/admin/') && (response.status === 400 || response.status === 422)) fail(400, 'invalid_password', providerMessage(data) ?? 'The account service did not accept that password. Try a longer one.');
      if (path.startsWith('/auth/') && (response.status === 400 || response.status === 401 || response.status === 422)) fail(401, 'invalid_credentials', 'Check your sign-in details and try again.');
      if (path.startsWith('/auth/') && !path.includes('/admin/') && response.status === 403) fail(401, 'session_revoked', 'Your session ended. Please sign in again.');
      if (response.status === 429) fail(429, 'rate_limited', 'Too many attempts. Please wait a few minutes.');
      fail(502, 'service_unavailable', 'The account service could not complete this request. Please retry.');
    }
    return data;
  }
  rows(table: string, filter = ''): Promise<Row[]> { return this.request(`/rest/v1/brick_${table}?${filter}`); }
  insert(table: string, data: Row): Promise<Row[]> { return this.request(`/rest/v1/brick_${table}`, { method: 'POST', body: JSON.stringify(data) }); }
  patch(table: string, filter: string, data: Row): Promise<Row[]> { return this.request(`/rest/v1/brick_${table}?${filter}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  remove(table: string, filter: string) { return this.request(`/rest/v1/brick_${table}?${filter}`, { method: 'DELETE' }); }
  rpc(name: string, data: Row): Promise<any> { return this.request(`/rest/v1/rpc/brick_${name}`, { method: 'POST', body: JSON.stringify(data) }); }
  /** Takes one token from the named bucket; false once it is empty. Throws only when the database cannot answer. */
  async takeRate(key: string, limit: number, seconds: number): Promise<boolean> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return (await this.rpc('take_rate_limit', { p_key: hashed, p_limit: limit, p_seconds: seconds })) === true;
  }
  async rate(key: string, limit: number, seconds: number) {
    if (!await this.takeRate(key, limit, seconds)) fail(429, 'rate_limited', 'Too many attempts. Please wait a few minutes.');
  }
  async authenticate(token: string, allowReset = false): Promise<Caller> {
    if (!token) fail(401, 'sign_in_required', 'Sign in to use classroom features.');
    const authUser = await this.request('/auth/v1/user', {}, token);
    const teachers = (this.env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim());
    if (teachers.includes(authUser.id)) {
      const sid = sessionId(token);
      const registered = (await this.rows('teacher_sessions', `session_id=eq.${sid}&user_id=eq.${authUser.id}&revoked=eq.false&limit=1`))[0];
      if (!registered) fail(401, 'session_revoked', 'Please sign in through Brickgineers again.');
      return { id: authUser.id, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, token, authVersion: 0, sessionId: sid };
    }
    const student = (await this.rows('students', `user_id=eq.${authUser.id}&limit=1`))[0];
    if (!student) fail(403, 'not_enrolled', 'This account is not enrolled in Brickgineers.');
    const sid = sessionId(token);
    const registered = (await this.rows('sessions', `session_id=eq.${sid}&user_id=eq.${authUser.id}&limit=1`))[0];
    if (!registered || registered.auth_version !== student.auth_version) fail(401, 'session_revoked', 'Your account changed. Please sign in again.');
    if (student.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.');
    if (student.reset_required && !allowReset) fail(403, 'password_change_required', 'Choose a new password to continue.');
    return { id: student.user_id, username: student.username, rosterName: student.roster_name, role: 'student', resetRequired: student.reset_required, classId: student.class_id, authVersion: student.auth_version, sessionId: sid, token };
  }
  async classFor(caller: Caller, id: string, teacherOnly = false): Promise<Row> {
    if (!uuid(id)) fail(404, 'not_found', 'Class not found.');
    const row = (await this.rows('classes', `id=eq.${id}&limit=1`))[0];
    if (!row || (caller.role === 'teacher' ? row.teacher_id !== caller.id : teacherOnly || caller.classId !== id)) fail(404, 'not_found', 'Class not found.');
    return row;
  }
  /** The world row when the caller may see it (404 otherwise). Use `worldAccess` when the caller's edit right matters. */
  async worldFor(caller: Caller, id: string, requireCollaboration = false, metadataOnly = false): Promise<Row> {
    return (await this.worldAccess(caller, id, requireCollaboration, metadataOnly)).world;
  }
  /**
   * Visibility and edit rights for one world, mirroring `brick_authorize_world` in the migration.
   * Personal worlds: the owner always sees and edits; a classmate (or the class teacher) sees a shared one
   * (`class_visibility='class'`, or `'members'` when brick_world_members lists the classmate) and edits only
   * with `class_can_edit`. Students are refused while the class has
   * collaboration closed or sharing disabled, or the teacher hid the world; the teacher may still look in those
   * states but never edits (`sharedEditAllowed`, the same rule `brick_commit_world` applies). A suspended owner's
   * shared world is not found for classmates (as `listWorlds` already hides it) and look-only for the teacher.
   * Class and group worlds keep their rules. The live-join flag stays in the signature for its callers; personal
   * worlds are joinable by ownership or sharing.
   */
  async worldAccess(caller: Caller, id: string, _requireCollaboration = false, metadataOnly = false): Promise<WorldAccess> {
    if (!uuid(id)) fail(404, 'not_found', 'World not found.');
    const world = (await this.rows('worlds', `id=eq.${id}&limit=1${metadataOnly ? `&select=${WORLD_FIELDS}` : ''}`))[0];
    if (!world) fail(404, 'not_found', 'World not found.');
    if (world.kind === 'personal') {
      if (world.owner_id === caller.id) return { world, canEdit: true, isOwner: true, ownerName: callerDisplayName(caller), ownerClassId: caller.classId ?? null };
      if (!isSharedVisibility(world.class_visibility)) fail(404, 'not_found', 'World not found.');
      const owner = (await this.rows('students', `user_id=eq.${world.owner_id}&select=class_id,roster_name,suspended&limit=1`))[0];
      if (!owner) fail(404, 'not_found', 'World not found.');
      const cls = await this.classFor(caller, owner.class_id);
      if (caller.role !== 'teacher') {
        // Invited classmates only: anyone else in the class gets the same not_found as a private world.
        if (world.class_visibility === 'members' && !(await this.rows('world_members', `world_id=eq.${id}&user_id=eq.${caller.id}&limit=1`)).length) fail(404, 'not_found', 'World not found.');
        if (owner.suspended) fail(404, 'not_found', 'World not found.');
        if (world.hidden_by_teacher) fail(403, 'world_hidden', 'Your teacher hid this world from the class.');
        if (!cls.collaboration_open) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.');
        if (cls.students_can_share === false) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.');
      }
      return { world, canEdit: sharedEditAllowed(world, cls, owner), isOwner: false, ownerName: rosterDisplayName(owner.roster_name), ownerClassId: owner.class_id };
    }
    const cls = await this.classFor(caller, world.class_id);
    if (caller.role !== 'teacher') {
      if (!cls.collaboration_open) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.');
      if (world.kind === 'group' && !(await this.rows('world_members', `world_id=eq.${id}&user_id=eq.${caller.id}&limit=1`)).length) fail(404, 'not_found', 'World not found.');
    }
    return { world, canEdit: true, isOwner: world.owner_id === caller.id, ownerName: 'Teacher', ownerClassId: world.class_id };
  }
  classesFor(caller: Caller): Promise<Row[]> {
    return this.rows('classes', caller.role === 'teacher' ? `teacher_id=eq.${caller.id}&order=created_at.asc` : `id=eq.${caller.classId}`);
  }
  /** IDs must come from classesFor: service-role queries do not enforce the caller's access. */
  private async rowsForClasses(table: string, classIds: string[], filter: string): Promise<Row[]> {
    const result: Row[] = [];
    // Bound URL length while keeping ordinary teacher accounts below the Worker subrequest limit.
    for (let start = 0; start < classIds.length; start += 50) {
      const ids = classIds.slice(start, start + 50);
      for (let offset = 0; ; offset += 1000) {
        const page = await this.rows(table, `class_id=in.(${ids.join(',')})&${filter}&limit=1000&offset=${offset}`);
        result.push(...page);
        if (page.length < 1000) break;
      }
    }
    return result;
  }
  /**
   * `buildingNow` is filled only when the route supplies live presence, which only a teacher's GET /classes does;
   * GET /me and sign-in responses report null so opening the app or logging in never fans out to live rooms.
   */
  async me(caller: Caller, liveParticipants?: ClassroomHandlerOptions['liveParticipants']) {
    const classes = await this.classesFor(caller);
    const codes = caller.role === 'teacher'
      ? await this.rowsForClasses('class_codes', classes.map(row => row.id), 'can_enroll=eq.true&select=class_id,code&order=class_id.asc,code.asc') : [];
    const building = caller.role === 'teacher' && liveParticipants ? await this.buildingNow(caller, classes, liveParticipants) : new Map<string, number | null>();
    return { user: { id: caller.id, username: caller.username, rosterName: caller.rosterName, role: caller.role, resetRequired: caller.resetRequired }, classes: classes.map(row => classView(row, codes.find(code => code.class_id === row.id)?.code, building.get(row.id) ?? null)) };
  }
  /** Live rooms per class: the class's own worlds plus its students' shared personal worlds. IDs must come from classesFor. */
  async liveWorldIdsByClass(classes: Row[]): Promise<Map<string, string[]>> {
    const ids = classes.map(row => row.id), byClass = new Map<string, string[]>(ids.map(id => [id, []]));
    for (const world of await this.rowsForClasses('worlds', ids, 'select=id,class_id')) byClass.get(world.class_id)?.push(world.id);
    const students = await this.rowsForClasses('students', ids, 'select=user_id,class_id');
    const classOf = new Map(students.map(row => [row.user_id, row.class_id]));
    for (const world of await this.sharedWorldsOf(students.map(row => row.user_id), 'select=id,owner_id')) byClass.get(classOf.get(world.owner_id))?.push(world.id);
    return byClass;
  }
  /**
   * Distinct accounts building in each class right now; null for a class whose presence could not be read.
   * Every live-capable world costs one Durable Object fetch (there is no registry of rooms that have ever opened,
   * so an idle id still instantiates a cold object that answers with nobody). The fan-out is therefore bounded
   * twice per request: at most PRESENCE_ROOM_LIMIT rooms in total, in class order (classes past the cap report
   * null), and at most PRESENCE_RATE.limit requests per teacher per PRESENCE_RATE.seconds (beyond it every class
   * reports null and the listing still succeeds). Classes with no live-capable world report 0 without a fetch.
   */
  private async buildingNow(caller: Caller, classes: Row[], liveParticipants: NonNullable<ClassroomHandlerOptions['liveParticipants']>): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>(classes.map(row => [row.id, null]));
    if (!classes.length) return result;
    const allowed = await this.takeRate(`presence:${caller.id}`, PRESENCE_RATE.limit, PRESENCE_RATE.seconds).catch(() => false);
    if (!allowed) return result;
    const byClass = await this.liveWorldIdsByClass(classes);
    let rooms = 0;
    for (const cls of classes) {
      const ids = byClass.get(cls.id) ?? [];
      if (!ids.length) { result.set(cls.id, 0); continue; }
      rooms += ids.length;
      if (rooms > PRESENCE_ROOM_LIMIT) break;
      const participants = await liveParticipants(ids);
      result.set(cls.id, participants ? new Set(participants).size : null);
    }
    return result;
  }
  async listWorlds(caller: Caller) {
    const mine = await this.rows('worlds', `owner_id=eq.${caller.id}&kind=eq.personal&select=${WORLD_FIELDS}&order=updated_at.desc`);
    const allClasses = await this.classesFor(caller);
    const classes = allClasses.filter(row => caller.role === 'teacher' || row.collaboration_open);
    const candidates = await this.rowsForClasses('worlds', classes.map(row => row.id), `kind=in.(class,group)&select=${WORLD_FIELDS}&order=updated_at.desc,id.asc`);
    // Classmates' shared personal worlds: resolved through the owners' brick_students rows (personal worlds keep
    // class_id null). Students need collaboration_open and students_can_share and never see hidden worlds; the
    // teacher sees every shared world of their classes, hidden ones flagged.
    const sharingClasses = classes.filter(row => caller.role === 'teacher' || row.students_can_share !== false);
    const owners = sharingClasses.length
      ? (await this.rowsForClasses('students', sharingClasses.map(row => row.id), `select=user_id,class_id,roster_name,suspended&order=user_id.asc`))
          .filter(row => row.user_id !== caller.id && (caller.role === 'teacher' || !row.suspended)) : [];
    const sharedByClassmates = await this.sharedWorldsOf(owners.map(row => row.user_id), `select=${WORLD_FIELDS}&order=updated_at.desc,id.asc${caller.role === 'teacher' ? '' : '&hidden_by_teacher=eq.false'}`);
    // One membership read covers assigned group worlds and classmates' members-only worlds.
    const memberships = caller.role === 'student' && (candidates.some(row => row.kind === 'group') || sharedByClassmates.some(row => row.class_visibility === 'members'))
      ? await this.rows('world_members', `user_id=eq.${caller.id}&select=world_id`) : [];
    const isMember = (world: Row) => memberships.some(member => member.world_id === world.id);
    const shared = candidates.filter(world => caller.role === 'teacher' || world.kind === 'class' || isMember(world));
    const fromClassmates = sharedByClassmates.filter(world => caller.role === 'teacher' || world.class_visibility !== 'members' || isMember(world));
    // Who a members-only world is shared with: reported to its owner and to the teacher, never to a fellow invitee.
    const membersByWorld = await this.membersOf([...mine, ...(caller.role === 'teacher' ? fromClassmates : [])].filter(world => world.class_visibility === 'members').map(world => world.id));
    const names = new Map(owners.map(row => [row.user_id, rosterDisplayName(row.roster_name)]));
    const classOf = new Map(owners.map(row => [row.user_id, row.class_id as string]));
    const ownerById = new Map(owners.map(row => [row.user_id as string, row]));
    const classById = new Map(sharingClasses.map(row => [row.id as string, row]));
    const view = (world: Row, canEdit: boolean, ownerName: string, ownerClassId: string | null) => worldView(world, { canEdit, ownerName, ownerClassId, teacher: caller.role === 'teacher', members: membersByWorld.get(world.id) });
    return [
      ...mine.map(world => view(world, true, callerDisplayName(caller), caller.classId ?? null)),
      ...shared.map(world => view(world, true, 'Teacher', world.class_id)),
      ...fromClassmates.map(world => view(world, sharedEditAllowed(world, classById.get(classOf.get(world.owner_id) ?? ''), ownerById.get(world.owner_id)), names.get(world.owner_id) ?? 'Classmate', classOf.get(world.owner_id) ?? null)),
    ];
  }
  /** Shared personal worlds (whole class or invited classmates) owned by the given students, in bounded batches. IDs must come from the caller's own classes. */
  async sharedWorldsOf(ownerIds: string[], filter: string): Promise<Row[]> {
    const result: Row[] = [];
    for (let start = 0; start < ownerIds.length; start += 100) {
      const ids = ownerIds.slice(start, start + 100);
      result.push(...await this.rows('worlds', `owner_id=in.(${ids.join(',')})&kind=eq.personal&class_visibility=in.(class,members)&${filter}`));
    }
    return result;
  }
  /** Invited classmates of members-only worlds, by world id, with display names. World ids must already be authorized for the caller. */
  async membersOf(worldIds: string[]): Promise<Map<string, WorldMemberSummary[]>> {
    const result = new Map<string, WorldMemberSummary[]>();
    if (!worldIds.length) return result;
    const rows: Row[] = [];
    for (let start = 0; start < worldIds.length; start += 100) rows.push(...await this.rows('world_members', `world_id=in.(${worldIds.slice(start, start + 100).join(',')})&select=world_id,user_id`));
    const userIds = [...new Set(rows.map(row => row.user_id as string))];
    const names = new Map<string, string>();
    for (let start = 0; start < userIds.length; start += 100) {
      for (const row of await this.rows('students', `user_id=in.(${userIds.slice(start, start + 100).join(',')})&select=user_id,roster_name`)) names.set(row.user_id, rosterDisplayName(row.roster_name));
    }
    for (const id of worldIds) result.set(id, []);
    for (const row of rows) { const name = names.get(row.user_id); if (name !== undefined) result.get(row.world_id)?.push({ id: row.user_id, displayName: name }); }
    for (const list of result.values()) list.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
    return result;
  }
  /**
   * Replaces the invitees of the caller's members-only world. Every id must be an active student of the owner's
   * class other than the owner; one to WORLD_MEMBER_LIMIT of them. Validation completes before the set is touched,
   * so a refused list changes nothing. Returns the resulting member ids.
   */
  async replaceMembers(caller: Caller, worldId: string, members: unknown): Promise<string[]> {
    if (!Array.isArray(members) || members.some(id => typeof id !== 'string' || !uuid(id))) fail(400, 'invalid_input', 'members must be a list of student ids.');
    const ids = [...new Set(members as string[])];
    if (ids.includes(caller.id)) fail(400, 'invalid_member', 'You already own this world.');
    if (ids.length > WORLD_MEMBER_LIMIT) fail(400, 'too_many_members', `Pick up to ${WORLD_MEMBER_LIMIT} classmates.`);
    if (!ids.length) fail(400, 'invalid_input', 'Pick at least one classmate.');
    const found = new Set((await this.rows('students', `class_id=eq.${caller.classId}&user_id=in.(${ids.join(',')})&suspended=eq.false&select=user_id`)).map(row => row.user_id));
    if (ids.some(id => !found.has(id))) fail(400, 'invalid_member', 'Choose active students in your class.');
    await this.remove('world_members', `world_id=eq.${worldId}`);
    await this.request('/rest/v1/brick_world_members?on_conflict=world_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(ids.map(user_id => ({ world_id: worldId, user_id }))) });
    return ids;
  }
  async login(email: string, pass: string) { return this.request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: pass }) }); }
  async registerSession(session: Row, student: Row) {
    await this.request('/rest/v1/brick_sessions?on_conflict=session_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ session_id: sessionId(session.access_token), user_id: student.user_id, auth_version: student.auth_version }) });
  }
  async registerTeacherSession(session: Row) {
    const authUser = await this.request('/auth/v1/user', {}, session.access_token);
    if (!(this.env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim()).includes(authUser.id)) fail(403, 'teacher_required', 'This account is not configured as a teacher.');
    await this.request('/rest/v1/brick_teacher_sessions?on_conflict=session_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ session_id: sessionId(session.access_token), user_id: authUser.id }) });
  }
  async authResult(session: Row) {
    const caller = await this.authenticate(session.access_token, true);
    return { ...await this.me(caller), session: { accessToken: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in } };
  }
  async audit(caller: Caller, action: string, classId?: string, targetId?: string) {
    await this.insert('audit_events', { actor_id: caller.id, action, class_id: classId || null, target_id: targetId || null });
  }
  async withCredentialLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const token = crypto.randomUUID();
    if (!await this.rpc('acquire_credential_lock', { p_user_id: userId, p_token: token })) fail(409, 'account_busy', 'An account update is already in progress. Wait a moment and try again.');
    this.credentialLease = { userId, token, deadline: Date.now() + 120_000 };
    try {
      const result = await operation();
      this.credentialLease = null;
      await this.remove('credential_locks', `user_id=eq.${userId}&token=eq.${token}`);
      return result;
    } catch (error) {
      this.credentialLease = null;
      // An uncertain provider write must not race a retry. Network/5xx failures keep
      // the bounded lease until expiry; ordinary validated failures can release it.
      if (error instanceof ClassroomHttpError && error.status < 500) await this.remove('credential_locks', `user_id=eq.${userId}&token=eq.${token}`);
      throw error;
    }
  }
}
export type Caller = { id: string; username: string; rosterName: string; role: 'teacher' | 'student'; resetRequired: boolean; classId?: string; authVersion: number; sessionId: string; token: string };
/** `teacherName` is null: teacher accounts are bare auth users with no roster name in the brick tables. */
function classView(row: Row, code?: string, buildingNow: number | null = null) { return { id: row.id, name: row.name, loginCode: row.login_code, enrollmentOpen: row.enrollment_open, collaborationOpen: row.collaboration_open, showNamesOnJoin: row.show_names_on_join !== false, studentsCanShare: row.students_can_share !== false, buildingNow, teacherName: null, ...(code ? { code } : {}) }; }
/**
 * Whether a non-owner may edit a shared personal world right now: shared with editing, not hidden by the teacher,
 * the owner not suspended, and the owner's class has collaboration open and sharing on. Mirrors the checks
 * `brick_commit_world` makes, so the teacher (who may still look in those states) is never offered an edit right the
 * save would refuse.
 */
function sharedEditAllowed(world: Row, cls: Row | undefined, owner: Row | undefined): boolean {
  return isSharedVisibility(world.class_visibility) && world.class_can_edit === true && world.hidden_by_teacher !== true
    && owner?.suspended !== true && cls?.collaboration_open === true && cls.students_can_share !== false;
}
/** Owner label for the caller's own worlds: students by first name and last initial, teachers as "Teacher". */
function callerDisplayName(caller: Caller) { return caller.role === 'teacher' ? 'Teacher' : rosterDisplayName(caller.rosterName); }
/** Public join-screen name: first word of the roster name plus the last initial ("Ava R."); one-word names stay as is. */
export function rosterDisplayName(rosterName: string): string {
  const words = rosterName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] || '';
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
}
/** Usernames are global. Throws 409 username_taken with free variants; `excludeUserId` lets a student keep their own name. */
async function assertUsernameFree(service: ClassroomService, username: string, excludeUserId?: string) {
  const key = username.toLowerCase();
  const taken = await service.rows('students', `username_key=eq.${encodeURIComponent(key)}${excludeUserId ? `&user_id=neq.${excludeUserId}` : ''}&select=user_id&limit=1`);
  if (!taken.length) return;
  throw new ClassroomHttpError(409, 'username_taken', 'That username is already taken. Try one of these or choose another.', { suggestions: await usernameSuggestions(service, username) });
}
/** Three free variants of a taken username, checked against the database in one query per batch. */
export async function usernameSuggestions(service: ClassroomService, username: string, count = 3): Promise<string[]> {
  const stem = (suffix: string) => `${username.slice(0, 24 - suffix.length)}${suffix}`;
  const random = () => String(10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 90));
  const batches = [['2', '3', '7', '4', '5', '8', '9', '6'].map(stem), Array.from({ length: 8 }, () => stem(random())), Array.from({ length: 8 }, () => stem(`_${random()}`))];
  const free: string[] = [];
  for (const batch of batches) {
    const candidates = [...new Set(batch)].filter(name => !free.includes(name));
    const keys = candidates.map(name => name.toLowerCase());
    const taken = new Set((await service.rows('students', `username_key=in.(${keys.map(encodeURIComponent).join(',')})&select=username_key`)).map(row => row.username_key));
    for (const name of candidates) if (!taken.has(name.toLowerCase()) && free.length < count) free.push(name);
    if (free.length >= count) break;
  }
  return free;
}
/** Resolves a public class code to its alias and class rows, or 404 class_not_found. Rotated codes still identify the class. */
async function publicClass(service: ClassroomService, input: Row): Promise<{ alias: Row; cls: Row }> {
  const code = cleanText(input.classCode, 'Class code', 40).toUpperCase();
  const alias = (await service.rows('class_codes', `code=eq.${encodeURIComponent(code)}&limit=1`))[0];
  const cls = alias && (await service.rows('classes', `id=eq.${alias.class_id}&limit=1`))[0];
  if (!alias || !cls) fail(404, 'class_not_found', 'Check the class code with your teacher.');
  return { alias, cls };
}
/** Columns the API exposes without the document; the sharing columns come from migration 202609190001. */
const WORLD_FIELDS = 'id,title,owner_id,class_id,kind,revision,updated_at,class_visibility,class_can_edit,hidden_by_teacher,class_shared_at';
/** Most live rooms one GET /classes will ask for presence, across all of the teacher's classes. */
export const PRESENCE_ROOM_LIMIT = 150;
/** Presence fan-outs allowed per teacher: beyond it `buildingNow` is null until the window passes. */
export const PRESENCE_RATE = { limit: 30, seconds: 60 } as const;
/** Saved worlds per account; the database trigger (0003) enforces the same bound. */
const WORLD_LIMIT = 50;
/** Invited classmates per members-only world. */
export const WORLD_MEMBER_LIMIT = 30;
/** Personal-world sharing states that admit someone other than the owner (migration 202609210001). */
const isSharedVisibility = (value: unknown): value is 'class' | 'members' => value === 'class' || value === 'members';
type WorldMemberSummary = { id: string; displayName: string };
type WorldAccess = { world: Row; canEdit: boolean; isOwner: boolean; ownerName: string; ownerClassId: string | null };
type WorldViewContext = { full?: boolean; canEdit?: boolean; ownerName?: string; ownerClassId?: string | null; teacher?: boolean; members?: WorldMemberSummary[] };
function worldView(row: Row, context: WorldViewContext = {}) {
  const visibility = row.kind === 'personal' ? (isSharedVisibility(row.class_visibility) ? row.class_visibility : 'private') : 'class';
  return {
    id: row.id, title: row.title, ownerId: row.owner_id, classId: row.class_id, kind: row.kind, revision: row.revision, updatedAt: row.updated_at,
    visibility, canEdit: context.canEdit ?? true, classCanEdit: row.kind === 'personal' ? row.class_can_edit === true : true, ownerName: context.ownerName ?? 'Teacher', ownerClassId: context.ownerClassId ?? row.class_id ?? null,
    sharedAt: row.kind === 'personal' && visibility !== 'private' ? row.class_shared_at ?? null : null,
    ...(context.members ? { members: context.members } : {}),
    ...(context.teacher ? { hiddenByTeacher: row.hidden_by_teacher === true } : {}), ...(context.full ? { document: row.document } : {}),
  };
}
const accessView = (access: WorldAccess, caller: Caller, full = false) => worldView(access.world, { full, canEdit: access.canEdit, ownerName: access.ownerName, ownerClassId: access.ownerClassId, teacher: caller.role === 'teacher' });
/** View context for a world the caller just created or copied. */
const ownView = (caller: Caller, full = true): WorldViewContext => ({ full, canEdit: true, ownerName: callerDisplayName(caller), ownerClassId: caller.classId ?? null, teacher: caller.role === 'teacher' });
function studentView(row: Row) { return { id: row.user_id, username: row.username, rosterName: row.roster_name, suspended: row.suspended, resetRequired: row.reset_required }; }
function bearer(request: Request) { return request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] || ''; }
function internalEmail(id: string) { return `brick-${id}@students.invalid`; }
function newCode() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(10)), n => alphabet[n % alphabet.length]).join(''); }
async function body(request: Request): Promise<Row> {
  return readClassroomBody(request);
}
function document(value: unknown) {
  const result = validateBrickStudioDocument(value);
  if (!result.ok) fail(400, 'invalid_document', 'This world is incomplete or invalid. Your existing saved world has not been replaced.');
  return result.ok ? result.document : null;
}
function expectedRevision(value: unknown): number { if (!Number.isInteger(value) || (value as number) < 1) fail(400, 'invalid_revision', 'A valid expectedRevision is required.'); return value as number; }

/** The host Worker owns CORS and invokes this before its legacy routes. */
export async function handleClassroomRequest(request: Request, env: ClassroomEnv, options: ClassroomHandlerOptions = {}): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/classroom/')) return null;
  try { return await route(request, new ClassroomService(env), url.pathname.slice('/classroom/'.length).split('/'), options); }
  catch (error) {
    if (error instanceof ClassroomHttpError) return json({ error: error.message, code: error.code, ...error.details }, error.status);
    if (error instanceof ClassroomBodyError) return json({ error: error.message, code: error.code }, error.status);
    console.error('classroom_internal_error', error instanceof Error ? error.name : typeof error, error instanceof Error ? error.stack?.split('\n').slice(1, 4).join('\n') : '');
    return json({ error: 'The classroom service could not complete this request. Please retry.', code: 'internal_error' }, 500);
  }
}

async function route(request: Request, service: ClassroomService, path: string[], options: ClassroomHandlerOptions): Promise<Response> {
  const method = request.method;
  if (path[0] === 'auth' && method === 'POST') {
    const input = path[1] === 'logout' ? {} : await body(request);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    // A full class shares one school NAT: account-level buckets do the tight throttling.
    await service.rate(`ip:${ip}`, 600, 600);
    if (path[1] === 'class') {
      const { alias, cls } = await publicClass(service, input);
      return json({ name: cls.name, canEnroll: Boolean(alias.can_enroll && cls.enrollment_open) });
    }
    if (path[1] === 'roster') {
      // Public tap-your-name list for the join screen: first name and last initial only, never roster names, ids or credentials.
      const { alias, cls } = await publicClass(service, input);
      const showNames = cls.show_names_on_join !== false;
      const students = showNames
        ? (await service.rows('students', `class_id=eq.${cls.id}&suspended=eq.false&select=username,roster_name&order=username.asc`))
          .map(row => ({ username: row.username as string, displayName: rosterDisplayName(row.roster_name) }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username))
        : [];
      return json({ name: cls.name, canEnroll: Boolean(alias.can_enroll && cls.enrollment_open), showNames, students });
    }
    if (path[1] === 'register') {
      const code = cleanText(input.classCode, 'Class code', 40).toUpperCase();
      const username = normalizeUsername(input.username);
      const pass = newStudentPassword(input.password, username);
      const alias = (await service.rows('class_codes', `code=eq.${encodeURIComponent(code)}&limit=1`))[0];
      if (!alias) fail(401, 'invalid_credentials', 'Check your class code, username and password.');
      // All aliases for a class share one account bucket. Rotating codes cannot bypass throttling.
      await service.rate(`login:${alias.class_id}:${username.toLowerCase()}`, 12, 300);
      const cls = (await service.rows('classes', `id=eq.${alias.class_id}&limit=1`))[0];
      if (!alias.can_enroll || !cls.enrollment_open) fail(403, 'enrollment_closed', 'Your teacher has closed enrollment with this code.');
      await service.rate(`enroll:${cls.id}`, 120, 600);
      const rosterName = cleanText(input.rosterName || username, 'Name your teacher knows');
      await assertUsernameFree(service, username);
      const id = crypto.randomUUID();
      const auth = await service.request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ id, email: internalEmail(id), password: pass, email_confirm: true, app_metadata: { brick_student: true } }) });
      const userId = auth.id || auth.user?.id;
      if (userId !== id) fail(502, 'account_creation_failed', 'Account creation did not complete. Ask your teacher for help.');
      let student: Row;
      try { student = (await service.insert('students', { user_id: id, class_id: cls.id, username, username_key: username.toLowerCase(), roster_name: rosterName }))[0]; }
      catch (error) {
        await service.request(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
        // A concurrent registration won the unique index race: answer as the pre-check would have.
        if (error instanceof ClassroomHttpError && error.code === 'already_exists') await assertUsernameFree(service, username);
        throw error;
      }
      const session = await service.login(internalEmail(id), pass);
      await service.registerSession(session, student);
      return json(await service.authResult(session), 201);
    }
    if (path[1] === 'login') {
      const username = normalizeUsername(input.username);
      const pass = password(input.password, 6);
      const key = username.toLowerCase();
      // Usernames are global, so the code is optional. A supplied code narrows the lookup and keeps its class bucket.
      const code = input.classCode === undefined || input.classCode === null || input.classCode === '' ? null : cleanText(input.classCode, 'Class code', 40).toUpperCase();
      let student: Row | undefined;
      if (code) {
        const alias = (await service.rows('class_codes', `code=eq.${encodeURIComponent(code)}&limit=1`))[0];
        if (!alias) fail(401, 'invalid_credentials', 'Check your class code, username and password.');
        // All aliases for a class share one account bucket. Rotating codes cannot bypass throttling.
        await service.rate(`login:${alias.class_id}:${key}`, 12, 300);
        student = (await service.rows('students', `class_id=eq.${alias.class_id}&username_key=eq.${encodeURIComponent(key)}&limit=1`))[0];
        if (!student) fail(401, 'invalid_credentials', 'Check your class code, username and password.');
      } else {
        // Unknown and wrong-password attempts share this bucket, so probing for usernames is throttled the same way.
        await service.rate(`login:${key}`, 12, 300);
        const matches = await service.rows('students', `username_key=eq.${encodeURIComponent(key)}&limit=2`);
        if (matches.length > 1) fail(409, 'class_code_required', 'More than one account uses this username. Add your class code to pick yours.');
        student = matches[0];
        if (!student) fail(401, 'invalid_credentials', 'Check your username and password.');
      }
      if ((await service.rows('credential_locks', `user_id=eq.${student.user_id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`)).length) fail(409, 'account_busy', 'Your teacher is updating this account. Please try again shortly.');
      const session = await service.login(internalEmail(student.user_id), pass);
      if (student.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.');
      // A reset may have begun while managed Auth checked the old password. Never
      // register that session with a newer account version or during a mutation.
      const current = (await service.rows('students', `user_id=eq.${student.user_id}&limit=1`))[0];
      const changing = (await service.rows('credential_locks', `user_id=eq.${student.user_id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`)).length;
      if (changing || !current || current.auth_version !== student.auth_version) fail(409, 'account_busy', 'Your account changed during sign-in. Please try again.');
      await service.registerSession(session, student);
      return json(await service.authResult(session));
    }
    if (path[1] === 'teacher-google-start') {
      const authorizationUrl = teacherGoogleAuthorizationUrl(service.env.SUPABASE_URL!, request.headers.get('Origin'), input.codeChallenge, input.state);
      if (!authorizationUrl) fail(400, 'invalid_oauth_request', 'Start Google sign-in again from Brickgineers.');
      return json({ url: authorizationUrl });
    }
    if (path[1] === 'teacher-google') {
      const code = cleanText(input.code, 'Sign-in code', 4096);
      if (!validGoogleCodeVerifier(input.codeVerifier)) fail(400, 'invalid_oauth_request', 'Start Google sign-in again from this browser tab.');
      // The provider verifies that this one-time code belongs to the initiating
      // tab's S256 challenge. No client identity/role claims are accepted.
      const session = await service.request('/auth/v1/token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: input.codeVerifier }) });
      await service.registerTeacherSession(session);
      return json(await service.authResult(session));
    }
    if (path[1] === 'teacher-login') {
      const email = cleanText(input.email, 'Email', 254);
      await service.rate(`teacher:${email.toLowerCase()}`, 12, 300);
      const session = await service.login(email, password(input.password));
      await service.registerTeacherSession(session);
      const caller = await service.authenticate(session.access_token, true);
      if (caller.role !== 'teacher') fail(403, 'teacher_required', 'This account is not configured as a teacher.');
      return json(await service.authResult(session));
    }
    if (path[1] === 'refresh') {
      const session = await service.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: cleanText(input.refreshToken, 'Refresh token', 4096) }) });
      // Never register a refreshed session: an old session cannot adopt a new auth_version.
      return json(await service.authResult(session));
    }
    const caller = await service.authenticate(bearer(request), true);
    if (path[1] === 'logout') {
      if (caller.role === 'student') await service.remove('sessions', `session_id=eq.${caller.sessionId}&user_id=eq.${caller.id}`);
      else await service.patch('teacher_sessions', `session_id=eq.${caller.sessionId}&user_id=eq.${caller.id}`, { revoked: true });
      await service.request('/auth/v1/logout?scope=local', { method: 'POST' }, caller.token);
      await options.onAccessChanged?.({ userId: caller.id, classId: caller.classId, reason: 'logout', change: 'revocation' });
      return json({ ok: true });
    }
    if (path[1] === 'change-password') {
      if (caller.role !== 'student') fail(403, 'student_required', 'Manage teacher credentials through your sign-in provider.');
      const pass = newStudentPassword(input.password, caller.username);
      await service.rate(`password:${caller.id}`, 6, 600);
      return service.withCredentialLock(caller.id, async () => {
      if (caller.resetRequired) {
        // Check managed credentials rather than storing a temporary-password hash ourselves.
        let unchanged: Row | null = null;
        try { unchanged = await service.login(internalEmail(caller.id), pass); }
        catch (error) { if (!(error instanceof ClassroomHttpError) || error.code !== 'invalid_credentials') throw error; }
        if (unchanged) {
          await service.request('/auth/v1/logout?scope=local', { method: 'POST' }, unchanged.access_token);
          fail(400, 'password_unchanged', 'Choose a different password from your temporary password.');
        }
      }
      // Revoke product sessions before changing managed credentials; failures remain fail-closed.
      const student = (await service.patch('students', `user_id=eq.${caller.id}&auth_version=eq.${caller.authVersion}`, { auth_version: caller.authVersion + 1 }))[0];
      if (!student) fail(409, 'account_changed', 'Your account changed. Please sign in again.');
      await service.request(`/auth/v1/admin/users/${caller.id}`, { method: 'PUT', body: JSON.stringify({ password: pass }) });
      const cleared = (await service.patch('students', `user_id=eq.${caller.id}&auth_version=eq.${student.auth_version}`, { reset_required: false }))[0];
      if (!cleared) fail(409, 'account_changed', 'Your account changed. Please sign in again.');
      const session = await service.login(internalEmail(caller.id), pass);
      await service.registerSession(session, student);
      await options.onAccessChanged?.({ userId: caller.id, classId: caller.classId, reason: 'password_changed', change: 'revocation' });
      return json(await service.authResult(session));
      });
    }
  }
  const caller = await service.authenticate(bearer(request), path[0] === 'me');
  if (path[0] === 'me' && method === 'GET') return json(await service.me(caller));
  if (path[0] === 'classes') {
    if (path.length === 1 && method === 'GET') return json({ classes: (await service.me(caller, options.liveParticipants)).classes });
    if (path.length === 1 && method === 'POST') {
      if (caller.role !== 'teacher') fail(403, 'teacher_required', 'Only teachers can create classes.');
      const input = await body(request), code = newCode();
      const cls = (await service.insert('classes', { teacher_id: caller.id, name: cleanText(input.name, 'Class name'), login_code: code }))[0];
      await service.insert('class_codes', { class_id: cls.id, code });
      return json({ class: classView(cls, code) }, 201);
    }
    if (path[2] === 'classmates' && path.length === 3 && method === 'GET') {
      // The invite picker: active students of the caller's own class (or a teacher's class) as id + display
      // name only. Roster names, usernames and suspended accounts stay on the teacher's roster route.
      const own = await service.classFor(caller, path[1]);
      const classmates = (await service.rows('students', `class_id=eq.${own.id}&suspended=eq.false&user_id=neq.${caller.id}&select=user_id,roster_name&order=user_id.asc`))
        .map(row => ({ id: row.user_id as string, displayName: rosterDisplayName(row.roster_name) }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
      return json({ classmates });
    }
    const cls = await service.classFor(caller, path[1], true);
    if (path.length === 2 && method === 'PATCH') {
      const input = await body(request), changes: Row = {};
      if (input.name !== undefined) changes.name = cleanText(input.name, 'Class name');
      for (const [api, db] of [['enrollmentOpen', 'enrollment_open'], ['collaborationOpen', 'collaboration_open'], ['showNamesOnJoin', 'show_names_on_join'], ['studentsCanShare', 'students_can_share']]) {
        if (input[api] !== undefined) { if (typeof input[api] !== 'boolean') fail(400, 'invalid_input', `${api} must be true or false.`); changes[db] = input[api]; }
      }
      const updated = Object.keys(changes).length ? (await service.patch('classes', `id=eq.${cls.id}&teacher_id=eq.${caller.id}`, changes))[0] : cls;
      let code: string | undefined;
      if (input.rotateCode === true) {
        await service.patch('class_codes', `class_id=eq.${cls.id}&can_enroll=eq.true`, { can_enroll: false });
        code = newCode(); await service.insert('class_codes', { class_id: cls.id, code });
      } else code = (await service.rows('class_codes', `class_id=eq.${cls.id}&can_enroll=eq.true&limit=1`))[0]?.code;
      await service.audit(caller, input.rotateCode ? 'rotate_class_code' : 'update_class', cls.id);
      await options.onAccessChanged?.({ classId: cls.id, reason: 'class_updated', change: 'membership' });
      return json({ class: classView(updated, code) });
    }
    if (path[2] === 'students' && path.length === 3 && method === 'GET') return json({ students: (await service.rows('students', `class_id=eq.${cls.id}&order=username.asc`)).map(studentView) });
    if (path[2] === 'students' && path.length === 4 && method === 'PATCH') {
      if (!uuid(path[3])) fail(404, 'not_found', 'Student not found.');
      // Confirm classroom ownership before acquiring a student mutation lease.
      const target = (await service.rows('students', `class_id=eq.${cls.id}&user_id=eq.${path[3]}&limit=1`))[0];
      if (!target) fail(404, 'not_found', 'Student not found.');
      return service.withCredentialLock(path[3], async () => {
      const student = (await service.rows('students', `class_id=eq.${cls.id}&user_id=eq.${path[3]}&limit=1`))[0];
      if (!student) fail(404, 'not_found', 'Student not found.');
      const input = await body(request), changes: Row = {};
      if (input.username !== undefined) { changes.username = normalizeUsername(input.username); changes.username_key = changes.username.toLowerCase(); }
      if (input.rosterName !== undefined) changes.roster_name = cleanText(input.rosterName, 'Roster name');
      if (input.suspended !== undefined) { if (typeof input.suspended !== 'boolean') fail(400, 'invalid_input', 'suspended must be true or false.'); changes.suspended = input.suspended; changes.auth_version = student.auth_version + 1; }
      let temp: string | undefined;
      if (input.temporaryPassword !== undefined) { temp = newStudentPassword(input.temporaryPassword, changes.username || student.username); changes.reset_required = true; changes.auth_version = student.auth_version + 1; }
      if (changes.username_key !== undefined && changes.username_key !== student.username_key) await assertUsernameFree(service, changes.username, student.user_id);
      let updated: Row | undefined;
      try { updated = Object.keys(changes).length ? (await service.patch('students', `user_id=eq.${student.user_id}&class_id=eq.${cls.id}&auth_version=eq.${student.auth_version}`, changes))[0] : student; }
      catch (error) {
        if (error instanceof ClassroomHttpError && error.code === 'already_exists' && changes.username) await assertUsernameFree(service, changes.username, student.user_id);
        throw error;
      }
      if (!updated) fail(409, 'account_changed', 'This account changed. Refresh and try again.');
      if (temp) {
        await service.request(`/auth/v1/admin/users/${student.user_id}`, { method: 'PUT', body: JSON.stringify({ password: temp, email: internalEmail(student.user_id), email_confirm: true }) });
        // Establish a server-only session solely to revoke all provider refresh sessions.
        const resetSession = await service.login(internalEmail(student.user_id), temp);
        await service.request('/auth/v1/logout?scope=global', { method: 'POST' }, resetSession.access_token);
      }
      await service.audit(caller, temp ? 'reset_password' : 'update_student', cls.id, student.user_id);
      // Only an auth_version bump (suspension, temporary password) invalidates the
      // student's sessions; a username or roster edit re-authorizes them in place.
      await options.onAccessChanged?.({ classId: cls.id, userId: student.user_id, reason: temp ? 'password_reset' : 'student_updated', change: changes.auth_version !== undefined ? 'revocation' : 'membership' });
      return json({ student: studentView(updated) });
      });
    }
  }
  if (path[0] === 'worlds') {
    if (path.length === 1 && method === 'GET') {
      return json({ worlds: await service.listWorlds(caller) });
    }
    if (path.length === 1 && method === 'POST') {
      const input = await body(request), kind = input.kind || 'personal';
      if (!['personal', 'class', 'group'].includes(kind)) fail(400, 'invalid_input', 'Unknown world kind.');
      if (kind !== 'personal') await service.classFor(caller, input.classId, true);
      await service.rate(`create-world:${caller.id}`, 60, 3600);
      const created = (await service.insert('worlds', { owner_id: caller.id, class_id: kind === 'personal' ? null : input.classId, kind, title: cleanText(input.title || 'My world', 'World title'), document: document(input.document) }))[0];
      return json({ world: worldView(created, ownView(caller)) }, 201);
    }
    const access = await service.worldAccess(caller, path[1]), { world } = access;
    // Personal worlds belong to their owner: classmates and the teacher may look (and edit live when shared with
    // editing), but renaming, restoring and recovery history stay with the owner. Class/group worlds keep teacher control.
    const controls = access.isOwner || (world.kind !== 'personal' && caller.role === 'teacher');
    if (path.length === 2 && method === 'GET') return json({ world: accessView(access, caller, true) });
    if (path[2] === 'sharing' && path.length === 3 && method === 'PATCH') {
      if (caller.role !== 'student') fail(403, 'student_required', 'Only students share their own worlds with the class.');
      if (!access.isOwner || world.kind !== 'personal') fail(403, 'owner_required', 'Only the owner can share this world.');
      const input = await body(request);
      if (input.visibility !== 'private' && !isSharedVisibility(input.visibility)) fail(400, 'invalid_input', 'visibility must be private, class or members.');
      if (typeof input.canEdit !== 'boolean') fail(400, 'invalid_input', 'canEdit must be true or false.');
      const cls = await service.classFor(caller, caller.classId!);
      if (cls.students_can_share === false) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.');
      const sharing = input.visibility !== 'private';
      // Invitees exist only while the world is members-only: a given list replaces the set (validated first, so a
      // refused list changes nothing); an omitted list keeps the current invitees; other visibilities clear them.
      let members: WorldMemberSummary[] | undefined;
      if (input.visibility === 'members') {
        const ids = input.members === undefined ? (await service.membersOf([world.id])).get(world.id)!.map(member => member.id) : await service.replaceMembers(caller, world.id, input.members);
        if (!ids.length) fail(400, 'invalid_input', 'Pick at least one classmate.');
      }
      const updated = (await service.patch('worlds', `id=eq.${world.id}&owner_id=eq.${caller.id}&select=${WORLD_FIELDS}`, {
        class_visibility: input.visibility, class_can_edit: sharing && input.canEdit, class_shared_at: sharing ? world.class_shared_at ?? new Date().toISOString() : null,
      }))[0];
      if (!updated) fail(404, 'not_found', 'World not found.');
      if (input.visibility === 'members') members = (await service.membersOf([world.id])).get(world.id);
      else if (world.class_visibility === 'members') await service.remove('world_members', `world_id=eq.${world.id}`);
      await service.audit(caller, sharing ? 'share_world' : 'unshare_world', cls.id, world.id);
      // Live sockets re-authorize in place: unsharing, removing editing or dropping an invitee closes them (the owner stays).
      await options.onAccessChanged?.({ worldId: world.id, reason: 'sharing_updated', change: 'membership' });
      return json({ world: worldView(updated, { ...ownView(caller, false), members }) });
    }
    if (path[2] === 'visibility' && path.length === 3 && method === 'PATCH') {
      if (caller.role !== 'teacher') fail(403, 'teacher_required', 'Only the class teacher can hide a shared world.');
      if (world.kind !== 'personal') fail(400, 'invalid_input', 'Only shared student worlds can be hidden.');
      const input = await body(request);
      if (typeof input.hiddenByTeacher !== 'boolean') fail(400, 'invalid_input', 'hiddenByTeacher must be true or false.');
      const updated = (await service.patch('worlds', `id=eq.${world.id}&select=${WORLD_FIELDS}`, { hidden_by_teacher: input.hiddenByTeacher }))[0];
      if (!updated) fail(404, 'not_found', 'World not found.');
      await service.audit(caller, input.hiddenByTeacher ? 'hide_world' : 'show_world', undefined, world.id);
      await options.onAccessChanged?.({ worldId: world.id, reason: 'visibility_updated', change: 'membership' });
      return json({ world: accessView({ ...access, world: updated }, caller) });
    }
    if (path[2] === 'copy' && path.length === 3 && method === 'POST') {
      await service.rate(`create-world:${caller.id}`, 60, 3600);
      if ((await service.rows('worlds', `owner_id=eq.${caller.id}&select=id&limit=${WORLD_LIMIT}`)).length >= WORLD_LIMIT) fail(409, 'world_limit', 'You have reached the saved-world limit. Ask your teacher for help.');
      let created: Row;
      // The stored row is authoritative: live edits commit there before they are acknowledged.
      try { created = (await service.insert('worlds', { owner_id: caller.id, class_id: null, kind: 'personal', title: `${world.title} (copy)`.slice(0, 80), document: world.document }))[0]; }
      catch (error) { if (error instanceof ClassroomHttpError && error.code === 'quota_exceeded') fail(409, 'world_limit', 'You have reached the saved-world limit. Ask your teacher for help.'); throw error; }
      await service.audit(caller, 'copy_world', world.class_id || undefined, world.id);
      return json({ world: worldView(created, ownView(caller)) }, 201);
    }
    if (path.length === 2 && method === 'PATCH') {
      if (!controls) fail(403, 'owner_required', 'Only the owner or teacher can rename this world.');
      const input = await body(request);
      const updated = await service.rpc('commit_world', { p_world_id: world.id, p_expected_revision: world.revision, p_document: world.document, p_title: cleanText(input.title, 'World title'), p_reason: 'rename', p_actor_id: caller.id, p_session_id: caller.sessionId, p_auth_version: caller.authVersion });
      if (updated.error === 'conflict') throw new ClassroomHttpError(409, 'revision_conflict', 'Someone saved a newer version. Refresh before renaming.', { currentRevision: updated.currentRevision });
      if (updated.error === 'access_revoked') fail(403, 'access_revoked', 'Classroom access changed.');
      if (updated.error === 'rate_limited') fail(429, 'rate_limited', 'Too many saves. Please wait briefly.');
      if (updated.error) fail(404, 'not_found', 'World not found.');
      await options.onAccessChanged?.({ worldId: world.id, classId: world.class_id || undefined, reason: 'world_saved', change: 'metadata' });
      return json({ world: accessView({ ...access, world: updated }, caller) });
    }
    if (path.length === 2 && method === 'PUT' || path[2] === 'restore' && method === 'POST') {
      const input = await body(request), restoring = path[2] === 'restore';
      if (!access.canEdit) fail(403, 'read_only', 'You do not have editing access to this world.');
      let doc: unknown, title: string | null = input.title === undefined ? null : cleanText(input.title, 'World title');
      if (restoring) {
        if (!controls) fail(403, 'owner_required', 'Only the owner or teacher can restore this world.');
        if (!uuid(input.checkpointId)) fail(400, 'invalid_input', 'Choose a valid checkpoint.');
        const cp = (await service.rows('checkpoints', `id=eq.${input.checkpointId}&world_id=eq.${world.id}&limit=1`))[0];
        if (!cp) fail(404, 'not_found', 'Checkpoint not found.');
        doc = document(cp.document); title = cp.title;
      } else doc = document(input.document);
      const saved = await service.rpc('commit_world', { p_world_id: world.id, p_expected_revision: expectedRevision(input.expectedRevision), p_document: doc, p_title: title, p_reason: restoring ? 'restore' : 'save', p_actor_id: caller.id, p_session_id: caller.sessionId, p_auth_version: caller.authVersion });
      if (saved.error === 'conflict') throw new ClassroomHttpError(409, 'revision_conflict', 'Someone saved a newer version. Refresh before saving again.', { currentRevision: saved.currentRevision });
      if (saved.error === 'access_revoked') fail(403, 'access_revoked', 'Classroom access changed.');
      if (saved.error === 'rate_limited') fail(429, 'rate_limited', 'Too many saves. Please wait briefly.');
      if (saved.error) fail(404, 'not_found', 'World not found.');
      if (restoring) await service.audit(caller, 'restore_world', world.class_id, world.id);
      await options.onAccessChanged?.({ worldId: world.id, classId: world.class_id || undefined, reason: restoring ? 'world_restored' : 'world_saved', change: 'metadata' });
      return json({ world: accessView({ ...access, world: saved }, caller, true) });
    }
    if (path[2] === 'checkpoints' && method === 'GET' && !controls) fail(403, 'owner_required', 'Only the owner can see the recovery history of this world.');
    if (path[2] === 'checkpoints' && method === 'GET') return json({ checkpoints: (await service.rows('checkpoints', `world_id=eq.${world.id}&select=id,revision,created_at,reason&order=created_at.desc&limit=30`)).map(cp => ({ id: cp.id, revision: cp.revision, createdAt: cp.created_at, reason: cp.reason })) });
    if (path[2] === 'members') {
      if (world.kind === 'personal') fail(400, 'private_world', 'Personal worlds do not have group members.');
      if (method !== 'GET') {
        await service.classFor(caller, world.class_id, true);
        if (world.kind !== 'group') fail(400, 'class_world', 'Class worlds include the entire class. Use a group world for selected members.');
        if (method === 'POST') {
          const input = await body(request);
          if (!uuid(input.userId)) fail(400, 'invalid_input', 'Choose a student.');
          const student = (await service.rows('students', `user_id=eq.${input.userId}&class_id=eq.${world.class_id}&limit=1`))[0];
          if (!student || student.suspended) fail(400, 'invalid_member', 'Choose an active student in this class.');
          await service.request('/rest/v1/brick_world_members?on_conflict=world_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ world_id: world.id, user_id: student.user_id }) });
        } else if (method === 'DELETE' && uuid(path[3])) {
          await service.remove('world_members', `world_id=eq.${world.id}&user_id=eq.${path[3]}`);
          await service.audit(caller, 'remove_group_member', world.class_id, path[3]);
        } else fail(405, 'method_not_allowed', 'Unsupported member action.');
      }
      if (method !== 'GET') await options.onAccessChanged?.({ worldId: world.id, classId: world.class_id, userId: method === 'DELETE' ? path[3] : undefined, reason: 'members_updated', change: method === 'DELETE' ? 'revocation' : 'membership' });
      const students = await service.rows('students', `class_id=eq.${world.class_id}&order=username.asc`);
      const members = world.kind === 'group' ? await service.rows('world_members', `world_id=eq.${world.id}`) : students.map(s => ({ user_id: s.user_id }));
      return json({ members: students.filter(s => members.some(m => m.user_id === s.user_id)).map(s => ({ id: s.user_id, username: s.username, ...(caller.role === 'teacher' ? { rosterName: s.roster_name } : {}) })) });
    }
  }
  return fail(404, 'not_found', 'Classroom route not found.');
}

/** Re-run for every privileged room action and periodically for idle sockets. Do not cache indefinitely. */
export async function authorizeClassroomWorld(request: Request, env: ClassroomEnv, worldId: string) {
  const service = new ClassroomService(env);
  const caller = await service.authenticate(bearer(request));
  const { world, canEdit, isOwner } = await service.worldAccess(caller, worldId, true, true);
  return { userId: caller.id, username: caller.username, role: caller.role, worldId: world.id as string, classId: (world.class_id ?? null) as string | null, canEdit, isTeacher: caller.role === 'teacher', isOwner, authVersion: caller.authVersion, sessionId: caller.sessionId };
}

/** Live permissions for one session. `classId` is null for personal worlds (shared ones resolve the owner's class). */
export type ClassroomWorldAccess = { userId: string; username: string; role: 'teacher' | 'student'; worldId: string; classId: string | null; canEdit: boolean; isTeacher: boolean; isOwner: boolean; authVersion: number; sessionId: string };
function accessError(code: string): ClassroomHttpError {
  const status = code === 'session_revoked' ? 401 : code === 'not_found' ? 404 : 403;
  const messages: Record<string, string> = { session_revoked: 'Please sign in again.', suspended: 'Your teacher has paused your classroom account.', password_change_required: 'Choose a new password to continue.', class_closed: 'Your teacher has closed classroom collaboration.', private_world: 'This world is not shared with the class.', world_hidden: 'Your teacher hid this world from the class.', sharing_disabled: 'Your teacher has turned off sharing between students.', not_found: 'World not found.' };
  return new ClassroomHttpError(status, code, messages[code] || 'Classroom access changed.');
}
function validIdentity(identity: ClassroomSessionIdentity) {
  if (!uuid(identity.userId) || !uuid(identity.sessionId) || !Number.isInteger(identity.authVersion)) fail(401, 'invalid_session', 'Please sign in again.');
}
/** Only invoke after validating ticket signature/expiry, or with trusted DO attachments. */
export async function revalidateClassroomWorldAccess(env: ClassroomEnv, identity: ClassroomSessionIdentity, worldId: string): Promise<ClassroomWorldAccess> {
  validIdentity(identity);
  if (!uuid(worldId)) fail(404, 'not_found', 'World not found.');
  const result = await new ClassroomService(env).rpc('authorize_world', { p_world_id: worldId, p_user_id: identity.userId, p_session_id: identity.sessionId, p_auth_version: identity.authVersion, p_teacher_allowed: (env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim()).includes(identity.userId) });
  if (result.error) throw accessError(result.error);
  return result as ClassroomWorldAccess;
}
export async function revalidateClassroomWorldAccessBatch(env: ClassroomEnv, identities: ClassroomSessionIdentity[], worldId: string): Promise<Array<{ identity: ClassroomSessionIdentity; access?: ClassroomWorldAccess; error?: { status: number; code: string; message: string } }>> {
  if (!uuid(worldId) || identities.length > 64) fail(400, 'invalid_input', 'Invalid permission batch.');
  identities.forEach(validIdentity);
  const teacherIds = (env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim());
  const results: Row[] = await new ClassroomService(env).rpc('authorize_world_batch', { p_world_id: worldId, p_identities: identities.map(identity => ({ ...identity, teacherAllowed: teacherIds.includes(identity.userId) })) });
  if (results.length !== identities.length) fail(502, 'service_unavailable', 'Permission checks did not complete.');
  return results.map((result, index) => {
    if (!result.error) return { identity: identities[index], access: result as ClassroomWorldAccess };
    const error = accessError(result.error);
    return { identity: identities[index], error: { status: error.status, code: error.code, message: error.message } };
  });
}
export async function reauthorizeClassroomSocket(env: ClassroomEnv, access: ClassroomSessionIdentity & { worldId: string }) {
  return revalidateClassroomWorldAccess(env, access, access.worldId);
}

/** A stored world as trusted DOs consume it; every stored document was validated on write. */
export type ClassroomWorldSnapshot = { id: string; title: string; ownerId: string; classId: string | null; kind: 'personal' | 'group' | 'class'; revision: number; updatedAt: string; document: BrickStudioDocument };
/** Server-only helpers. The DO must authorize the caller before committing any edit. */
export async function loadClassroomWorld(env: ClassroomEnv, worldId: string): Promise<ClassroomWorldSnapshot> {
  if (!uuid(worldId)) fail(404, 'not_found', 'World not found.');
  const row = (await new ClassroomService(env).rows('worlds', `id=eq.${worldId}&limit=1`))[0];
  if (!row) fail(404, 'not_found', 'World not found.');
  return worldView(row, { full: true }) as ClassroomWorldSnapshot;
}
export async function commitClassroomWorld(env: ClassroomEnv, worldId: string, value: unknown, revision: number, identity: ClassroomSessionIdentity): Promise<ClassroomWorldSnapshot> {
  if (!uuid(worldId)) fail(404, 'not_found', 'World not found.');
  const saved = await new ClassroomService(env).rpc('commit_world', { p_world_id: worldId, p_expected_revision: expectedRevision(revision), p_document: document(value), p_title: null, p_reason: 'live_edit', p_actor_id: identity.userId, p_session_id: identity.sessionId, p_auth_version: identity.authVersion });
  if (saved.error === 'conflict') throw new ClassroomHttpError(409, 'revision_conflict', 'A newer world revision exists.', { currentRevision: saved.currentRevision });
  if (saved.error === 'access_revoked') fail(403, 'access_revoked', 'Classroom access changed.');
  if (saved.error === 'rate_limited') fail(429, 'rate_limited', 'Too many saves. Please wait briefly.');
  if (saved.error) fail(404, 'not_found', 'World not found.');
  return worldView(saved, { full: true }) as ClassroomWorldSnapshot;
}
/**
 * Live rooms a class-level change can affect: the class's own worlds plus personal worlds its students have
 * shared (those keep class_id null, so they are found through the owners).
 */
export async function listClassroomWorldIds(env: ClassroomEnv, filter: { classId?: string; userId?: string }): Promise<string[]> {
  const service = new ClassroomService(env);
  const worldsOfClass = async (classId: string) => [...new Set((await service.liveWorldIdsByClass([{ id: classId }])).get(classId))];
  if (filter.classId && uuid(filter.classId)) return worldsOfClass(filter.classId);
  if (filter.userId && uuid(filter.userId)) {
    const student = (await service.rows('students', `user_id=eq.${filter.userId}&limit=1`))[0];
    if (student) return worldsOfClass(student.class_id);
    const classes = await service.rows('classes', `teacher_id=eq.${filter.userId}&select=id`);
    const worlds = await Promise.all(classes.map(c => worldsOfClass(c.id)));
    return [...new Set(worlds.flat())];
  }
  return [];
}
