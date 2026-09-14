import {
  BRICK_STUDIO_MAX_BRICKS,
  LIVE_MAX_COMMAND_BYTES,
  LIVE_MAX_DOCUMENT_BYTES,
  LIVE_PROTOCOL_VERSION,
  createBrickStudioDocument,
  type BrickInstance,
  type BrickStudioDocument,
} from "@brick-studio/core";
import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomService } from "../src/classroom/index";
import { handleReleaseRequest } from "../src/classroomRoutes";
import type { Env as WorkerEnv } from "../src/index";
import {
  newWorldId, newOwnerToken, ownerTokenVerifier,
  WORLD_ROOM_EXPIRY_GRACE_MS,
  WORLD_ROOM_TTL_MS,
  type WorldRoom,
} from "../src/worldRoom";
import {
  WORLD_CREATION_LIMIT,
  worldCreationLimiterKey,
  type WorldCreationLimiter,
} from "../src/worldCreationLimiter";

type Message = Record<string, unknown> & { type: string };

const sockets: WebSocket[] = [];

function brick(id: string, x = 2, z = 2): BrickInstance {
  return { id, partId: "brick_1x2", x, y: 0, z, rotation: 0, color: "#3e83d7" };
}

function worldDocument(bricks: BrickInstance[] = []): BrickStudioDocument {
  return createBrickStudioDocument(bricks);
}

function largeWorld(count: number): BrickInstance[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `large-${index}`,
    partId: "brick_1x1",
    x: index % 64,
    y: 0,
    z: Math.floor(index / 64),
    rotation: 0,
    color: "#3e83d7",
  }));
}

async function workerFetch(input: string, init?: RequestInit): Promise<Response> {
  const worker = (exports as unknown as {
    default: { fetch(request: Request, env: typeof import("cloudflare:workers").env): Promise<Response> };
  }).default;
  return worker.fetch(new Request(input, init), env);
}

// Exercise guest rooms through the public boundary, including header stripping.
async function roomFetch(input: string, init?: RequestInit): Promise<Response> {
  return workerFetch(input, init);
}
async function createWorld(document = worldDocument(), displayName = "  Ada   Builder  ") {
  const response = await workerFetch("https://worker.test/worlds", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://virtual-legos.vercel.app" },
    body: JSON.stringify({ title: "Shared build", document, profile: { displayName, characterId: "future-character" } }),
  });
  expect(response.status).toBe(201);
  return response.json<{ roomId: string; ownerToken: string }>();
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

async function connectWorld(roomId: string, playerId: string, ownerToken?: string, reconnectToken?: string) {
  const url = new URL(`https://worker.test/worlds/${roomId}/connect`);
  url.searchParams.set("playerId", playerId);
  if (ownerToken) url.searchParams.set("ownerToken", ownerToken);
  if (reconnectToken) url.searchParams.set("reconnectToken", reconnectToken);
  const response = await roomFetch(url.toString(), {
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

function nextClose(socket: WebSocket, timeoutMs = 3_000): Promise<CloseEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for socket close")), timeoutMs);
    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve(event);
    }, { once: true });
  });
}

async function getWorld(roomId: string) {
  const response = await roomFetch(`https://worker.test/worlds/${roomId}`);
  expect(response.status).toBe(200);
  return response.json<Record<string, unknown> & { document: BrickStudioDocument; revision: number }>();
}

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    try { socket.close(1000, "test complete"); } catch { /* already closed */ }
  }
});

