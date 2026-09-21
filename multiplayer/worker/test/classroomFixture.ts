/**
 * Shared classroom test harness: a tiny stand-in for the classroom Postgres
 * schema and its authorization/commit RPCs, wired through the ClassroomService
 * prototype so the router and every Durable Object see the same database.
 */
import { LIVE_PROTOCOL_VERSION, createBrickStudioDocument, type BrickInstance, type BrickStudioDocument } from "@brick-studio/core";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, vi } from "vitest";
import { ClassroomService } from "../src/classroom/index";
import type { Env as WorkerEnv } from "../src/index";
import { newWorldId, newOwnerToken, ownerTokenVerifier, type WorldRoom } from "../src/worldRoom";

export type Message = Record<string, unknown> & { type: string };

/** Every socket a test opens; each test file closes them in its own afterEach. */
export const sockets: WebSocket[] = [];

export function brick(id: string, x = 2, z = 2): BrickInstance {
  return { id, partId: "brick_1x2", x, y: 0, z, rotation: 0, color: "#3e83d7" };
}

export function worldDocument(bricks: BrickInstance[] = []): BrickStudioDocument {
  return createBrickStudioDocument(bricks);
}

export function send(socket: WebSocket, value: unknown) {
  socket.send(JSON.stringify(value));
}

export class Inbox {
  private readonly messages: Message[] = [];
  private readonly waiters: Array<() => void> = [];

  constructor(readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(String(event.data)) as Message);
      this.waiters.splice(0).forEach((resolve) => resolve());
    });
  }

  async next(type: string, timeoutMs = 3_000): Promise<Message> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex((message) => message.type === type);
      if (index >= 0) return this.messages.splice(index, 1)[0];
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), Math.max(1, deadline - Date.now()));
        this.waiters.push(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    throw new Error(`Timed out waiting for ${type}`);
  }

  /** Messages of this type received so far, without consuming them. */
  peek(type: string): Message[] {
    return this.messages.filter((message) => message.type === type);
  }
}

export const classId = "00000000-0000-4000-8000-0000000000c1";
export const teacher = { id: "00000000-0000-4000-8000-0000000000a1", sessionId: "00000000-0000-4000-8000-0000000000a2" };
export const teacherCaller = { id: teacher.id, username: "Teacher", rosterName: "Teacher", role: "teacher" as const, resetRequired: false, authVersion: 0, sessionId: teacher.sessionId, token: "teacher" };
export const fakeEnv = { SUPABASE_URL: "https://fake-db.test", SUPABASE_SERVICE_ROLE_KEY: "test", SUPABASE_ANON_KEY: "test", BRICK_TEACHER_IDS: teacher.id };
export const workerEnv = env as unknown as WorkerEnv;
export const routeEnv = {
  ...fakeEnv, CLASSROOM_TICKET_SECRET: "test-only-secret-".repeat(4),
  WORLD_ROOMS: workerEnv.WORLD_ROOMS, WORLD_CREATION_LIMITER: workerEnv.WORLD_CREATION_LIMITER, RACE_ROOMS: workerEnv.RACE_ROOMS,
} as WorkerEnv;

export type FixtureWorld = { id: string; class_id: string; kind: "group" | "class"; owner_id: string; title: string; revision: number; document: BrickStudioDocument };
export type FixtureStudent = { user_id: string; username: string; roster_name: string; class_id: string; auth_version: number; suspended: boolean; reset_required: boolean; session_id: string };
export type Access = { userId: string; username: string; role: "teacher" | "student"; worldId: string; classId: string; canEdit: boolean; isTeacher: boolean; isOwner: boolean; authVersion: number; sessionId: string };
export type CommitRecord = { worldId: string; expectedRevision: number; actorId: string; sessionId: string; authVersion: number };

