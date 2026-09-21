import {
  normalizeCharacterAppearance,
  BRICK_STUDIO_MAX_BRICKS,
  LIVE_MAX_COMMAND_BYTES,
  LIVE_MAX_COMMANDS,
  LIVE_MAX_DISPLAY_NAME_LENGTH,
  LIVE_MAX_DOCUMENT_BYTES,
  LIVE_MAX_PLAYERS,
  LIVE_MAX_POSE_BYTES,
  LIVE_OP_ID_PATTERN,
  LIVE_PROTOCOL_VERSION,
  validateBrickStudioDocument,
  type BrickInstance,
  type BrickStudioDocument,
  type CreateLiveWorldRequest,
  type LiveBrickCommand,
  type LivePlayer,
  type LivePose,
  type LiveServerMessage,
  type LiveWorldMode,
  type PlayerProfile,
} from "@brick-studio/core";
import { DurableObject } from "cloudflare:workers";
import { loadClassroomWorld, commitClassroomWorld, revalidateClassroomWorldAccess, revalidateClassroomWorldAccessBatch, type ClassroomEnv, type ClassroomSessionIdentity } from "./classroom/index";

export interface WorldRoomEnv extends ClassroomEnv {
  WORLD_ROOMS: DurableObjectNamespace<WorldRoom>;
}

type CachedOperationOutcome =
  | { opId: string; type: "apply"; revision: number }
  | { opId: string; type: "replace"; revision: number }
  | { opId: string; type: "reject"; code: string; message: string };

export type ClassroomSocketAccess = {
  userId: string; username: string; role: "teacher" | "student"; worldId: string; classId: string | null;
  canEdit: boolean; isTeacher: boolean; isOwner: boolean; authVersion: number; sessionId: string;
};

/**
 * Why a classroom commit could not land. `blocked` and `missing` wait for a new
 * editor or connection; every other failure retries on the alarm.
 */
type CommitBlock = { code: string; message: string; at: number };

type WorldRoomRecord = {
  classroomWorldId?: string;
  roomId: string;
  title: string;
  document: BrickStudioDocument;
  /**
   * The client-facing counter: +1 per accepted edit or mode change, never
   * rewound. For classroom rooms it is independent of the database revision.
   */
  revision: number;
  mode: LiveWorldMode;
  locked: boolean;
  ownerTokenVerifier: string;
  reconnectTokenVerifiers: Record<string, string>;
  initialOwnerProfile: PlayerProfile;
  profiles: Record<string, PlayerProfile>;
  operationOutcomes: Record<string, CachedOperationOutcome[]>;
  operationHighWater: Record<string, string>;
  expiresAt: number;
  // --- Classroom write-behind state (absent on guest rooms) ---
  /** The database revision this room last confirmed: the compare-and-set base of the next commit. */
  dbRevision?: number;
  /** Set while the in-memory document holds edits the database has not confirmed. */
  dirtySince?: number;
  /** When the next commit attempt is due (debounce or retry backoff). Absent while blocked. */
  commitDueAt?: number;
  /** Consecutive failed attempts; indexes the retry backoff. */
  commitFailures?: number;
  /** Every usable identity was refused (or the world is gone); cleared by the next accepted edit or commit. */
  commitBlocked?: CommitBlock;
  /** Whose edit the uncommitted document carries last; the first identity a commit runs as. */
  lastEditor?: ClassroomSessionIdentity;
  /** The world owner's (or supervising teacher's) last known session, the fallback identity. */
  ownerIdentity?: ClassroomSessionIdentity;
};

type WorldSocketAttachment = {
  documentSchema?: number;
  classroomAccess?: ClassroomSocketAccess;
  playerId: string;
  isOwner: boolean;
  connectedAt: number;
  connectionId?: string;
  superseded?: boolean;
  lastPoseAt: number;
  /** Last accepted movement state; optional for sockets attached before this release. */
  lastPoseMoving?: boolean;
  messageWindowAt: number;
  messageCount: number;
  messageRateViolations: number;
  profileWindowAt: number;
  profileMutationCount: number;
  controlWindowAt: number;
  controlMutationCount: number;
};

type SnapshotMessage = Extract<LiveServerMessage, { type: "snapshot" }>;

/**
 * How a classroom commit attempt ended.
 * - `clean`: nothing to commit. `committed`: the database took the document.
 * - `conflict`: the database had moved; the room adopted its copy.
 * - `failed`: transient (network, 5xx, rate limit); a retry is scheduled.
 * - `blocked`: no identity may commit right now; waits for an editor or connection.
 * - `skipped`: the room changed identity underneath the attempt; nothing recorded.
 */
type CommitOutcome = "clean" | "committed" | "conflict" | "failed" | "blocked" | "skipped";

type ValidationResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export const WORLD_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const WORLD_ROOM_EXPIRY_GRACE_MS = 90 * 1000;
const EXPIRY_PERSIST_INTERVAL_MS = 60 * 1000;
/** Classroom sockets are re-checked against the database this often while any are open. */
const CLASSROOM_REAUTH_INTERVAL_MS = 60 * 1000;
/** A classroom commit runs this long after the first uncommitted edit, coalescing the burst behind it. */
export const COMMIT_DEBOUNCE_MS = 1000;
/** No uncommitted edit waits longer than this for its commit while the database is healthy. */
export const COMMIT_MAX_LAG_MS = 5000;
/** Retry delays after a failed commit (network, 5xx, rate limit); the last one repeats. */
export const COMMIT_RETRY_BACKOFF_MS = [1000, 2000, 5000, 15_000];
/** After this many consecutive failures the room tells builders that saving is delayed. */
const COMMIT_DELAY_NOTICE_AFTER = 3;
const SAVE_DELAYED_MESSAGE = "Saving to your class world is delayed. Your changes stay live in this room and will be saved automatically.";
const SAVE_BLOCKED_MESSAGE = "Your changes are live in this room but could not be saved to the class world. Rejoin from My Class to keep saving.";
const SAVE_REPLACED_MESSAGE = "Someone saved a newer version of this world, so the room reloaded it. The last few changes made here could not be kept.";
const MAX_MESSAGES_PER_SECOND = 30;
const MAX_MESSAGE_RATE_VIOLATIONS = 3;
const MIN_POSE_INTERVAL_MS = 45;
const MUTATION_WINDOW_MS = 10 * 1000;
const MAX_PROFILE_MUTATIONS_PER_WINDOW = 6;
const MAX_CONTROL_MUTATIONS_PER_WINDOW = 12;
const MAX_PROFILE_BYTES = 2 * 1024;
const MAX_PROFILE_PALETTE_ENTRIES = 16;
const MAX_PROFILE_CACHE = 64;
const MAX_OUTCOMES_PER_PLAYER = 128;
const MAX_FRAME_BYTES = LIVE_MAX_DOCUMENT_BYTES + 4 * 1024;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{6,48}$/;
const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PALETTE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} .,'’_-]+$/u;
const WORLD_ID_PATTERN = /^[a-f0-9]{32}$/;
const CAPABILITY_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

function cloneDocument(document: BrickStudioDocument): BrickStudioDocument {
  return {
    ...document,
    customParts: document.customParts.map((part) => ({ ...part })),
    bricks: document.bricks.map((brick) => ({ ...brick })),
  };
}

function fail<T>(code: string, message: string): ValidationResult<T> {
  return { ok: false, code, message };
}

export function validWorldId(value: string): boolean {
  return WORLD_ID_PATTERN.test(value);
}

export function newWorldId(): string {
  return randomHex(16);
}

export function newOwnerToken(): string {
  return randomHex(32);
}

export function newReconnectToken(): string {
  return randomHex(32);
}

