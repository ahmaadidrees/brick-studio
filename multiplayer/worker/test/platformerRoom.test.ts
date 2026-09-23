import { createPlatformerDocument, type PlatformerDocument } from "@brick-studio/platformer-core/document";
import { createBlankLevel, levelFromJson, levelToJson } from "@brick-studio/platformer-core/engine/level";
import { PROTOCOL } from "@brick-studio/platformer-core/net/protocol";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomService } from "../src/classroom";
import { handleReleaseRequest } from "../src/classroomRoutes";
import type { Env } from "../src/index";
import type { PlatformerRoom } from "../src/platformerRoom";
import { Inbox, fakeEnv, fixture, randomWorldUuid, routeEnv, send, sockets, teacherCaller, workerEnv, worldDocument } from "./classroomFixture";

const env = { ...routeEnv, PLATFORMER_ROOMS: workerEnv.PLATFORMER_ROOMS } as Env;

afterEach(() => {
  for (const socket of sockets.splice(0)) try { socket.close(); } catch { /* already closed */ }
  vi.restoreAllMocks();
});

const level = (title = "Test level") => levelToJson(createBlankLevel(40, 20, title));
const edit = (cid: string, x = 2) => ({ type: "ev", cid, tick: 5, ev: { t: "edit", ops: [{ o: "tile", x, y: 2, t: 3, c: 0 }] } });

async function request(path: string, init: RequestInit = {}) {
  return handleReleaseRequest(new Request(`https://worker.test${path}`, init), env);
}

