/*
 * 2D class rooms keep edits the database does not have yet: in storage as each edit lands, through the last
 * player leaving, a database outage and a restart, saved as the last editor without anyone connected. And a
 * failed access check never lets an edit through. (From the pre-ship review, findings 2 and 6.)
 */
import { createPlatformerDocument } from "@brick-studio/platformer-core/document";
import { createBrickStudioDocument } from "@brick-studio/core";
import { createBlankLevel, levelFromJson, type LevelJson } from "@brick-studio/platformer-core/engine/level";
import { PROTOCOL } from "@brick-studio/platformer-core/net/protocol";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { ClassroomHttpError, ClassroomService } from "../src/classroom";
import { handleReleaseRequest } from "../src/classroomRoutes";
import type { Env } from "../src/index";
import { MAX_PLATFORMER_RECOVERY_COPIES, type PlatformerRoom } from "../src/platformerRoom";
import { commitGate, fakeEnv, fixture, Inbox, randomWorldUuid, routeEnv, send, sockets, teacherCaller, withClockAhead, workerEnv } from "./classroomFixture";

afterEach(() => {
  for (const socket of sockets.splice(0)) try { socket.close(); } catch { /* already closed */ }
  vi.restoreAllMocks();
});

type Stored = { level: LevelJson; pending?: LevelJson; unsaved?: boolean; commitDueAt?: number };
type Recovery = { id: string; worldId: string; level: LevelJson; revision: number; at: number };

async function recoveryCopies(stub: DurableObjectStub<PlatformerRoom>): Promise<Recovery[]> {
  return runInDurableObject(stub, async (_room: PlatformerRoom, state: DurableObjectState) =>
    [...(await state.storage.list<Recovery>({ prefix: "recovery:" })).values()]);
}