function randomHex(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ownerTokenVerifier(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const reconnectTokenVerifier = ownerTokenVerifier;

function safeVerifierEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

function profileEqual(first: PlayerProfile, second: PlayerProfile): boolean {
  if (first.displayName !== second.displayName || first.characterId !== second.characterId) return false;
  const firstPalette = Object.entries(first.palette ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const secondPalette = Object.entries(second.palette ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalizeCharacterAppearance(first.appearance)) === JSON.stringify(normalizeCharacterAppearance(second.appearance))
    && firstPalette.length === secondPalette.length
    && firstPalette.every(([key, color], index) => (
      key === secondPalette[index]?.[0] && color === secondPalette[index]?.[1]
    ));
}

function decimalSequenceAtMost(value: string, highWater: string): boolean {
  return value.length < highWater.length || (value.length === highWater.length && value <= highWater);
}

function maxDecimalSequence(first: string | undefined, second: string): string {
  if (!first || !decimalSequenceAtMost(second, first)) return second;
  return first;
}

export function sanitizeProfile(value: unknown): ValidationResult<PlayerProfile> {
  if (!isRecord(value) || encodedBytes(value) > MAX_PROFILE_BYTES) {
    return fail("invalid_profile", "The player profile is missing or too large.");
  }
  if (typeof value.displayName !== "string") {
    return fail("invalid_profile", "A display name is required.");
  }
  const displayName = value.displayName.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!displayName
      || [...displayName].length > LIVE_MAX_DISPLAY_NAME_LENGTH
      || !DISPLAY_NAME_PATTERN.test(displayName)) {
    return fail("invalid_profile", "The display name contains unsupported characters or is too long.");
  }

  let characterId: string | undefined;
  if (value.characterId !== undefined) {
    if (typeof value.characterId !== "string" || !PROFILE_ID_PATTERN.test(value.characterId)) {
      return fail("invalid_profile", "The character id is invalid.");
    }
    characterId = value.characterId;
  }

  let palette: Record<string, string> | undefined;
  if (value.palette !== undefined) {
    if (!isRecord(value.palette)) return fail("invalid_profile", "The profile palette is invalid.");
    const entries = Object.entries(value.palette);
    if (entries.length > MAX_PROFILE_PALETTE_ENTRIES) {
      return fail("invalid_profile", "The profile palette has too many entries.");
    }
    palette = {};
    for (const [key, color] of entries) {
      if (!PALETTE_KEY_PATTERN.test(key) || typeof color !== "string" || !COLOR_PATTERN.test(color)) {
        return fail("invalid_profile", "The profile palette contains an invalid entry.");
      }
      palette[key] = color.toLowerCase();
    }
  }

  return {
    ok: true,
    value: {
      displayName,
      ...(characterId ? { characterId } : {}),
      ...(palette ? { palette } : {}),
      ...(value.appearance !== undefined ? { appearance: normalizeCharacterAppearance(value.appearance) } : {}),
    },
  };
}

export function validateCreateWorldRequest(value: unknown): ValidationResult<{
  title: string;
  document: BrickStudioDocument;
  profile: PlayerProfile;
}> {
  if (!isRecord(value)) return fail("invalid_world", "The live world request must be an object.");
  const request = value as Partial<CreateLiveWorldRequest>;
  if (typeof request.title !== "string") return fail("invalid_world", "A world title is required.");
  const title = request.title.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!title || [...title].length > 100) return fail("invalid_world", "The world title is invalid.");
  if (encodedBytes(request.document) > LIVE_MAX_DOCUMENT_BYTES) {
    return fail("payload_too_large", "The world document exceeds the live-room byte limit.");
  }
  const document = validateBrickStudioDocument(request.document, { maxBricks: BRICK_STUDIO_MAX_BRICKS });
  if (!document.ok) return fail(document.error.code, document.error.message);
  const profile = sanitizeProfile(request.profile);
  if (!profile.ok) return profile;
  return { ok: true, value: { title, document: document.document, profile: profile.value } };
}

function validateCommands(value: unknown, document: BrickStudioDocument): ValidationResult<{
  commands: LiveBrickCommand[];
  document: BrickStudioDocument;
}> {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIVE_MAX_COMMANDS) {
    return fail("invalid_batch", `Command batches must contain 1-${LIVE_MAX_COMMANDS} commands.`);
  }

  const existing = new Map(document.bricks.map((brick) => [brick.id, brick]));
  const touched = new Set<string>();
  const deleted = new Set<string>();
  const replacements = new Map<string, BrickInstance>();
  const additions: BrickInstance[] = [];
  const commands: LiveBrickCommand[] = [];

  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.op !== "string") {
      return fail("invalid_command", "A command in the batch is malformed.");
    }
    if (raw.op === "delete") {
      if (typeof raw.id !== "string" || !raw.id || raw.id.length > 128) {
        return fail("invalid_command", "A delete command has an invalid brick id.");
      }
      if (touched.has(raw.id)) return fail("conflicting_batch", "A batch may only touch each brick once.");
      if (!existing.has(raw.id)) return fail("unknown_brick", "That brick was removed by another builder.");
      touched.add(raw.id);
      deleted.add(raw.id);
      commands.push({ op: "delete", id: raw.id });
      continue;
    }
    if (!["place", "move", "rotate", "recolor", "update"].includes(raw.op)
        || !isRecord(raw.brick)
        || typeof raw.brick.id !== "string") {
      return fail("invalid_command", "A command in the batch is malformed.");
    }
    const op = raw.op as Exclude<LiveBrickCommand["op"], "delete">;
    const id = raw.brick.id;
    if (touched.has(id)) return fail("conflicting_batch", "A batch may only touch each brick once.");
    touched.add(id);
    const submitted = { ...raw.brick } as unknown as BrickInstance;
    let brick: BrickInstance;
    if (op === "place") {
      if (existing.has(id)) return fail("duplicate_id", "A placed brick reuses an existing id.");
      brick = submitted;
      additions.push(brick);
    } else {
      const current = existing.get(id);
      if (!current) return fail("unknown_brick", "That brick was removed by another builder.");
      switch (op) {
        case "move":
          brick = { ...current, x: submitted.x, y: submitted.y, z: submitted.z };
          break;
        case "rotate":
          brick = { ...current, rotation: submitted.rotation };
          break;
        case "recolor":
          brick = { ...current, color: submitted.color };
          break;
        case "update":
          brick = submitted;
          break;
      }
      replacements.set(id, brick);
    }
    commands.push({ op, brick });
  }

  const nextBricks = document.bricks
    .filter((brick) => !deleted.has(brick.id))
    .map((brick) => replacements.get(brick.id) ?? { ...brick });
  nextBricks.push(...additions);
  const validated = validateBrickStudioDocument({ ...document, bricks: nextBricks }, { maxBricks: BRICK_STUDIO_MAX_BRICKS });
  if (!validated.ok) return fail(validated.error.code, validated.error.message);
  const normalizedById = new Map(validated.document.bricks.map((brick) => [brick.id, brick]));
  const normalizedCommands = commands.map((command): LiveBrickCommand => command.op === "delete"
    ? command
    : { op: command.op, brick: { ...normalizedById.get(command.brick.id)! } });
  return { ok: true, value: { commands: normalizedCommands, document: validated.document } };
}

export class WorldRoom extends DurableObject<WorldRoomEnv> {
  private record: WorldRoomRecord | null = null;
  private lastPersistedTouch = 0;
  private admissionTail: Promise<void> = Promise.resolve();
  /** The classroom commit currently talking to the database, if any. Never two at once. */
  private commitInFlight: Promise<CommitOutcome> | null = null;
  /** The alarm time this object last set (null: none, undefined: unknown after a wake). */
  private alarmAt: number | null | undefined = undefined;
  /** When the periodic classroom re-authorization sweep is next due. */
  private reauthDueAt = 0;
  /** True when this object woke with uncommitted classroom edits: commit before serving anything. */
  private wakeRecoveryPending = false;
  /** The last "saving is delayed / blocked" notice sent, so builders hear each state once. */
  private lastSaveNotice: "delayed" | "blocked" | null = null;