describe("WorldRoom", () => {
  it("persists and rejoins a maximum-size custom brick while rejecting oversized definitions", async () => {
    const customPart = {
      id: "custom_large_test", name: "Large custom brick", template: "solid" as const,
      width: 32, depth: 32, height: 96, studs: "none" as const,
    };
    const placed = { ...brick("large-custom", 0, 0), partId: customPart.id };
    const document = createBrickStudioDocument([placed], { customParts: [customPart] });
    const { roomId } = await createWorld(document);
    const guest = await connectWorld(roomId, "guest_custom_size");
    expect(guest.welcome!.document).toEqual(document);
    const moved = { ...placed, x: 1 };
    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION, type: "commands", opId: "guest_custom_size#1",
      commands: [{ op: "move", brick: moved }],
    });
    expect(await guest.inbox!.next("apply")).toMatchObject({ revision: 1 });
    const expected = createBrickStudioDocument([moved], { customParts: [customPart] });
    const workerEnv = env as unknown as WorkerEnv;
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    await evictDurableObject(stub);
    expect((await getWorld(roomId)).document).toEqual(expected);
    const rejoined = await connectWorld(roomId, "guest_custom_rejoin");
    expect(rejoined.welcome).toMatchObject({ revision: 1, document: expected });

    for (const oversized of [{ width: 33 }, { depth: 33 }, { height: 97 }]) {
      const response = await workerFetch("https://worker.test/worlds", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://virtual-legos.vercel.app" },
        body: JSON.stringify({ document: { ...document, customParts: [{ ...customPart, ...oversized }] } }),
      });
      expect(response.status).toBe(400);
    }
  });

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
    expect(owner.welcome).not.toHaveProperty("reconnectToken");
    expect((owner.welcome!.players as Array<Record<string, unknown>>)[0]).toMatchObject({
      playerId: "owner_001",
      profile: { displayName: "Ada Builder", characterId: "future-character" },
    });

    const guest = await connectWorld(roomId, "guest_001");
    expect(guest.response.status).toBe(101);
    expect(guest.welcome).toMatchObject({ playerId: "guest_001", isOwner: false });
    const reconnectToken = guest.welcome!.reconnectToken as string;
    expect(reconnectToken).toMatch(/^[a-f0-9]{64}$/);
    const storedAfterGuest = await runInDurableObject(stub, async (_instance: WorldRoom, durableState) =>
      durableState.storage.get<Record<string, unknown>>("world"));
    expect((storedAfterGuest?.reconnectTokenVerifiers as Record<string, string>).guest_001)
      .toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(storedAfterGuest)).not.toContain(reconnectToken);
    const ownerPlayers = await owner.inbox!.next("players");
    expect(JSON.stringify(ownerPlayers)).not.toContain(reconnectToken);
    send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setProfile", profile: { displayName: "  Grace   Hopper ", palette: { shirt: "#ABC" } } });
    let players = await guest.inbox!.next("players");
    while (!(players.players as Array<{ playerId: string; profile: { displayName: string } }>).some(
      (player) => player.playerId === "guest_001" && player.profile.displayName === "Grace Hopper",
    )) players = await guest.inbox!.next("players");
    expect(players.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: "guest_001", profile: { displayName: "Grace Hopper", palette: { shirt: "#abc" } } }),
    ]));
  });

  it("accepts, edits, and strictly bounds a 1,000-brick authoritative world", async () => {
    const seed = largeWorld(BRICK_STUDIO_MAX_BRICKS - 1);
    const { roomId } = await createWorld(worldDocument(seed));
    const guest = await connectWorld(roomId, "guest_large");
    const finalBrick: BrickInstance = {
      id: "large-final",
      partId: "brick_1x1",
      x: 39,
      y: 0,
      z: 15,
      rotation: 0,
      color: "#e7473c",
    };
    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_large#1",
      commands: [{ op: "place", brick: finalBrick }],
    });

    expect(await guest.inbox!.next("apply")).toMatchObject({ opId: "guest_large#1", revision: 1 });
    expect((await getWorld(roomId)).document.bricks).toHaveLength(BRICK_STUDIO_MAX_BRICKS);

    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_large#2",
      commands: [{
        op: "place",
        brick: { ...finalBrick, id: "over-limit", x: 40 },
      }],
    });
    expect(await guest.inbox!.next("reject")).toMatchObject({
      opId: "guest_large#2",
      code: "brick-limit",
      revision: 1,
    });
    expect((await getWorld(roomId)).document.bricks).toHaveLength(BRICK_STUDIO_MAX_BRICKS);
  });

  it("rejects observed-id hijacks without evicting the legitimate player and permits capability reconnect", async () => {
    const { roomId } = await createWorld();
    const legitimate = await connectWorld(roomId, "guest_secure");
    const reconnectToken = legitimate.welcome!.reconnectToken as string;

    const observedIdAttack = await connectWorld(roomId, "guest_secure");
    expect(observedIdAttack.response.status).toBe(403);
    expect(await observedIdAttack.response.json()).toEqual({ error: "reconnect_token_required" });
    const invalidCapability = await connectWorld(roomId, "guest_secure", undefined, "a".repeat(64));
    expect(invalidCapability.response.status).toBe(403);
    expect(await invalidCapability.response.json()).toEqual({ error: "reconnect_token_required" });

    send(legitimate.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_secure#1",
      commands: [{ op: "place", brick: brick("still-connected") }],
    });
    expect(await legitimate.inbox!.next("apply")).toMatchObject({ opId: "guest_secure#1", revision: 1 });

    const reconnected = await connectWorld(roomId, "guest_secure", undefined, reconnectToken);
    expect(reconnected.response.status).toBe(101);
    expect(reconnected.welcome).toMatchObject({ playerId: "guest_secure", revision: 1 });
    expect(reconnected.welcome).not.toHaveProperty("reconnectToken");
  });

  it("atomically replaces an owner session without ever duplicating its roster identity", async () => {
    const { roomId, ownerToken } = await createWorld(worldDocument(), "Teacher");
    const owner = await connectWorld(roomId, "owner_stable", ownerToken);
    const guest = await connectWorld(roomId, "guest_stable");

    const attacker = await connectWorld(roomId, "owner_stable");
    expect(attacker.response.status).toBe(403);
    expect(await attacker.response.json()).toEqual({ error: "reconnect_token_required" });
    send(owner.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setLocked", locked: true });
    expect(await guest.inbox!.next("locked")).toMatchObject({ locked: true });

    const originalClosed = nextClose(owner.socket!);
    const replacement = await connectWorld(roomId, "owner_stable", ownerToken);
    expect(replacement.response.status).toBe(101);
    expect((await originalClosed).code).toBe(4001);
    const welcomePlayers = replacement.welcome!.players as Array<{ playerId: string; isOwner: boolean }>;
    expect(welcomePlayers).toHaveLength(2);
    expect(welcomePlayers.filter((player) => player.playerId === "owner_stable")).toEqual([
      expect.objectContaining({ isOwner: true }),
    ]);

    send(replacement.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "setProfile",
      profile: { displayName: "Teacher Rejoined" },
    });
    let roster = await guest.inbox!.next("players");
    while (!(roster.players as Array<{ playerId: string; profile: { displayName: string } }>).some(
      (player) => player.playerId === "owner_stable" && player.profile.displayName === "Teacher Rejoined",
    )) roster = await guest.inbox!.next("players");
    const rosterPlayers = roster.players as Array<{ playerId: string; isOwner: boolean }>;
    expect(rosterPlayers).toHaveLength(2);
    expect(new Set(rosterPlayers.map((player) => player.playerId)).size).toBe(2);
    expect(rosterPlayers.filter((player) => player.playerId === "owner_stable")).toHaveLength(1);

    const publicPlayers = (await getWorld(roomId)).players as Array<{ playerId: string; isOwner: boolean }>;
    expect(publicPlayers).toHaveLength(2);
    expect(publicPlayers.filter((player) => player.playerId === "owner_stable")).toHaveLength(1);

    const replacementClosed = nextClose(replacement.socket!);
    const changedPlayerId = await connectWorld(roomId, "owner_new_id", ownerToken);
    expect(changedPlayerId.response.status).toBe(101);
    expect((await replacementClosed).code).toBe(4001);
    const changedIdPlayers = changedPlayerId.welcome!.players as Array<{ playerId: string; isOwner: boolean }>;
    expect(changedIdPlayers).toHaveLength(2);
    expect(changedIdPlayers.filter((player) => player.isOwner)).toEqual([
      expect.objectContaining({ playerId: "owner_new_id" }),
    ]);

    const rapidUrl = new URL(`https://worker.test/worlds/${roomId}/connect`);
    rapidUrl.searchParams.set("playerId", "owner_stable");
    rapidUrl.searchParams.set("ownerToken", ownerToken);
    const rapidRequests = [1, 2].map(() => roomFetch(rapidUrl.toString(), {
      headers: { Upgrade: "websocket", origin: "https://virtual-legos.vercel.app" },
    }));
    const rapidResponses = await Promise.all(rapidRequests);
    expect(rapidResponses.map((response) => response.status)).toEqual([101, 101]);
    for (const response of rapidResponses) {
      const socket = response.webSocket!;
      sockets.push(socket);
      socket.accept();
    }
    const afterRapidReconnects = (await getWorld(roomId)).players as Array<{ playerId: string }>;
    expect(afterRapidReconnects).toHaveLength(2);
    expect(new Set(afterRapidReconnects.map((player) => player.playerId)).size).toBe(2);
    expect(afterRapidReconnects.filter((player) => player.playerId === "owner_stable")).toHaveLength(1);

    const workerEnv = env as unknown as WorkerEnv;
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    await runInDurableObject(stub, async (_instance: WorldRoom, durableState) => {
      const ownerAttachments = durableState.getWebSockets()
        .map((socket) => socket.deserializeAttachment() as {
          playerId?: string;
          isOwner?: boolean;
          superseded?: boolean;
        } | null)
        .filter((attachment) => attachment?.isOwner);
      expect(ownerAttachments.filter((attachment) => !attachment?.superseded)).toHaveLength(1);
    });
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

  it("merges semantic move fields onto the authoritative brick without clobbering peer rotation or color", async () => {
    const seed = brick("shared");
    const { roomId } = await createWorld(worldDocument([seed]));
    const first = await connectWorld(roomId, "builder_alpha");
    const second = await connectWorld(roomId, "builder_beta");

    send(first.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "builder_alpha#1",
      commands: [{
        op: "rotate",
        brick: { ...seed, x: 6, rotation: 1, color: "#000000" },
      }],
    });
    expect((await second.inbox!.next("apply")).commands).toEqual([{
      op: "rotate",
      brick: { ...seed, rotation: 1 },
    }]);
    send(first.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "builder_alpha#2",
      commands: [{
        op: "recolor",
        brick: { ...seed, x: 8, rotation: 3, color: "#ff0000" },
      }],
    });
    expect((await second.inbox!.next("apply")).commands).toEqual([{
      op: "recolor",
      brick: { ...seed, rotation: 1, color: "#ff0000" },
    }]);

    send(second.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "builder_beta#1",
      commands: [{ op: "move", brick: { ...seed, x: 10, z: 10 } }],
    });
    const applied = await second.inbox!.next("apply");
    expect(applied.commands).toEqual([{
      op: "move",
      brick: { ...seed, x: 10, z: 10, rotation: 1, color: "#ff0000" },
    }]);
    expect(await getWorld(roomId)).toMatchObject({
      revision: 3,
      document: { bricks: [{ ...seed, x: 10, z: 10, rotation: 1, color: "#ff0000" }] },
    });

    const replacement = {
      ...seed,
      partId: "brick_2x2",
      x: 12,
      y: 3,
      z: 12,
      rotation: 3 as const,
      color: "#0000ff",
    };
    send(second.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "builder_beta#2",
      commands: [{ op: "update", brick: replacement }],
    });
    expect((await second.inbox!.next("apply")).commands).toEqual([{ op: "update", brick: replacement }]);
    expect(await getWorld(roomId)).toMatchObject({ revision: 4, document: { bricks: [replacement] } });
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
    const reconnectToken = guest.welcome!.reconnectToken as string;
    const returning = await connectWorld(roomId, "guest_201", undefined, reconnectToken);
    expect(returning.response.status).toBe(101);
    expect(returning.welcome).toMatchObject({ locked: true, isOwner: false, mode: "explore" });
    const returningPlayers = returning.welcome!.players as Array<{ playerId: string }>;
    expect(returningPlayers).toHaveLength(2);
    expect(new Set(returningPlayers.map((player) => player.playerId)).size).toBe(2);

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
      expectedRevision: 2,
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
      expectedRevision: 1,
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

  it("never reapplies an operation below the persisted high-water after detailed outcomes are pruned", async () => {
    const seed = brick("high-water");
    const { roomId } = await createWorld(worldDocument([seed]));
    const guest = await connectWorld(roomId, "guest_replay");
    const reconnectToken = guest.welcome!.reconnectToken as string;

    for (let sequence = 1; sequence <= 130; sequence += 1) {
      send(guest.socket!, {
        v: LIVE_PROTOCOL_VERSION,
        type: "commands",
        opId: `guest_replay#${sequence}`,
        commands: [{
          op: "recolor",
          brick: { ...seed, color: sequence % 2 === 0 ? "#00ff00" : "#ff0000" },
        }],
      });
      expect(await guest.inbox!.next("apply")).toMatchObject({ revision: sequence });
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    guest.socket!.close(1000, "reload");
    const reconnected = await connectWorld(roomId, "guest_replay", undefined, reconnectToken);
    expect(reconnected.welcome).toMatchObject({ operationHighWater: "130", revision: 130 });
    send(reconnected.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "commands",
      opId: "guest_replay#1",
      commands: [{ op: "recolor", brick: { ...seed, color: "#0000ff" } }],
    });
    const duplicate = await reconnected.inbox!.next("snapshot");
    expect(duplicate).toMatchObject({ opId: "guest_replay#1", revision: 130 });
    expect((duplicate.document as BrickStudioDocument).bricks[0]?.color).toBe("#00ff00");

    const workerEnv = env as unknown as WorkerEnv;
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    const stored = await runInDurableObject(stub, async (_instance: WorldRoom, durableState) =>
      durableState.storage.get<{
        operationHighWater: Record<string, string>;
        operationOutcomes: Record<string, unknown[]>;
      }>("world"));
    expect(stored?.operationHighWater.guest_replay).toBe("130");
    expect(stored?.operationOutcomes.guest_replay).toHaveLength(128);
    expect((await getWorld(roomId)).revision).toBe(130);
  }, 20_000);

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
    const staleExpiry = Date.now() + 5_000;
    await runInDurableObject(stub, async (_instance: WorldRoom, durableState) => {
      const stored = (await durableState.storage.get<Record<string, unknown>>("world"))!;
      stored.expiresAt = staleExpiry;
      await durableState.storage.put("world", stored);
      await durableState.storage.setAlarm(staleExpiry);
    });
    await evictDurableObject(stub);

    send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    const snapshot = await guest.inbox!.next("snapshot");
    expect(snapshot).toMatchObject({ revision: 1, mode: "build" });
    expect((snapshot.document as BrickStudioDocument).bricks).toEqual([brick("durable", 9, 9)]);
    const renewed = await runInDurableObject(stub, async (_instance: WorldRoom, durableState) =>
      durableState.storage.get<{ expiresAt: number }>("world"));
    expect(renewed!.expiresAt).toBeGreaterThan(Date.now() + WORLD_ROOM_TTL_MS - 5_000);
  });

  it("uses a bounded expiry grace before deleting an inactive rehydrated room", async () => {
    const { roomId } = await createWorld();
    const workerEnv = env as unknown as WorkerEnv;
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    const justExpired = Date.now() - 1_000;
    await runInDurableObject(stub, async (_instance: WorldRoom, durableState) => {
      const stored = (await durableState.storage.get<Record<string, unknown>>("world"))!;
      stored.expiresAt = justExpired;
      await durableState.storage.put("world", stored);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance: WorldRoom, durableState) => {
      await instance.alarm();
      expect(await durableState.storage.get("world")).toBeTruthy();
      expect(await durableState.storage.getAlarm()).toBeGreaterThanOrEqual(
        justExpired + WORLD_ROOM_EXPIRY_GRACE_MS,
      );
    });

    const graceElapsed = Date.now() - WORLD_ROOM_EXPIRY_GRACE_MS - 1_000;
    await runInDurableObject(stub, async (_instance: WorldRoom, durableState) => {
      const stored = (await durableState.storage.get<Record<string, unknown>>("world"))!;
      stored.expiresAt = graceElapsed;
      await durableState.storage.put("world", stored);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance: WorldRoom, durableState) => {
      await instance.alarm();
      expect(await durableState.storage.get("world")).toBeUndefined();
    });
  });

  it("bounds profile and owner-control mutations without penalizing normal changes", async () => {
    const { roomId, ownerToken } = await createWorld();
    const guest = await connectWorld(roomId, "guest_rates");
    for (let index = 0; index < 6; index += 1) {
      send(guest.socket!, {
        v: LIVE_PROTOCOL_VERSION,
        type: "setProfile",
        profile: { displayName: `Builder ${index}` },
      });
      await guest.inbox!.next("players");
    }
    send(guest.socket!, {
      v: LIVE_PROTOCOL_VERSION,
      type: "setProfile",
      profile: { displayName: "Builder blocked" },
    });
    expect(await guest.inbox!.next("error")).toMatchObject({ code: "profile_rate_limited" });

    const owner = await connectWorld(roomId, "owner_rates", ownerToken);
    for (let index = 0; index < 12; index += 1) {
      send(owner.socket!, {
        v: LIVE_PROTOCOL_VERSION,
        type: "setLocked",
        locked: index % 2 === 0,
      });
      await owner.inbox!.next("locked");
    }
    send(owner.socket!, { v: LIVE_PROTOCOL_VERSION, type: "setLocked", locked: true });
    expect(await owner.inbox!.next("error")).toMatchObject({ code: "control_rate_limited" });
  });

  it("closes clients that persist after repeated per-second message-rate violations", async () => {
    const { roomId } = await createWorld();
    const guest = await connectWorld(roomId, "guest_flood");
    const closed = nextClose(guest.socket!);
    for (let index = 0; index < 33; index += 1) {
      send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    }
    expect((await closed).code).toBe(1008);
  });

  it("fits 30 students plus a teacher and spare seat, rejecting player 33", async () => {
    const { roomId, ownerToken } = await createWorld();
    const first = await connectWorld(roomId, "owner_601", ownerToken);
    expect(first.response.status).toBe(101);
    for (let index = 1; index < 32; index += 1) {
      const guest = await connectWorld(roomId, `guest_${String(index).padStart(3, "0")}`);
      expect(guest.response.status).toBe(101);
    }
    const overflow = await connectWorld(roomId, "guest_999");
    expect(overflow.response.status).toBe(429);
    expect(await overflow.response.json()).toEqual({ error: "world_full" });
  });
});

