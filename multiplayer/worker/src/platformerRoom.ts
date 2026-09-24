import { createPlatformerDocument, validatePlatformerDocument } from "@brick-studio/platformer-core/document";
import { editDesign } from "@brick-studio/platformer-core/engine/designEdit";
import type { EditOp } from "@brick-studio/platformer-core/engine/events";
import { levelFromJson, levelToJson, type LevelJson } from "@brick-studio/platformer-core/engine/level";
import { MAX_PLAYERS, PROTOCOL, type ClientMsg, type RoomInfo } from "@brick-studio/platformer-core/net/protocol";
import { RoomCore, type RoomMeta, type RoomSocket, type TrustedIdentity } from "@brick-studio/platformer-core/net/roomCore";
import { DurableObject } from "cloudflare:workers";
import {
  ClassroomHttpError,
  commitClassroomWorld,
  loadClassroomLevel,
  revalidateClassroomWorldAccess,
  type ClassroomEnv,
  type ClassroomSessionIdentity,
} from "./classroom/index";
import { ownerTokenVerifier, safeVerifierEqual, validWorldId, type ClassroomSocketAccess } from "./worldRoom";

/*
 * One live 2D room (docs/PLATFORMER.md). The shared logic lives in `RoomCore` from
 * `@brick-studio/platformer-core`: the room never runs the game, it keeps the clock, puts every event
 * in one order and passes poses around. This object adds what hosting needs: sockets that may
 * hibernate, identities the router vouches for (an owner token for guest rooms, a signed-in ticket
 * for class rooms), periodic re-checks of classroom access, and saving: guest rooms keep their level
 * in storage, class rooms write it behind to the account world, about a second after edits.
 */

export interface PlatformerRoomEnv extends ClassroomEnv {
  PLATFORMER_ROOMS: DurableObjectNamespace<PlatformerRoom>;
}

/** Guest rooms are forgotten this long after the last activity, like 3D guest rooms. */
export const PLATFORMER_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const PLATFORMER_ROOM_EXPIRY_GRACE_MS = 90 * 1000;
const TOUCH_PERSIST_INTERVAL_MS = 60 * 1000;
const GUEST_SAVE_DELAY_MS = 2000;
export const PLATFORMER_COMMIT_DEBOUNCE_MS = 1000;
const COMMIT_MAX_LAG_MS = 5000;
const COMMIT_RETRY_BACKOFF_MS = [1000, 2000, 5000, 15_000];
/** Edits nobody can save right now (the database is down, or no known editor may save) are retried this often. */
const COMMIT_PARKED_RETRY_MS = 5 * 60 * 1000;
/** Edit operations kept for replaying onto a newer copy after a conflict; past this, only the conflict copy is kept. */
const MAX_PENDING_OPS = 20_000;
/** Recovery copies are never pruned automatically. At capacity, pending work stays parked in the room. */
export const MAX_PLATFORMER_RECOVERY_COPIES = 16;
const RECOVERY_PREFIX = "recovery:";
const COMMIT_DELAY_NOTICE_AFTER = 3;
const REAUTH_INTERVAL_MS = 60 * 1000;
/** Edits and host actions need a classroom check at most this old. */
const PRIVILEGED_ACCESS_MAX_AGE_MS = 15 * 1000;
/** Poses (20 a second), events, pings and fingerprints fit well under this. */
const MAX_MESSAGES_PER_SECOND = 120;
const MAX_RATE_VIOLATIONS = 3;
/** Sockets beyond the player cap are refused before they say hello. */
const MAX_SOCKETS = MAX_PLAYERS + 4;
const OWNER_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

const SAVE_DELAYED_MESSAGE = "Saving to your class level is delayed. Your changes stay live in this room and will be saved automatically.";
const SAVE_BLOCKED_MESSAGE = "Your changes are live in this room but could not be saved to the class level. Rejoin from My worlds to keep saving.";
const SAVE_REPLACED_MESSAGE = "Someone saved a newer version of this level, so the room reloaded it. The changes made here are kept as a recovery copy for the teacher.";
const SAVE_REBASED_MESSAGE = "Someone saved a newer version of this level, so the room took it and put the changes made here back on top.";
const LEVEL_UPDATED_MESSAGE = "This level was updated, so the room reloaded it.";

export type PlatformerRoomKind = "guest" | "classroom";

