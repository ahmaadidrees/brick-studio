import { DurableObject } from "cloudflare:workers";
import { HACKABLE_PROTOCOL, MAX_PLAYERS, type ClientMsg } from "../../../src/platformer/lab/rooms/protocol";
import { HackableRoomCore, checkProject, type RoomMeta, type RoomSocket, type TrustedIdentity } from "../../../src/platformer/lab/rooms/roomCore";
import {
  ClassroomHttpError,
  commitClassroomWorld,
  loadClassroomHackable,
  revalidateClassroomWorldAccess,
  type ClassroomEnv,
  type ClassroomSessionIdentity,
} from "./classroom/index";
import { ownerTokenVerifier, safeVerifierEqual, validWorldId, type ClassroomSocketAccess } from "./worldRoom";

/*
 * One live Hackable room (docs/qa/hackable-rooms M1, M2). The shared logic is HackableRoomCore
 * (src/platformer/lab/rooms/roomCore.ts): the room never runs kids' code, it keeps the clock and puts every key,
 * join, leave and edit in one order, checking who may make each edit. This object adds what hosting needs: sockets
 * that may hibernate, identities the router vouches for (an owner token for guest rooms, a signed-in ticket for class
 * rooms), periodic re-checks of classroom access, and keeping the project and its blocks while the room lives.
 *
 * Since M2 a class room saves the shared project to the class project itself, write-behind: about a second and a half
 * after edits stop (at most eight seconds after the first), as the owner's or the teacher's last session here (the
 * classroom service checks it may still save). If someone saved the project somewhere else meanwhile, that version is
 * kept as a recovery copy (GET /classroom/worlds/<id>/hackable-recovery) and the room's version is saved on top, since
 * it is the one everyone is looking at. A class room starts from the account's copy whenever nobody is playing in it.
 */

export interface HackableRoomEnv extends ClassroomEnv {
  HACKABLE_ROOMS: DurableObjectNamespace<HackableRoom>;
}

/** Guest rooms are forgotten this long after the last activity, like the other rooms. */
export const HACKABLE_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const EXPIRY_GRACE_MS = 90 * 1000;
const TOUCH_PERSIST_INTERVAL_MS = 60 * 1000;
const REAUTH_INTERVAL_MS = 60 * 1000;
/** Edits and host actions need a classroom check at most this old. */
const PRIVILEGED_ACCESS_MAX_AGE_MS = 15 * 1000;
/** Keys (a few a second), pings and fingerprints fit well under this. */
const MAX_MESSAGES_PER_SECOND = 90;
const MAX_RATE_VIOLATIONS = 3;
const MAX_SOCKETS = MAX_PLAYERS + 4;
const OWNER_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
/** M2: a class room saves this long after edits stop, and at most this long after the first unsaved one. */
export const HACKABLE_COMMIT_DEBOUNCE_MS = 1500;
const HACKABLE_COMMIT_MAX_LAG_MS = 8000;
/** M2: a failed save is tried again after these waits, then every five minutes (from the alarm). */
const HACKABLE_COMMIT_RETRY_MS = [5_000, 15_000, 60_000];
const HACKABLE_COMMIT_PARKED_MS = 5 * 60 * 1000;
/** M2: recovery copies of versions the room saved over; at most this many are kept. */
export const MAX_HACKABLE_RECOVERY_COPIES = 16;
const RECOVERY_PREFIX = "recovery:";
const WORKSPACES_KEY = "workspaces";
const SAVE_DELAYED = "Saving to the class project is delayed. Your changes stay in this room and will be saved automatically.";
const SAVE_BLOCKED = "The room can't save to the class project right now: the owner or the teacher needs to join it once.";
const SAVE_REPLACED = "This project was also saved somewhere else. The room saved its version, and kept the other one as a recovery copy for the owner and the teacher.";
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export type HackableRoomKind = "guest" | "classroom";

type HackableRecord = {
  kind: HackableRoomKind;
  roomId: string;
  classroomWorldId?: string;
  title: string;
  /** The project as designText, with the host's edits so far. */
  project: string;
  /** Class rooms: the account revision `project` came from. */
  dbRevision?: number;
  /** Guest rooms: SHA-256 of the owner token; the token itself is never stored. */
  ownerTokenVerifier?: string;
  meta?: RoomMeta;
  expiresAt: number;
  /** M2, class rooms: edits the class project does not have yet. */
  unsaved?: boolean;
  /** M2, class rooms: when the alarm should try the next save. */
  commitDueAt?: number;
  /** M2, class rooms: the owner's or teacher's last session here, which saves are made as. */
  saverIdentity?: ClassroomSessionIdentity;
};