async function openRoom() {
  const id = randomWorldUuid();
  const f = fixture([id]);
  const world = f.db.worlds[0] as unknown as { document: ReturnType<typeof createPlatformerDocument> };
  world.document = createPlatformerDocument(createBlankLevel(40, 20, "Durable"));
  vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue(teacherCaller as never);
  const env = { ...routeEnv, PLATFORMER_ROOMS: workerEnv.PLATFORMER_ROOMS } as Env;
  const request = (path: string, init: RequestInit) => handleReleaseRequest(new Request(`https://worker.test${path}`, init), env);
  const ticketResponse = await request(`/classroom/worlds/${id}/platformer-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
  expect(ticketResponse.status).toBe(200);
  const { ticket } = await ticketResponse.json<{ ticket: string }>();
  const stub = workerEnv.PLATFORMER_ROOMS.get(workerEnv.PLATFORMER_ROOMS.idFromName(id.replaceAll("-", "")));
  await runInDurableObject(stub, async (room: PlatformerRoom) => { Object.assign((room as unknown as { env: object }).env, fakeEnv); });
  const response = await request(`/platformer/worlds/${id}/connect?ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const inbox = new Inbox(socket);
  socket.accept();
  send(socket, { type: "hello", v: PROTOCOL, name: "Teacher", key: "durable" });
  await inbox.next("welcome");
  const stored = () => runInDurableObject(stub, async (_room: PlatformerRoom, state: DurableObjectState) => (await state.storage.get<Stored>("room"))!);
  const dbTile = () => levelFromJson(world.document.level).tiles[TILE];
  return { ...f, world, socket, inbox, stub, stored, dbTile, request };
}

/** Advance the room's clock by `ms` and fire its alarm, as the runtime would. */
async function alarmAfter(room: { stub: DurableObjectStub<PlatformerRoom> }, ms: number): Promise<boolean> {
  const now = Date.now() + ms;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try { return await runDurableObjectAlarm(room.stub); } finally { clock.mockRestore(); }
}

/** Tile (9, 2) on a 40-wide level. */
const TILE = 89;
const edit = (tile: number, cid = `durable:${tile}`) => ({ type: "ev", cid, tick: 5, ev: { t: "edit", ops: [{ o: "tile", x: 9, y: 2, t: tile, c: 0 }] } });

it("keeps each accepted edit in storage before the save", async () => {
  const r = await openRoom();
  const gate = commitGate(); // the database is slow to answer
  r.db.commitGate = gate.wait;
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  const stored = await r.stored();
  expect(stored.unsaved).toBe(true);
  expect(levelFromJson(stored.pending!).tiles[TILE]).toBe(3);
  const saved = r.db.nextCommit();
  gate.release();
  await saved;
});

it("saves the final edit as the last editor after the last editor has left", async () => {
  const r = await openRoom();
  const saved = r.db.nextCommit();
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  r.socket.close();
  await saved;
  expect(r.dbTile()).toBe(3);
  expect((await r.stored()).pending).toBeUndefined();
});

it("keeps edits through a database outage and a restart, then saves them", async () => {
  const r = await openRoom();
  r.db.commitFailure = new Error("offline");
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  r.socket.close();
  await vi.waitFor(() => { if (r.db.commitAttempts < 1) throw new Error("no save tried yet"); }, { timeout: 4000, interval: 10 });
  expect(r.dbTile()).toBe(0);
  expect(levelFromJson((await r.stored()).pending!).tiles[TILE]).toBe(3);

  // A restart: everything in memory is gone and only storage is left (the retry alarms keep this room awake, so
  // the runtime's eviction helper would wait on them). The database is back; the next alarm saves what storage kept.
  await runInDurableObject(r.stub, async (room: PlatformerRoom) => {
    Object.assign(room as unknown as Record<string, unknown>, { core: null, commitFailures: 0, commitInFlight: false, saveNotice: null });
  });
  r.db.commitFailure = null;
  const saved = r.db.nextCommit();
  await alarmAfter(r, 10 * 60 * 1000);
  await saved;
  expect(r.dbTile()).toBe(3);
  expect((await r.stored()).pending).toBeUndefined();
});

it("does not expire a room whose edits are not saved", async () => {
  const r = await openRoom();
  r.db.commitFailure = new Error("offline");
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  r.socket.close();
  await vi.waitFor(() => { if (r.db.commitAttempts < 1) throw new Error("no save tried yet"); }, { timeout: 4000, interval: 10 });
  await alarmAfter(r, 3 * 60 * 60 * 1000);
  expect(levelFromJson((await r.stored()).pending!).tiles[TILE]).toBe(3);
});

it("refuses an edit while a due access check cannot run, then accepts it once the check works", async () => {
  const r = await openRoom();
  const rpc = vi.mocked(ClassroomService.prototype.rpc);
  const original = rpc.getMockImplementation()!;
  let down = true;
  rpc.mockImplementation(async function (this: ClassroomService, name, input) {
    if (name === "authorize_world" && down) throw new Error("permission service unavailable");
    return original.call(this, name, input);
  });
  await withClockAhead(61_000, async () => {
    send(r.socket, edit(3, "durable:down"));
    expect((await r.inbox.next("reject")) as unknown as { cid: string; reason: string }).toMatchObject({ cid: "durable:down", reason: "unchecked" });
    expect(r.inbox.peek("ev")).toHaveLength(0);
    down = false;
    const saved = r.db.nextCommit();
    send(r.socket, edit(4, "durable:up"));
    await r.inbox.next("ev");
    await saved;
  });
  expect(r.dbTile()).toBe(4);
});

it("after a revision conflict, keeps the room's copy and saves its edits on top of the newer version", async () => {
  const r = await openRoom();
  // Someone saved the world elsewhere after this room opened it: tile (1, 1) changed, the revision moved on.
  const elsewhere = createBlankLevel(40, 20, "Durable");
  elsewhere.tiles[41] = 5;
  r.world.document = createPlatformerDocument(elsewhere);
  (r.db.worlds[0] as unknown as { revision: number }).revision += 1;
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  await vi.waitFor(() => { if (r.dbTile() !== 3) throw new Error("not saved yet"); }, { timeout: 4000, interval: 10 });
  const saved = levelFromJson(r.world.document.level);
  expect(saved.tiles[41]).toBe(5); // their change
  expect(saved.tiles[TILE]).toBe(3); // ours, on top
  const copies = await recoveryCopies(r.stub);
  expect(copies).toHaveLength(1);
  expect(levelFromJson(copies[0].level).tiles[TILE]).toBe(3);
  expect((await r.stored()).pending).toBeUndefined();
});

it("keeps an unrebasable conflict after expiry and exports it only for a current teacher", async () => {
  const r = await openRoom();
  const worldId = r.db.worlds[0].id;
  r.db.worlds[0].revision += 1;
  const gate = commitGate();
  r.db.commitGate = gate.wait;
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  await runInDurableObject(r.stub, async (room: PlatformerRoom) => { (room as any).record.pendingOpsLost = true; });
  gate.release();
  await vi.waitFor(async () => {
    expect((await recoveryCopies(r.stub)).length).toBe(1);
    expect((await r.stored()).pending).toBeUndefined();
  }, { timeout: 4000, interval: 10 });
  const copy = (await recoveryCopies(r.stub))[0];
  expect(levelFromJson(copy.level).tiles[TILE]).toBe(3);
  expect(r.dbTile()).toBe(0);

  r.socket.close();
  await vi.waitFor(async () => expect(await runInDurableObject(r.stub, async (room: PlatformerRoom) => (room as any).openSockets().length)).toBe(0));
  await alarmAfter(r, 3 * 60 * 60 * 1000);
  expect(await runInDurableObject(r.stub, async (_room: PlatformerRoom, state: DurableObjectState) => state.storage.get("room"))).toBeUndefined();
  expect((await recoveryCopies(r.stub))[0]).toEqual(copy);

  const path = `/classroom/worlds/${worldId}/platformer-recovery`;
  const authenticate = vi.mocked(ClassroomService.prototype.authenticate);
  authenticate.mockImplementation(async (token) => {
    if (token === "teacher") return teacherCaller as never;
    const student = r.db.students.find((entry, index) => token === `student${index}` && entry);
    if (!student) throw new ClassroomHttpError(401, "sign_in_required", "Sign in first.");
    return { id: student.user_id, username: student.username, rosterName: student.roster_name, classId: student.class_id,
      role: "student", resetRequired: false, authVersion: student.auth_version,
      sessionId: student.session_id, token } as never;
  });
  r.db.worlds[0].owner_id = r.db.students[0].user_id;
  // The small fixture's authorize_world RPC has a fixed student ownership flag; mirror its updated owner row.
  const rpc = vi.mocked(ClassroomService.prototype.rpc);
  const originalRpc = rpc.getMockImplementation()!;
  rpc.mockImplementation(async function (this: ClassroomService, name, input) {
    const result = await originalRpc.call(this, name, input);
    return name === "authorize_world" && input.p_user_id === r.db.students[0].user_id && result && !result.error
      ? { ...result, isOwner: true } : result;
  });
  const spoofed = { method: "GET", headers: { "x-platformer-access": JSON.stringify({ kind: "classroom", access: r.teacherAccess(worldId) }) } };
  expect((await r.request(path, spoofed)).status).toBe(401);
  expect((await r.request(`${path}?ownerToken=guest-capability`, { method: "GET" })).status).toBe(401);
  expect((await r.request(`${path}/${copy.id}`, { method: "GET", headers: {
    authorization: "Bearer student1", "x-platformer-access": JSON.stringify({ kind: "classroom", access: r.teacherAccess(worldId) }),
  } })).status).toBe(403);
  const listing = await r.request(path, { method: "GET", headers: { authorization: "Bearer teacher" } });
  expect(listing.status).toBe(200);
  expect((await listing.json<{ copies: Array<{ id: string }> }>()).copies.map((item) => item.id)).toContain(copy.id);
  expect(listing.headers.get("cache-control")).toBe("no-store");
  const exported = await r.request(`${path}/${copy.id}`, { method: "GET", headers: { authorization: "Bearer student0" } });
  expect(exported.status).toBe(200);
  const downloaded = await exported.json<Recovery>();
  expect(levelFromJson(downloaded.level).tiles[TILE]).toBe(3);
  expect(Object.keys(downloaded).sort()).toEqual(["at", "id", "level", "revision", "worldId"]);
  expect((await r.request(`${path}/not-a-copy`, { method: "GET", headers: { authorization: "Bearer teacher" } })).status).toBe(404);
  expect((await r.request(path, { method: "POST", headers: { authorization: "Bearer teacher" } })).status).toBe(405);
  expect((await r.request(path, { method: "DELETE", headers: { authorization: "Bearer teacher" } })).status).toBe(405);
  expect((await r.request(`${path}/${copy.id}`, { method: "DELETE", headers: { "x-platformer-access": JSON.stringify({ kind: "classroom", access: r.teacherAccess(worldId) }) } })).status).toBe(401);
  expect((await r.request(`${path}/${copy.id}?ownerToken=guest-capability`, { method: "DELETE" })).status).toBe(401);
  expect((await r.request(`${path}/${copy.id}`, { method: "DELETE", headers: { authorization: "Bearer student1" } })).status).toBe(403);
  expect((await recoveryCopies(r.stub))).toHaveLength(1);
  expect((await r.request(`${path}/${copy.id}`, { method: "DELETE", headers: { authorization: "Bearer teacher" } })).status).toBe(204);
  expect(await recoveryCopies(r.stub)).toHaveLength(0);
  expect((await r.request(`${path}/${copy.id}`, { method: "GET", headers: { authorization: "Bearer student0" } })).status).toBe(404);
  r.db.worlds[0].document = createBrickStudioDocument([]);
  expect((await r.request(path, { method: "GET", headers: { authorization: "Bearer teacher" } })).status).toBe(409);
});

it("keeps each conflict copy when later conflicts occur", async () => {
  const r = await openRoom();
  for (const tile of [3, 4]) {
    r.db.worlds[0].revision += 1;
    const gate = commitGate();
    r.db.commitGate = gate.wait;
    send(r.socket, edit(tile, `conflict:${tile}`));
    await r.inbox.next("ev");
    await runInDurableObject(r.stub, async (room: PlatformerRoom) => { (room as any).record.pendingOpsLost = true; });
    gate.release();
    await vi.waitFor(async () => {
      expect((await recoveryCopies(r.stub)).length).toBe(tile === 3 ? 1 : 2);
      expect((await r.stored()).pending).toBeUndefined();
    }, { timeout: 4000, interval: 10 });
  }
  expect((await recoveryCopies(r.stub)).map((copy) => levelFromJson(copy.level).tiles[TILE]).sort()).toEqual([3, 4]);
});

it("parks pending edits when the recovery archive is full", async () => {
  const r = await openRoom();
  const worldId = r.db.worlds[0].id;
  await runInDurableObject(r.stub, async (_room: PlatformerRoom, state: DurableObjectState) => {
    const level = (await state.storage.get<Stored>("room"))!.level;
    for (let index = 0; index < MAX_PLATFORMER_RECOVERY_COPIES; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      await state.storage.put(`recovery:${id}`, { id, worldId, level, revision: 1, at: index } satisfies Recovery);
    }
  });
  r.db.worlds[0].revision += 1;
  const gate = commitGate();
  r.db.commitGate = gate.wait;
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  await runInDurableObject(r.stub, async (room: PlatformerRoom) => { (room as any).record.pendingOpsLost = true; });
  gate.release();
  await vi.waitFor(async () => {
    const stored = await r.stored();
    expect(levelFromJson(stored.pending!).tiles[TILE]).toBe(3);
    expect(stored.commitDueAt).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
  }, { timeout: 4000, interval: 10 });
  expect((await recoveryCopies(r.stub))).toHaveLength(MAX_PLATFORMER_RECOVERY_COPIES);
  expect(r.dbTile()).toBe(0);
  r.socket.close();
  await alarmAfter(r, 3 * 60 * 60 * 1000);
  expect(levelFromJson((await r.stored()).pending!).tiles[TILE]).toBe(3);

  const oldCopies = await recoveryCopies(r.stub);
  const removed = oldCopies[0];
  const path = `/classroom/worlds/${worldId}/platformer-recovery/${removed.id}`;
  expect((await r.request(path, { method: "DELETE", headers: { authorization: "Bearer teacher" } })).status).toBe(204);
  const afterDelete = await r.stored();
  expect(levelFromJson(afterDelete.pending!).tiles[TILE]).toBe(3);
  expect(levelFromJson(afterDelete.level).tiles[TILE]).toBe(0);
  expect(r.dbTile()).toBe(0);
  expect(afterDelete.commitDueAt).toBeLessThan(Date.now() + 5_000);
  const remaining = await recoveryCopies(r.stub);
  expect(remaining).toHaveLength(MAX_PLATFORMER_RECOVERY_COPIES - 1);
  expect(remaining.some((copy) => copy.id === removed.id)).toBe(false);
  expect(remaining.some((copy) => copy.id === oldCopies[1].id)).toBe(true);

  await alarmAfter(r, 2_000);
  await vi.waitFor(async () => expect((await r.stored()).pending).toBeUndefined());
  const recovered = await recoveryCopies(r.stub);
  expect(recovered).toHaveLength(MAX_PLATFORMER_RECOVERY_COPIES);
  expect(recovered.some((copy) => levelFromJson(copy.level).tiles[TILE] === 3)).toBe(true);
  expect(r.dbTile()).toBe(0);
});

it("moves an older room-embedded recovery copy before room expiry", async () => {
  const r = await openRoom();
  const worldId = r.db.worlds[0].id;
  await runInDurableObject(r.stub, async (room: PlatformerRoom, state: DurableObjectState) => {
    const record = (room as any).record;
    const level = createBlankLevel(40, 20, "Durable");
    level.tiles[TILE] = 3;
    record.conflictCopy = { level: createPlatformerDocument(level).level, revision: 1, at: Date.now() };
    await state.storage.put("room", record);
  });
  r.socket.close();
  await vi.waitFor(async () => expect(await runInDurableObject(r.stub, async (room: PlatformerRoom) => (room as any).openSockets().length)).toBe(0));
  await alarmAfter(r, 3 * 60 * 60 * 1000);
  expect(await runInDurableObject(r.stub, async (_room: PlatformerRoom, state: DurableObjectState) => state.storage.get("room"))).toBeUndefined();
  const copies = await recoveryCopies(r.stub);
  expect(copies).toHaveLength(1);
  expect(copies[0].id).toBe("legacy");
  expect(levelFromJson(copies[0].level).tiles[TILE]).toBe(3);
  expect((await r.request(`/classroom/worlds/${worldId}/platformer-recovery/legacy`, {
    method: "DELETE", headers: { authorization: "Bearer teacher" },
  })).status).toBe(204);
  expect(await recoveryCopies(r.stub)).toHaveLength(0);
});

it("removes a legacy embedded copy without changing the live level", async () => {
  const r = await openRoom();
  const worldId = r.db.worlds[0].id;
  await runInDurableObject(r.stub, async (room: PlatformerRoom, state: DurableObjectState) => {
    const record = (room as any).record;
    const level = createBlankLevel(40, 20, "Durable");
    level.tiles[TILE] = 3;
    record.conflictCopy = { level: createPlatformerDocument(level).level, revision: 1, at: Date.now() };
    await state.storage.put("room", record);
  });
  expect((await r.request(`/classroom/worlds/${worldId}/platformer-recovery/legacy`, {
    method: "DELETE", headers: { authorization: "Bearer teacher" },
  })).status).toBe(204);
  const stored = await r.stored() as Stored & { conflictCopy?: unknown };
  expect(stored.conflictCopy).toBeUndefined();
  expect(levelFromJson(stored.level).tiles[TILE]).toBe(0);
  expect(stored.pending).toBeUndefined();
  expect(await recoveryCopies(r.stub)).toHaveLength(0);
  expect(r.dbTile()).toBe(0);
});

it("waits for the retry time, not every second, once an unsaved room is past its expiry", async () => {
  const r = await openRoom();
  r.db.commitFailure = new Error("offline");
  send(r.socket, edit(3));
  await r.inbox.next("ev");
  r.socket.close();
  await vi.waitFor(() => { if (r.db.commitAttempts < 1) throw new Error("no save tried yet"); }, { timeout: 4000, interval: 10 });
  const later = Date.now() + 3 * 60 * 60 * 1000;
  const clock = vi.spyOn(Date, "now").mockReturnValue(later);
  try {
    await runDurableObjectAlarm(r.stub);
    const next = await runInDurableObject(r.stub, async (_room: PlatformerRoom, state: DurableObjectState) => {
      const record = (await state.storage.get<Stored & { commitDueAt?: number }>("room"))!;
      return { alarm: await state.storage.getAlarm(), due: record.commitDueAt, pending: !!record.pending };
    });
    expect(next.pending).toBe(true);
    // The backoff's next step (not a wake-up every second because the old expiry has passed).
    expect(next.alarm).toBe(next.due);
    expect(next.due! - later).toBe(2000);
  } finally {
    clock.mockRestore();
  }
});