export const randomWorldUuid = () => {
  const hex = newWorldId();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Context rule for these tests: a promise settled from inside a Durable Object's
 * event runs its awaiting continuation in that object's context, and vice versa.
 * Test code must therefore never await a promise the room resolves, and the room
 * must never await a promise the test resolves; both sides poll with their own
 * timers instead (`nextCommit`, `commitGate`).
 */
export function fixture(worldIds: string[]) {
  const db = {
    worlds: worldIds.map((id): FixtureWorld => ({ id, class_id: classId, kind: "group", owner_id: teacher.id, title: "Period 1 build", revision: 1, document: worldDocument() })),
    students: [1, 2, 3].map((n): FixtureStudent => ({
      user_id: `00000000-0000-4000-8000-0000000000${n}1`, username: `Builder${n}`, roster_name: `Student ${n}`, class_id: classId,
      auth_version: 1, suspended: false, reset_required: false, session_id: `00000000-0000-4000-8000-0000000000${n}2`,
    })),
    classes: [{ id: classId, teacher_id: teacher.id, name: "Period 1", login_code: "PERIOD1", enrollment_open: true, collaboration_open: true }],
    members: [] as Array<{ world_id: string; user_id: string }>,
    batchUnavailable: false,
    worldsUnavailable: false,
    /** Successful `commit_world` calls, in order. */
    commits: [] as CommitRecord[],
    /** Every `commit_world` call, including refused and failed ones. */
    commitAttempts: 0,
    /** `commit_world` calls that have finished, whatever their outcome. */
    commitsSettled: 0,
    /** When set, `commit_world` throws this before touching the world (a network or 5xx failure). */
    commitFailure: null as Error | null,
    /** When set, `commit_world` waits for this before applying (a slow database). Use `commitGate()`. */
    commitGate: null as (() => Promise<void>) | null,
    /** Resolves once the next `commit_world` call has finished, whatever its outcome. Create it before the trigger. */
    nextCommit: () => {
      const target = db.commitsSettled + 1;
      return vi.waitFor(() => { if (db.commitsSettled < target) throw new Error(`Waiting for commit ${target}`); }, { timeout: 4_000, interval: 5 });
    },
  };
  for (const world of db.worlds) for (const student of db.students.slice(0, 2)) db.members.push({ world_id: world.id, user_id: student.user_id });
  const matches = (row: Record<string, unknown>, filter: string) => filter.split("&").every((part) => {
    const [key, value] = part.split("=eq.");
    return value === undefined || String(row[key]) === value;
  });
  const tables = (): Record<string, Array<Record<string, unknown>>> => ({
    worlds: db.worlds, students: db.students, classes: db.classes, world_members: db.members,
    sessions: db.students.map((student) => ({ session_id: student.session_id, user_id: student.user_id, auth_version: student.auth_version })),
    teacher_sessions: [{ session_id: teacher.sessionId, user_id: teacher.id, revoked: false }],
  });
  const authorize = (worldId: string, userId: string, sessionId: string, authVersion: number, teacherAllowed: boolean) => {
    const world = db.worlds.find((candidate) => candidate.id === worldId);
    const cls = db.classes[0];
    if (teacherAllowed && authVersion === 0) {
      if (userId !== teacher.id || sessionId !== teacher.sessionId) return { error: "session_revoked" };
      if (!world) return { error: "not_found" };
      return { userId, username: "Teacher", role: "teacher", worldId, classId: cls.id, canEdit: true, isTeacher: true, isOwner: world.owner_id === userId, authVersion, sessionId };
    }
    const student = db.students.find((candidate) => candidate.user_id === userId);
    if (!student || student.auth_version !== authVersion || student.session_id !== sessionId) return { error: "session_revoked" };
    if (student.suspended) return { error: "suspended" };
    if (!world) return { error: "not_found" };
    if (!cls.collaboration_open) return { error: "class_closed" };
    if (world.kind === "group" && !db.members.some((member) => member.world_id === worldId && member.user_id === userId)) return { error: "not_found" };
    return { userId, username: student.username, role: "student", worldId, classId: cls.id, canEdit: true, isTeacher: false, isOwner: false, authVersion, sessionId };
  };
  const commitWorld = async (input: Record<string, any>) => {
    db.commitAttempts += 1;
    try {
      if (db.commitFailure) throw db.commitFailure;
      if (db.commitGate) await db.commitGate();
      const world = db.worlds.find((candidate) => candidate.id === input.p_world_id);
      if (!world) return { error: "not_found" };
      // Like brick_commit_world: the actor's session must still be allowed to edit.
      const access = authorize(world.id, input.p_actor_id, input.p_session_id, input.p_auth_version, input.p_actor_id === teacher.id);
      if ("error" in access || !access.canEdit) return { error: "access_revoked" };
      if (world.revision !== input.p_expected_revision) return { error: "conflict", currentRevision: world.revision };
      world.revision += 1;
      world.document = input.p_document;
      if (typeof input.p_title === "string") world.title = input.p_title;
      db.commits.push({ worldId: world.id, expectedRevision: input.p_expected_revision, actorId: input.p_actor_id, sessionId: input.p_session_id, authVersion: input.p_auth_version });
      return { ...world };
    } finally {
      db.commitsSettled += 1;
    }
  };
  vi.spyOn(ClassroomService.prototype, "rows").mockImplementation(async (table, filter = "") => {
    if (table === "worlds" && db.worldsUnavailable) throw new Error("database unavailable");
    return (tables()[table] ?? []).filter((row) => matches(row, filter));
  });
  const rpc = vi.spyOn(ClassroomService.prototype, "rpc").mockImplementation(async (name, input) => {
    if (name === "authorize_world") return authorize(input.p_world_id, input.p_user_id, input.p_session_id, input.p_auth_version, input.p_teacher_allowed);
    if (name === "authorize_world_batch") {
      if (db.batchUnavailable) throw new Error("permission provider unavailable");
      return input.p_identities.map((identity: { userId: string; sessionId: string; authVersion: number; teacherAllowed: boolean }) =>
        authorize(input.p_world_id, identity.userId, identity.sessionId, identity.authVersion, identity.teacherAllowed));
    }
    if (name === "commit_world") return commitWorld(input);
    if (name === "take_rate_limit" || name === "acquire_credential_lock") return true;
    throw new Error(`Unexpected rpc ${name}`);
  });
  const batchChecks = () => rpc.mock.calls.filter(([name]) => name === "authorize_world_batch").length;
  /** Single-session permission checks (`authorize_world`) so far, optionally for one user. */
  const authorizeChecks = (userId?: string) => rpc.mock.calls.filter(([name, input]) => name === "authorize_world" && (!userId || input.p_user_id === userId)).length;
  const studentAccess = (index: number, worldId: string): Access => {
    const student = db.students[index];
    return { userId: student.user_id, username: student.username, role: "student", worldId, classId, canEdit: true, isTeacher: false, isOwner: false, authVersion: student.auth_version, sessionId: student.session_id };
  };
  const teacherAccess = (worldId: string): Access => ({ userId: teacher.id, username: "Teacher", role: "teacher", worldId, classId, canEdit: true, isTeacher: true, isOwner: true, authVersion: 0, sessionId: teacher.sessionId });
  return { db, batchChecks, authorizeChecks, studentAccess, teacherAccess };
}

/** Run `action` with the room's (and the test's) clock advanced by `ms`. */
export async function withClockAhead<T>(ms: number, action: () => Promise<T>): Promise<T> {
  const now = Date.now() + ms;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try { return await action(); } finally { clock.mockRestore(); }
}

export async function openRoom(world: FixtureWorld) {
  const roomId = world.id.replaceAll("-", "");
  const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
  const verifier = await ownerTokenVerifier(newOwnerToken());
  // What ensureRoom sends: the stored world as the database holds it right now.
  const init = (copy: FixtureWorld = world) => stub.fetch("https://world.internal/init", {
    method: "POST", headers: { "x-world-init": "1", "content-type": "application/json" },
    body: JSON.stringify({ roomId, classroomWorldId: copy.id, revision: copy.revision, title: copy.title, document: copy.document, initialOwnerProfile: { displayName: "Builder" }, ownerTokenVerifier: verifier }),
  });
  const initialized = await init();
  expect(initialized.status).toBe(201); await initialized.text();
  const patchEnv = () => runInDurableObject(stub, async (instance: WorldRoom) => { Object.assign((instance as unknown as { env: object }).env, fakeEnv); });
  await patchEnv();
  return {
    roomId, stub, patchEnv,
    /** ensureRoom's re-init with the database copy: 409 when the room exists. */
    reinit: async (copy?: FixtureWorld) => {
      const response = await init(copy);
      return { status: response.status, body: await response.json<Record<string, unknown>>() };
    },
    invalidate: async (body: Record<string, unknown>) => {
      const response = await stub.fetch("https://world.internal/internal/classroom-invalidate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json<Record<string, unknown>>() };
    },
    state: async (access: Access) => {
      const response = await stub.fetch(`https://world.internal/worlds/${roomId}`, { headers: { "x-classroom-access": JSON.stringify(access) } });
      expect(response.status).toBe(200);
      return response.json<{ title: string; revision: number; document: BrickStudioDocument; players: Array<{ playerId: string }> }>();
    },
    /** The stored record's write-behind bookkeeping. */
    stored: () => runInDurableObject(stub, async (_instance: WorldRoom, state: DurableObjectState) =>
      (await state.storage.get<{ revision: number; dbRevision?: number; dirtySince?: number; commitDueAt?: number; commitFailures?: number; commitBlocked?: { code: string }; document: BrickStudioDocument }>("world"))!),
    alarmAt: () => runInDurableObject(stub, async (_instance: WorldRoom, state: DurableObjectState) => state.storage.getAlarm()),
  };
}
export type Room = Awaited<ReturnType<typeof openRoom>>;

export async function join(room: Room, access: Access) {
  const response = await room.stub.fetch(`https://world.internal/worlds/${room.roomId}/connect`, { headers: { Upgrade: "websocket", "x-classroom-access": JSON.stringify(access) } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const inbox = new Inbox(socket);
  socket.accept();
  const welcome = await inbox.next("welcome");
  const closed = new Promise<number>((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  let sequence = 0;
  const edit = (id: string, x: number, z = 0) => {
    sequence += 1;
    const opId = `${access.userId}#${sequence}`;
    send(socket, { v: LIVE_PROTOCOL_VERSION, type: "commands", opId, commands: [{ op: "place", brick: brick(id, x, z) }] });
    return opId;
  };
  return { access, socket, inbox, welcome, closed, edit };
}
export type Builder = Awaited<ReturnType<typeof join>>;

export const stillOpen = (closed: Promise<number>) => Promise.race([
  closed.then((code) => `closed ${code}`),
  new Promise<string>((resolve) => setTimeout(() => resolve("open"), 150)),
]);
// Every connected builder receives every broadcast; drain them so inboxes stay in step.
export const applied = async (opId: string, revision: number, ...builders: Builder[]) => {
  for (const builder of builders) expect(await builder.inbox.next("apply")).toMatchObject({ opId, revision });
};
export const snapshotted = async (revision: number, ...builders: Builder[]) => {
  for (const builder of builders) expect(await builder.inbox.next("snapshot")).toMatchObject({ revision });
};
export const bricksOf = (document: unknown) => (document as BrickStudioDocument).bricks.map((placed) => placed.id);

/**
 * Ask the room to save now (a resync is one of the immediate commit triggers)
 * and wait for the database to answer that attempt. Only meaningful while the
 * room holds uncommitted edits; otherwise no commit runs and this times out.
 */
export async function saveNow(builder: Builder, db: ReturnType<typeof fixture>["db"]) {
  const settled = db.nextCommit();
  send(builder.socket, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
  await builder.inbox.next("snapshot");
  await Promise.race([settled, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for the commit")), 3_000))]);
  // Let the room finish its bookkeeping for the answer it just received.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A slow database: `commit_world` waits behind `wait` (polled from the room's own context) until `release`. */
export function commitGate() {
  let released = false;
  return {
    release: () => { released = true; },
    wait: () => vi.waitFor(() => { if (!released) throw new Error("Commit still gated"); }, { timeout: 5_000, interval: 5 }).then(() => undefined),
  };
}

/** Advance the room's clock by `ms` and fire its alarm as the runtime would. Returns the clock the alarm saw. */
export async function alarmAfter(room: Room, ms: number): Promise<{ ran: boolean; now: number }> {
  const now = Date.now() + ms;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try { return { ran: await runDurableObjectAlarm(room.stub), now }; }
  finally { clock.mockRestore(); }
}
