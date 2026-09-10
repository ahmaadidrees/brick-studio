import { DurableObject } from "cloudflare:workers";
import { WorldRoom, type WorldRoomEnv } from "./worldRoom";
import { WorldCreationLimiter } from "./worldCreationLimiter";
import { handleReleaseRequest } from "./classroomRoutes";
export interface Env extends WorldRoomEnv {
  RACE_ROOMS: DurableObjectNamespace<RaceRoom>;
  WORLD_CREATION_LIMITER: DurableObjectNamespace<WorldCreationLimiter>;
  CLASSROOM_TICKET_SECRET?: string;
}
export { WorldCreationLimiter, WorldRoom };
export default { fetch: handleReleaseRequest };

// Retain the historical Durable Object class for existing migration/storage identity.
// Public Race routes remain retired; guest Build together uses WorldRoom.
type RoomStatus = "waiting" | "countdown" | "racing";

interface RoomRecord {
  roomId: string;
  title: string;
  document: unknown;
  hostToken: string;
  status: RoomStatus;
  locked: boolean;
  startAt: number | null;
  finishOrder: string[];
  expiresAt: number;
}

interface SocketAttachment {
  playerId: string;
  isHost: boolean;
  connectedAt: number;
  ready: boolean;
  finishedAt: number | null;
  lastPoseAt: number;
  messageWindowAt: number;
  messageCount: number;
}

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 800_000;
const MAX_MESSAGE_BYTES = 2_048;
const MAX_PLAYERS = 30;
const MAX_MESSAGES_PER_SECOND = 30;
const MIN_POSE_INTERVAL_MS = 45;

