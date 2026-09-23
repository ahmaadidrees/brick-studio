import { createPlatformerDocument, validatePlatformerDocument } from "@brick-studio/platformer-core/document";
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
const SAVE_REPLACED_MESSAGE = "Someone saved a newer version of this level, so the room reloaded it. The last few changes made here could not be kept.";
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
  /** Guest rooms: SHA-256 of the owner token; the token itself is never stored. */
  ownerTokenVerifier?: string;
  meta?: RoomMeta;
  expiresAt: number;
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
  private lastEditor: ClassroomSessionIdentity | null = null;
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
    const core = new RoomCore(record.roomId, levelFromJson(record.level), { classroom: record.kind === "classroom", meta: record.meta });
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
        if (!(await this.reauthorize(socket, attachment))) return;
      }
    }
    core.message(sock, message);
    if (msg.type === "hello") {
      const player = core.player(sock);
      if (player) {
        attachment.num = player.num;
        attachment.name = player.name;
        attachment.identity = { ...attachment.identity, key: player.key };
      }
    }
    if (msg.type === "ev" && msg.ev?.t === "edit" && attachment.access?.canEdit) this.lastEditor = identityOf(attachment.access);
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
      if (this.core.dirty) await this.commit();
    } else await this.saveGuestNow();
  }

  // -------------------------------------------------------------------------------------------
  // Classroom access

  /** Re-check one classroom socket. Returns false when the socket was closed. */
  private async reauthorize(socket: WebSocket, attachment: PlatformerAttachment): Promise<boolean> {
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
      // The permission service is unavailable: keep playing and check again on the next message.
      return true;
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
      if (change === "membership") await this.reauthorize(socket, attachment);
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

  /** One write-behind save of the class level. Callers run inside `serialized`. */
  private async commit(): Promise<void> {
    const core = this.core, record = this.record;
    if (!core || !record?.classroomWorldId || !core.dirty || this.commitInFlight) return;
    if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
    const identity = this.editorIdentity();
    if (!identity) {
      record.unsaved = true;
      await this.persist(false);
      this.notifySave("blocked");
      return;
    }
    this.commitInFlight = true;
    this.commitDueBy = 0;
    const document = createPlatformerDocument(core.design);
    core.dirty = false;
    record.unsaved = true;
    let retryIn = 0;
    try {
      const saved = await commitClassroomWorld(this.env, record.classroomWorldId, document, record.dbRevision ?? 1, identity, "2d");
      record.dbRevision = saved.revision;
      record.level = document.level;
      record.title = saved.title;
      record.unsaved = core.dirty;
      this.commitFailures = 0;
      this.saveNotice = null;
    } catch (error) {
      core.dirty = true;
      const code = error instanceof ClassroomHttpError ? error.code : "unavailable";
      if (code === "revision_conflict") {
        try {
          const latest = await loadClassroomLevel(this.env, record.classroomWorldId);
          await this.adopt(latest.document.level, latest.revision, latest.title, SAVE_REPLACED_MESSAGE);
        } catch { retryIn = COMMIT_RETRY_BACKOFF_MS[0]; }
      } else if (code === "access_revoked" || code === "read_only") {
        // This editor may no longer save; another connected editor can.
        if (this.lastEditor?.userId === identity.userId) this.lastEditor = null;
        retryIn = this.editorIdentity(identity.userId) ? 1 : 0;
        if (!retryIn) this.notifySave("blocked");
      } else {
        this.commitFailures += 1;
        retryIn = COMMIT_RETRY_BACKOFF_MS[Math.min(this.commitFailures - 1, COMMIT_RETRY_BACKOFF_MS.length - 1)];
        if (this.commitFailures >= COMMIT_DELAY_NOTICE_AFTER) this.notifySave("delayed");
      }
    } finally {
      this.commitInFlight = false;
    }
    await this.persist(false);
    if (retryIn) {
      this.commitTimer = setTimeout(() => {
        this.commitTimer = null;
        void this.serialized(() => this.commit());
      }, retryIn);
    } else if (core.dirty) this.scheduleCommit();
  }

  /** Take a level from the database as the room's own (a newer copy, or after a conflict). */
  private async adopt(level: LevelJson, revision: number, title: string | undefined, notice: string): Promise<void> {
    const record = this.record!;
    const checked = validatePlatformerDocument({ ...createPlatformerDocument(levelFromJson(level)) });
    if (!checked.ok) return;
    record.level = checked.document.level;
    record.dbRevision = revision;
    record.unsaved = false;
    if (title) record.title = title;
    if (this.core) {
      this.core.replaceLevel(record.level, false);
      if (this.core.live) this.core.notice(notice);
    }
    await this.persist(false);
  }

  /** Someone who may still save: the last editor if connected, else any connected editor. */
  private editorIdentity(excludeUserId?: string): ClassroomSessionIdentity | null {
    const editors = this.openSockets().flatMap((socket) => {
      const access = this.attachment(socket)?.access;
      return access?.canEdit && access.userId !== excludeUserId ? [identityOf(access)] : [];
    });
    if (this.lastEditor && this.lastEditor.userId !== excludeUserId && editors.some((editor) => editor.userId === this.lastEditor!.userId)) return this.lastEditor;
    return editors[0] ?? null;
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
      if (this.openSockets().length > 0) {
        record.expiresAt = now + PLATFORMER_ROOM_TTL_MS;
        await this.persist(true);
        return;
      }
      if (record.kind === "classroom" && (record.unsaved || this.core?.dirty)) {
        if (this.core?.dirty) await this.commit();
        if (this.record?.unsaved) {
          // Nobody is left to save as; the next person to open the level reconciles.
          record.unsaved = false;
        }
      }
      if (now >= record.expiresAt) {
        await this.ctx.storage.deleteAll();
        this.record = null;
        this.core = null;
        return;
      }
      await this.ctx.storage.setAlarm(record.expiresAt + PLATFORMER_ROOM_EXPIRY_GRACE_MS);
    });
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
    if (scheduleAlarm) await this.ctx.storage.setAlarm(this.record.expiresAt + PLATFORMER_ROOM_EXPIRY_GRACE_MS);
  }

  private attachment(socket: WebSocket): PlatformerAttachment | null {
    try { return socket.deserializeAttachment() as PlatformerAttachment | null; } catch { return null; }
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }
}