it("rejects stale full-world replacement without losing a concurrent accepted brick", async () => {
  const { roomId, ownerToken } = await createWorld();
  const owner = await connectWorld(roomId, "owner_cas", ownerToken);
  const guest = await connectWorld(roomId, "guest_cas");
  send(guest.socket!, { v: LIVE_PROTOCOL_VERSION, type: "commands", opId: "guest_cas#1", commands: [{ op: "place", brick: brick("keep-me") }] });
  await guest.inbox!.next("apply");
  send(owner.socket!, { v: LIVE_PROTOCOL_VERSION, type: "replaceDocument", opId: "owner_cas#1", expectedRevision: 0, document: worldDocument() });
  expect(await owner.inbox!.next("reject")).toMatchObject({ code: "revision_conflict", revision: 1 });
  expect(await getWorld(roomId)).toMatchObject({ revision: 1, document: { bricks: [brick("keep-me")] } });
});

it("enforces trusted classroom identity and immediate group revocation without deleting the world", async () => {
  const { roomId } = await createWorld();
  const workerEnv = env as unknown as WorkerEnv;
  const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
  const worldId = "00000000-0000-4000-8000-000000000001";
  await runInDurableObject(stub, async (_instance: WorldRoom, state: DurableObjectState) => {
    const record = await state.storage.get<Record<string, unknown>>("world");
    await state.storage.put("world", { ...record, classroomWorldId: worldId });
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, async (instance: WorldRoom) => {
    Object.assign((instance as unknown as { env: object }).env, { SUPABASE_URL: "https://fake-db.test", SUPABASE_SERVICE_ROLE_KEY: "test", SUPABASE_ANON_KEY: "test" });
  });
  const classId = "00000000-0000-4000-8000-000000000003";
  const fixtureWorld = { id: worldId, class_id: classId, kind: "group", owner_id: "teacher", title: "Classroom", revision: 1, document: worldDocument() };
  let revocation: "none" | "password" | "removed" | "paused" = "none";
  const rows = vi.spyOn(ClassroomService.prototype, "rows").mockImplementation(async (table) => {
    if (table === "worlds") return [fixtureWorld];
    if (table === "students") return [{ user_id: "00000000-0000-4000-8000-000000000002", username: "TrueName", class_id: classId, auth_version: revocation === "password" ? 2 : 1, suspended: false, reset_required: false }];
    if (table === "sessions") return [{ auth_version: 1 }];
    if (table === "classes") return [{ id: classId, collaboration_open: revocation !== "paused" }];
    if (table === "world_members") return revocation === "removed" ? [] : [{ user_id: "00000000-0000-4000-8000-000000000002" }];
    return [];
  });
  let batchUnavailable = false;
  const commit = vi.fn().mockRejectedValue(new Error("database unavailable"));
  const access = { userId: "00000000-0000-4000-8000-000000000002", username: "TrueName", role: "student", worldId, classId: null, canEdit: true, isTeacher: false, isOwner: false, authVersion: 1, sessionId: "00000000-0000-4000-8000-000000000004" };
  const rpc = vi.spyOn(ClassroomService.prototype, "rpc").mockImplementation(async (name, input) => {
    if (name === "authorize_world") return revocation === "none" ? { ...access, classId } : { error: revocation === "password" ? "session_revoked" : revocation === "paused" ? "class_closed" : "not_found" };
    if (name === "authorize_world_batch") { if (batchUnavailable) throw new Error("permission provider unavailable"); return input.p_identities.map(() => ({ ...access, classId })); }
    return commit(name, input);
  });
  const denied = await stub.fetch(`https://internal/worlds/${roomId}/connect?playerId=spoofed`, { headers: { Upgrade: "websocket" } });
  expect(denied.status).toBe(401);
  const response = await stub.fetch(`https://internal/worlds/${roomId}/connect?playerId=spoofed`, { headers: { Upgrade: "websocket", "x-classroom-access": JSON.stringify(access) } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const inbox = new Inbox(socket);
  socket.accept();
  expect(await inbox.next("welcome")).toMatchObject({ playerId: access.userId, players: [{ playerId: access.userId, profile: { displayName: "TrueName" } }] });
  send(socket, { v: LIVE_PROTOCOL_VERSION, type: "setProfile", profile: { displayName: "Imposter" } });
  expect(await inbox.next("players")).toMatchObject({ players: [{ profile: { displayName: "TrueName" } }] });
  send(socket, { v: LIVE_PROTOCOL_VERSION, type: "commands", opId: `${access.userId}#1`, commands: [{ op: "place", brick: brick("unsaved") }] });
  expect(await inbox.next("reject")).toMatchObject({ code: "save_conflict", revision: 1, document: { bricks: [] } });
  commit.mockImplementationOnce(async () => {
    fixtureWorld.revision = 2;
    fixtureWorld.document = worldDocument([brick("teacher-restored", 20, 20)]);
    return { error: "conflict", currentRevision: 2 };
  });
  send(socket, { v: LIVE_PROTOCOL_VERSION, type: "commands", opId: `${access.userId}#2`, commands: [{ op: "place", brick: brick("stale-write") }] });
  expect(await inbox.next("reject")).toMatchObject({ code: "save_conflict", revision: 2, document: { bricks: [brick("teacher-restored", 20, 20)] } });
  commit.mockImplementationOnce(async (_name, input) => {
    expect(input).toMatchObject({ p_expected_revision: 2, p_actor_id: access.userId, p_session_id: access.sessionId, p_auth_version: 1 });
    fixtureWorld.revision = 3;
    fixtureWorld.document = input.p_document;
    return fixtureWorld;
  });
  send(socket, { v: LIVE_PROTOCOL_VERSION, type: "commands", opId: `${access.userId}#3`, commands: [{ op: "place", brick: brick("durable") }] });
  expect(await inbox.next("apply")).toMatchObject({ revision: 3, opId: `${access.userId}#3` });
  expect(fixtureWorld.document.bricks.map(b => b.id)).toEqual(["teacher-restored", "durable"]);
  // A slow durable write must not trap presence behind the command queue or
  // rate-limit normally spaced arrivals when that queue finally drains.
  let releaseCommit!: () => void;
  let enteredCommit!: () => void;
  const entered = new Promise<void>(resolve => { enteredCommit = resolve; });
  commit.mockImplementationOnce(async (_name, input) => {
    enteredCommit();
    await new Promise<void>(resolve => { releaseCommit = resolve; });
    fixtureWorld.revision += 1;
    fixtureWorld.document = input.p_document;
    return fixtureWorld;
  });
  await runInDurableObject(stub, async (instance: WorldRoom, state: DurableObjectState) => {
    const server = state.getWebSockets()[0];
    const pending = instance.webSocketMessage(server, JSON.stringify({ v: LIVE_PROTOCOL_VERSION, type: "commands", opId: `${access.userId}#4`, commands: [{ op: "place", brick: brick("slow-durable", 30, 30) }] }));
    await entered;
    const start = Date.now();
    let clock = start;
    const time = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      for (let frame = 0; frame < 40; frame += 1) {
        clock = start + frame * 500;
        await instance.webSocketMessage(server, JSON.stringify({ v: LIVE_PROTOCOL_VERSION, type: "pose", x: frame, y: 0, z: 0, yaw: 0, moving: true, jumping: false }));
      }
      const attachment = server.deserializeAttachment() as { lastPoseAt: number; messageRateViolations: number; superseded: boolean };
      expect(attachment.lastPoseAt).toBe(clock);
      expect(attachment.messageRateViolations).toBe(0);
      expect(attachment.superseded).toBe(false);
    } finally { time.mockRestore(); releaseCommit(); }
    await pending;
  });
  expect(await inbox.next("apply")).toMatchObject({ revision: 4, opId: `${access.userId}#4` });
  const closed = new Promise<number>(resolve => socket.addEventListener("close", event => resolve(event.code)));
  expect((await stub.fetch("https://internal/internal/classroom-invalidate", { method: "POST", body: JSON.stringify({ userId: access.userId }) })).status).toBe(200);
  expect(await closed).toBe(4003);
  for (const change of ["password", "removed", "paused"] as const) {
    revocation = "none";
    const fresh = await stub.fetch(`https://internal/worlds/${roomId}/connect`, { headers: { Upgrade: "websocket", "x-classroom-access": JSON.stringify(access) } });
    expect(fresh.status).toBe(101);
    const active = fresh.webSocket!;
    sockets.push(active);
    const activeInbox = new Inbox(active);
    active.accept();
    await activeInbox.next("welcome");
    const revoked = new Promise<number>(resolve => active.addEventListener("close", event => resolve(event.code)));
    revocation = change;
    send(active, { v: LIVE_PROTOCOL_VERSION, type: "commands", opId: `${access.userId}#2`, commands: [{ op: "place", brick: brick("unauthorized") }] });
    expect(await revoked).toBe(4003);
  }
  revocation = "none";
  const idleResponse = await stub.fetch(`https://internal/worlds/${roomId}/connect`, { headers: { Upgrade: "websocket", "x-classroom-access": JSON.stringify(access) } });
  const idle = idleResponse.webSocket!;
  sockets.push(idle);
  const idleInbox = new Inbox(idle);
  idle.accept();
  await idleInbox.next("welcome");
  const idleClosed = new Promise<number>(resolve => idle.addEventListener("close", event => resolve(event.code)));
  batchUnavailable = true;
  await runInDurableObject(stub, async (instance: WorldRoom, state: DurableObjectState) => {
    await instance.alarm();
    expect(await state.storage.get("world")).toBeTruthy();
  });
  expect(await idleClosed).toBe(4003);
  rows.mockRestore();
  rpc.mockRestore();
});

describe("Retired race routes", () => {
  it("keeps the old race system retired", async () => {
    for (const route of ["rooms"]) {
      const response = await workerFetch(`https://worker.test/${route}`, { method: "POST", headers: { origin: "https://virtual-legos.vercel.app", "content-type": "application/json" }, body: JSON.stringify({ title: "Bypass", document: worldDocument(), profile: { displayName: "Guest" } }) });
      expect(response.status).toBe(410);
    }
  });
});

it('exports a surviving legacy document only with the exact owner capability and no session', async () => {
  const document = worldDocument([brick('legacy-recovery')]);
  const {roomId,ownerToken} = await createWorld(document);
  const ns = (env as unknown as WorkerEnv).WORLD_ROOMS;
  const stub = ns.get(ns.idFromName(roomId));
  const request = (token: string) => stub.fetch('https://world.internal/internal/legacy-export', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerToken:token})});
  const denied = await request(newOwnerToken()); expect(denied.status).toBe(404); await denied.text();
  const allowed = await request(ownerToken); expect(allowed.status).toBe(200);
  const value = await allowed.json<{title:string;document:BrickStudioDocument}>();
  expect(value).toEqual({title:'Shared build',document});
  await runInDurableObject(stub, async (_instance, state) => { expect(state.getWebSockets()).toHaveLength(0); });
  const publicRequest = await workerFetch('https://worker.test/internal/legacy-export', {method:'POST',body:JSON.stringify({ownerToken})});
  expect(publicRequest.status).toBe(404);await publicRequest.text();
});

