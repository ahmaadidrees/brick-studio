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

async function guestRoom(project = projects.platformer, workspaces?: Record<string, unknown>) {
  const created = await request("/hackable/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project, title: "Maya's level", ...(workspaces ? { workspaces } : {}) }) });
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
      { num: 1, name: "Maya", provider: true, host: true, build: true, code: true },
      { num: 2, name: "Sam", provider: false, host: false, away: true, build: true, code: false },
    ]);
    // The host removes them: their Hero goes now, for everyone.
    send(owner.socket, { type: "kick", num: 2 });
    let leave = await owner.inbox.next("ev");
    while ((leave.e as { ev: { t: string } }).ev.t !== "leave") leave = await owner.inbox.next("ev");
    expect(leave.e).toMatchObject({ by: 0, ev: { t: "leave", num: 2 } });
    expect((await owner.inbox.next("players")).players).toEqual([{ num: 1, name: "Maya", provider: true, host: true, build: true, code: true }]);
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

/** Building together (docs/qa/hackable-rooms M2): edits as room events, checked by role in the real Durable Object. */
describe("Hackable rooms: building together (M2)", () => {
  const design = () => JSON.parse(projects.platformer).design as { copies: Array<Record<string, unknown>>; bricks: Array<Record<string, unknown>> };
  const moveHero = (x: number) => ({ op: "copy", copy: { ...design().copies[0], x } });
  const renameHero = (name: string, ws?: unknown) => ({ op: "brick", brick: { ...design().bricks[0], name }, ...(ws ? { ws } : {}) });
  /** Events until one from `cid` (the room's answer to it), or a reject for it. */
  async function answer(inbox: Inbox, cid: string) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const rejected = inbox.peek("reject").find((m) => m.cid === cid);
      if (rejected) return rejected;
      const ev = inbox.peek("ev").find((m) => (m.e as { cid: string }).cid === cid);
      if (ev) return ev;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`No answer for ${cid}`);
  }

  it("classmates build by default; code waits for the host; blocks travel and are kept; undo is the author's or the host's", async () => {
    const blocks = { brick_hero: { blocks: { languageVersion: 0, blocks: [] }, from: "creation" } };
    const { roomId, ownerToken } = await guestRoom(projects.platformer, blocks);
    const owner = await connect(`/hackable/rooms/${roomId}/connect?ownerToken=${ownerToken}`);
    const welcome = await hello(owner, "Maya", "browser-a");
    expect(welcome.settings).toEqual({ closed: false, build: true, code: false });
    expect(welcome.history).toEqual([]);
    const guest = await connect(`/hackable/rooms/${roomId}/connect`);
    await hello(guest, "Sam", "browser-b");

    // Sam builds (moves the Hero's starting spot): everyone gets it, and it is in the history.
    send(guest.socket, { type: "ev", cid: "b:1", tick: 1, ev: { t: "edit", ops: [moveHero(120)] } });
    expect((await answer(owner.inbox, "b:1")).e).toMatchObject({ by: 2, ev: { t: "edit", ops: [{ op: "copy" }] } });
    expect((await owner.inbox.next("history")).history).toEqual([{ seq: expect.any(Number), by: 2, name: "Sam", summary: "moved Hero", kind: "build" }]);
    // Sam may not change code yet.
    send(guest.socket, { type: "ev", cid: "b:2", tick: 2, ev: { t: "edit", ops: [renameHero("Sam's Hero", { from: "Sam" })] } });
    expect(await answer(guest.inbox, "b:2")).toMatchObject({ type: "reject", reason: "not_allowed" });
    // The host lets Sam change code; now his edit goes through, with its blocks.
    send(owner.socket, { type: "grant", num: 2, code: true });
    let players = await owner.inbox.next("players");
    while (!(players.players as Array<{ num: number; code?: boolean }>).find((p) => p.num === 2)?.code) players = await owner.inbox.next("players");
    send(guest.socket, { type: "ev", cid: "b:3", tick: 3, ev: { t: "edit", ops: [renameHero("Sam's Hero", { from: "Sam" })] } });
    expect((await answer(owner.inbox, "b:3")).e).toMatchObject({ by: 2, ev: { t: "edit", ops: [{ op: "brick", ws: { from: "Sam" } }] } });
    // Anyone may ask for a brick's blocks.
    send(owner.socket, { type: "workspace", id: "brick_hero" });
    expect(await owner.inbox.next("workspace")).toMatchObject({ id: "brick_hero", ws: { from: "Sam" } });
    // Presence.
    send(guest.socket, { type: "presence", what: "Hero's code" });
    players = await owner.inbox.next("players");
    while (!(players.players as Array<{ num: number; editing?: string }>).find((p) => p.num === 2)?.editing) players = await owner.inbox.next("players");
    expect((players.players as Array<{ num: number; editing?: string }>).find((p) => p.num === 2)?.editing).toBe("Hero's code");

    // The host puts back Sam's rename: the room's own edit, by the host.
    let history = await owner.inbox.next("history");
    while ((history.history as unknown[]).length < 2) history = await owner.inbox.next("history");
    const rename = (history.history as Array<{ seq: number; summary: string }>).find((h) => h.summary === "renamed Hero to Sam's Hero")!;
    expect(rename).toBeTruthy();
    send(owner.socket, { type: "undo", seq: rename.seq });
    let undo = await guest.inbox.next("ev");
    while ((undo.e as { ev: { undoOf?: number } }).ev.undoOf === undefined) undo = await guest.inbox.next("ev");
    expect(undo.e).toMatchObject({ by: 1, ev: { t: "edit", undoOf: rename.seq, ops: [{ op: "brick", brick: { name: "Hero" }, ws: blocks.brick_hero }] } });

    // The room keeps the project and its blocks as they are now.
    const stub = workerEnv.HACKABLE_ROOMS.get(workerEnv.HACKABLE_ROOMS.idFromName(roomId));
    await vi.waitFor(async () => {
      await runInDurableObject(stub, async (_instance: HackableRoom, state) => {
        const stored = await state.storage.get<{ project: string }>("room");
        expect(JSON.parse(stored!.project).design.copies[0].x).toBe(120);
        expect(JSON.parse(stored!.project).design.bricks[0].name).toBe("Hero");
        expect(await state.storage.get("workspaces")).toEqual(blocks);
      });
    });
  });

  it("building off stops classmates, not the host; a classmate can't hand out code", async () => {
    const { roomId, ownerToken } = await guestRoom();
    const owner = await connect(`/hackable/rooms/${roomId}/connect?ownerToken=${ownerToken}`);
    await hello(owner, "Maya", "browser-a");
    const guest = await connect(`/hackable/rooms/${roomId}/connect`);
    await hello(guest, "Sam", "browser-b");
    send(guest.socket, { type: "grant", num: 2, code: true });
    send(guest.socket, { type: "settings", code: true });
    send(owner.socket, { type: "settings", build: false });
    expect((await guest.inbox.next("settings")).settings).toEqual({ closed: false, build: false, code: false });
    send(guest.socket, { type: "ev", cid: "b:1", tick: 1, ev: { t: "edit", ops: [moveHero(200)] } });
    expect(await answer(guest.inbox, "b:1")).toMatchObject({ type: "reject", reason: "not_allowed" });
    send(owner.socket, { type: "ev", cid: "a:1", tick: 1, ev: { t: "edit", ops: [moveHero(200)] } });
    expect((await answer(guest.inbox, "a:1")).e).toMatchObject({ by: 1 });
    // An edit that does not read is refused, whoever sends it.
    send(owner.socket, { type: "ev", cid: "a:2", tick: 2, ev: { t: "edit", ops: [{ op: "cells", cells: [[0, 0, "G"]] }] } });
    expect(await answer(owner.inbox, "a:2")).toMatchObject({ type: "reject", reason: "invalid" });
  });

  it("a class room saves edits to the class project write-behind, and keeps a recovery copy of a version it saves over", async () => {
    const worldId = randomWorldUuid();
    const f = fixture([worldId]);
    const workspaces = { brick_hero: { blocks: { languageVersion: 0, blocks: [] }, from: "account" } };
    (f.db.worlds[0] as { document: unknown }).document = { format: "brickgineers-hackable", version: 1, save: { ...JSON.parse(projects.platformer), workspaces } };
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({ ...teacherCaller } as never);
    const ticketed = await request(`/classroom/worlds/${worldId}/hackable-ticket`, { method: "POST", headers: { authorization: "Bearer teacher" } });
    const { ticket } = await ticketed.json<{ ticket: string }>();
    const stub = workerEnv.HACKABLE_ROOMS.get(workerEnv.HACKABLE_ROOMS.idFromName(worldId.replaceAll("-", "")));
    await runInDurableObject(stub, async (instance: HackableRoom) => { Object.assign((instance as unknown as { env: object }).env, fakeEnv); });
    const teacher = await connect(`/hackable/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`);
    await hello(teacher, "Anything", "ignored");
    // The room has the account's blocks.
    send(teacher.socket, { type: "workspace", id: "brick_hero" });
    expect(await teacher.inbox.next("workspace")).toMatchObject({ ws: { from: "account" } });

    const committed = f.db.nextCommit();
    send(teacher.socket, { type: "ev", cid: "t:1", tick: 1, ev: { t: "edit", ops: [moveHero(150)] } });
    await committed;
    const world = f.db.worlds[0] as unknown as { revision: number; document: { save: { design: { copies: Array<{ x: number }> }; workspaces: unknown } } };
    expect(world.document.save.design.copies[0].x).toBe(150);
    expect(world.document.save.workspaces).toEqual(workspaces);
    expect(f.db.commits).toHaveLength(1);

    // Someone saves the project somewhere else; the room's next save keeps that version and saves its own on top.
    world.revision += 1;
    (world.document as unknown as { elsewhere: boolean }).elsewhere = true;
    const second = f.db.nextCommit();
    send(teacher.socket, { type: "ev", cid: "t:2", tick: 2, ev: { t: "edit", ops: [moveHero(170)] } });
    await second;
    await vi.waitFor(() => expect(world.document.save.design.copies[0].x).toBe(170), { timeout: 4000 });
    const notice = await teacher.inbox.next("notice");
    expect(notice.message).toMatch(/saved somewhere else/);
    const listed = await request(`/classroom/worlds/${worldId}/hackable-recovery`, { headers: { authorization: "Bearer teacher" } });
    expect(listed.status).toBe(200);
    const { copies } = await listed.json<{ copies: Array<{ id: string; revision: number }> }>();
    expect(copies).toHaveLength(1);
    const copy = await (await request(`/classroom/worlds/${worldId}/hackable-recovery/${copies[0].id}`, { headers: { authorization: "Bearer teacher" } })).json<{ document: { save: { design: { copies: Array<{ x: number }> } } } }>();
    expect(copy.document.save.design.copies[0].x).toBe(150);
  });
});