/** M2: a version of the class project the room saved over, kept for the owner and the teacher. */
type HackableRecoveryCopy = { id: string; worldId: string; revision: number; at: number; title: string; document: unknown };

type HackableAttachment = {
  identity: TrustedIdentity;
  /** Player number and name once admitted, so a room that wakes up can re-admit everyone as they were. */
  num: number;
  name: string;
  access?: ClassroomSocketAccess & { checkedAt: number };
  windowAt: number;
  count: number;
  violations: number;
};

/** What the router puts in `x-hackable-access`. Browsers cannot send it: the router strips it. */
export type HackableConnectGrant =
  | { kind: "guest"; ownerToken?: string }
  | { kind: "classroom"; access: ClassroomSocketAccess };

export type HackableInit =
  | { kind: "guest"; roomId: string; title: string; project: string; ownerTokenVerifier: string; workspaces?: Record<string, unknown> }
  | { kind: "classroom"; roomId: string; classroomWorldId: string; title: string; project: string; dbRevision: number; workspaces?: Record<string, unknown> };

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const identityOf = (access: ClassroomSocketAccess): ClassroomSessionIdentity => ({
  userId: access.userId, sessionId: access.sessionId, authVersion: access.authVersion,
});

/** In M1 the owner and the teacher host a class room; everyone else in the class plays. */
function trustedClassroomIdentity(access: ClassroomSocketAccess): TrustedIdentity {
  return { key: access.userId, host: access.isTeacher || (access.isOwner && access.canEdit), name: access.isTeacher ? "Teacher" : access.username };
}

const cleanTitle = (value: unknown): string => (typeof value === "string" ? value.trim().slice(0, 80) : "") || "Hackable room";

const isWorkspaces = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const sameIdentity = (a?: ClassroomSessionIdentity, b?: ClassroomSessionIdentity) => !!a && !!b && a.userId === b.userId && a.sessionId === b.sessionId;