it('never exports a classroom world through legacy owner recovery even with its initializer capability', async () => {
  const roomId=newWorldId(),ownerToken=newOwnerToken();const ns=(env as unknown as WorkerEnv).WORLD_ROOMS;
  const stub=ns.get(ns.idFromName(roomId));
  const initialized=await stub.fetch('https://world.internal/init',{method:'POST',headers:{'x-world-init':'1','content-type':'application/json'},body:JSON.stringify({roomId,classroomWorldId:'11111111-1111-4111-8111-111111111111',revision:1,title:'Private classroom',document:worldDocument(),initialOwnerProfile:{displayName:'Teacher'},ownerTokenVerifier:await ownerTokenVerifier(ownerToken)})});
  expect(initialized.status).toBe(201);await initialized.text();
  const exported=await stub.fetch('https://world.internal/internal/legacy-export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerToken})});
  expect(exported.status).toBe(404);await exported.text();
});


it("denies public classroom snapshots and sockets even with forged internal headers and the owner token", async () => {
  const classroomWorldId = "11111111-1111-4111-8111-111111111111";
  const roomId = classroomWorldId.replaceAll("-", ""), ownerToken = newOwnerToken();
  const ns = (env as unknown as WorkerEnv).WORLD_ROOMS;
  const stub = ns.get(ns.idFromName(roomId));
  const initialized = await stub.fetch("https://world.internal/init", {
    method: "POST", headers: { "x-world-init": "1", "content-type": "application/json" },
    body: JSON.stringify({ roomId, classroomWorldId, revision: 1, title: "Secret title", document: worldDocument([brick("secret-brick")]), initialOwnerProfile: { displayName: "Teacher" }, ownerTokenVerifier: await ownerTokenVerifier(ownerToken) }),
  });
  expect(initialized.status).toBe(201); await initialized.text();
  for (const path of [roomId, classroomWorldId]) {
    for (const suffix of ["", "/connect"]) {
      const response = await workerFetch(`https://worker.test/worlds/${path}${suffix}?playerId=attacker&ownerToken=${ownerToken}`, {
        headers: { Upgrade: "websocket", "x-guest-world-access": "1", "x-world-init": "1", "x-classroom-access": JSON.stringify({ worldId: classroomWorldId, userId: "attacker", username: "Teacher", isTeacher: true }) },
      });
      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).not.toContain("secret-brick"); expect(text).not.toContain("Secret title");
    }
  }
  const direct = await stub.fetch(`https://world.internal/worlds/${roomId}`);
  expect(direct.status).toBe(401); await direct.text();
  const internal = await workerFetch("https://worker.test/internal/room-kind");
  expect(internal.status).toBe(404); await internal.text();
});

