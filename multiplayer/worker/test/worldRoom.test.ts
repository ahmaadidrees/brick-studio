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
import {
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

async function connectWorld(roomId: string, playerId: string, ownerToken?: string, reconnectToken?: string) {
  const url = new URL(`https://worker.test/worlds/${roomId}/connect`);
  url.searchParams.set("playerId", playerId);
  if (ownerToken) url.searchParams.set("ownerToken", ownerToken);
  if (reconnectToken) url.searchParams.set("reconnectToken", reconnectToken);
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
    const rapidRequests = [1, 2].map(() => workerFetch(rapidUrl.toString(), {
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

describe("World creation limiter", () => {
  it("returns a clean per-IP 429 while leaving another IP and legacy race creation available", async () => {
    const workerEnv = env as unknown as WorkerEnv;
    const limitedIp = "203.0.113.10";
    const limiterStub = workerEnv.WORLD_CREATION_LIMITER.get(
      workerEnv.WORLD_CREATION_LIMITER.idFromName(worldCreationLimiterKey(limitedIp)),
    );
    await runInDurableObject(limiterStub, async (_instance: WorldCreationLimiter, durableState) => {
      await durableState.storage.put("window", {
        windowStartedAt: Date.now(),
        count: WORLD_CREATION_LIMIT,
      });
    });
    const body = JSON.stringify({
      title: "Limited world",
      document: worldDocument(),
      profile: { displayName: "Ada Builder" },
    });
    const limited = await workerFetch("https://worker.test/worlds", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://virtual-legos.vercel.app",
        "cf-connecting-ip": limitedIp,
      },
      body,
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await limited.json()).toMatchObject({
      error: "creation_rate_limited",
      retryAfterSeconds: expect.any(Number),
    });

    const otherIp = await workerFetch("https://worker.test/worlds", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://virtual-legos.vercel.app",
        "cf-connecting-ip": "203.0.113.11",
      },
      body,
    });
    expect(otherIp.status).toBe(201);

    const race = await workerFetch("https://worker.test/rooms", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://virtual-legos.vercel.app",
        "cf-connecting-ip": limitedIp,
      },
      body: JSON.stringify({ title: "Legacy race", document: { bricks: [] } }),
    });
    expect(race.status).toBe(201);
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