const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export class RaceRoom extends DurableObject<Env> {
  private record: RoomRecord | null = null;
  private lastPersistedTouch = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.record = (await this.ctx.storage.get<RoomRecord>("room")) ?? null;
      this.lastPersistedTouch = Date.now();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/init" && request.headers.get("x-room-init") === "1") {
      if (this.record) return json({ error: "already_exists" }, 409);
      const input = await request.json() as Pick<RoomRecord, "roomId" | "title" | "document" | "hostToken">;
      this.record = {
        ...input, status: "waiting", locked: false, startAt: null,
        finishOrder: [], expiresAt: Date.now() + ROOM_TTL_MS,
      };
      await this.persist();
      return json({ ok: true }, 201);
    }
    if (!this.record) return json({ error: "room_not_found" }, 404);
    if (url.pathname.endsWith("/connect")) return this.connectSocket(request, url);
    return json({
      title: this.record.title,
      document: this.record.document,
      status: this.record.status,
      locked: this.record.locked,
      players: this.players(),
    });
  }

  private async connectSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "websocket_required" }, 426);
    }
    const playerId = url.searchParams.get("playerId") ?? "";
    if (!/^[A-Za-z0-9_-]{6,48}$/.test(playerId)) return json({ error: "invalid_player_id" }, 400);
    const isHost = url.searchParams.get("hostToken") === this.record!.hostToken;
    const existing = this.ctx.getWebSockets().find((socket) => (socket.deserializeAttachment() as SocketAttachment | null)?.playerId === playerId);
    if (existing) existing.close(4001, "Reconnected elsewhere");
    if (this.record!.locked && !isHost) return json({ error: "room_locked" }, 403);
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS && !existing) return json({ error: "room_full" }, 429);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const now = Date.now();
    const attachment: SocketAttachment = {
      playerId, isHost, connectedAt: now, ready: false, finishedAt: null,
      lastPoseAt: 0, messageWindowAt: now, messageCount: 0,
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    await this.touch();
    server.send(JSON.stringify({
      type: "welcome", playerId, isHost, roomId: this.record!.roomId,
      title: this.record!.title, document: this.record!.document,
      status: this.record!.status, locked: this.record!.locked,
      startAt: this.record!.startAt, finishOrder: this.record!.finishOrder,
      players: this.players(),
    }));
    this.broadcastPlayers();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const bytes = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes > MAX_MESSAGE_BYTES) return this.reject(socket, "message_too_large");
    if (typeof message !== "string") return this.reject(socket, "text_messages_only");
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return socket.close(1011, "Missing session");
    const now = Date.now();
    if (now - attachment.messageWindowAt >= 1000) {
      attachment.messageWindowAt = now;
      attachment.messageCount = 0;
    }
    attachment.messageCount += 1;
    if (attachment.messageCount > MAX_MESSAGES_PER_SECOND) {
      socket.serializeAttachment(attachment);
      return this.reject(socket, "rate_limited");
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(message) as Record<string, unknown>; }
    catch { return this.reject(socket, "invalid_json"); }

    switch (data.type) {
      case "pose": {
        if (now - attachment.lastPoseAt < MIN_POSE_INTERVAL_MS) return;
        const keys = ["x", "y", "z", "yaw"] as const;
        if (!keys.every((key) => typeof data[key] === "number" && Number.isFinite(data[key]) && Math.abs(data[key] as number) <= 100_000) ||
            typeof data.moving !== "boolean" || typeof data.jumping !== "boolean") return this.reject(socket, "invalid_pose");
        attachment.lastPoseAt = now;
        socket.serializeAttachment(attachment);
        this.broadcast({ type: "pose", playerId: attachment.playerId, x: data.x, y: data.y, z: data.z,
          yaw: data.yaw, moving: data.moving, jumping: data.jumping, at: now }, socket);
        break;
      }
      case "ready":
        if (typeof data.ready !== "boolean") return this.reject(socket, "invalid_ready");
        attachment.ready = data.ready;
        socket.serializeAttachment(attachment);
        this.broadcastPlayers();
        break;
      case "finish":
        if (this.record!.status !== "racing" || attachment.finishedAt) return;
        attachment.finishedAt = now;
        socket.serializeAttachment(attachment);
        this.record!.finishOrder.push(attachment.playerId);
        await this.persist();
        this.broadcast({ type: "raceFinish", playerId: attachment.playerId,
          place: this.record!.finishOrder.length, finishedAt: now, finishOrder: this.record!.finishOrder });
        break;
      case "start": {
        if (!attachment.isHost) return this.reject(socket, "host_only");
        const countdownMs = typeof data.countdownMs === "number" ? Math.max(0, Math.min(10_000, data.countdownMs)) : 3000;
        this.record!.status = countdownMs ? "countdown" : "racing";
        this.record!.startAt = now + countdownMs;
        this.record!.finishOrder = [];
        for (const peer of this.ctx.getWebSockets()) {
          const peerAttachment = peer.deserializeAttachment() as SocketAttachment | null;
          if (peerAttachment) { peerAttachment.finishedAt = null; peer.serializeAttachment(peerAttachment); }
        }
        await this.persist(false);
        this.broadcast({ type: "raceStart", startAt: this.record!.startAt, countdownMs });
        if (countdownMs) {
          await this.ctx.storage.setAlarm(this.record!.startAt);
        } else {
          await this.ctx.storage.setAlarm(this.record!.expiresAt);
        }
        break;
      }
      case "reset":
        if (!attachment.isHost) return this.reject(socket, "host_only");
        this.record!.status = "waiting";
        this.record!.startAt = null;
        this.record!.finishOrder = [];
        for (const peer of this.ctx.getWebSockets()) {
          const peerAttachment = peer.deserializeAttachment() as SocketAttachment | null;
          if (peerAttachment) { peerAttachment.finishedAt = null; peerAttachment.ready = false; peer.serializeAttachment(peerAttachment); }
        }
        await this.persist();
        this.broadcast({ type: "raceReset" });
        this.broadcastPlayers();
        break;
      case "lock":
        if (!attachment.isHost) return this.reject(socket, "host_only");
        if (typeof data.locked !== "boolean") return this.reject(socket, "invalid_lock");
        this.record!.locked = data.locked;
        await this.persist();
        this.broadcast({ type: "locked", locked: this.record!.locked });
        break;
      default:
        return this.reject(socket, "unknown_message");
    }
    await this.touch();
  }

  async webSocketClose(_socket: WebSocket, _code: number, _reason: string): Promise<void> {
    this.broadcastPlayers();
    await this.touch();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, "WebSocket error");
    this.broadcastPlayers();
  }

  async alarm(): Promise<void> {
    if (!this.record) return;
    const now = Date.now();
    if (this.record.status === "countdown" && this.record.startAt && now >= this.record.startAt) {
      this.record.status = "racing";
      await this.persist(false);
      this.broadcast({ type: "raceLive", startAt: this.record.startAt });
    }
    if (now >= this.record.expiresAt) {
      for (const socket of this.ctx.getWebSockets()) socket.close(4000, "Room expired");
      await this.ctx.storage.deleteAll();
      this.record = null;
      return;
    }
    await this.ctx.storage.setAlarm(this.record.expiresAt);
  }

  private players() {
    return this.ctx.getWebSockets().flatMap((socket) => {
      const a = socket.deserializeAttachment() as SocketAttachment | null;
      return a ? [{ playerId: a.playerId, isHost: a.isHost, ready: a.ready,
        connectedAt: a.connectedAt, finishedAt: a.finishedAt }] : [];
    });
  }

  private broadcastPlayers(): void { this.broadcast({ type: "players", players: this.players() }); }

  private broadcast(value: unknown, exclude?: WebSocket): void {
    const message = JSON.stringify(value);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== exclude && socket.readyState === WebSocket.OPEN) {
        try { socket.send(message); } catch { /* cleanup handled by close/error */ }
      }
    }
  }

  private reject(socket: WebSocket, error: string): void {
    socket.send(JSON.stringify({ type: "error", error }));
  }

  private async touch(): Promise<void> {
    if (!this.record) return;
    this.record.expiresAt = Date.now() + ROOM_TTL_MS;
    // Pose traffic can be frequent; persist the sliding expiry at most once a
    // minute instead of turning every movement packet into a storage write.
    if (Date.now() - this.lastPersistedTouch >= 60_000) await this.persist();
  }

  private async persist(scheduleAlarm = true): Promise<void> {
    if (!this.record) return;
    await this.ctx.storage.put("room", this.record);
    this.lastPersistedTouch = Date.now();
    if (scheduleAlarm) await this.ctx.storage.setAlarm(this.record.expiresAt);
  }
}