it("bounds anonymous creation requests and retains per-IP creation limits", async () => {
  const invalid = await workerFetch("https://worker.test/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(invalid.status).toBe(400); await invalid.text();
  const oversized = await workerFetch("https://worker.test/worlds", { method: "POST", headers: { "content-length": String(LIVE_MAX_DOCUMENT_BYTES + 16 * 1024 + 1) }, body: "{}" });
  expect(oversized.status).toBe(413); await oversized.text();
  const ip = "192.0.2.100";
  const ns = (env as unknown as WorkerEnv).WORLD_CREATION_LIMITER;
  const limiter = ns.get(ns.idFromName(worldCreationLimiterKey(ip)));
  await runInDurableObject(limiter, async (_instance: WorldCreationLimiter, state: DurableObjectState) => {
    await state.storage.put("window", { windowStartedAt: Date.now(), count: WORLD_CREATION_LIMIT });
  });
  const limited = await workerFetch("https://worker.test/worlds", { method: "POST", headers: { "cf-connecting-ip": ip, "content-type": "application/json" }, body: JSON.stringify({ title: "Limited", document: worldDocument(), profile: { displayName: "Builder" } }) });
  expect(limited.status).toBe(429); expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0); await limited.text();
});

describe("classroom invalidation", () => {
  const classId = "00000000-0000-4000-8000-0000000000c1";
  const teacher = { id: "00000000-0000-4000-8000-0000000000a1", sessionId: "00000000-0000-4000-8000-0000000000a2" };
  const teacherCaller = { id: teacher.id, username: "Teacher", rosterName: "Teacher", role: "teacher" as const, resetRequired: false, authVersion: 0, sessionId: teacher.sessionId, token: "teacher" };
  const fakeEnv = { SUPABASE_URL: "https://fake-db.test", SUPABASE_SERVICE_ROLE_KEY: "test", SUPABASE_ANON_KEY: "test", BRICK_TEACHER_IDS: teacher.id };
  const workerEnv = env as unknown as WorkerEnv;
  const routeEnv = {
    ...fakeEnv, CLASSROOM_TICKET_SECRET: "test-only-secret-".repeat(4),
    WORLD_ROOMS: workerEnv.WORLD_ROOMS, WORLD_CREATION_LIMITER: workerEnv.WORLD_CREATION_LIMITER, RACE_ROOMS: workerEnv.RACE_ROOMS,
  } as WorkerEnv;
  type FixtureWorld = { id: string; class_id: string; kind: "group" | "class"; owner_id: string; title: string; revision: number; document: BrickStudioDocument };
  type FixtureStudent = { user_id: string; username: string; roster_name: string; class_id: string; auth_version: number; suspended: boolean; reset_required: boolean; session_id: string };
  type Access = { userId: string; username: string; role: "teacher" | "student"; worldId: string; classId: string; canEdit: boolean; isTeacher: boolean; isOwner: boolean; authVersion: number; sessionId: string };

  const randomWorldUuid = () => {
    const hex = newWorldId();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  // A tiny stand-in for the classroom Postgres schema and its authorization RPCs,
  // shared by the router and every Durable Object through the service prototype.
  function fixture(worldIds: string[]) {
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
      commits: [] as Array<{ worldId: string; expectedRevision: number; actorId: string }>,
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
      if (name === "commit_world") {
        const world = db.worlds.find((candidate) => candidate.id === input.p_world_id);
        if (!world) return { error: "not_found" };
        db.commits.push({ worldId: world.id, expectedRevision: input.p_expected_revision, actorId: input.p_actor_id });
        if (world.revision !== input.p_expected_revision) return { error: "conflict", currentRevision: world.revision };
        world.revision += 1;
        world.document = input.p_document;
        if (typeof input.p_title === "string") world.title = input.p_title;
        return { ...world };
      }
      if (name === "take_rate_limit" || name === "acquire_credential_lock") return true;
      throw new Error(`Unexpected rpc ${name}`);
    });
    const batchChecks = () => rpc.mock.calls.filter(([name]) => name === "authorize_world_batch").length;
    const studentAccess = (index: number, worldId: string): Access => {
      const student = db.students[index];
      return { userId: student.user_id, username: student.username, role: "student", worldId, classId, canEdit: true, isTeacher: false, isOwner: false, authVersion: student.auth_version, sessionId: student.session_id };
    };
    const teacherAccess = (worldId: string): Access => ({ userId: teacher.id, username: "Teacher", role: "teacher", worldId, classId, canEdit: true, isTeacher: true, isOwner: true, authVersion: 0, sessionId: teacher.sessionId });
    return { db, batchChecks, studentAccess, teacherAccess };
  }

  async function openRoom(world: FixtureWorld) {
    const roomId = world.id.replaceAll("-", "");
    const stub = workerEnv.WORLD_ROOMS.get(workerEnv.WORLD_ROOMS.idFromName(roomId));
    const initialized = await stub.fetch("https://world.internal/init", {
      method: "POST", headers: { "x-world-init": "1", "content-type": "application/json" },
      body: JSON.stringify({ roomId, classroomWorldId: world.id, revision: world.revision, title: world.title, document: world.document, initialOwnerProfile: { displayName: "Builder" }, ownerTokenVerifier: await ownerTokenVerifier(newOwnerToken()) }),
    });
    expect(initialized.status).toBe(201); await initialized.text();
    await runInDurableObject(stub, async (instance: WorldRoom) => { Object.assign((instance as unknown as { env: object }).env, fakeEnv); });
    return {
      roomId, stub,
      invalidate: async (body: Record<string, unknown>) => {
        const response = await stub.fetch("https://world.internal/internal/classroom-invalidate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json<Record<string, unknown>>() };
      },
      state: async (access: Access) => {
        const response = await stub.fetch(`https://world.internal/worlds/${roomId}`, { headers: { "x-classroom-access": JSON.stringify(access) } });
        expect(response.status).toBe(200);
        return response.json<{ title: string; revision: number; document: BrickStudioDocument; players: Array<{ playerId: string }> }>();
      },
    };
  }
  type Room = Awaited<ReturnType<typeof openRoom>>;

  async function join(room: Room, access: Access) {
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
  type Builder = Awaited<ReturnType<typeof join>>;

  const stillOpen = (closed: Promise<number>) => Promise.race([
    closed.then((code) => `closed ${code}`),
    new Promise<string>((resolve) => setTimeout(() => resolve("open"), 150)),
  ]);
  // Every connected builder receives every broadcast; drain them so inboxes stay in step.
  const applied = async (opId: string, revision: number, ...builders: Builder[]) => {
    for (const builder of builders) expect(await builder.inbox.next("apply")).toMatchObject({ opId, revision });
  };
  const snapshotted = async (revision: number, ...builders: Builder[]) => {
    for (const builder of builders) expect(await builder.inbox.next("snapshot")).toMatchObject({ revision });
  };
  const bricksOf = (document: unknown) => (document as BrickStudioDocument).bricks.map((placed) => placed.id);

  afterEach(() => vi.restoreAllMocks());

  it("keeps every builder connected through a rename and commits later edits against the refreshed revision", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));
    await applied(first.edit("first-before", 0), 2, first, second);

    // The teacher renames through the REST route: Postgres has already advanced
    // the revision when the live event reaches the room.
    world.revision = 3; world.title = "Bridge challenge";
    expect((await room.invalidate({ reason: "world_saved", change: "metadata" })).status).toBe(200);
    for (const builder of [first, second]) {
      const snapshot = await builder.inbox.next("snapshot");
      expect(snapshot).toMatchObject({ revision: 3 });
      expect(bricksOf(snapshot.document)).toEqual(["first-before"]);
    }
    expect(await room.state(first.access)).toMatchObject({ title: "Bridge challenge", revision: 3 });

    await applied(first.edit("first-after", 4), 4, first, second);
    await applied(second.edit("second-after", 8), 5, first, second);
    expect(db.commits.slice(-2).map((commit) => commit.expectedRevision)).toEqual([3, 4]);
    expect(bricksOf(world.document)).toEqual(["first-before", "first-after", "second-after"]);

    // An edit that races a second rename: the database moved on before the room heard.
    world.revision = 6; world.title = "Bridge challenge, day two";
    second.edit("raced", 12);
    const rejected = await second.inbox.next("reject");
    expect(rejected).toMatchObject({ code: "save_conflict", revision: 6 });
    expect(bricksOf(rejected.document)).toEqual(["first-before", "first-after", "second-after"]);
    expect(db.commits.at(-1)).toMatchObject({ expectedRevision: 5 });
    expect(bricksOf(world.document)).not.toContain("raced");
    await snapshotted(6, first, second);

    // The late live event re-confirms the same base for everyone, and building continues.
    expect((await room.invalidate({ reason: "world_saved", change: "metadata" })).status).toBe(200);
    await snapshotted(6, first, second);
    expect(await room.state(first.access)).toMatchObject({ title: "Bridge challenge, day two", revision: 6 });
    await applied(second.edit("retry", 12), 7, first, second);
    expect(db.commits.at(-1)).toMatchObject({ expectedRevision: 6 });
    expect(await stillOpen(first.closed)).toBe("open");
    expect(await stillOpen(second.closed)).toBe("open");
  });

  it("keeps builders connected when the metadata reload is unavailable and recovers through the commit guard", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));
    world.revision = 2; world.title = "Renamed while the database was away";
    db.worldsUnavailable = true;
    const unavailable = await room.invalidate({ reason: "world_saved", change: "metadata" });
    expect(unavailable).toMatchObject({ status: 503, body: { error: "world_reload_failed" } });
    expect(await stillOpen(builder.closed)).toBe("open");

    db.worldsUnavailable = false;
    builder.edit("stale", 0);
    expect(await builder.inbox.next("reject")).toMatchObject({ code: "save_conflict", revision: 2 });
    await snapshotted(2, builder);
    expect(bricksOf(world.document)).toEqual([]);
    expect(await room.state(builder.access)).toMatchObject({ title: "Renamed while the database was away", revision: 2 });
    await applied(builder.edit("fresh", 0), 3, builder);
  });

  it("re-authorizes existing members in place when a member is added and closes only a removed member", async () => {
    const { db, batchChecks, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));

    db.members.push({ world_id: world.id, user_id: db.students[2].user_id });
    expect((await room.invalidate({ reason: "members_updated", change: "membership" })).status).toBe(200);
    expect(batchChecks()).toBe(1);
    expect(await stillOpen(first.closed)).toBe("open");
    expect(await stillOpen(second.closed)).toBe("open");
    await applied(first.edit("still-building", 0), 2, first, second);
    const third = await join(room, studentAccess(2, world.id));
    expect(third.welcome).toMatchObject({ revision: 2 });

    db.members = db.members.filter((member) => member.user_id !== first.access.userId);
    expect((await room.invalidate({ reason: "members_updated", change: "revocation", userId: first.access.userId })).status).toBe(200);
    expect(await first.closed).toBe(4003);
    expect(batchChecks()).toBe(1);
    expect(await stillOpen(second.closed)).toBe("open");
    expect(await stillOpen(third.closed)).toBe("open");
    await applied(second.edit("after-removal", 4), 3, second, third);
    expect((await room.state(second.access)).players.map((player) => player.playerId).sort())
      .toEqual([second.access.userId, third.access.userId].sort());
  });

  it("a password or session revocation closes only that user's sockets", async () => {
    const { db, batchChecks, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));
    const stale = first.access;

    db.students[0].auth_version = 2;
    expect((await room.invalidate({ reason: "password_reset", change: "revocation", userId: stale.userId })).status).toBe(200);
    expect(await first.closed).toBe(4003);
    expect(batchChecks()).toBe(0);
    expect(await stillOpen(second.closed)).toBe("open");
    await applied(second.edit("unaffected", 0), 2, second);

    const rejoin = await room.stub.fetch(`https://world.internal/worlds/${room.roomId}/connect`, { headers: { Upgrade: "websocket", "x-classroom-access": JSON.stringify(stale) } });
    expect(rejoin.status).toBe(403);
    expect(await rejoin.json()).toEqual({ error: "classroom_access_denied" });
  });

  it("closing collaboration disconnects every student in every class world while the teacher keeps oversight", async () => {
    const { db, studentAccess, teacherAccess } = fixture([randomWorldUuid(), randomWorldUuid()]);
    const alpha = await openRoom(db.worlds[0]);
    const beta = await openRoom(db.worlds[1]);
    const alphaStudent = await join(alpha, studentAccess(0, db.worlds[0].id));
    const betaStudent = await join(beta, studentAccess(1, db.worlds[1].id));
    const alphaTeacher = await join(alpha, teacherAccess(db.worlds[0].id));
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue(teacherCaller);
    vi.spyOn(ClassroomService.prototype, "patch").mockImplementation(async (table, _filter, data) => {
      if (table !== "classes") return [];
      Object.assign(db.classes[0], data);
      return [db.classes[0]];
    });
    vi.spyOn(ClassroomService.prototype, "insert").mockResolvedValue([]);

    const response = await handleReleaseRequest(new Request(`https://worker.test/classroom/classes/${classId}`, {
      method: "PATCH", headers: { authorization: "Bearer teacher", "content-type": "application/json", origin: "https://virtual-legos.vercel.app" },
      body: JSON.stringify({ collaborationOpen: false }),
    }), routeEnv);
    expect(response.status).toBe(200);
    expect(await alphaStudent.closed).toBe(4003);
    expect(await betaStudent.closed).toBe(4003);
    expect(await stillOpen(alphaTeacher.closed)).toBe("open");
    await applied(alphaTeacher.edit("teacher-only", 0), 2, alphaTeacher);
  });

  it("fails closed and reports live_invalidation_failed when membership re-authorization is unavailable", async () => {
    const { db, studentAccess, teacherAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));
    const supervising = await join(room, teacherAccess(world.id));
    vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue(teacherCaller);
    vi.spyOn(ClassroomService.prototype, "patch").mockImplementation(async (table, _filter, data) => {
      if (table !== "classes") return [];
      Object.assign(db.classes[0], data);
      return [db.classes[0]];
    });
    vi.spyOn(ClassroomService.prototype, "insert").mockResolvedValue([]);

    db.batchUnavailable = true;
    const response = await handleReleaseRequest(new Request(`https://worker.test/classroom/classes/${classId}`, {
      method: "PATCH", headers: { authorization: "Bearer teacher", "content-type": "application/json", origin: "https://virtual-legos.vercel.app" },
      body: JSON.stringify({ name: "Period 1, renamed" }),
    }), routeEnv);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "live_invalidation_failed" });
    expect(db.classes[0].name).toBe("Period 1, renamed");
    for (const builder of [first, second, supervising]) expect(await builder.closed).toBe(4003);
  });
});