  constructor(ctx: DurableObjectState, env: WorldRoomEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = (await this.ctx.storage.get<WorldRoomRecord>("world")) ?? null;
      if (stored) {
        stored.reconnectTokenVerifiers ??= {};
        stored.operationHighWater ??= {};
        for (const [playerId, outcomes] of Object.entries(stored.operationOutcomes ?? {})) {
          for (const outcome of outcomes) {
            const sequence = this.operationSequence(outcome.opId, playerId);
            if (sequence) {
              stored.operationHighWater[playerId] = maxDecimalSequence(
                stored.operationHighWater[playerId],
                sequence,
              );
            }
          }
        }
        if (stored.classroomWorldId) {
          // Records written before write-behind committed every edit before its ack,
          // so their room revision is the database revision.
          stored.dbRevision ??= stored.revision;
          this.wakeRecoveryPending = stored.dirtySince !== undefined;
        }
      }
      this.record = stored;
      // A hibernated object has no trustworthy in-memory persistence clock. The
      // first authenticated activity after rehydrate must durably renew expiry.
      this.lastPersistedTouch = 0;
      this.reauthDueAt = Date.now() + CLASSROOM_REAUTH_INTERVAL_MS;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Only the outer router can call this endpoint; it discloses no world data.
    if (url.pathname === "/internal/room-kind" && request.method === "GET") {
      const expired = this.record && !this.record.classroomWorldId
        && Date.now() >= this.record.expiresAt + WORLD_ROOM_EXPIRY_GRACE_MS;
      return json({ kind: !this.record || expired ? "missing" : this.record.classroomWorldId ? "classroom" : "guest" });
    }
    // Only the outer router can call this endpoint: distinct classroom accounts connected right now, for the
    // class page's "building now" count. Ids only, no names or world data.
    if (url.pathname === "/internal/classroom-presence" && request.method === "GET") {
      const userIds = !this.record?.classroomWorldId ? [] : [...new Set(this.openSockets().flatMap((socket) => {
        const attachment = this.attachment(socket);
        return attachment?.classroomAccess ? [attachment.classroomAccess.userId] : [];
      }))];
      return json({ userIds });
    }
    // Cold start with edits the database never confirmed: commit them before
    // anything else looks at the room, so an init or connect sees the same
    // world the last session left. The attempt runs once per wake; a failure
    // keeps the edits in storage and the alarm retries.
    if (this.wakeRecoveryPending) {
      await this.withSerializedAdmission(() => this.flushCommit(this.requestIdentity(request)));
    }
    // Reachable only through the authenticated outer legacy-import route.
    // A surviving owner capability recovers a private copy, never anonymous access.
    if (url.pathname === "/internal/legacy-export" && request.method === "POST") {
      return this.withSerializedAdmission(async () => {
        if (!this.record || this.record.classroomWorldId) return json({ error: "legacy_world_unavailable" }, 404);
        let input: { ownerToken?: unknown };
        try { input = await request.json() as { ownerToken?: unknown }; }
        catch { return json({ error: "legacy_world_unavailable" }, 404); }
        const token = input?.ownerToken;
        if (typeof token !== "string" || !CAPABILITY_TOKEN_PATTERN.test(token)
            || !safeVerifierEqual(await ownerTokenVerifier(token), this.record.ownerTokenVerifier)) {
          return json({ error: "legacy_world_unavailable" }, 404);
        }
        return json({ title: this.record.title, document: this.record.document });
      });
    }
    if (url.pathname === "/internal/classroom-invalidate" && request.method === "POST") {
      return this.withSerializedAdmission(async () => {
        if (!this.record?.classroomWorldId) return json({ error: "world_not_found" }, 404);
        const input = await request.json() as { userId?: unknown; change?: unknown; document?: unknown; revision?: unknown };
        const userId = typeof input.userId === "string" ? input.userId : undefined;
        // A missing or unknown kind revokes: a caller that predates `change`
        // must never keep a revoked session alive.
        const change = input.change === "metadata" || input.change === "membership" ? input.change : "revocation";
        if (change === "metadata") return this.refreshClassroomWorld(input);
        if (change === "membership") {
          const checked = await this.reauthorizeClassroomSockets(userId);
          await this.persist();
          this.broadcastPlayers();
          return checked ? json({ ok: true }) : json({ error: "reauthorization_failed" }, 503);
        }
        for (const socket of this.sessionSockets()) {
          const attachment = this.attachment(socket);
          if (attachment?.classroomAccess && (!userId || attachment.playerId === userId)) this.revokeSocket(socket, attachment);
        }
        await this.persist();
        this.broadcastPlayers();
        return json({ ok: true });
      });
    }
    if (request.method === "POST" && url.pathname === "/init" && request.headers.get("x-world-init") === "1") {
      if (this.record) {
        if (!this.record.classroomWorldId) return json({ error: "already_exists" }, 409);
        return this.withSerializedAdmission(async () => {
          // ensureRoom re-sends the stored world on every open. A classroom room
          // adopts that copy only when the database is ahead of what it last
          // confirmed; uncommitted edits are never overwritten by a stale copy.
          let input: Partial<WorldRoomRecord> = {};
          try { input = await request.json() as Partial<WorldRoomRecord>; } catch { /* nothing to refresh from */ }
          if (this.record?.classroomWorldId && input.classroomWorldId === this.record.classroomWorldId && Number.isInteger(input.revision)) {
            const parsed = validateBrickStudioDocument(input.document, { maxBricks: BRICK_STUDIO_MAX_BRICKS });
            await this.settleCommit();
            if (parsed.ok && await this.reconcileWithDatabase({ document: parsed.document, revision: input.revision as number, title: input.title })) {
              this.broadcastSnapshot();
            }
          }
          return json({ error: "already_exists" }, 409);
        });
      }
      const input = await request.json() as Partial<WorldRoomRecord>;
      const initial = validateCreateWorldRequest({
        title: input.title,
        document: input.document,
        profile: input.initialOwnerProfile,
      });
      if (!initial.ok
          || typeof input.roomId !== "string"
          || !validWorldId(input.roomId)
          || typeof input.ownerTokenVerifier !== "string"
          || !/^[a-f0-9]{64}$/.test(input.ownerTokenVerifier)) {
        return json({ error: initial.ok ? "invalid_world" : initial.code }, 400);
      }
      this.record = {
        roomId: input.roomId,
        ...(input.classroomWorldId ? { classroomWorldId: input.classroomWorldId } : {}),
        title: initial.value.title,
        document: initial.value.document,
        revision: input.classroomWorldId && Number.isInteger(input.revision) ? input.revision! : 0,
        ...(input.classroomWorldId ? { dbRevision: Number.isInteger(input.revision) ? input.revision! : 0 } : {}),
        mode: "build",
        locked: false,
        ownerTokenVerifier: input.ownerTokenVerifier,
        reconnectTokenVerifiers: {},
        initialOwnerProfile: initial.value.profile,
        profiles: {},
        operationOutcomes: {},
        operationHighWater: {},
        expiresAt: Date.now() + WORLD_ROOM_TTL_MS,
      };
      await this.persist();
      return json({ ok: true }, 201);
    }
    if (!this.record) return json({ error: "world_not_found" }, 404);
    if (this.record.classroomWorldId && request.headers.has("x-guest-world-access"))
      return json({ error: "classroom_auth_required" }, 401);
    if (url.pathname.endsWith("/connect")) {
      return this.withSerializedAdmission(() => this.connectSocket(request, url));
    }
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (this.record.classroomWorldId) {
      let access: ClassroomSocketAccess | null = null;
      try { access = JSON.parse(request.headers.get("x-classroom-access") ?? "null"); } catch { /* denied below */ }
      if (!access || access.worldId !== this.record.classroomWorldId || typeof access.userId !== "string")
        return json({ error: "classroom_auth_required" }, 401);
    }
    return json(this.publicState());
  }