export class HackableRoom extends DurableObject<HackableRoomEnv> {
  private record: HackableRecord | null = null;
  private core: HackableRoomCore | null = null;
  /** M2: the project's blocks (kept under their own key: they can be as big as the project). */
  private workspaces: Record<string, unknown> = {};
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private commitDueBy = 0;
  private commitInFlight = false;
  private commitFailures = 0;
  /** Everything that touches the room runs one at a time, in arrival order. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastTouchPersist = 0;

  constructor(ctx: DurableObjectState, env: HackableRoomEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.record = (await this.ctx.storage.get<HackableRecord>("room")) ?? null;
      this.workspaces = (await this.ctx.storage.get<Record<string, unknown>>(WORKSPACES_KEY)) ?? {};
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
    if (url.pathname === "/init" && request.method === "POST" && request.headers.get("x-hackable-init") === "1") {
      return this.serialized(() => this.init(request));
    }
    if (url.pathname === "/internal/recovery" && request.method === "GET") return this.serialized(() => this.recovery(request));
    if (url.pathname.startsWith("/internal/recovery/") && request.method === "GET") {
      return this.serialized(() => this.recovery(request, url.pathname.slice("/internal/recovery/".length)));
    }
    if (!this.record || this.expired()) return json({ error: "room_not_found" }, 404);
    if (url.pathname === "/connect") return this.serialized(() => this.connectSocket(request));
    if (url.pathname === "/info" && request.method === "GET") {
      if (this.record.kind !== "guest") return json({ error: "classroom_auth_required" }, 401);
      return json(this.ensureCore().info());
    }
    return json({ error: "not_found" }, 404);
  }

  // -------------------------------------------------------------------------------------------
  // Opening

  private async init(request: Request): Promise<Response> {
    let input: Partial<HackableInit> & Record<string, unknown>;
    try { input = await request.json() as typeof input; } catch { return json({ error: "invalid_room" }, 400); }
    if (this.record && !this.expired()) {
      // The router re-sends a class project on every open. With nobody playing, the account's copy is the project.
      if (this.record.kind === "classroom" && input.kind === "classroom" && input.classroomWorldId === this.record.classroomWorldId
          && Number.isInteger(input.dbRevision) && (input.dbRevision as number) > (this.record.dbRevision ?? 0) && !this.core?.live) {
        const check = checkProject(input.project);
        if (check.ok && this.core && check.kit !== this.core.kit) return json({ error: "already_exists" }, 409);
        // Never over edits the class project does not have yet.
        if (check.ok && !this.record.unsaved) {
          this.record.project = input.project as string;
          this.record.dbRevision = input.dbRevision as number;
          this.record.title = cleanTitle(input.title);
          this.core = null;
          if (isWorkspaces(input.workspaces)) await this.keepWorkspaces(input.workspaces);
          await this.persist(false);
        }
      }
      return json({ error: "already_exists" }, 409);
    }
    if (typeof input.roomId !== "string" || !validWorldId(input.roomId) || !checkProject(input.project).ok) return json({ error: "invalid_room" }, 400);
    const now = Date.now();
    if (input.kind === "guest") {
      if (typeof input.ownerTokenVerifier !== "string" || !OWNER_TOKEN_PATTERN.test(input.ownerTokenVerifier)) return json({ error: "invalid_room" }, 400);
      this.record = { kind: "guest", roomId: input.roomId, title: cleanTitle(input.title), project: input.project as string, ownerTokenVerifier: input.ownerTokenVerifier, expiresAt: now + HACKABLE_ROOM_TTL_MS };
    } else if (input.kind === "classroom") {
      if (typeof input.classroomWorldId !== "string" || !UUID_PATTERN.test(input.classroomWorldId) || !Number.isInteger(input.dbRevision)) return json({ error: "invalid_room" }, 400);
      this.record = {
        kind: "classroom", roomId: input.roomId, classroomWorldId: input.classroomWorldId, title: cleanTitle(input.title),
        project: input.project as string, dbRevision: input.dbRevision as number, expiresAt: now + HACKABLE_ROOM_TTL_MS,
      };
    } else return json({ error: "invalid_room" }, 400);
    this.core = null;
    await this.keepWorkspaces(isWorkspaces(input.workspaces) ? input.workspaces : {});
    await this.persist(true);
    return json({ ok: true }, 201);
  }

  private async connectSocket(request: Request): Promise<Response> {
    const record = this.record!;
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
    let grant: HackableConnectGrant | null = null;
    try { grant = JSON.parse(request.headers.get("x-hackable-access") ?? "null") as HackableConnectGrant | null; } catch { grant = null; }
    if (!grant || grant.kind !== record.kind) return json({ error: "access_required" }, 401);
    let identity: TrustedIdentity;
    let access: HackableAttachment["access"];
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
    server.serializeAttachment({ identity, num: 0, name: "", access, windowAt: now, count: 0, violations: 0 } satisfies HackableAttachment);
    core.connect(server as unknown as RoomSocket, identity);
    await this.touch();
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * The live session, rebuilt after the object hibernated or restarted: everyone still connected is re-admitted as
   * they were and gets a fresh welcome (a new session from the project as edited).
   */
  private ensureCore(): HackableRoomCore {
    if (this.core) return this.core;
    const record = this.record!;
    const core = new HackableRoomCore(record.roomId, record.project, { classroom: record.kind === "classroom", meta: record.meta, title: record.title, workspaces: this.workspaces });
    this.core = core;
    for (const socket of this.openSockets()) {
      const attachment = this.attachment(socket);
      if (!attachment) continue;
      core.connect(socket as unknown as RoomSocket, { ...attachment.identity, num: attachment.num || undefined });
      if (attachment.num > 0) {
        core.message(socket as unknown as RoomSocket, JSON.stringify({ type: "hello", v: HACKABLE_PROTOCOL, name: attachment.name, key: attachment.identity.key ?? "" }));
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
    let msg: Partial<ClientMsg> & { ev?: { t?: unknown }; cid?: unknown } = {};
    try { msg = JSON.parse(message) as typeof msg; } catch { /* the room answers bad JSON */ }
    if (attachment.access) {
      // Edits (M2) are privileged too: what a classmate may change follows their current class access.
      const privileged = (msg.type === "ev" && (msg.ev?.t === "project" || msg.ev?.t === "restart" || msg.ev?.t === "edit"))
        || msg.type === "settings" || msg.type === "kick" || msg.type === "unban" || msg.type === "grant" || msg.type === "undo";
      const age = now - attachment.access.checkedAt;
      if ((privileged && age > PRIVILEGED_ACCESS_MAX_AGE_MS) || age > REAUTH_INTERVAL_MS) {
        if (!(await this.reauthorize(socket, attachment)) && privileged) {
          // The sender's game already applied its edit: undo it there.
          if (msg.type === "ev" && typeof msg.cid === "string") core.rejectEvent(sock, msg.cid, msg.ev?.t === "edit" ? "not_allowed" : "host_only");
          return;
        }
      }
    }
    // Who saves the class project: the owner's or the teacher's latest session here.
    const access = attachment.access;
    if (access && this.record.kind === "classroom" && (access.isTeacher || (access.isOwner && access.canEdit))) {
      const identity = identityOf(access);
      if (!sameIdentity(this.record.saverIdentity, identity)) this.record.saverIdentity = identity;
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
    socket.serializeAttachment(attachment);
    await this.afterChange();
    await this.touch();
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.serialized(async () => {
      this.core?.disconnect(socket as unknown as RoomSocket);
      await this.afterChange();
    });
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.serialized(async () => {
      this.core?.disconnect(socket as unknown as RoomSocket);
      try { socket.close(1011, "WebSocket error"); } catch { /* already closed */ }
      await this.afterChange();
    });
  }

  /**
   * Keep what the room learned (the edited project, its blocks, its settings) in storage, so a restart keeps it. A
   * class room then saves to the class project a moment later (write-behind).
   */
  private async afterChange(): Promise<void> {
    const core = this.core;
    const record = this.record;
    if (!core || !record) return;
    if (!core.projectDirty && !core.metaDirty && !core.workspacesDirty) return;
    const edited = core.projectDirty || core.workspacesDirty;
    record.project = core.project;
    record.meta = core.meta();
    if (core.workspacesDirty) await this.keepWorkspaces(core.workspaces);
    core.projectDirty = false;
    core.metaDirty = false;
    core.workspacesDirty = false;
    if (edited && record.kind === "classroom") record.unsaved = true;
    await this.persist(false);
    if (edited && record.kind === "classroom") this.scheduleCommit();
  }

  private async keepWorkspaces(workspaces: Record<string, unknown>): Promise<void> {
    this.workspaces = { ...workspaces };
    await this.ctx.storage.put(WORKSPACES_KEY, this.workspaces);
  }

  // -------------------------------------------------------------------------------------------
  // Saving to the class project (M2)

  private scheduleCommit(): void {
    const now = Date.now();
    if (!this.commitDueBy) this.commitDueBy = now + HACKABLE_COMMIT_MAX_LAG_MS;
    const at = Math.min(now + HACKABLE_COMMIT_DEBOUNCE_MS, this.commitDueBy);
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.serialized(() => this.commit());
    }, Math.max(0, at - now));
  }

  /** The class project as the room has it: the project and its blocks. */
  private document(): unknown {
    if (this.core) return this.core.document();
    return { format: "brickgineers-hackable", version: 1, save: { ...(JSON.parse(this.record!.project) as Record<string, unknown>), workspaces: { ...this.workspaces }, ir: {} } };
  }

  /** One write-behind save. Callers run inside `serialized`. */
  async commit(): Promise<void> {
    const record = this.record;
    if (!record?.classroomWorldId || !record.unsaved || this.commitInFlight) return;
    if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
    const identity = record.saverIdentity;
    if (!identity) return this.parkCommit(SAVE_BLOCKED);
    this.commitInFlight = true;
    this.commitDueBy = 0;
    // Edits that arrive while this save is out stay unsaved for the next one.
    record.unsaved = false;
    const document = this.document();
    let outcome: "saved" | "replaced" | "refused" | "failed" = "failed";
    try {
      try {
        const saved = await commitClassroomWorld(this.env, record.classroomWorldId, document, record.dbRevision ?? 1, identity, "hackable");
        record.dbRevision = saved.revision;
        outcome = "saved";
      } catch (error) {
        const code = error instanceof ClassroomHttpError ? error.code : "unavailable";
        if (code === "access_revoked" || code === "read_only") {
          delete record.saverIdentity;
          outcome = "refused";
        } else if (code === "revision_conflict") {
          // Saved somewhere else since: keep that version, then save the room's on top of it.
          const latest = await loadClassroomHackable(this.env, record.classroomWorldId);
          const kept = await this.keepRecovery(record.classroomWorldId, latest);
          if (!kept) outcome = "refused";
          else {
            const saved = await commitClassroomWorld(this.env, record.classroomWorldId, document, latest.revision, identity, "hackable");
            record.dbRevision = saved.revision;
            outcome = "replaced";
          }
        }
      }
    } catch {
      outcome = "failed";
    } finally {
      this.commitInFlight = false;
    }
    if (outcome === "saved" || outcome === "replaced") {
      this.commitFailures = 0;
      delete record.commitDueAt;
      if (outcome === "replaced") this.core?.notice(SAVE_REPLACED);
      await this.persist(false);
      if (record.unsaved) this.scheduleCommit();
      return;
    }
    record.unsaved = true;
    if (outcome === "refused") return this.parkCommit(SAVE_BLOCKED);
    this.commitFailures += 1;
    if (this.commitFailures > HACKABLE_COMMIT_RETRY_MS.length) return this.parkCommit(SAVE_DELAYED);
    if (this.commitFailures === HACKABLE_COMMIT_RETRY_MS.length) this.core?.notice(SAVE_DELAYED);
    record.commitDueAt = Date.now() + HACKABLE_COMMIT_RETRY_MS[this.commitFailures - 1];
    await this.persist(false);
    await this.scheduleAlarm();
  }

  /** Saving can't happen now: keep the edits, say so, and let the alarm try again later. */
  private async parkCommit(message: string): Promise<void> {
    const record = this.record!;
    record.unsaved = true;
    record.commitDueAt = Date.now() + HACKABLE_COMMIT_PARKED_MS;
    this.core?.notice(message);
    await this.persist(false);
    await this.scheduleAlarm();
  }

  /** Keep a version the room is about to save over. False when the archive is full (then nothing is saved over). */
  private async keepRecovery(worldId: string, latest: { revision: number; title: string; project: string; workspaces?: Record<string, unknown> }): Promise<boolean> {
    const existing = await this.ctx.storage.list({ prefix: RECOVERY_PREFIX });
    if (existing.size >= MAX_HACKABLE_RECOVERY_COPIES) return false;
    const id = crypto.randomUUID();
    const document = { format: "brickgineers-hackable", version: 1, save: { ...(JSON.parse(latest.project) as Record<string, unknown>), workspaces: latest.workspaces ?? {} } };
    const copy: HackableRecoveryCopy = { id, worldId, revision: latest.revision, at: Date.now(), title: latest.title, document };
    await this.ctx.storage.put(RECOVERY_PREFIX + id, copy);
    return true;
  }

  /** The owner or the teacher reads the recovery copies (through the router, which vouches for them). */
  private async recovery(request: Request, id?: string): Promise<Response> {
    let grant: HackableConnectGrant | null = null;
    try { grant = JSON.parse(request.headers.get("x-hackable-access") ?? "null") as HackableConnectGrant | null; } catch { grant = null; }
    if (grant?.kind !== "classroom" || !grant.access || !UUID_PATTERN.test(grant.access.worldId)) return json({ error: "access_required" }, 401);
    if (this.record && (this.record.kind !== "classroom" || this.record.classroomWorldId !== grant.access.worldId)) return json({ error: "room_not_found" }, 404);
    try {
      const access = await revalidateClassroomWorldAccess(this.env, identityOf(grant.access), grant.access.worldId);
      if (!access.isOwner && !access.isTeacher) return json({ error: "access_required" }, 403);
    } catch (error) {
      if (error instanceof ClassroomHttpError) return json({ error: error.code }, error.status);
      return json({ error: "access_unavailable" }, 503);
    }
    if (id) {
      if (!UUID_PATTERN.test(id)) return json({ error: "not_found" }, 404);
      const copy = await this.ctx.storage.get<HackableRecoveryCopy>(RECOVERY_PREFIX + id);
      return copy?.worldId === grant.access.worldId ? json(copy) : json({ error: "not_found" }, 404);
    }
    const copies = await this.ctx.storage.list<HackableRecoveryCopy>({ prefix: RECOVERY_PREFIX });
    const items = [...copies.values()].filter((c) => c.worldId === grant.access.worldId).map(({ id, revision, at, title }) => ({ id, revision, at, title }));
    return json({ copies: items });
  }

  // -------------------------------------------------------------------------------------------
  // Classroom access

  /** Re-check one classroom socket. False when the socket was closed or the check could not run. */
  private async reauthorize(socket: WebSocket, attachment: HackableAttachment): Promise<boolean> {
    const access = attachment.access;
    const worldId = this.record?.classroomWorldId;
    if (!access || !worldId) return true;
    try {
      const fresh = await revalidateClassroomWorldAccess(this.env, identityOf(access), worldId);
      attachment.access = { ...fresh, checkedAt: Date.now() } as HackableAttachment["access"];
      const host = trustedClassroomIdentity(fresh as ClassroomSocketAccess).host;
      attachment.identity = { ...attachment.identity, host };
      socket.serializeAttachment(attachment);
      this.ensureCore().updatePlayer(socket as unknown as RoomSocket, { host });
      return true;
    } catch (error) {
      if (error instanceof ClassroomHttpError && error.status < 500) {
        this.ensureCore().refuse(socket as unknown as RoomSocket, "access", error.message);
        return false;
      }
      // The permission service is unavailable: play goes on, nothing privileged does until a check succeeds.
      if (attachment.access) attachment.access.checkedAt = Math.min(attachment.access.checkedAt, Date.now() - PRIVILEGED_ACCESS_MAX_AGE_MS - 1);
      socket.serializeAttachment(attachment);
      return false;
    }
  }

  private async invalidate(request: Request): Promise<Response> {
    const record = this.record;
    if (!record || record.kind !== "classroom" || this.expired()) return json({ error: "room_not_found" }, 404);
    let input: { userId?: unknown; change?: unknown } = {};
    try { input = await request.json() as typeof input; } catch { /* a missing kind revokes, below */ }
    const userId = typeof input.userId === "string" ? input.userId : undefined;
    const change = input.change === "metadata" || input.change === "membership" || input.change === "invitation" ? input.change : "revocation";
    // A save elsewhere changes nothing live: the next session starts from the account's copy.
    if (change === "metadata") return json({ ok: true });
    for (const socket of this.openSockets()) {
      const attachment = this.attachment(socket);
      if (!attachment?.access || (userId && attachment.access.userId !== userId)) continue;
      if (change === "membership" || change === "invitation") await this.reauthorize(socket, attachment);
      else this.ensureCore().refuse(socket as unknown as RoomSocket, "access", "Your classroom access changed.");
    }
    return json({ ok: true });
  }

  // -------------------------------------------------------------------------------------------
  // Expiry

  async alarm(): Promise<void> {
    await this.serialized(async () => {
      const record = this.record;
      if (!record) return;
      const now = Date.now();
      // M2: a save that is due (a retry, or edits nobody saved before the room went quiet).
      if (record.unsaved && (record.commitDueAt ?? 0) <= now) await this.commit();
      if (this.openSockets().length > 0) {
        record.expiresAt = now + HACKABLE_ROOM_TTL_MS;
        await this.persist(true);
        return;
      }
      // Never forget edits the class project does not have yet.
      if (now >= record.expiresAt && !record.unsaved) {
        await this.ctx.storage.delete("room");
        await this.ctx.storage.delete(WORKSPACES_KEY);
        this.record = null;
        this.core = null;
        return;
      }
      await this.scheduleAlarm();
    });
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.record) return;
    const expiry = this.record.expiresAt + EXPIRY_GRACE_MS;
    const due = this.record.unsaved && this.record.commitDueAt ? Math.min(expiry, this.record.commitDueAt) : expiry;
    await this.ctx.storage.setAlarm(Math.max(due, Date.now() + 1000));
  }

  private expired(): boolean {
    return !!this.record && this.record.kind === "guest" && this.openSockets().length === 0
      && Date.now() >= this.record.expiresAt + EXPIRY_GRACE_MS;
  }

  private async touch(): Promise<void> {
    if (!this.record) return;
    this.record.expiresAt = Date.now() + HACKABLE_ROOM_TTL_MS;
    if (Date.now() - this.lastTouchPersist >= TOUCH_PERSIST_INTERVAL_MS) await this.persist(true);
  }

  private async persist(scheduleAlarm: boolean): Promise<void> {
    if (!this.record) return;
    await this.ctx.storage.put("room", this.record);
    this.lastTouchPersist = Date.now();
    if (scheduleAlarm) await this.scheduleAlarm();
  }

  private attachment(socket: WebSocket): HackableAttachment | null {
    try { return socket.deserializeAttachment() as HackableAttachment | null; } catch { return null; }
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }
}