type PlatformerRecord = {
  kind: PlatformerRoomKind;
  roomId: string;
  classroomWorldId?: string;
  title: string;
  level: LevelJson;
  /** Class rooms: the database revision `level` was last confirmed at. */
  dbRevision?: number;
  /** Class rooms: edits the database has not confirmed yet. */
  unsaved?: boolean;
  /**
   * Class rooms: the level with those edits, kept in storage as each edit is accepted, so a restart, the last
   * player leaving or a database outage never loses them. Cleared once the database has it.
   */
  pending?: LevelJson;
  /** Class rooms: who made the latest edit, the first identity a save is made as. */
  lastEditor?: ClassroomSessionIdentity;
  /** Class rooms: the owner's or teacher's last session here, the last identity a save is tried as. */
  ownerIdentity?: ClassroomSessionIdentity;
  /** Class rooms: when the alarm should try the next save of `pending`. */
  commitDueAt?: number;
  /**
   * Class rooms: the edit operations in `pending`, in the order the room applied them, so a save that finds a newer
   * copy in the database can put them back on top of it. Absent once there were too many to keep.
   */
  pendingOps?: EditOp[];
  /** Class rooms: more edits arrived than `pendingOps` keeps, so a conflict can only keep the copy. */
  pendingOpsLost?: boolean;
  /** Legacy recovery field. Moved to a separate durable key before room expiry. */
  conflictCopy?: { level: LevelJson; revision: number; at: number };
  /** Guest rooms: SHA-256 of the owner token; the token itself is never stored. */
  ownerTokenVerifier?: string;
  meta?: RoomMeta;
  expiresAt: number;
};

type PlatformerRecoveryCopy = {
  id: string;
  worldId: string;
  level: LevelJson;
  revision: number;
  at: number;
};

type PlatformerAttachment = {
  identity: TrustedIdentity;
  /** Player number and name once admitted, so a room that wakes up can re-admit everyone as they were. */
  num: number;
  name: string;
  access?: ClassroomSocketAccess & { checkedAt: number };
  windowAt: number;
  count: number;
  violations: number;
};

/** What the router puts in `x-platformer-access`. Browsers cannot send it: the router strips it. */
export type PlatformerConnectGrant =
  | { kind: "guest"; ownerToken?: string }
  | { kind: "classroom"; access: ClassroomSocketAccess };

export type PlatformerInit =
  | { kind: "guest"; roomId: string; level: unknown; ownerTokenVerifier: string }
  | { kind: "classroom"; roomId: string; classroomWorldId: string; title: string; level: unknown; dbRevision: number };

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const identityOf = (access: ClassroomSocketAccess): ClassroomSessionIdentity => ({
  userId: access.userId, sessionId: access.sessionId, authVersion: access.authVersion,
});

const sameIdentity = (a: ClassroomSessionIdentity | undefined, b: ClassroomSessionIdentity) =>
  !!a && a.userId === b.userId && a.sessionId === b.sessionId && a.authVersion === b.authVersion;

function trustedClassroomIdentity(access: ClassroomSocketAccess): TrustedIdentity {
  return { key: access.userId, host: access.isTeacher || access.isOwner, name: access.isTeacher ? "Teacher" : access.username, canBuild: access.canEdit };
}

function parseLevel(value: unknown): LevelJson | null {
  try {
    return levelToJson(levelFromJson(value));
  } catch {
    return null;
  }
}