  private async connectSocket(request: Request, url: URL): Promise<Response> {
    if (!this.record) return json({ error: "world_not_found" }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "websocket_required" }, 426);
    }
    if (request.headers.has("x-classroom-access") && !this.record.classroomWorldId) return json({ error: "world_identity_conflict" }, 409);
    let classroomAccess: ClassroomSocketAccess | undefined;
    if (this.record.classroomWorldId) {
      try { classroomAccess = JSON.parse(request.headers.get("x-classroom-access") ?? "null"); } catch { /* denied below */ }
      if (!classroomAccess || classroomAccess.worldId !== this.record.classroomWorldId
          || typeof classroomAccess.userId !== "string" || typeof classroomAccess.username !== "string") {
        return json({ error: "classroom_auth_required" }, 401);
      }
    }
    if (classroomAccess) {
      try {
        const worldId = classroomAccess.worldId;
        classroomAccess = await revalidateClassroomWorldAccess(this.env, classroomAccess, worldId);
        // A stuck commit gets the freshly validated session as its first identity:
        // the builder who just opened the world is the most likely one allowed to save it.
        if (this.record.dirtySince !== undefined && (this.record.commitBlocked || (this.record.commitFailures ?? 0) > 0)) {
          await this.flushCommit(classroomAccess.canEdit ? classroomAccess : undefined);
        }
        const latest = await loadClassroomWorld(this.env, worldId);
        // Only compare once no commit is mid-flight: a copy read while the room's
        // own commit was landing must not be mistaken for a foreign save.
        await this.settleCommit();
        if (await this.reconcileWithDatabase(latest)) this.broadcastSnapshot();
      } catch { return json({ error: "classroom_access_denied" }, 403); }
    }
    const documentSchema = url.searchParams.get("documentSchema") === "3" ? 3 : 2;
    if (this.record!.document.schemaVersion > documentSchema) return json({ error: "client_update_required", message: "Refresh Brickgineers to open this expanded world." }, 409);
    const playerId = classroomAccess?.userId ?? url.searchParams.get("playerId") ?? "";
    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ error: "invalid_player_id" }, 400);
    const suppliedOwnerToken = url.searchParams.get("ownerToken") ?? "";
    const suppliedOwnerVerifier = CAPABILITY_TOKEN_PATTERN.test(suppliedOwnerToken)
      ? await ownerTokenVerifier(suppliedOwnerToken)
      : "";
    const isOwner = classroomAccess ? Boolean(classroomAccess.isOwner || classroomAccess.isTeacher) : Boolean(
      suppliedOwnerVerifier && safeVerifierEqual(suppliedOwnerVerifier, this.record!.ownerTokenVerifier),
    );
    const suppliedReconnectToken = url.searchParams.get("reconnectToken") ?? "";
    const knownReconnectVerifier = this.record!.reconnectTokenVerifiers[playerId];
    const suppliedReconnectVerifier = CAPABILITY_TOKEN_PATTERN.test(suppliedReconnectToken)
      ? await reconnectTokenVerifier(suppliedReconnectToken)
      : "";
    const validReconnect = Boolean(classroomAccess) || Boolean(
      knownReconnectVerifier
      && suppliedReconnectVerifier
      && safeVerifierEqual(suppliedReconnectVerifier, knownReconnectVerifier),
    );
    const existing = this.openSockets().find((socket) => this.attachment(socket)?.playerId === playerId);
    const existingIdentity = isOwner && !classroomAccess
      ? this.openSockets().find((socket) => this.attachment(socket)?.isOwner)
      : existing;
    const knownPlayer = Boolean(existing || this.record!.profiles[playerId] || knownReconnectVerifier);
    if (!isOwner && knownPlayer && !validReconnect) {
      return json({ error: "reconnect_token_required" }, 403);
    }
    if (this.record!.locked && !isOwner && !validReconnect) {
      return json({ error: "world_locked" }, 403);
    }
    if (this.openSockets().length >= LIVE_MAX_PLAYERS && !existingIdentity) return json({ error: "world_full" }, 429);

    let issuedReconnectToken: string | undefined;
    if (!classroomAccess && !isOwner && !knownPlayer) {
      issuedReconnectToken = newReconnectToken();
      this.record!.reconnectTokenVerifiers[playerId] = await reconnectTokenVerifier(issuedReconnectToken);
    } else if (isOwner && knownReconnectVerifier) {
      // The owner capability is authoritative. If the owner deliberately claims
      // a guest id, revoke the weaker guest capability for that id.
      delete this.record!.reconnectTokenVerifiers[playerId];
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const now = Date.now();
    const attachment: WorldSocketAttachment = {
      documentSchema,
      playerId,
      isOwner,
      ...(classroomAccess ? { classroomAccess } : {}),
      connectedAt: now,
      connectionId: randomHex(8),
      superseded: false,
      lastPoseAt: 0,
      messageWindowAt: now,
      messageCount: 0,
      messageRateViolations: 0,
      profileWindowAt: now,
      profileMutationCount: 0,
      controlWindowAt: now,
      controlMutationCount: 0,
    };
    if (!this.record!.profiles[playerId]) {
      this.record!.profiles[playerId] = isOwner
        ? { ...this.record!.initialOwnerProfile }
        : { displayName: "Builder" };
      this.pruneProfileCache();
    }
    if (classroomAccess) {
      this.record!.profiles[playerId] = { ...this.record!.profiles[playerId], displayName: classroomAccess.username };
      this.rememberOwnerIdentity(classroomAccess);
    }
    await this.persist();
    for (const previous of this.sessionSockets()) {
      const previousAttachment = this.attachment(previous);
      if (previousAttachment
          && (previousAttachment.playerId === playerId || (isOwner && previousAttachment.isOwner && !classroomAccess))) {
        this.supersedeSocket(previous);
      }
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    // The first socket arms the periodic re-authorization sweep.
    if (classroomAccess) await this.scheduleAlarm();
    this.send(server, {
      v: LIVE_PROTOCOL_VERSION,
      type: "welcome",
      roomId: this.record!.roomId,
      playerId,
      isOwner,
      revision: this.record!.revision,
      mode: this.record!.mode,
      locked: this.record!.locked,
      document: cloneDocument(this.record!.document),
      players: this.players(),
      ...(issuedReconnectToken ? { reconnectToken: issuedReconnectToken } : {}),
      ...(this.record!.operationHighWater[playerId]
        ? { operationHighWater: this.record!.operationHighWater[playerId] }
        : {}),
    });
    this.broadcastPlayers();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async withSerializedAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.admissionTail;
    let release!: () => void;
    this.admissionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Admission is measured when the frame arrives, never after database work
    // drains the mutation queue. Presence must not wait behind durable writes.
    const bytes = typeof message === "string" ? encodedBytes(message) : message.byteLength;
    if (bytes > MAX_FRAME_BYTES) return this.sendError(socket, "message_too_large", "The live-world message is too large.");
    if (typeof message !== "string") return this.sendError(socket, "text_messages_only", "Only JSON text messages are accepted.");
    const attachment = this.attachment(socket);
    if (!attachment || !this.record) return socket.close(1011, "Missing live-world session");
    if (attachment.superseded || this.currentSocket(attachment) !== socket) {
      this.supersedeSocket(socket);
      return;
    }
    const now = Date.now();
    attachment.messageRateViolations ??= 0;
    attachment.profileWindowAt ??= now;
    attachment.profileMutationCount ??= 0;
    attachment.controlWindowAt ??= now;
    attachment.controlMutationCount ??= 0;
    if (now - attachment.messageWindowAt >= 1000) {
      attachment.messageWindowAt = now;
      attachment.messageCount = 0;
      attachment.messageRateViolations = 0;
    }
    attachment.messageCount += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messageCount > MAX_MESSAGES_PER_SECOND) {
      attachment.messageRateViolations += 1;
      socket.serializeAttachment(attachment);
      this.sendError(socket, "rate_limited", "Too many messages were sent in one second.");
      if (attachment.messageRateViolations >= MAX_MESSAGE_RATE_VIOLATIONS) {
        socket.close(1008, "Persistent message-rate violation");
      }
      return;
    }

    let data: Record<string, unknown>;
    try { data = JSON.parse(message) as Record<string, unknown>; }
    catch { return this.sendError(socket, "invalid_json", "Messages must be valid JSON."); }
    if (!isRecord(data) || data.v !== LIVE_PROTOCOL_VERSION || typeof data.type !== "string") {
      return this.sendError(socket, "unsupported_protocol", `This room uses live protocol v${LIVE_PROTOCOL_VERSION}.`);
    }

    if (data.type === "pose") {
      this.handlePose(socket, attachment, data, bytes, now);
      if (!this.record.classroomWorldId) await this.touch();
      return;
    }
    if (this.record.classroomWorldId) {
      // A hibernated socket may speak before any fetch wakes the room: start the
      // recovery commit first so its base excludes this message.
      if (this.wakeRecoveryPending) void this.flushCommit();
      return this.withSerializedAdmission(() => this.processSocketMessage(socket, data, bytes));
    }
    return this.processSocketMessage(socket, data, bytes);
  }

  private async processSocketMessage(socket: WebSocket, data: Record<string, unknown>, bytes: number): Promise<void> {
    if (typeof data.type !== "string") return;
    // A queued frame may have lost access while waiting. Re-read its attachment.
    const attachment = this.attachment(socket);
    if (!attachment || !this.record || attachment.superseded || this.currentSocket(attachment) !== socket) return;
    if (attachment.classroomAccess && ["commands", "addCustomPart", "replaceDocument", "setMode", "setLocked", "setProfile", "resync"].includes(data.type)) {
      if (!await this.reauthorizeSocket(socket, attachment)) return;
    }
    if (attachment.classroomAccess && !attachment.classroomAccess.canEdit
        && ["commands", "addCustomPart", "replaceDocument", "setMode", "setLocked"].includes(data.type)) {
      return this.rejectOperation(socket, attachment.playerId, typeof data.opId === "string" ? data.opId : "", "read_only", "You do not have editing access to this world.");
    }
    if (this.record.document.schemaVersion > (attachment.documentSchema ?? 2)
      && ["commands", "addCustomPart", "replaceDocument", "setMode"].includes(data.type)) {
      return this.rejectOperation(socket, attachment.playerId, typeof data.opId === "string" ? data.opId : "", "client_update_required", "Refresh Brickgineers before editing this expanded world.");
    }
    switch (data.type) {
      case "commands":
        await this.handleCommands(socket, attachment, data, bytes);
        break;
      case "addCustomPart":
        await this.handleReplaceDocument(socket, attachment, data, bytes, true);
        break;
      case "replaceDocument":
        await this.handleReplaceDocument(socket, attachment, data, bytes);
        break;
      case "resync":
        this.sendSnapshot(socket);
        this.requestCommit();
        break;
      case "setMode":
        await this.handleSetMode(socket, attachment, data);
        break;
      case "setLocked":
        await this.handleSetLocked(socket, attachment, data);
        break;
      case "setProfile":
        await this.handleSetProfile(socket, attachment, data);
        break;
      default:
        this.sendError(socket, "unknown_message", "The live-world message type is unknown.");
        return;
    }
    await this.touch();
  }

  async webSocketClose(socket: WebSocket, _code: number, _reason: string): Promise<void> {
    if (!this.record) return;
    this.broadcastPlayers();
    // The last builder leaving is the natural end of a burst: save it now rather
    // than a second later, and re-arm the alarm for a room with no sockets left.
    if (this.record.classroomWorldId && !this.sessionSockets().some((open) => open !== socket)) this.requestCommit();
    await this.touch();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, "WebSocket error");
    if (this.record) this.broadcastPlayers();
  }

  async alarm(): Promise<void> {
    if (!this.record) return;
    if (this.record.classroomWorldId) {
      // One alarm slot serves two purposes: the write-behind commit and the
      // periodic re-authorization sweep. A commit alarm alone never runs the
      // sweep early (that would add a permission RPC per burst), but the sweep
      // is never starved: it runs whenever it is due or the alarm was not a commit.
      this.alarmAt = null;
      const now = Date.now();
      const commitDue = this.record.dirtySince !== undefined && (this.record.commitDueAt ?? Infinity) <= now;
      const reauthDue = !commitDue || now >= this.reauthDueAt;
      const work: Promise<unknown>[] = [];
      if (commitDue) work.push(this.flushCommit());
      if (reauthDue) {
        this.reauthDueAt = now + CLASSROOM_REAUTH_INTERVAL_MS;
        work.push(this.withSerializedAdmission(async () => {
          await this.reauthorizeClassroomSockets();
          // Sessions that just passed the sweep are known-good identities for a blocked commit.
          if (this.record?.dirtySince !== undefined && this.record.commitBlocked) await this.flushCommit();
        }));
      }
      await Promise.all(work);
      await this.scheduleAlarm();
      return;
    }
    const deleteAt = this.record.expiresAt + WORLD_ROOM_EXPIRY_GRACE_MS;
    if (Date.now() >= deleteAt) {
      for (const socket of this.ctx.getWebSockets()) socket.close(4000, "Live world expired");
      await this.ctx.storage.deleteAll();
      this.record = null;
      return;
    }
    await this.ctx.storage.setAlarm(deleteAt);
  }

  private async handleCommands(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    data: Record<string, unknown>,
    bytes: number,
  ): Promise<void> {
    const opId = typeof data.opId === "string" ? data.opId : "";
    const sequence = this.operationSequence(opId, attachment.playerId);
    if (!sequence) {
      return this.rejectOperation(socket, attachment.playerId, opId, "invalid_op_id", "The operation id is invalid.");
    }
    const cached = this.cachedOutcome(attachment.playerId, opId);
    if (cached) return this.sendCachedOutcome(socket, attachment.playerId, cached);
    if (this.isConsumedOperation(attachment.playerId, sequence)) {
      this.sendSnapshot(socket, opId);
      return;
    }
    if (bytes > LIVE_MAX_COMMAND_BYTES) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "commands_too_large", "The command batch exceeds 64 KiB.");
    }
    if (this.record!.mode !== "build") {
      return this.cacheAndReject(socket, attachment.playerId, opId, "explore_mode", "Building is paused while the room is in Explore mode.");
    }
    const result = validateCommands(data.commands, this.record!.document);
    if (!result.ok) return this.cacheAndReject(socket, attachment.playerId, opId, result.code, result.message);

    if (!this.acceptDocument(attachment, result.value.document)) return;
    const outcome: CachedOperationOutcome = { opId, type: "apply", revision: this.record!.revision };
    this.rememberOutcome(attachment.playerId, outcome);
    await this.persist();
    this.broadcast({
      v: LIVE_PROTOCOL_VERSION,
      type: "apply",
      from: attachment.playerId,
      opId,
      revision: this.record!.revision,
      commands: result.value.commands,
    });
  }

  private async handleReplaceDocument(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    data: Record<string, unknown>,
    bytes: number,
    additive = false,
  ): Promise<void> {
    const opId = typeof data.opId === "string" ? data.opId : "";
    const sequence = this.operationSequence(opId, attachment.playerId);
    if (!sequence) {
      return this.rejectOperation(socket, attachment.playerId, opId, "invalid_op_id", "The operation id is invalid.");
    }
    const cached = this.cachedOutcome(attachment.playerId, opId);
    if (cached) return this.sendCachedOutcome(socket, attachment.playerId, cached);
    if (this.isConsumedOperation(attachment.playerId, sequence)) {
      this.sendSnapshot(socket, opId);
      return;
    }
    if (!additive && !attachment.isOwner) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "owner_only", "Only the room owner can replace the world.");
    }
    if (this.record!.mode !== "build") {
      return this.cacheAndReject(socket, attachment.playerId, opId, "explore_mode", "The world cannot be replaced during Explore mode.");
    }
    if (!additive && (!Number.isInteger(data.expectedRevision) || data.expectedRevision !== this.record!.revision)) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "revision_conflict", "The world changed while this update was prepared. Review the latest world and try again.");
    }
    if (bytes > MAX_FRAME_BYTES || (!additive && encodedBytes(data.document) > LIVE_MAX_DOCUMENT_BYTES)) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "document_too_large", "The replacement document is too large.");
    }
    // Validate an append against the latest authoritative document, never a client's stale copy.
    const part = data.part as { id?: unknown } | null;
    if (additive && (!part || typeof part !== "object" || this.record!.document.customParts.some(existing => existing.id === part.id))) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "custom_part_conflict", "That custom brick id already exists or is invalid.");
    }
    const input = additive ? { ...this.record!.document, schemaVersion: 3, plateSize: this.record!.document.plateSize ?? 64, customParts: [...this.record!.document.customParts, data.part] } : data.document;
    const document = validateBrickStudioDocument(input, { maxBricks: BRICK_STUDIO_MAX_BRICKS });
    if (!document.ok) return this.cacheAndReject(socket, attachment.playerId, opId, document.error.code, document.error.message);
    if (encodedBytes(document.document) > LIVE_MAX_DOCUMENT_BYTES) return this.cacheAndReject(socket, attachment.playerId, opId, "document_too_large", "The shared brick library is full.");
    if (document.document.schemaVersion === 3 && this.openSockets().some(peer => (this.attachment(peer)?.documentSchema ?? 2) < 3)) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "client_update_required", "Ask everyone in this world to refresh Brickgineers before using larger plates or bricks.");
    }
    if (!this.consumeMutationBudget(socket, attachment, "control")) return;
    if (!this.acceptDocument(attachment, document.document)) return;
    const outcome: CachedOperationOutcome = { opId, type: "replace", revision: this.record!.revision };
    this.rememberOutcome(attachment.playerId, outcome);
    await this.persist();
    this.broadcastSnapshot(opId);
  }

  /**
   * A rename, REST save or checkpoint restore changed the stored world without
   * changing who may be inside. Reconciliation rule, in order:
   * 1. Commit the room's own uncommitted edits first, with the compare-and-set.
   *    If the database had not moved (the common case: the room was simply
   *    behind by a debounce), the room's edits land and nothing is lost.
   * 2. Then adopt the database copy only when it is ahead of the revision the
   *    room last confirmed. A save that raced the commit wins that race and the
   *    room's unconfirmed edits are dropped, because the room keeps no per-op
   *    history to replay on top of a foreign document.
   * 3. Broadcast the snapshot either way so clients rebase pending edits on the
   *    confirmed base.
   */
  private async refreshClassroomWorld(input: { document?: unknown; revision?: unknown }): Promise<Response> {
    if (this.record!.dirtySince !== undefined) await this.flushCommit();
    if (input.document !== undefined) {
      const parsed = validateBrickStudioDocument(input.document);
      if (!parsed.ok || !Number.isInteger(input.revision) || (input.revision as number) < this.record!.dbRevision!) {
        return json({ error: "invalid_restore" }, 409);
      }
      await this.settleCommit();
      await this.reconcileWithDatabase({ document: parsed.document, revision: input.revision as number });
    } else {
      try {
        const latest = await loadClassroomWorld(this.env, this.record!.classroomWorldId!);
        await this.settleCommit();
        await this.reconcileWithDatabase(latest);
      } catch {
        // Keep the last confirmed document: the next commit's compare-and-set
        // detects the moved database. Report it so the route never claims success.
        return json({ error: "world_reload_failed" }, 503);
      }
    }
    await this.persist();
    this.broadcastSnapshot();
    return json({ ok: true });
  }

  /**
   * Re-check every connected classroom session (or only one user's) against the
   * current database permissions. Allowed sessions continue with refreshed access
   * and display names; denied ones close with 4003. Returns false when the check
   * itself failed: unavailable permission data must never extend a session's
   * access, so every session in scope is closed.
   */
  private async reauthorizeClassroomSockets(userId?: string): Promise<boolean> {
    const sessions = this.openSockets().flatMap((socket) => {
      const attachment = this.attachment(socket);
      return attachment?.classroomAccess && (!userId || attachment.playerId === userId) ? [{ socket, attachment }] : [];
    });
    if (!sessions.length) return true;
    try {
      const results = await revalidateClassroomWorldAccessBatch(
        this.env,
        sessions.map((session) => session.attachment.classroomAccess!),
        this.record!.classroomWorldId!,
      );
      sessions.forEach(({ socket, attachment }, index) => {
        const access = results[index]?.access;
        if (access) this.applyReauthorizedAccess(socket, attachment, access);
        else this.revokeSocket(socket, attachment);
      });
      return true;
    } catch {
      for (const { socket, attachment } of sessions) this.revokeSocket(socket, attachment);
      return false;
    }
  }

  /**
   * Replace the room's document with the database copy. The room revision only
   * ever moves forward (clients ignore snapshots below their own revision), and
   * any uncommitted edits are dropped: their compare-and-set base no longer exists.
   */
  private async adoptDatabaseWorld(latest: { document: BrickStudioDocument; revision: number; title?: unknown }): Promise<void> {
    const dropped = this.record!.dirtySince !== undefined;
    this.record!.document = latest.document;
    this.record!.dbRevision = latest.revision;
    this.record!.revision = Math.max(this.record!.revision + 1, latest.revision);
    if (typeof latest.title === "string" && latest.title.trim()) this.record!.title = latest.title;
    this.markClean();
    await this.persist();
    if (dropped) this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "error", code: "save_conflict", message: SAVE_REPLACED_MESSAGE });
  }

  /**
   * Adopt the database copy when it is ahead of the last confirmed revision.
   * True when the room changed. Callers outside a commit call `settleCommit`
   * first so a copy read mid-commit is compared against the settled base.
   */
  private async reconcileWithDatabase(latest: { document: BrickStudioDocument; revision: number; title?: unknown }): Promise<boolean> {
    if (!this.record?.classroomWorldId || latest.revision <= this.record.dbRevision!) return false;
    await this.adoptDatabaseWorld(latest);
    return true;
  }

  /** Wait for any commit currently talking to the database. */
  private async settleCommit(): Promise<void> {
    while (this.commitInFlight) await this.commitInFlight;
  }

  private markClean(): void {
    delete this.record!.dirtySince;
    delete this.record!.commitDueAt;
    delete this.record!.commitFailures;
    delete this.record!.commitBlocked;
    this.lastSaveNotice = null;
  }

  /** An accepted classroom edit: the room is ahead of the database until the next commit lands. */
  private markDirty(editor: ClassroomSocketAccess): void {
    const now = Date.now();
    const record = this.record!;
    record.lastEditor = { userId: editor.userId, sessionId: editor.sessionId, authVersion: editor.authVersion };
    this.rememberOwnerIdentity(editor);
    if (record.dirtySince === undefined) {
      record.dirtySince = now;
      record.commitDueAt = now + COMMIT_DEBOUNCE_MS;
    } else if (record.commitBlocked) {
      // This editor was re-authorized moments ago, so a commit as them can land.
      delete record.commitBlocked;
      delete record.commitFailures;
      record.commitDueAt = now + COMMIT_DEBOUNCE_MS;
    }
  }

  private rememberOwnerIdentity(access: ClassroomSocketAccess): void {
    if ((access.isOwner || access.isTeacher) && access.canEdit) {
      this.record!.ownerIdentity = { userId: access.userId, sessionId: access.sessionId, authVersion: access.authVersion };
    }
  }

  /** The trusted classroom session on an internal request, when the router attached one. */
  private requestIdentity(request: Request): ClassroomSessionIdentity | undefined {
    try {
      const access = JSON.parse(request.headers.get("x-classroom-access") ?? "null") as ClassroomSocketAccess | null;
      if (access && access.worldId === this.record?.classroomWorldId && access.canEdit
          && typeof access.userId === "string" && typeof access.sessionId === "string" && Number.isInteger(access.authVersion)) {
        return { userId: access.userId, sessionId: access.sessionId, authVersion: access.authVersion };
      }
    } catch { /* an unreadable header simply adds no candidate */ }
    return undefined;
  }

  /** Bring the next commit forward to now (mode or lock change, resync, last disconnect) and start it. */
  private requestCommit(): void {
    if (!this.record?.classroomWorldId || this.record.dirtySince === undefined) return;
    this.record.commitDueAt = Date.now();
    void this.flushCommit();
  }

  /**
   * Commit the room's uncommitted document to the database, waiting first for a
   * commit already in flight. Never throws and never holds the admission lock
   * while the database answers, so edits keep flowing during the round trip.
   */
  private async flushCommit(extra?: ClassroomSessionIdentity): Promise<CommitOutcome> {
    this.wakeRecoveryPending = false;
    await this.settleCommit();
    if (!this.record?.classroomWorldId || this.record.dirtySince === undefined) return "clean";
    const attempt = this.performCommit(extra).finally(() => { this.commitInFlight = null; });
    this.commitInFlight = attempt;
    return attempt;
  }

  /**
   * Identities a commit may run as, most likely first: the session that just
   * asked (a fresh connect), the last editor, one other connected editor, then
   * the owner's or teacher's last known session.
   */
  private commitIdentities(extra?: ClassroomSessionIdentity): ClassroomSessionIdentity[] {
    const record = this.record!;
    const seen = new Set<string>();
    const ordered: ClassroomSessionIdentity[] = [];
    const add = (identity: ClassroomSessionIdentity | undefined) => {
      if (!identity) return;
      const key = `${identity.userId}:${identity.sessionId}:${identity.authVersion}`;
      if (seen.has(key)) return;
      seen.add(key);
      ordered.push({ userId: identity.userId, sessionId: identity.sessionId, authVersion: identity.authVersion });
    };
    add(extra);
    add(record.lastEditor);
    const connected = this.openSockets().flatMap((socket) => {
      const access = this.attachment(socket)?.classroomAccess;
      return access?.canEdit ? [access] : [];
    });
    const other = connected.find((access) => !seen.has(`${access.userId}:${access.sessionId}:${access.authVersion}`));
    add(other);
    add(record.ownerIdentity);
    return ordered;
  }

  private async performCommit(extra?: ClassroomSessionIdentity): Promise<CommitOutcome> {
    const record = this.record!;
    const worldId = record.classroomWorldId!;
    const startedAt = Date.now();
    // Captured synchronously: edits replace `document` rather than mutating it,
    // so this reference stays exactly what the compare-and-set will store.
    const base = { document: record.document, revision: record.revision, dbRevision: record.dbRevision! };
    const stale = () => this.record !== record || record.dbRevision !== base.dbRevision;
    let refused: CommitBlock | null = null;
    for (const identity of this.commitIdentities(extra)) {
      let saved: { revision: number };
      try {
        saved = await commitClassroomWorld(this.env, worldId, base.document, base.dbRevision, identity);
      } catch (error) {
        const status = isRecord(error) && typeof error.status === "number" ? error.status : 0;
        const code = isRecord(error) && typeof error.code === "string" ? error.code : "commit_failed";
        const message = error instanceof Error ? error.message : "The classroom save failed.";
        if (stale()) return "skipped";
        if (status === 401 || status === 403) {
          refused = { code, message, at: Date.now() };
          this.revokeIdentitySockets(identity);
          continue;
        }
        if (status === 409) return this.adoptAfterConflict(startedAt);
        if (status === 404) return this.blockCommit({ code, message, at: Date.now() }, false);
        return this.deferCommit();
      }
      if (stale()) return "skipped";
      record.dbRevision = saved.revision;
      delete record.commitFailures;
      delete record.commitBlocked;
      if (record.revision === base.revision) this.markClean();
      else {
        // Edits arrived during the round trip: they form the next burst.
        record.dirtySince = startedAt;
        record.commitDueAt = Math.min(Date.now() + COMMIT_DEBOUNCE_MS, startedAt + COMMIT_MAX_LAG_MS);
      }
      this.lastSaveNotice = null;
      await this.persist();
      return "committed";
    }
    return this.blockCommit(refused ?? { code: "no_editor_identity", message: "No classroom session is available to save this world.", at: Date.now() }, true);
  }

  /**
   * The database moved under the room (a solo save, rename or checkpoint restore
   * landed first). Adopt its copy and let clients rebase; the room's own
   * uncommitted edits are lost to that race. Without the database copy, keep the
   * edits and retry so a transient read failure never drops them.
   */
  private async adoptAfterConflict(startedAt: number): Promise<CommitOutcome> {
    let latest: { document: BrickStudioDocument; revision: number; title?: unknown };
    try { latest = await loadClassroomWorld(this.env, this.record!.classroomWorldId!); }
    catch { return this.deferCommit(); }
    if (this.record?.dirtySince === undefined || this.record.dirtySince > startedAt) return "skipped";
    if (!await this.reconcileWithDatabase(latest)) return this.deferCommit();
    this.broadcastSnapshot();
    return "conflict";
  }

  /** A transient failure: keep the edits, back off, and let builders know once it drags on. */
  private async deferCommit(): Promise<CommitOutcome> {
    const record = this.record!;
    record.commitFailures = (record.commitFailures ?? 0) + 1;
    const delay = COMMIT_RETRY_BACKOFF_MS[Math.min(record.commitFailures, COMMIT_RETRY_BACKOFF_MS.length) - 1];
    record.commitDueAt = Date.now() + delay;
    if (record.commitFailures >= COMMIT_DELAY_NOTICE_AFTER && this.lastSaveNotice !== "delayed") {
      this.lastSaveNotice = "delayed";
      this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "error", code: "save_conflict", message: SAVE_DELAYED_MESSAGE });
    }
    await this.persist();
    return "failed";
  }

  /**
   * Nobody may save right now (every identity refused, or the world is gone).
   * The edits stay in durable storage; the next accepted edit, connect or
   * re-authorization sweep tries again with a fresh identity. A retry alarm is
   * pointless without one, so none is set.
   */
  private async blockCommit(reason: CommitBlock, notify: boolean): Promise<CommitOutcome> {
    const record = this.record!;
    record.commitBlocked = reason;
    delete record.commitDueAt;
    if (notify && this.lastSaveNotice !== "blocked") {
      this.lastSaveNotice = "blocked";
      this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "error", code: "save_conflict", message: SAVE_BLOCKED_MESSAGE });
    }
    await this.persist();
    return "blocked";
  }

  /** A commit as this session was refused: the session lost access, so its sockets must rejoin. */
  private revokeIdentitySockets(identity: ClassroomSessionIdentity): void {
    for (const socket of this.sessionSockets()) {
      const attachment = this.attachment(socket);
      const access = attachment?.classroomAccess;
      if (attachment && access && access.userId === identity.userId && access.sessionId === identity.sessionId && access.authVersion === identity.authVersion) {
        this.revokeSocket(socket, attachment);
      }
    }
  }

  private async reauthorizeSocket(socket: WebSocket, attachment: WorldSocketAttachment): Promise<boolean> {
    if (!attachment.classroomAccess) return true;
    try {
      const access = await revalidateClassroomWorldAccess(this.env, attachment.classroomAccess, attachment.classroomAccess.worldId);
      return this.applyReauthorizedAccess(socket, attachment, access);
    } catch {
      this.revokeSocket(socket, attachment);
      return false;
    }
  }

  private applyReauthorizedAccess(socket: WebSocket, attachment: WorldSocketAttachment, access: ClassroomSocketAccess): boolean {
    const current = this.attachment(socket);
    if (!current || current.superseded || this.currentSocket(current) !== socket) return false;
    Object.assign(attachment, current);
    attachment.classroomAccess = access;
    attachment.isOwner = access.isOwner || access.isTeacher;
    socket.serializeAttachment(attachment);
    this.record!.profiles[attachment.playerId] = { ...this.record!.profiles[attachment.playerId], displayName: access.username };
    this.rememberOwnerIdentity(access);
    return true;
  }

  private revokeSocket(socket: WebSocket, attachment: WorldSocketAttachment): void {
    attachment.superseded = true;
    socket.serializeAttachment(attachment);
    socket.close(4003, "Classroom access changed. Rejoin from My Class.");
    this.broadcastPlayers();
  }

  /**
   * Apply an accepted edit. Guest and classroom rooms alike take it in memory
   * and acknowledge at once; a classroom room also marks itself dirty so the
   * write-behind commit carries the document to the database shortly after
   * (see `flushCommit`). The caller persists the record, which arms the alarm.
   */
  private acceptDocument(attachment: WorldSocketAttachment, document: BrickStudioDocument): boolean {
    this.record!.document = document;
    this.record!.revision += 1;
    if (this.record!.classroomWorldId && attachment.classroomAccess) this.markDirty(attachment.classroomAccess);
    return true;
  }

  private async handleSetMode(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!attachment.isOwner) return this.sendError(socket, "owner_only", "Only the room owner can change modes.");
    if (data.mode !== "build" && data.mode !== "explore") {
      return this.sendError(socket, "invalid_mode", "The room mode must be Build or Explore.");
    }
    if (this.record!.mode === data.mode) {
      this.send(socket, { v: LIVE_PROTOCOL_VERSION, type: "modeChanged", mode: data.mode, revision: this.record!.revision });
      return;
    }
    if (!this.consumeMutationBudget(socket, attachment, "control")) return;
    this.record!.revision += 1;
    this.record!.mode = data.mode;
    await this.persist();
    this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "modeChanged", mode: data.mode, revision: this.record!.revision });
    // Switching modes ends a building burst: save what the room holds right away.
    this.requestCommit();
  }

  private async handleSetLocked(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!attachment.isOwner) return this.sendError(socket, "owner_only", "Only the room owner can lock the room.");
    if (typeof data.locked !== "boolean") return this.sendError(socket, "invalid_lock", "The lock value must be true or false.");
    if (this.record!.locked === data.locked) {
      this.send(socket, { v: LIVE_PROTOCOL_VERSION, type: "locked", locked: data.locked });
      return;
    }
    if (!this.consumeMutationBudget(socket, attachment, "control")) return;
    this.record!.locked = data.locked;
    await this.persist();
    this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "locked", locked: data.locked });
    this.requestCommit();
  }

  private async handleSetProfile(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    data: Record<string, unknown>,
  ): Promise<void> {
    const inputProfile = attachment.classroomAccess && isRecord(data.profile)
      ? { ...data.profile, displayName: attachment.classroomAccess.username } : data.profile;
    const profile = sanitizeProfile(inputProfile);
    if (!profile.ok) return this.sendError(socket, profile.code, profile.message);
    const current = this.record!.profiles[attachment.playerId];
    if (current && profileEqual(current, profile.value)) {
      this.send(socket, { v: LIVE_PROTOCOL_VERSION, type: "players", players: this.players() });
      return;
    }
    if (!this.consumeMutationBudget(socket, attachment, "profile")) return;
    this.record!.profiles[attachment.playerId] = profile.value;
    this.pruneProfileCache();
    await this.persist();
    this.broadcastPlayers();
  }

  private handlePose(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    data: Record<string, unknown>,
    bytes: number,
    now: number,
  ): void {
    if (bytes > LIVE_MAX_POSE_BYTES) return this.sendError(socket, "pose_too_large", "The pose message exceeds 2 KiB.");
    const keys = ["x", "y", "z", "yaw"] as const;
    if (!keys.every((key) => typeof data[key] === "number" && Number.isFinite(data[key]) && Math.abs(data[key] as number) <= 100_000)
        || typeof data.moving !== "boolean"
        || typeof data.jumping !== "boolean") {
      return this.sendError(socket, "invalid_pose", "The pose message is invalid.");
    }
    const moving = data.moving || data.jumping;
    // The client sends its final stop immediately, even within the normal pose
    // interval. Admit that transition once so peers need not wait for the idle
    // heartbeat. Repeated idle packets and a rapid restart still hit the normal
    // throttle; the outer per-socket message budget also remains in force.
    const finalStop = attachment.lastPoseMoving === true && !moving;
    if (now - attachment.lastPoseAt < MIN_POSE_INTERVAL_MS && !finalStop) return;
    attachment.lastPoseAt = now;
    attachment.lastPoseMoving = Boolean(moving);
    socket.serializeAttachment(attachment);
    const pose = data as unknown as LivePose;
    this.broadcast({
      v: LIVE_PROTOCOL_VERSION,
      type: "pose",
      playerId: attachment.playerId,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      moving: pose.moving,
      jumping: pose.jumping,
      at: now,
    }, socket);
  }

  private operationSequence(opId: string, playerId: string): string | null {
    if (!LIVE_OP_ID_PATTERN.test(opId) || !opId.startsWith(`${playerId}#`)) return null;
    return opId.slice(playerId.length + 1);
  }

  private isConsumedOperation(playerId: string, sequence: string): boolean {
    const highWater = this.record!.operationHighWater[playerId];
    return Boolean(highWater && decimalSequenceAtMost(sequence, highWater));
  }

  private cachedOutcome(playerId: string, opId: string): CachedOperationOutcome | undefined {
    return this.record!.operationOutcomes[playerId]?.find((outcome) => outcome.opId === opId);
  }

  private rememberOutcome(playerId: string, outcome: CachedOperationOutcome): void {
    const previous = this.record!.operationOutcomes[playerId] ?? [];
    this.record!.operationOutcomes[playerId] = [...previous, outcome].slice(-MAX_OUTCOMES_PER_PLAYER);
    const sequence = this.operationSequence(outcome.opId, playerId);
    if (sequence) {
      this.record!.operationHighWater[playerId] = maxDecimalSequence(
        this.record!.operationHighWater[playerId],
        sequence,
      );
    }
  }

  private consumeMutationBudget(
    socket: WebSocket,
    attachment: WorldSocketAttachment,
    kind: "profile" | "control",
  ): boolean {
    const now = Date.now();
    const windowKey = kind === "profile" ? "profileWindowAt" : "controlWindowAt";
    const countKey = kind === "profile" ? "profileMutationCount" : "controlMutationCount";
    const limit = kind === "profile" ? MAX_PROFILE_MUTATIONS_PER_WINDOW : MAX_CONTROL_MUTATIONS_PER_WINDOW;
    if (now - attachment[windowKey] >= MUTATION_WINDOW_MS) {
      attachment[windowKey] = now;
      attachment[countKey] = 0;
    }
    if (attachment[countKey] >= limit) {
      this.sendError(
        socket,
        `${kind}_rate_limited`,
        `Too many ${kind} changes were sent in a short period.`,
      );
      return false;
    }
    attachment[countKey] += 1;
    socket.serializeAttachment(attachment);
    return true;
  }

  private sendCachedOutcome(socket: WebSocket, playerId: string, outcome: CachedOperationOutcome): void {
    if (outcome.type === "apply") {
      this.send(socket, {
        v: LIVE_PROTOCOL_VERSION,
        type: "apply",
        from: playerId,
        opId: outcome.opId,
        revision: outcome.revision,
        commands: [],
      });
      return;
    }
    if (outcome.type === "replace") {
      this.sendSnapshot(socket, outcome.opId);
      return;
    }
    this.send(socket, {
      v: LIVE_PROTOCOL_VERSION,
      type: "reject",
      opId: outcome.opId,
      code: outcome.code,
      message: outcome.message,
      revision: this.record!.revision,
      document: cloneDocument(this.record!.document),
    });
  }

  private rejectOperation(
    socket: WebSocket,
    _playerId: string,
    opId: string,
    code: string,
    message: string,
  ): void {
    this.send(socket, {
      v: LIVE_PROTOCOL_VERSION,
      type: "reject",
      ...(opId ? { opId } : {}),
      code,
      message,
      revision: this.record!.revision,
      document: cloneDocument(this.record!.document),
    });
  }

  private async cacheAndReject(
    socket: WebSocket,
    playerId: string,
    opId: string,
    code: string,
    message: string,
  ): Promise<void> {
    const outcome: CachedOperationOutcome = { opId, type: "reject", code, message };
    this.rememberOutcome(playerId, outcome);
    await this.persist();
    this.rejectOperation(socket, playerId, opId, code, message);
  }

  private publicState() {
    return {
      roomId: this.record!.roomId,
      title: this.record!.title,
      revision: this.record!.revision,
      mode: this.record!.mode,
      locked: this.record!.locked,
      document: cloneDocument(this.record!.document),
      players: this.players(),
    };
  }

  private players(): LivePlayer[] {
    if (!this.record) return [];
    return this.openSockets().flatMap((socket) => {
      const attachment = this.attachment(socket);
      if (!attachment) return [];
      return [{
        playerId: attachment.playerId,
        isOwner: attachment.isOwner,
        profile: { ...(this.record!.profiles[attachment.playerId] ?? { displayName: "Builder" }) },
      }];
    });
  }

  private pruneProfileCache(): void {
    const entries = Object.entries(this.record!.profiles);
    if (entries.length <= MAX_PROFILE_CACHE) return;
    const connected = new Set(this.openSockets().flatMap((socket) => {
      const attachment = this.attachment(socket);
      return attachment ? [attachment.playerId] : [];
    }));
    for (const [playerId] of entries) {
      if (Object.keys(this.record!.profiles).length <= MAX_PROFILE_CACHE) break;
      if (!connected.has(playerId)) {
        delete this.record!.profiles[playerId];
        delete this.record!.reconnectTokenVerifiers[playerId];
        delete this.record!.operationOutcomes[playerId];
        delete this.record!.operationHighWater[playerId];
      }
    }
  }

  private attachment(socket: WebSocket): WorldSocketAttachment | null {
    return socket.deserializeAttachment() as WorldSocketAttachment | null;
  }

  private sessionSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      return !this.attachment(socket)?.superseded;
    });
  }

  private openSockets(): WebSocket[] {
    const latestByIdentity = new Map<string, WebSocket>();
    for (const socket of this.sessionSockets()) {
      const attachment = this.attachment(socket);
      if (!attachment) continue;
      const identity = this.socketIdentity(attachment);
      const previous = latestByIdentity.get(identity);
      const previousAttachment = previous ? this.attachment(previous) : null;
      const isNewer = !previousAttachment
        || attachment.connectedAt > previousAttachment.connectedAt
        || (attachment.connectedAt === previousAttachment.connectedAt
          && (attachment.connectionId ?? "") >= (previousAttachment.connectionId ?? ""));
      if (isNewer) latestByIdentity.set(identity, socket);
    }
    return [...latestByIdentity.values()];
  }

  private socketIdentity(attachment: WorldSocketAttachment): string {
    return attachment.isOwner && !attachment.classroomAccess ? "owner" : `player:${attachment.playerId}`;
  }

  private currentSocket(attachment: WorldSocketAttachment): WebSocket | undefined {
    const identity = this.socketIdentity(attachment);
    return this.openSockets().find((socket) => {
      const candidate = this.attachment(socket);
      return candidate ? this.socketIdentity(candidate) === identity : false;
    });
  }

  private supersedeSocket(socket: WebSocket): void {
    const attachment = this.attachment(socket);
    if (attachment && !attachment.superseded) {
      attachment.superseded = true;
      socket.serializeAttachment(attachment);
    }
    if (socket.readyState === WebSocket.OPEN) socket.close(4001, "Reconnected elsewhere");
  }

  private broadcastPlayers(): void {
    if (!this.record) return;
    this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "players", players: this.players() });
  }

  private broadcastSnapshot(opId?: string): void {
    const message: SnapshotMessage = {
      v: LIVE_PROTOCOL_VERSION,
      type: "snapshot",
      ...(opId ? { opId } : {}),
      revision: this.record!.revision,
      mode: this.record!.mode,
      document: cloneDocument(this.record!.document),
    };
    this.broadcast(message);
  }

  private sendSnapshot(socket: WebSocket, opId?: string): void {
    const message: SnapshotMessage = {
      v: LIVE_PROTOCOL_VERSION,
      type: "snapshot",
      ...(opId ? { opId } : {}),
      revision: this.record!.revision,
      mode: this.record!.mode,
      document: cloneDocument(this.record!.document),
    };
    this.send(socket, message);
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { v: LIVE_PROTOCOL_VERSION, type: "error", code, message });
  }

  private send(socket: WebSocket, value: LiveServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(value)); } catch { /* close/error handlers perform cleanup */ }
  }

  private broadcast(value: LiveServerMessage, exclude?: WebSocket): void {
    const message = JSON.stringify(value);
    for (const socket of this.openSockets()) {
      if (socket === exclude) continue;
      try { socket.send(message); } catch { /* close/error handlers perform cleanup */ }
    }
  }

  private async touch(): Promise<void> {
    if (!this.record) return;
    const now = Date.now();
    this.record.expiresAt = now + WORLD_ROOM_TTL_MS;
    if (now - this.lastPersistedTouch >= EXPIRY_PERSIST_INTERVAL_MS) await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.record) return;
    this.record.expiresAt = Date.now() + WORLD_ROOM_TTL_MS;
    await this.ctx.storage.put("world", this.record);
    this.lastPersistedTouch = Date.now();
    if (this.record.classroomWorldId) await this.scheduleAlarm();
    else await this.ctx.storage.setAlarm(this.record.expiresAt + WORLD_ROOM_EXPIRY_GRACE_MS);
  }

  /**
   * Classroom rooms: one alarm at the earlier of the pending commit and the
   * re-authorization sweep (which only matters while sockets are open). The
   * alarm outlives hibernation, so a commit due after eviction still runs.
   */
  private async scheduleAlarm(): Promise<void> {
    if (!this.record?.classroomWorldId) return;
    const due: number[] = [];
    if (this.record.dirtySince !== undefined && this.record.commitDueAt !== undefined) due.push(this.record.commitDueAt);
    if (this.sessionSockets().length) due.push(this.reauthDueAt);
    const next = due.length ? Math.min(...due) : null;
    if (next === this.alarmAt) return;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
    this.alarmAt = next;
  }
}
