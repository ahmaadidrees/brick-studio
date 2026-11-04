import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HACKABLE_PROTOCOL } from "../../../src/platformer/lab/rooms/protocol";
import { ClassroomService } from "../src/classroom";
import { handleReleaseRequest } from "../src/classroomRoutes";
import type { HackableRoom } from "../src/hackableRoom";
import type { Env } from "../src/index";
import { Inbox, fakeEnv, fixture, randomWorldUuid, routeEnv, send, sockets, teacherCaller, workerEnv } from "./classroomFixture";
import projects from "./fixtures/hackableProjects.json";

/** Hackable rooms M1 (docs/qa/hackable-rooms): the Worker's routes and the HackableRoom Durable Object. */

const env = { ...routeEnv, HACKABLE_ROOMS: workerEnv.HACKABLE_ROOMS } as Env;

afterEach(() => {
  for (const socket of sockets.splice(0)) try { socket.close(); } catch { /* already closed */ }
  vi.restoreAllMocks();
});

async function request(path: string, init: RequestInit = {}) {
  return handleReleaseRequest(new Request(`https://worker.test${path}`, init), env);
}

async function connect(path: string) {
  const response = await request(path, { headers: { Upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const inbox = new Inbox(socket);
  socket.accept();
  return { socket, inbox };
}

async function hello(player: { socket: WebSocket; inbox: Inbox }, name: string, key: string) {
  send(player.socket, { type: "hello", v: HACKABLE_PROTOCOL, name, key });
  return player.inbox.next("welcome");
}

async function guestRoom(project = projects.platformer) {
  const created = await request("/hackable/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project, title: "Maya's level" }) });
  expect(created.status).toBe(201);
  return created.json<{ roomId: string; ownerToken: string }>();
}

describe("Hackable guest rooms", () => {
  it("open from a project, host their owner, order keys and joins, and take only the host's edits", async () => {
    const { roomId, ownerToken } = await guestRoom();
    expect(await (await request(`/hackable/rooms/${roomId}`)).json()).toMatchObject({ roomId, title: "Maya's level", kit: "platformer", players: 0, full: false, closed: false });

    const owner = await connect(`/hackable/rooms/${roomId}/connect?ownerToken=${ownerToken}`);
    const welcome = await hello(owner, "Maya", "browser-a");
    expect(welcome).toMatchObject({ you: 1, host: true, classroom: false, title: "Maya's level" });
    expect((welcome.base as { project: string }).project).toBe(projects.platformer);
    // The owner's own join is the first event, a moment ahead.
    expect((welcome.events as Array<{ ev: unknown }>)[0].ev).toEqual({ t: "join", num: 1, name: "Maya" });

    const guest = await connect(`/hackable/rooms/${roomId}/connect`);
    expect(await hello(guest, "Sam", "browser-b")).toMatchObject({ you: 2, host: false });
    expect((await owner.inbox.next("ev")).e).toMatchObject({ by: 0, ev: { t: "join", num: 2, name: "Sam" } });

    send(guest.socket, { type: "ev", cid: "b:1", tick: 1, ev: { t: "key", key: "right arrow", down: true } });
    expect((await owner.inbox.next("ev")).e).toMatchObject({ by: 2, cid: "b:1", ev: { t: "key", key: "right arrow", down: true } });
    // Everyone hears every event, their own too (that is how a game learns the room took it).
    expect((await guest.inbox.next("ev")).e).toMatchObject({ cid: "b:1" });
    // Shift is a game key (the Hero runs with it, as in classic).
    send(guest.socket, { type: "ev", cid: "b:s1", tick: 1, ev: { t: "key", key: "shift", down: true } });
    expect((await owner.inbox.next("ev")).e).toMatchObject({ by: 2, cid: "b:s1", ev: { t: "key", key: "shift", down: true } });
    expect((await guest.inbox.next("ev")).e).toMatchObject({ cid: "b:s1" });
    send(guest.socket, { type: "ev", cid: "b:s2", tick: 1, ev: { t: "key", key: "shift", down: false } });
    expect((await owner.inbox.next("ev")).e).toMatchObject({ by: 2, cid: "b:s2", ev: { t: "key", key: "shift", down: false } });
    expect((await guest.inbox.next("ev")).e).toMatchObject({ cid: "b:s2" });

    // A guest's edit is refused; the host's goes to everyone and becomes the room's project.
    send(guest.socket, { type: "ev", cid: "b:2", tick: 2, ev: { t: "restart" } });
    expect(await guest.inbox.next("reject")).toMatchObject({ cid: "b:2", reason: "host_only" });
    const edited = projects.platformer.replace('"name":"Hero"', '"name":"Super Hero"');
    expect(edited).not.toBe(projects.platformer);
    send(owner.socket, { type: "ev", cid: "a:1", tick: 3, ev: { t: "project", text: edited, restart: true } });
    expect((await guest.inbox.next("ev")).e).toMatchObject({ by: 1, ev: { t: "project", restart: true } });
    // A project that does not read is refused.
    await new Promise((r) => setTimeout(r, 600));
    send(owner.socket, { type: "ev", cid: "a:2", tick: 4, ev: { t: "project", text: "{}", restart: false } });
    expect(await owner.inbox.next("reject")).toMatchObject({ cid: "a:2", reason: "invalid" });

    // The guest drops while holding a key: the room lets go of it for them, and their Hero waits in case they come back.
    await owner.inbox.next("players"); // Sam's arrival
    send(guest.socket, { type: "ev", cid: "b:3", tick: 5, ev: { t: "key", key: "space", down: true } });
    let held = await owner.inbox.next("ev");
    while ((held.e as { cid: string }).cid !== "b:3") held = await owner.inbox.next("ev");
    guest.socket.close();
    // Sam still held right arrow from before, and space.
    const ups: unknown[] = [];
    while (ups.length < 2) {
      const e = (await owner.inbox.next("ev")).e as { ev: { t: string } };
      if (e.ev.t === "key") ups.push(e);
    }
    expect(ups).toMatchObject([{ by: 2, ev: { t: "key", key: "right arrow", down: false } }, { by: 2, ev: { t: "key", key: "space", down: false } }]);
    expect((await owner.inbox.next("players")).players).toEqual([
      { num: 1, name: "Maya", provider: true, host: true },
      { num: 2, name: "Sam", provider: false, host: false, away: true },
    ]);
    // The host removes them: their Hero goes now, for everyone.
    send(owner.socket, { type: "kick", num: 2 });
    let leave = await owner.inbox.next("ev");
    while ((leave.e as { ev: { t: string } }).ev.t !== "leave") leave = await owner.inbox.next("ev");
    expect(leave.e).toMatchObject({ by: 0, ev: { t: "leave", num: 2 } });
    expect((await owner.inbox.next("players")).players).toEqual([{ num: 1, name: "Maya", provider: true, host: true }]);
    expect(await owner.inbox.next("settings")).toMatchObject({ banned: 1 });

    const stub = workerEnv.HACKABLE_ROOMS.get(workerEnv.HACKABLE_ROOMS.idFromName(roomId));
    await runInDurableObject(stub, async (_instance: HackableRoom, state) => {
      const stored = await state.storage.get<{ project: string }>("room");
      expect(stored?.project).toBe(edited);
    });
  });

  it("refuse projects that do not read, and unknown rooms", async () => {
    const bad = await request("/hackable/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: "{\"design\":{}}" }) });
    expect(bad.status).toBe(400);
    expect((await request(`/hackable/rooms/${"0".repeat(32)}`)).status).toBe(404);
  });

  it("keep a Racing room's game: a Platformer project can't replace it", async () => {
    const { roomId, ownerToken } = await guestRoom(projects.race);
    const owner = await connect(`/hackable/rooms/${roomId}/connect?ownerToken=${ownerToken}`);
    await hello(owner, "Ava", "browser-a");
    send(owner.socket, { type: "ev", cid: "a:1", tick: 3, ev: { t: "project", text: projects.platformer, restart: true } });
    expect(await owner.inbox.next("reject")).toMatchObject({ cid: "a:1", reason: "invalid" });
  });
});

describe("Hackable class projects", () => {
  function classProject(document: unknown) {
    const worldId = randomWorldUuid();
    const f = fixture([worldId]);
    (f.db.worlds[0] as { document: unknown }).document = document;
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({ ...teacherCaller } as never);
    return { ...f, worldId };
  }
  const saved = (text: string) => {
    const save = JSON.parse(text) as Record<string, unknown>;
    return { format: "brickgineers-hackable", version: 1, save: { ...save, workspaces: { brick_hero: { blocks: {} } } } };
  };

  it("open with a Hackable ticket from the account's project, with the teacher hosting", async () => {
    const { worldId } = classProject(saved(projects.platformer));
    const ticketed = await request(`/classroom/worlds/${worldId}/hackable-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    expect(ticketed.status).toBe(200);
    const { ticket } = await ticketed.json<{ ticket: string }>();
    const stub = workerEnv.HACKABLE_ROOMS.get(workerEnv.HACKABLE_ROOMS.idFromName(worldId.replaceAll("-", "")));
    await runInDurableObject(stub, async (instance: HackableRoom) => { Object.assign((instance as unknown as { env: object }).env, fakeEnv); });

    // A 2D room will not take its ticket, and a guest link cannot open a class room.
    expect((await request(`/platformer/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: "websocket" } })).status).toBe(401);
    expect((await request(`/hackable/rooms/${worldId.replaceAll("-", "")}`)).status).toBe(404);

    const teacher = await connect(`/hackable/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`);
    const welcome = await hello(teacher, "Anything", "ignored");
    expect(welcome).toMatchObject({ host: true, classroom: true });
    expect((welcome.players as Array<{ name: string }>)[0].name).toBe("Teacher");
    // The room plays the project without the editor's workspaces.
    const project = JSON.parse((welcome.base as { project: string }).project) as Record<string, unknown>;
    expect(project.workspaces).toBeUndefined();
    expect(project.design).toEqual(JSON.parse(projects.platformer).design);
  });

  it("refuse a ticket for anything that is not a Hackable project", async () => {
    const { worldId } = classProject({ format: "brickgineers-2d", version: 1, level: {} });
    const ticket = await request(`/classroom/worlds/${worldId}/hackable-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    expect(ticket.status).toBe(409);
  });
});