export class PlatformerRoom extends DurableObject<PlatformerRoomEnv> {
  private record: PlatformerRecord | null = null;
  private core: RoomCore | null = null;
  /** Everything that touches the room runs one at a time, in arrival order. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastTouchPersist = 0;
  private guestSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private commitDueBy = 0;
  private commitInFlight = false;
  private commitFailures = 0;
  private saveNotice: "delayed" | "blocked" | null = null;

  constructor(ctx: DurableObjectState, env: PlatformerRoomEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.record = (await this.ctx.storage.get<PlatformerRecord>("room")) ?? null;
    });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/room-kind" && request.method === "GET") {
      return json({ kind: this.record && !this.expired() ? this.record.kind : "missing" });
    }
    if (url.pathname === "/internal/classroom-presence" && request.method === "GET") {
      const userIds = this.record?.kind !== "classroom" ? [] : [...new Set(this.openSockets().flatMap((socket) => {
        const access = this.attachment(socket)?.access;
        return access ? [access.userId] : [];
      }))];
      return json({ userIds });
    }
    if (url.pathname === "/internal/classroom-invalidate" && request.method === "POST") {
      return this.serialized(() => this.invalidate(request));
    }
    if (url.pathname === "/internal/recovery" && request.method === "GET") {
      return this.serialized(() => this.recovery(request));
    }
    if (url.pathname.startsWith("/internal/recovery/") && (request.method === "GET" || request.method === "DELETE")) {
      return this.serialized(() => this.recovery(request, url.pathname.slice("/internal/recovery/".length)));
    }
    if (url.pathname === "/init" && request.method === "POST" && request.headers.get("x-platformer-init") === "1") {
      return this.serialized(() => this.init(request));
    }
    if (!this.record || this.expired()) return json({ error: "room_not_found" }, 404);
    if (url.pathname === "/connect") return this.serialized(() => this.connectSocket(request));
    if (url.pathname === "/info" && request.method === "GET") {
      if (this.record.kind !== "guest") return json({ error: "classroom_auth_required" }, 401);
      const players = this.core?.playerCount ?? 0;
      const info: RoomInfo = { roomId: this.record.roomId, title: this.record.title, players, full: players >= MAX_PLAYERS, closed: this.record.meta?.settings.closed ?? false };
      return json(info);
    }
    return json({ error: "not_found" }, 404);
  }

  /** Called only through the Worker router with its own grant; always check the current class permission. */
  private async recovery(request: Request, id?: string): Promise<Response> {
    let grant: PlatformerConnectGrant | null = null;
    try { grant = JSON.parse(request.headers.get("x-platformer-access") ?? "null") as PlatformerConnectGrant | null; } catch { /* no grant */ }
    if (grant?.kind !== "classroom" || !grant.access || !UUID_PATTERN.test(grant.access.worldId)) {
      return json({ error: "access_required" }, 401);
    }
    if (this.record && (this.record.kind !== "classroom" || this.record.classroomWorldId !== grant.access.worldId)) {
      return json({ error: "room_not_found" }, 404);
    }
    try {
      const access = await revalidateClassroomWorldAccess(this.env, identityOf(grant.access), grant.access.worldId);
      if (!access.isOwner && !access.isTeacher) return json({ error: "access_required" }, 403);
    } catch (error) {
      if (error instanceof ClassroomHttpError) return json({ error: error.code }, error.status);
      return json({ error: "access_unavailable" }, 503);
    }
    if (id) {
      if (id !== "legacy" && !UUID_PATTERN.test(id)) return json({ error: "not_found" }, 404);
      const embedded = id === "legacy" && this.record?.kind === "classroom" && this.record.conflictCopy;
      const copy = await this.ctx.storage.get<PlatformerRecoveryCopy>(RECOVERY_PREFIX + id);
      if (!embedded && copy?.worldId !== grant.access.worldId) return json({ error: "not_found" }, 404);
      if (request.method === "DELETE") {
        // Explicitly remove only this archive entry. The current level and pending edits are untouched.
        if (embedded) {
          delete this.record!.conflictCopy;
          await this.persist(false);
        }
        if (copy?.worldId === grant.access.worldId) await this.ctx.storage.delete(RECOVERY_PREFIX + id);
        if (this.record?.pending) {
          // A full archive may have parked a conflict. Recheck permissions on its ordinary save retry.
          this.record.commitDueAt = Date.now() + 1000;
          await this.persist(false);
          await this.scheduleAlarm();
        }
        return new Response(null, { status: 204 });
      }
      if (embedded) {
        return json({ id, worldId: grant.access.worldId, ...this.record!.conflictCopy });
      }
      return json(copy);
    }
    const copies = await this.ctx.storage.list<PlatformerRecoveryCopy>({ prefix: RECOVERY_PREFIX });
    const items = [...copies.values()]
      .filter((copy) => copy.worldId === grant.access.worldId)
      .map(({ id, revision, at }) => ({ id, revision, at }));
    if (this.record?.kind === "classroom" && this.record.conflictCopy && !items.some((item) => item.id === "legacy")) {
      const { revision, at } = this.record.conflictCopy;
      items.push({ id: "legacy", revision, at });
    }
    return json({ copies: items.sort((a, b) => b.at - a.at), capacity: MAX_PLATFORMER_RECOVERY_COPIES });
  }

  /** Immutable snapshots survive room expiry. Capacity is a backpressure signal, never a reason to delete a copy. */
  private async archiveRecovery(level: LevelJson, revision: number, at = Date.now(), id = crypto.randomUUID()): Promise<boolean> {
    const worldId = this.record?.classroomWorldId;
    if (!worldId) return false;
    const existing = await this.ctx.storage.list<PlatformerRecoveryCopy>({ prefix: RECOVERY_PREFIX });
    // A legacy copy keeps the same export ID when its expiring room record is migrated.
    if (id === "legacy" && existing.has(RECOVERY_PREFIX + id)) return true;
    if (existing.size >= MAX_PLATFORMER_RECOVERY_COPIES) return false;
    await this.ctx.storage.put(RECOVERY_PREFIX + id, { id, worldId, level, revision, at } satisfies PlatformerRecoveryCopy);
    return true;
  }

