import {
  LIVE_MAX_COMMAND_BYTES,
  LIVE_MAX_DOCUMENT_BYTES,
  LIVE_PROTOCOL_VERSION,
  createBrickStudioDocument,
  type BrickInstance,
  type BrickStudioDocument,
} from "@brick-studio/core";
import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { Env as WorkerEnv } from "../src/index";
import type { WorldRoom } from "../src/worldRoom";

type Message = Record<string, unknown> & { type: string };

const sockets: WebSocket[] = [];

function brick(id: string, x = 2, z = 2): BrickInstance {
  return { id, partId: "brick_1x2", x, y: 0, z, rotation: 0, color: "#3e83d7" };
}

function worldDocument(bricks: BrickInstance[] = []): BrickStudioDocument {
  return createBrickStudioDocument(bricks);
}

async function workerFetch(input: string, init?: RequestInit): Promise<Response> {
  const worker = (exports as unknown as {
    default: { fetch(request: Request, env: typeof import("cloudflare:workers").env): Promise<Response> };
  }).default;
  return worker.fetch(new Request(input, init), env);
}

async function createWorld(document = worldDocument(), displayName = "  Ada   Builder  ") {
  const response = await workerFetch("https://worker.test/worlds", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://virtual-legos.vercel.app" },
    body: JSON.stringify({ title: "Shared build", document, profile: { displayName, characterId: "future-character" } }),
  });
  const body = await response.json<{ roomId: string; ownerToken: string; error?: string }>();
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body;
}

class Inbox {
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
}

async function connectWorld(roomId: string, playerId: string, ownerToken?: string) {
  const url = new URL(`https://worker.test/worlds/${roomId}/connect`);
  url.searchParams.set("playerId", playerId);
  if (ownerToken) url.searchParams.set("ownerToken", ownerToken);
  const response = await workerFetch(url.toString(), {
    headers: { Upgrade: "websocket", origin: "https://virtual-legos.vercel.app" },
  });
  if (response.status !== 101 || !response.webSocket) return { response, socket: null, inbox: null, welcome: null };
  const socket = response.webSocket;
  sockets.push(socket);
  const inbox = new Inbox(socket);
  socket.accept();
  const welcome = await inbox.next("welcome");
  return { response, socket, inbox, welcome };
}

function send(socket: WebSocket, value: unknown) {
  socket.send(JSON.stringify(value));
}

async function getWorld(roomId: string) {
  const response = await workerFetch(`https://worker.test/worlds/${roomId}`);
  expect(response.status).toBe(200);
  return response.json<Record<string, unknown> & { document: BrickStudioDocument; revision: number }>();
}

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    try { socket.close(1000, "test complete"); } catch { /* already closed */ }
  }
});