async function connect(path: string, headers: Record<string, string> = {}) {
  const response = await request(path, { headers: { Upgrade: "websocket", ...headers } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const inbox = new Inbox(socket);
  socket.accept();
  return { socket, inbox };
}

async function hello(player: { socket: WebSocket; inbox: Inbox }, name: string, key: string) {
  send(player.socket, { type: "hello", v: PROTOCOL, name, key });
  return player.inbox.next("welcome");
}

async function guestRoom(title?: string) {
  const created = await request("/platformer/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ level: level(title) }) });
  expect(created.status).toBe(201);
  return created.json<{ roomId: string; ownerToken: string }>();
}

describe("2D guest rooms", () => {
  it("open from a level, host their owner and pass events around", async () => {
    const { roomId, ownerToken } = await guestRoom();
    expect(roomId).toMatch(/^[a-f0-9]{32}$/);
    expect(ownerToken).toMatch(/^[a-f0-9]{64}$/);
    expect(await (await request(`/platformer/rooms/${roomId}`)).json()).toMatchObject({ roomId, title: "Test level", players: 0, full: false, closed: false });

    const owner = await connect(`/platformer/rooms/${roomId}/connect?ownerToken=${ownerToken}`);
    expect(await hello(owner, "Ava", "browser-a")).toMatchObject({ you: 1, host: true, canBuild: true, classroom: false });
    const guest = await connect(`/platformer/rooms/${roomId}/connect`);
    expect(await hello(guest, "Ben", "browser-b")).toMatchObject({ you: 2, host: false });
    // A wrong token, or the right one in a header instead of the link, does not make a host.
    const wrong = await connect(`/platformer/rooms/${roomId}/connect?ownerToken=${"0".repeat(64)}`, { "x-platformer-access": JSON.stringify({ kind: "guest", ownerToken }) });
    expect(await hello(wrong, "Cy", "browser-c")).toMatchObject({ you: 3, host: false });

    send(guest.socket, edit("b:1"));
    expect((await owner.inbox.next("ev")).e).toMatchObject({ cid: "b:1", by: 2 });
    send(guest.socket, { type: "pose", p: { m: 0, x: 10, y: 20, f: 1, a: "stand", s: 0, v: 1, q: 0, t: 1 } });
    expect((await owner.inbox.next("poses")).list).toEqual([[2, { m: 0, x: 10, y: 20, f: 1, a: "stand", s: 0, v: 1, q: 0, t: 1 }]]);

    // The host locks building; players keep playing but their edits are refused.
    send(owner.socket, { type: "settings", buildLocked: true });
    await guest.inbox.next("settings");
    send(guest.socket, edit("b:2"));
    expect(await guest.inbox.next("reject")).toMatchObject({ cid: "b:2", reason: "locked" });
    expect(await (await request(`/platformer/rooms/${roomId}`)).json()).toMatchObject({ players: 3 });
  });

  it("keep the level in storage once everyone has left", async () => {
    const { roomId } = await guestRoom();
    const player = await connect(`/platformer/rooms/${roomId}/connect`);
    await hello(player, "Ava", "browser-a");
    send(player.socket, edit("a:1", 7));
    await player.inbox.next("ev");
    player.socket.close();
    const stub = workerEnv.PLATFORMER_ROOMS.get(workerEnv.PLATFORMER_ROOMS.idFromName(roomId));
    await vi.waitFor(async () => {
      const stored = await runInDurableObject(stub, async (_room: PlatformerRoom, state: DurableObjectState) => state.storage.get<{ level: unknown }>("room"));
      expect(levelFromJson(stored!.level).tiles[2 * 40 + 7]).toBe(3);
    }, { timeout: 4000, interval: 50 });
  });

  it("refuse levels that do not parse and unknown rooms", async () => {
    const bad = await request("/platformer/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ level: { w: 99999 } }) });
    expect(bad.status).toBe(400);
    expect((await request(`/platformer/rooms/${"a".repeat(32)}`)).status).toBe(404);
  });
});

describe("2D class levels", () => {
  /** A fixture world holding a 2D level (the fixture's worlds are group worlds owned by the teacher). */
  function classLevel() {
    const worldId = randomWorldUuid();
    const f = fixture([worldId]);
    const world = f.db.worlds[0] as unknown as { document: PlatformerDocument; id: string; revision: number };
    world.document = createPlatformerDocument(createBlankLevel(40, 20, "Class level"));
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({ ...teacherCaller } as never);
    return { ...f, world, worldId };
  }

  async function patchRoomEnv(worldId: string) {
    const stub = workerEnv.PLATFORMER_ROOMS.get(workerEnv.PLATFORMER_ROOMS.idFromName(worldId.replaceAll("-", "")));
    await runInDurableObject(stub, async (instance: PlatformerRoom) => { Object.assign((instance as unknown as { env: object }).env, fakeEnv); });
    return stub;
  }

  it("open with a 2D ticket and save edits back to the account level", async () => {
    const { db, world, worldId } = classLevel();
    const ticketed = await request(`/classroom/worlds/${worldId}/platformer-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    expect(ticketed.status).toBe(200);
    const { ticket } = await ticketed.json<{ ticket: string }>();
    await patchRoomEnv(worldId);

    // The 3D room will not take a 2D ticket, and the 2D room will not take someone else's world.
    expect((await request(`/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: "websocket" } })).status).toBe(401);
    expect((await request(`/platformer/worlds/${randomWorldUuid()}/connect?ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: "websocket" } })).status).toBe(403);
    // A guest link cannot open a class room.
    expect((await request(`/platformer/rooms/${worldId.replaceAll("-", "")}`)).status).toBe(404);

    const teacher = await connect(`/platformer/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`);
    const welcome = await hello(teacher, "Anything", "ignored");
    expect(welcome).toMatchObject({ host: true, canBuild: true, classroom: true });
    expect((welcome.players as Array<{ name: string }>)[0].name).toBe("Teacher");

    const saved = db.nextCommit();
    send(teacher.socket, edit("t:1", 9));
    await teacher.inbox.next("ev");
    await saved;
    expect(db.commits).toHaveLength(1);
    expect(world.revision).toBe(2);
    expect(world.document.format).toBe("brickgineers-2d");
    expect(levelFromJson(world.document.level).tiles[2 * 40 + 9]).toBe(3);
  });

  it("let look-only classmates play but not build", async () => {
    const { worldId, studentAccess } = classLevel();
    await request(`/classroom/worlds/${worldId}/platformer-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    const stub = await patchRoomEnv(worldId);
    const response = await stub.fetch("https://platformer.internal/connect", {
      headers: { Upgrade: "websocket", "x-platformer-access": JSON.stringify({ kind: "classroom", access: { ...studentAccess(0, worldId), canEdit: false } }) },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    sockets.push(socket);
    const viewer = { socket, inbox: new Inbox(socket) };
    socket.accept();
    const welcome = await hello(viewer, "Teacher", "ignored");
    expect(welcome).toMatchObject({ host: false, canBuild: false });
    expect((welcome.players as Array<{ name: string }>)[0].name).toBe("Builder1");
    send(socket, edit("s:1"));
    expect(await viewer.inbox.next("reject")).toMatchObject({ cid: "s:1", reason: "read_only" });
  });

  it("close sockets on a pushed revocation and reload a level saved elsewhere", async () => {
    const { world, worldId } = classLevel();
    const { ticket } = await (await request(`/classroom/worlds/${worldId}/platformer-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } })).json<{ ticket: string }>();
    const stub = await patchRoomEnv(worldId);
    const teacher = await connect(`/platformer/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`);
    await hello(teacher, "Teacher", "ignored");

    // Someone saved a newer copy from the 2D builder: the room takes it and tells everyone.
    world.revision = 5;
    world.document = createPlatformerDocument(createBlankLevel(40, 20, "Newer copy"));
    const pushed = await stub.fetch("https://platformer.internal/internal/classroom-invalidate", { method: "POST", body: JSON.stringify({ change: "metadata" }) });
    expect(pushed.status).toBe(200);
    const load = await teacher.inbox.next("ev");
    expect(load.e).toMatchObject({ by: 0, ev: { t: "load" } });
    expect(((load.e as { ev: { level: { title: string } } }).ev.level).title).toBe("Newer copy");
    expect(await teacher.inbox.next("notice")).toMatchObject({ message: expect.stringContaining("updated") });

    const revoked = await stub.fetch("https://platformer.internal/internal/classroom-invalidate", { method: "POST", body: JSON.stringify({ userId: teacherCaller.id, change: "revocation" }) });
    expect(revoked.status).toBe(200);
    expect(await teacher.inbox.next("error")).toMatchObject({ code: "access" });
  });

  it("keep 2D levels and 3D worlds apart", async () => {
    const { worldId } = classLevel();
    // A 3D live ticket for a 2D level is refused.
    const live = await request(`/classroom/worlds/${worldId}/live-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    expect(live.status).toBe(409);
    expect(await live.json()).toMatchObject({ code: "wrong_world_kind" });

    const other = randomWorldUuid();
    const f = fixture([other]);
    f.db.worlds[0].document = worldDocument();
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({ ...teacherCaller } as never);
    const ticket = await request(`/classroom/worlds/${other}/platformer-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    expect(ticket.status).toBe(409);
    expect(await ticket.json()).toMatchObject({ code: "wrong_world_kind" });
  });

  it("save a 2D level only over a 2D level", async () => {
    const { world, worldId } = classLevel();
    const put = (id: string, document: unknown, revision: number) => request(`/classroom/worlds/${id}`, {
      method: "PUT", headers: { authorization: "Bearer teacher", "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: revision, document }),
    });
    const ok = await put(worldId, createPlatformerDocument(createBlankLevel(40, 20, "Saved from the builder")), 1);
    expect(ok.status).toBe(200);
    const body = await ok.json<{ world: { format: string; revision: number } }>();
    expect(body.world).toMatchObject({ format: "2d", revision: 2 });
    expect(world.document.level.title).toBe("Saved from the builder");
    const brick = await put(worldId, worldDocument(), 2);
    expect(brick.status).toBe(400);
    expect(await brick.json()).toMatchObject({ code: "wrong_world_kind" });

    const other = randomWorldUuid();
    const f = fixture([other]);
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({ ...teacherCaller } as never);
    const flat = await put(other, createPlatformerDocument(createBlankLevel(40, 20, "Nope")), f.db.worlds[0].revision);
    expect(flat.status).toBe(400);
    expect(await flat.json()).toMatchObject({ code: "wrong_world_kind" });
  });
});