  /** Upgrade a copy written by an older Worker before dropping its expiring room record. */
  private async preserveLegacyRecovery(): Promise<boolean> {
    const record = this.record;
    if (record?.kind !== "classroom" || !record.conflictCopy) return true;
    const { level, revision, at } = record.conflictCopy;
    if (!await this.archiveRecovery(level, revision, at, "legacy")) return false;
    delete record.conflictCopy;
    await this.persist(false);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Opening

  private async init(request: Request): Promise<Response> {
    let input: Partial<PlatformerInit> & Record<string, unknown>;
    try { input = await request.json() as typeof input; } catch { return json({ error: "invalid_room" }, 400); }
    if (this.record && !this.expired()) {
      // ensureRoom re-sends the stored level on every open. A class room adopts it only when the database is
      // ahead of what it last confirmed and nothing here is waiting to be saved.
      if (this.record.kind === "classroom" && input.kind === "classroom" && input.classroomWorldId === this.record.classroomWorldId
          && Number.isInteger(input.dbRevision) && (input.dbRevision as number) > (this.record.dbRevision ?? 0)
          && !this.record.unsaved && !this.core?.dirty && !this.commitInFlight) {
        const level = parseLevel(input.level);
        if (level) await this.adopt(level, input.dbRevision as number, typeof input.title === "string" ? input.title : undefined, LEVEL_UPDATED_MESSAGE);
      }
      return json({ error: "already_exists" }, 409);
    }
    const level = parseLevel(input.level);
    if (!level || typeof input.roomId !== "string" || !validWorldId(input.roomId)) return json({ error: "invalid_room" }, 400);
    const now = Date.now();
    if (input.kind === "guest") {
      if (typeof input.ownerTokenVerifier !== "string" || !OWNER_TOKEN_PATTERN.test(input.ownerTokenVerifier)) return json({ error: "invalid_room" }, 400);
      this.record = { kind: "guest", roomId: input.roomId, title: level.title, level, ownerTokenVerifier: input.ownerTokenVerifier, expiresAt: now + PLATFORMER_ROOM_TTL_MS };
    } else if (input.kind === "classroom") {
      if (typeof input.classroomWorldId !== "string" || !UUID_PATTERN.test(input.classroomWorldId) || !Number.isInteger(input.dbRevision)) {
        return json({ error: "invalid_room" }, 400);
      }
      this.record = {
        kind: "classroom", roomId: input.roomId, classroomWorldId: input.classroomWorldId,
        title: typeof input.title === "string" ? input.title.slice(0, 80) : level.title, level,
        dbRevision: input.dbRevision as number, expiresAt: now + PLATFORMER_ROOM_TTL_MS,
      };
    } else return json({ error: "invalid_room" }, 400);
    this.core = null;
    await this.persist(true);
    return json({ ok: true }, 201);
  }

  private async connectSocket(request: Request): Promise<Response> {
    const record = this.record!;
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
    let grant: PlatformerConnectGrant | null = null;
    try { grant = JSON.parse(request.headers.get("x-platformer-access") ?? "null") as PlatformerConnectGrant | null; } catch { grant = null; }
    if (!grant || grant.kind !== record.kind) return json({ error: "access_required" }, 401);
    let identity: TrustedIdentity;
    let access: PlatformerAttachment["access"];
    if (grant.kind === "classroom") {
      const given = grant.access;
      if (!given || given.worldId !== record.classroomWorldId || typeof given.userId !== "string" || typeof given.username !== "string") {
        return json({ error: "access_required" }, 401);
      }
      identity = trustedClassroomIdentity(given);
      access = { ...given, checkedAt: Date.now() };
      if ((given.isOwner || given.isTeacher) && given.canEdit) {
        record.ownerIdentity = identityOf(given);
        await this.persist(false);
      }
    } else {
      const token = grant.ownerToken;
      const host = typeof token === "string" && OWNER_TOKEN_PATTERN.test(token) && !!record.ownerTokenVerifier
        && safeVerifierEqual(await ownerTokenVerifier(token), record.ownerTokenVerifier);
      identity = { host };
    }
    if (this.openSockets().length >= MAX_SOCKETS) return json({ error: "room_full" }, 429);
    const core = this.ensureCore();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    server.serializeAttachment({ identity, num: 0, name: "", access, windowAt: now, count: 0, violations: 0 } satisfies PlatformerAttachment);
    core.connect(server as unknown as RoomSocket, identity);
    await this.touch();
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * The live session, rebuilt after the object hibernated or restarted: everyone still connected is re-admitted
   * as they were and gets a fresh welcome (their game keeps its place and starts over from the saved level).
   */
  private ensureCore(): RoomCore {
    if (this.core) return this.core;
    const record = this.record!;
    const core = new RoomCore(record.roomId, levelFromJson(record.pending ?? record.level), { classroom: record.kind === "classroom", meta: record.meta });
    // Edits kept from before a restart are still owed to the database.
    if (record.pending) core.dirty = true;
    this.core = core;
    for (const socket of this.openSockets()) {
      const attachment = this.attachment(socket);
      if (!attachment) continue;
      core.connect(socket as unknown as RoomSocket, { ...attachment.identity, num: attachment.num || undefined });
      if (attachment.num > 0) {
        core.message(socket as unknown as RoomSocket, JSON.stringify({ type: "hello", v: PROTOCOL, name: attachment.name, key: attachment.identity.key ?? "" }));
      }
    }
    return core;
  }

  // -------------------------------------------------------------------------------------------
  // Messages

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.serialized(() => this.handleMessage(socket, message));
  }

  private async handleMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.record) return socket.close(4000, "room_not_found");
    const attachment = this.attachment(socket);
    if (!attachment) return socket.close(1011, "Missing session");
    const core = this.ensureCore();
    const sock = socket as unknown as RoomSocket;
    if (typeof message !== "string") return core.refuse(sock, "bad_json", "Text messages only.");
    const now = Date.now();
    if (now - attachment.windowAt >= 1000) {
      attachment.windowAt = now;
      attachment.count = 0;
    }
    if (++attachment.count > MAX_MESSAGES_PER_SECOND) {
      attachment.violations += 1;
      socket.serializeAttachment(attachment);
      if (attachment.violations >= MAX_RATE_VIOLATIONS) core.refuse(sock, "rate", "Too many messages. Reload the page to rejoin.");
      return;
    }
    let msg: Partial<ClientMsg> & { ev?: { t?: unknown } } = {};
    try { msg = JSON.parse(message) as typeof msg; } catch { /* RoomCore answers bad JSON */ }
    if (attachment.access) {
      const privileged = (msg.type === "ev" && (msg.ev?.t === "edit" || msg.ev?.t === "reset")) || msg.type === "settings" || msg.type === "kick" || msg.type === "unban";
      const age = now - attachment.access.checkedAt;
      if ((privileged && age > PRIVILEGED_ACCESS_MAX_AGE_MS) || age > REAUTH_INTERVAL_MS) {
        if (!(await this.reauthorize(socket, attachment, privileged))) {
          if (privileged) this.refuseUnchecked(socket, msg);
          return;
        }
      }
    }
    const accepted = core.stats.events;
    core.message(sock, message);
    const acceptedEdit = msg.type === "ev" && msg.ev?.t === "edit" && core.stats.events > accepted;
    if (msg.type === "hello") {
      const player = core.player(sock);
      if (player) {
        attachment.num = player.num;
        attachment.name = player.name;
        attachment.identity = { ...attachment.identity, key: player.key };
      }
    }
    if (acceptedEdit && this.record.kind === "classroom" && core.dirty) {
      // Keep the edited level in storage before anything else, so it survives whatever happens next.
      this.record.pending = levelToJson(core.design);
      this.record.unsaved = true;
      if (!this.record.pendingOpsLost) {
        const ops = (msg as { ev: { ops: EditOp[] } }).ev.ops;
        const kept = this.record.pendingOps ?? [];
        if (kept.length + ops.length <= MAX_PENDING_OPS) {
          kept.push(...ops);
          this.record.pendingOps = kept;
        } else {
          delete this.record.pendingOps;
          this.record.pendingOpsLost = true;
        }
      }
      if (attachment.access?.canEdit) this.record.lastEditor = identityOf(attachment.access);
      // A backstop that outlives eviction; the in-memory debounce normally saves well before it.
      const backstop = !this.record.commitDueAt;
      if (backstop) this.record.commitDueAt = Date.now() + COMMIT_MAX_LAG_MS;
      await this.persist(false);
      if (backstop) await this.scheduleAlarm();
    }
    socket.serializeAttachment(attachment);
    core.flushPoses();
    await this.afterChange();
    await this.touch();
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.serialized(async () => {
      this.core?.disconnect(socket as unknown as RoomSocket);
      await this.whenEmpty();
    });
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.serialized(async () => {
      this.core?.disconnect(socket as unknown as RoomSocket);
      try { socket.close(1011, "WebSocket error"); } catch { /* already closed */ }
      await this.whenEmpty();
    });
  }

  /** The last player left: save what is outstanding now instead of waiting. */
  private async whenEmpty(): Promise<void> {
    if (!this.core || this.core.playerCount > 0) return;
    if (this.record?.kind === "classroom") {
      if (this.core.dirty || this.record.pending) await this.commit();
    } else await this.saveGuestNow();
  }

  // -------------------------------------------------------------------------------------------
  // Classroom access

  /** A privileged message whose access check could not run: undo the sender's prediction, say why. */
  private refuseUnchecked(socket: WebSocket, msg: Partial<ClientMsg> & { cid?: unknown }): void {
    const core = this.ensureCore();
    if (msg.type === "ev" && typeof msg.cid === "string") core.rejectEvent(socket as unknown as RoomSocket, msg.cid, "unchecked");
  }

  /**
   * Re-check one classroom socket. False when the socket was closed, or when the check could not run and the
   * message is privileged (it waits for a check that succeeds).
   */
  private async reauthorize(socket: WebSocket, attachment: PlatformerAttachment, privileged: boolean): Promise<boolean> {
    const access = attachment.access;
    const worldId = this.record?.classroomWorldId;
    if (!access || !worldId) return true;
    try {
      const fresh = await revalidateClassroomWorldAccess(this.env, identityOf(access), worldId);
      attachment.access = { ...fresh, checkedAt: Date.now() } as PlatformerAttachment["access"];
      const trusted = trustedClassroomIdentity(fresh as ClassroomSocketAccess);
      attachment.identity = { ...attachment.identity, host: trusted.host, canBuild: trusted.canBuild };
      socket.serializeAttachment(attachment);
      this.ensureCore().updatePlayer(socket as unknown as RoomSocket, { host: trusted.host, canBuild: trusted.canBuild });
      return true;
    } catch (error) {
      if (error instanceof ClassroomHttpError && error.status < 500) {
        this.ensureCore().refuse(socket as unknown as RoomSocket, "access", error.message);
        return false;
      }
      // The permission service is unavailable: playing goes on, but nothing that changes the level or the room
      // does until a check succeeds. The old check no longer counts, so the next privileged message asks again.
      // Only privileged messages re-check at once; play re-checks on its usual interval, sparing the service.
      if (attachment.access) attachment.access.checkedAt = Math.min(attachment.access.checkedAt, Date.now() - PRIVILEGED_ACCESS_MAX_AGE_MS - 1);
      socket.serializeAttachment(attachment);
      return !privileged;
    }
  }

  private async invalidate(request: Request): Promise<Response> {
    const record = this.record;
    if (!record || record.kind !== "classroom" || this.expired()) return json({ error: "room_not_found" }, 404);
    let input: { userId?: unknown; change?: unknown } = {};
    try { input = await request.json() as typeof input; } catch { /* a missing kind revokes, below */ }
    const userId = typeof input.userId === "string" ? input.userId : undefined;
    const change = input.change === "metadata" || input.change === "membership" ? input.change : "revocation";
    if (change === "metadata") {
      // Saved outside this room (the 2D builder, a restore, a rename): take the newer copy unless edits here wait.
      if (!this.core?.dirty && !record.unsaved && !this.commitInFlight) {
        try {
          const latest = await loadClassroomLevel(this.env, record.classroomWorldId!);
          if (latest.revision > (record.dbRevision ?? 0)) await this.adopt(latest.document.level, latest.revision, latest.title, LEVEL_UPDATED_MESSAGE);
        } catch { /* the next save reconciles */ }
      }
      return json({ ok: true });
    }
    for (const socket of this.openSockets()) {
      const attachment = this.attachment(socket);
      if (!attachment?.access || (userId && attachment.access.userId !== userId)) continue;
      if (change === "membership") await this.reauthorize(socket, attachment, false);
      else this.ensureCore().refuse(socket as unknown as RoomSocket, "access", "Your classroom access changed.");
    }
    return json({ ok: true });
  }

  // -------------------------------------------------------------------------------------------
  // Saving

  private async afterChange(): Promise<void> {
    const core = this.core, record = this.record;
    if (!core || !record) return;
    if (core.metaDirty) {
      core.metaDirty = false;
      record.meta = core.meta();
      await this.persist(false);
    }
    if (!core.dirty) return;
    if (record.kind === "classroom") this.scheduleCommit();
    else this.scheduleGuestSave();
  }

  private scheduleGuestSave(): void {
    if (this.guestSaveTimer) return;
    this.guestSaveTimer = setTimeout(() => {
      this.guestSaveTimer = null;
      void this.serialized(() => this.saveGuestNow());
    }, GUEST_SAVE_DELAY_MS);
  }

  private async saveGuestNow(): Promise<void> {
    if (this.guestSaveTimer) { clearTimeout(this.guestSaveTimer); this.guestSaveTimer = null; }
    const core = this.core, record = this.record;
    if (!core || !record || record.kind !== "guest" || !core.dirty) return;
    core.dirty = false;
    record.level = levelToJson(core.design);
    record.title = record.level.title;
    await this.persist(false);
  }

  private scheduleCommit(): void {
    if (!this.core?.dirty) return;
    const now = Date.now();
    if (!this.commitDueBy) this.commitDueBy = now + COMMIT_MAX_LAG_MS;
    const at = Math.min(now + PLATFORMER_COMMIT_DEBOUNCE_MS, this.commitDueBy);
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.serialized(() => this.commit());
    }, Math.max(0, at - now));
  }

  /**
   * One write-behind save of the class level. Callers run inside `serialized`. Nobody needs to be connected:
   * the save is made as the last editor, then any connected editor, then the owner's or teacher's last session
   * (the classroom service checks each is still allowed). Until one lands, `pending` keeps the edits in
   * storage and the alarm keeps trying; the room does not expire with them.
   */
  private async commit(): Promise<void> {
    const core = this.core, record = this.record;
    if (!record?.classroomWorldId || this.commitInFlight) return;
    if (!core?.dirty && !record.pending) return;
    if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
    const identities = this.commitIdentities();
    if (!identities.length) return this.park("blocked");
    this.commitInFlight = true;
    this.commitDueBy = 0;
    const document = createPlatformerDocument(core ? core.design : levelFromJson(record.pending!));
    if (core) core.dirty = false;
    let outcome: "saved" | "rebased" | "replaced" | "refused" | "failed" | "archive_full" = "refused";
    try {
      for (const identity of identities) {
        try {
          const saved = await commitClassroomWorld(this.env, record.classroomWorldId, document, record.dbRevision ?? 1, identity, "2d");
          record.dbRevision = saved.revision;
          record.level = document.level;
          record.title = saved.title;
          outcome = "saved";
          break;
        } catch (error) {
          const code = error instanceof ClassroomHttpError ? error.code : "unavailable";
          if (code === "access_revoked" || code === "read_only") {
            // This identity may no longer save: forget it and try the next.
            if (sameIdentity(record.lastEditor, identity)) delete record.lastEditor;
            if (sameIdentity(record.ownerIdentity, identity)) delete record.ownerIdentity;
            continue;
          }
          if (code === "revision_conflict") {
            try {
              // Someone saved elsewhere since. Keep the room's version before replacing or rebasing it.
              const latest = await loadClassroomLevel(this.env, record.classroomWorldId);
              if (!await this.preserveLegacyRecovery() || !await this.archiveRecovery(document.level, record.dbRevision ?? 1)) {
                outcome = "archive_full";
              } else if (record.pendingOps && !record.pendingOpsLost && await this.rebase(latest.document.level, latest.revision, latest.title, record.pendingOps)) {
                outcome = "rebased";
              } else {
                await this.adopt(latest.document.level, latest.revision, latest.title, SAVE_REPLACED_MESSAGE);
                outcome = "replaced";
              }
            } catch { outcome = "failed"; }
          } else outcome = "failed";
          break;
        }
      }
    } finally {
      this.commitInFlight = false;
    }
    if (outcome === "rebased") {
      // The newer copy with this room's edits on top is pending now; save it straight away.
      this.commitFailures = 0;
      await this.persist(false);
      if (this.core?.dirty) this.scheduleCommit();
      else await this.scheduleAlarm();
      return;
    }
    if (outcome === "saved" || outcome === "replaced") {
      this.commitFailures = 0;
      this.saveNotice = null;
      // Edits that arrived while this save was out stay pending for the next one.
      if (core?.dirty) record.pending = levelToJson(core.design);
      else {
        delete record.pending;
        delete record.pendingOps;
        delete record.pendingOpsLost;
        record.unsaved = false;
        delete record.commitDueAt;
      }
      await this.persist(false);
      if (core?.dirty) this.scheduleCommit();
      return;
    }
    if (core) core.dirty = true;
    if (outcome === "archive_full") return this.park("blocked");
    if (outcome === "refused") return this.park("blocked");
    this.commitFailures += 1;
    if (this.commitFailures >= COMMIT_DELAY_NOTICE_AFTER) this.notifySave("delayed");
    if (this.commitFailures > COMMIT_RETRY_BACKOFF_MS.length) return this.park("delayed");
    // Retries run from the alarm, which also outlives a restart.
    record.commitDueAt = Date.now() + COMMIT_RETRY_BACKOFF_MS[this.commitFailures - 1];
    await this.persist(false);
    await this.scheduleAlarm();
  }

  /** Edits that cannot be saved now: keep them, say so, and let the alarm try again later. */
  private async park(state: "delayed" | "blocked"): Promise<void> {
    const record = this.record!;
    if (this.core?.dirty) record.pending = levelToJson(this.core.design);
    record.unsaved = true;
    record.commitDueAt = Date.now() + COMMIT_PARKED_RETRY_MS;
    this.notifySave(state);
    await this.persist(false);
    await this.scheduleAlarm();
  }

  /** Who a save is tried as, in order: the last editor, a connected editor, the owner's or teacher's last session. */
  private commitIdentities(): ClassroomSessionIdentity[] {
    const record = this.record!;
    const out: ClassroomSessionIdentity[] = [];
    const add = (identity: ClassroomSessionIdentity | undefined) => {
      if (identity && !out.some((known) => sameIdentity(known, identity))) out.push(identity);
    };
    add(record.lastEditor);
    for (const socket of this.openSockets()) {
      const access = this.attachment(socket)?.access;
      if (access?.canEdit) add(identityOf(access));
    }
    add(record.ownerIdentity);
    return out;
  }

  /**
   * After a conflict: take the newer copy from the database and put this room's edits back on top of it, in the
   * order the room applied them. The result is pending, to be saved against the newer revision. False when the
   * result is not a valid level (then the caller takes the newer copy as it is; the conflict copy keeps ours).
   */
  private async rebase(level: LevelJson, revision: number, title: string | undefined, ops: EditOp[]): Promise<boolean> {
    const record = this.record!;
    const newer = validatePlatformerDocument({ ...createPlatformerDocument(levelFromJson(level)) });
    if (!newer.ok) return false;
    const merged = levelFromJson(newer.document.level);
    for (const op of ops) editDesign(merged, op);
    const checked = validatePlatformerDocument({ ...createPlatformerDocument(merged) });
    if (!checked.ok) return false;
    record.level = newer.document.level;
    record.dbRevision = revision;
    if (title) record.title = title;
    record.pending = checked.document.level;
    record.unsaved = true;
    record.commitDueAt = Date.now();
    if (this.core) {
      this.core.replaceLevel(record.pending, true);
      if (this.core.live) this.core.notice(SAVE_REBASED_MESSAGE);
    }
    await this.persist(false);
    return true;
  }

  /** Take a level from the database as the room's own (a newer copy, or after a conflict). */
  private async adopt(level: LevelJson, revision: number, title: string | undefined, notice: string): Promise<void> {
    const record = this.record!;
    const checked = validatePlatformerDocument({ ...createPlatformerDocument(levelFromJson(level)) });
    if (!checked.ok) return;
    record.level = checked.document.level;
    record.dbRevision = revision;
    record.unsaved = false;
    delete record.pending;
    delete record.pendingOps;
    delete record.pendingOpsLost;
    delete record.commitDueAt;
    if (title) record.title = title;
    if (this.core) {
      this.core.replaceLevel(record.level, false);
      if (this.core.live) this.core.notice(notice);
    }
    await this.persist(false);
  }

  private notifySave(state: "delayed" | "blocked"): void {
    if (this.saveNotice === state) return;
    this.saveNotice = state;
    if (this.core?.live) this.core.notice(state === "blocked" ? SAVE_BLOCKED_MESSAGE : SAVE_DELAYED_MESSAGE);
  }

  // -------------------------------------------------------------------------------------------
  // Expiry

  async alarm(): Promise<void> {
    await this.serialized(async () => {
      const record = this.record;
      if (!record) return;
      const now = Date.now();
      // Class edits the database does not have yet: try again. They are never dropped by expiry.
      if (record.kind === "classroom" && (record.pending || this.core?.dirty)) {
        if ((record.commitDueAt ?? 0) <= now) await this.commit();
        if (this.record?.pending) {
          await this.scheduleAlarm();
          return;
        }
      }
      if (this.openSockets().length > 0) {
        record.expiresAt = now + PLATFORMER_ROOM_TTL_MS;
        await this.persist(true);
        return;
      }
      if (now >= record.expiresAt) {
        if (!await this.preserveLegacyRecovery()) {
          // A full archive must keep the older copy too; retry after someone exports and clears space.
          record.expiresAt = now + COMMIT_PARKED_RETRY_MS;
          await this.persist(true);
          return;
        }
        await this.ctx.storage.delete("room");
        this.record = null;
        this.core = null;
        return;
      }
      await this.scheduleAlarm();
    });
  }

  /** One alarm: the next save try of pending class edits, else the room's expiry. */
  private async scheduleAlarm(): Promise<void> {
    const record = this.record;
    if (!record) return;
    // Pending edits follow their own retry schedule; expiry only matters once nothing is pending.
    const at = record.pending && record.commitDueAt ? record.commitDueAt : record.expiresAt + PLATFORMER_ROOM_EXPIRY_GRACE_MS;
    await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 1000));
  }

  private expired(): boolean {
    return !!this.record && this.record.kind === "guest" && this.openSockets().length === 0
      && Date.now() >= this.record.expiresAt + PLATFORMER_ROOM_EXPIRY_GRACE_MS;
  }

  private async touch(): Promise<void> {
    if (!this.record) return;
    this.record.expiresAt = Date.now() + PLATFORMER_ROOM_TTL_MS;
    if (Date.now() - this.lastTouchPersist >= TOUCH_PERSIST_INTERVAL_MS) await this.persist(true);
  }

  private async persist(scheduleAlarm: boolean): Promise<void> {
    if (!this.record) return;
    await this.ctx.storage.put("room", this.record);
    this.lastTouchPersist = Date.now();
    if (scheduleAlarm) await this.scheduleAlarm();
  }

  private attachment(socket: WebSocket): PlatformerAttachment | null {
    try { return socket.deserializeAttachment() as PlatformerAttachment | null; } catch { return null; }
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }
}
