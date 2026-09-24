/*
 * 2D class rooms keep edits the database does not have yet: in storage as each edit lands, through the last
 * player leaving, a database outage and a restart, saved as the last editor without anyone connected. And a
 * failed access check never lets an edit through. (From the pre-ship review, findings 2 and 6.)
 */
import { createPlatformerDocument } from "@brick-studio/platformer-core/document";
import { createBlankLevel, levelFromJson, type LevelJson } from "@brick-studio/platformer-core/engine/level";
import { PROTOCOL } from "@brick-studio/platformer-core/net/protocol";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { ClassroomService } from "../src/classroom";
import { handleReleaseRequest } from "../src/classroomRoutes";
import type { Env } from "../src/index";
import type { PlatformerRoom } from "../src/platformerRoom";
import { commitGate, fakeEnv, fixture, Inbox, randomWorldUuid, routeEnv, send, sockets, teacherCaller, withClockAhead, workerEnv } from "./classroomFixture";

afterEach(() => {
  for (const socket of sockets.splice(0)) try { socket.close(); } catch { /* already closed */ }
  vi.restoreAllMocks();
});

type Stored = { level: LevelJson; pending?: LevelJson; unsaved?: boolean };

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
  return { ...f, world, socket, inbox, stub, stored, dbTile };
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
  const stored = await runInDurableObject(r.stub, async (_room: PlatformerRoom, state: DurableObjectState) =>
    (await state.storage.get<Stored & { conflictCopy?: { level: LevelJson } }>("room"))!);
  expect(levelFromJson(stored.conflictCopy!.level).tiles[TILE]).toBe(3);
  expect(stored.pending).toBeUndefined();
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