describe("WorldRoom", () => {
  it("creates a validated v2 world and joins with sanitized owner and guest profiles", async () => {
    const legacy = { schemaVersion: 1, partLibraryVersion: 1, bricks: [brick("seed")] } as const;
    const { roomId, ownerToken } = await createWorld(legacy as unknown as BrickStudioDocument);
    expect(roomId).toMatch(/^[a-f0-9]{32}$/);
    expect(ownerToken).toMatch(/^[a-f0-9]{64}$/);

    const state = await getWorld(roomId);
    expect(state).toMatchObject({ roomId, revision: 0, mode: "build", locked: false });
    expect(state.document).toMatchObject({ schemaVersion: 2, environmentId: "classic", customParts: [] });
    const workerEnv = env as unknown as WorkerEnv;
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    const stored = await runInDurableObject(stub, async (_instance: WorldRoom, durableState) =>
      durableState.storage.get<Record<string, unknown>>("world"));
    expect(stored?.ownerTokenVerifier).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(ownerToken);

    const owner = await connectWorld(roomId, "owner_001", ownerToken);
    expect(owner.response.status).toBe(101);
    expect(owner.welcome).toMatchObject({ playerId: "owner_001", isOwner: true, revision: 0, mode: "build" });
    expect((owner.welcome!.players as Array<Record<string, unknown>>)[0]).toMatchObject({
      playerId: "owner_001",
      profile: { displayName: "Ada Builder", characterId: "future-character" },
    });

    const guest = await connectWorld(roomId, "guest_001");
    expect(guest.response.status).toBe(101);
    expect(guest.welcome).toMatchObject({ playerId: "guest_001", isOwner: false });
    send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setProfile", profile: { displayName: "  Grace   Hopper ", palette: { shirt: "#ABC" } } });
    let players = await guest.inbox!.next("players");
    while (!(players.players as Array<{ playerId: string; profile: { displayName: string } }>).some(
      (player) => player.playerId === "guest_001" && player.profile.displayName === "Grace Hopper",
    )) players = await guest.inbox!.next("players");
    expect(players.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: "guest_001", profile: { displayName: "Grace Hopper", palette: { shirt: "#abc" } } }),
    ]));
  });

  it("applies atomic guest edits and rejects structural conflicts with a canonical snapshot", async () => {
    const { roomId } = await createWorld();
    const guest = await connectWorld(roomId, "guest_101");
    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_101#1",
      commands: [{ op: "place", brick: brick("placed") }],
    });
    expect(await guest.inbox!.next("apply")).toMatchObject({ opId: "guest_101#1", revision: 1 });
    expect(await getWorld(roomId)).toMatchObject({ revision: 1, document: { bricks: [brick("placed")] } });

    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_101#2",
      commands: [{ op: "place", brick: brick("overlap") }],
    });
    const rejected = await guest.inbox!.next("reject");
    expect(rejected).toMatchObject({ opId: "guest_101#2", code: "invalid-layout", revision: 1 });
    expect((rejected.document as BrickStudioDocument).bricks).toEqual([brick("placed")]);

    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_101#3",
      commands: [{ op: "delete", id: "already-gone" }],
    });
    expect(await guest.inbox!.next("reject")).toMatchObject({
      opId: "guest_101#3",
      code: "unknown_brick",
      revision: 1,
    });
  });

  it("enforces owner mode, lock, replace permissions, and lets known players reconnect while locked", async () => {
    const { roomId, ownerToken } = await createWorld(worldDocument([brick("seed")]));
    const owner = await connectWorld(roomId, "owner_201", ownerToken);
    const guest = await connectWorld(roomId, "guest_201");

    send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "explore" });
    expect(await guest.inbox!.next("error")).toMatchObject({ code: "owner_only" });
    send(owner.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "explore" });
    expect(await owner.inbox!.next("modeChanged")).toMatchObject({ mode: "explore", revision: 1 });
    expect(await guest.inbox!.next("modeChanged")).toMatchObject({ mode: "explore", revision: 1 });

    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_201#1",
      commands: [{ op: "delete", id: "seed" }],
    });
    expect(await guest.inbox!.next("reject")).toMatchObject({ code: "explore_mode", revision: 1 });
    send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setLocked", locked: true });
    expect(await guest.inbox!.next("error")).toMatchObject({ code: "owner_only" });
    send(owner.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setLocked", locked: true });
    expect(await guest.inbox!.next("locked")).toMatchObject({ locked: true });

    const stranger = await connectWorld(roomId, "guest_202");
    expect(stranger.response.status).toBe(403);
    expect(await stranger.response.json()).toEqual({ error: "world_locked" });

    guest.socket!.close(1000, "reconnect");
    const returning = await connectWorld(roomId, "guest_201");
    expect(returning.response.status).toBe(101);
    expect(returning.welcome).toMatchObject({ locked: true, isOwner: false, mode: "explore" });

    send(owner.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "build" });
    await owner.inbox!.next("modeChanged");
    send(returning.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "replaceDocument",
      opId: "guest_201#2",
      document: worldDocument(),
    });
    expect(await returning.inbox!.next("reject")).toMatchObject({ code: "owner_only" });
    send(owner.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "replaceDocument",
      opId: "owner_201#1",
      document: worldDocument([brick("replacement", 12, 12)]),
    });
    expect(await owner.inbox!.next("snapshot")).toMatchObject({ opId: "owner_201#1", revision: 3 });
    expect(await getWorld(roomId)).toMatchObject({ revision: 3, document: { bricks: [brick("replacement", 12, 12)] } });
  });

  it("deduplicates accepted, rejected, and replacement operation replays across reconnects", async () => {
    const { roomId, ownerToken } = await createWorld();
    const owner = await connectWorld(roomId, "owner_301", ownerToken);
    const command = {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "owner_301#1",
      commands: [{ op: "place", brick: brick("once") }],
    };
    send(owner.socket!, command);
    expect(await owner.inbox!.next("apply")).toMatchObject({ revision: 1 });
    owner.socket!.close(1000, "replay elsewhere");

    const replay = await connectWorld(roomId, "owner_301", ownerToken);
    send(replay.socket!, command);
    expect(await replay.inbox!.next("apply")).toMatchObject({ opId: "owner_301#1", revision: 1, commands: [] });
    expect((await getWorld(roomId)).revision).toBe(1);

    const rejected = {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "owner_301#2",
      commands: [{ op: "place", brick: brick("blocked") }],
    };
    send(replay.socket!, rejected);
    expect(await replay.inbox!.next("reject")).toMatchObject({ opId: "owner_301#2", code: "invalid-layout", revision: 1 });

    const replacement = {
      v: LIVE_PROTOCOL_VERSION,
      type: "replaceDocument",
      opId: "owner_301#3",
      document: worldDocument([brick("new-doc", 20, 20)]),
    };
    send(replay.socket!, replacement);
    expect(await replay.inbox!.next("snapshot")).toMatchObject({ opId: "owner_301#3", revision: 2 });
    send(replay.socket!, rejected);
    const replayedReject = await replay.inbox!.next("reject");
    expect(replayedReject).toMatchObject({ opId: "owner_301#2", code: "invalid-layout", revision: 2 });
    expect((replayedReject.document as BrickStudioDocument).bricks).toEqual([brick("new-doc", 20, 20)]);
    send(replay.socket!, replacement);
    expect(await replay.inbox!.next("snapshot")).toMatchObject({ opId: "owner_301#3", revision: 2 });
    expect((await getWorld(roomId)).revision).toBe(2);
  });

  it("enforces command, pose, and absolute frame byte limits without partially applying", async () => {
    const { roomId } = await createWorld();
    const guest = await connectWorld(roomId, "guest_401");
    const largeCommand = JSON.stringify({
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_401#1",
      commands: [{ op: "place", brick: brick("too-large") }],
      padding: "x".repeat(LIVE_MAX_COMMAND_BYTES),
    });
    guest.socket!.send(largeCommand);
    expect(await guest.inbox!.next("reject")).toMatchObject({ opId: "guest_401#1", code: "commands_too_large", revision: 0 });

    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "pose",
      x: 0,
      y: 1,
      z: 0,
      yaw: 0,
      moving: false,
      jumping: false,
      padding: "x".repeat(2_048),
    });
    expect(await guest.inbox!.next("error")).toMatchObject({ code: "pose_too_large" });

    guest.socket!.send(JSON.stringify({ type: "padding", padding: "x".repeat(LIVE_MAX_DOCUMENT_BYTES + 5_000) }));
    expect(await guest.inbox!.next("error")).toMatchObject({ code: "message_too_large" });
    expect(await getWorld(roomId)).toMatchObject({ revision: 0, document: { bricks: [] } });
  });

  it("resyncs an exact snapshot after hibernation and retains authoritative revision", async () => {
    const { roomId } = await createWorld();
    const guest = await connectWorld(roomId, "guest_501");
    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_501#1",
      commands: [{ op: "place", brick: brick("durable", 9, 9) }],
    });
    await guest.inbox!.next("apply");
    const workerEnv = env as unknown as WorkerEnv;
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    await evictDurableObject(stub);

    send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    const snapshot = await guest.inbox!.next("snapshot");
    expect(snapshot).toMatchObject({ revision: 1, mode: "build" });
    expect((snapshot.document as BrickStudioDocument).bricks).toEqual([brick("durable", 9, 9)]);
  });

  it("caps a room at 30 concurrent players and rejects player 31", async () => {
    const { roomId, ownerToken } = await createWorld();
    const first = await connectWorld(roomId, "owner_601", ownerToken);
    expect(first.response.status).toBe(101);
    for (let index = 1; index < 30; index += 1) {
      const guest = await connectWorld(roomId, `guest_${String(index).padStart(3, "0")}`);
      expect(guest.response.status).toBe(101);
    }
    const overflow = await connectWorld(roomId, "guest_999");
    expect(overflow.response.status).toBe(429);
    expect(await overflow.response.json()).toEqual({ error: "world_full" });
  });
});

describe("RaceRoom regression", () => {
  it("preserves existing /rooms creation, host connection, and race start", async () => {
    const createdResponse = await workerFetch("https://worker.test/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://virtual-legos.vercel.app" },
      body: JSON.stringify({ title: "Legacy race", document: { bricks: [] } }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json<{ roomId: string; hostToken: string }>();
    const url = new URL(`https://worker.test/rooms/${created.roomId}/connect`);
    url.searchParams.set("playerId", "racer_001");
    url.searchParams.set("hostToken", created.hostToken);
    const response = await workerFetch(url.toString(), {
      headers: { Upgrade: "websocket", origin: "https://virtual-legos.vercel.app" },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    sockets.push(socket);
    const inbox = new Inbox(socket);
    socket.accept();
    expect(await inbox.next("welcome")).toMatchObject({ playerId: "racer_001", isHost: true, status: "waiting" });
    socket.send(JSON.stringify({ type: "start", countdownMs: 0 }));
    expect(await inbox.next("raceStart")).toMatchObject({ countdownMs: 0 });
  });
});
