import {
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
import { loadClassroomWorld, commitClassroomWorld, revalidateClassroomWorldAccess, revalidateClassroomWorldAccessBatch, type ClassroomEnv } from "./classroom/index";

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

type WorldRoomRecord = {
  classroomWorldId?: string;
  roomId: string;
  title: string;
  document: BrickStudioDocument;
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
};

type WorldSocketAttachment = {
  classroomAccess?: ClassroomSocketAccess;
  playerId: string;
  isOwner: boolean;
  connectedAt: number;
  connectionId?: string;
  superseded?: boolean;
  lastPoseAt: number;
  messageWindowAt: number;
  messageCount: number;
  messageRateViolations: number;
  profileWindowAt: number;
  profileMutationCount: number;
  controlWindowAt: number;
  controlMutationCount: number;
};

type SnapshotMessage = Extract<LiveServerMessage, { type: "snapshot" }>;

type ValidationResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export const WORLD_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const WORLD_ROOM_EXPIRY_GRACE_MS = 90 * 1000;
const EXPIRY_PERSIST_INTERVAL_MS = 60 * 1000;
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
  return firstPalette.length === secondPalette.length
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
      }
      this.record = stored;
      // A hibernated object has no trustworthy in-memory persistence clock. The
      // first authenticated activity after rehydrate must durably renew expiry.
      this.lastPersistedTouch = 0;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
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
        const input = await request.json() as { userId?: string; reason?: string; document?: unknown; revision?: number };
        for (const socket of this.sessionSockets()) {
          const attachment = this.attachment(socket);
          if (attachment?.classroomAccess && (!input.userId || attachment.playerId === input.userId)) {
            attachment.superseded = true;
            socket.serializeAttachment(attachment);
            socket.close(4003, "Classroom access changed. Rejoin from My Class.");
          }
        }
        if (input.reason === "world_saved" || input.reason === "world_restored") {
          const latest = await loadClassroomWorld(this.env, this.record.classroomWorldId);
          this.record.document = latest.document;
          this.record.revision = latest.revision;
        } else if (input.document !== undefined) {
          const parsed = validateBrickStudioDocument(input.document);
          if (!parsed.ok || !Number.isInteger(input.revision) || input.revision! < this.record.revision) {
            return json({ error: "invalid_restore" }, 409);
          }
          this.record.document = parsed.document;
          this.record.revision = input.revision!;
        }
        await this.persist();
        this.broadcastPlayers();
        return json({ ok: true });
      });
    }
    if (request.method === "POST" && url.pathname === "/init" && request.headers.get("x-world-init") === "1") {
      if (this.record) return json({ error: "already_exists" }, 409);
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
    if (url.pathname.endsWith("/connect")) {
      return this.withSerializedAdmission(() => this.connectSocket(request, url));
    }
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
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
        const latest = await loadClassroomWorld(this.env, worldId);
        if (latest.revision !== this.record.revision) {
          this.record.document = latest.document;
          this.record.revision = latest.revision;
          await this.persist();
          this.broadcastSnapshot();
        }
      } catch { return json({ error: "classroom_access_denied" }, 403); }
    }
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
    if (classroomAccess) this.record!.profiles[playerId] = { ...this.record!.profiles[playerId], displayName: classroomAccess.username };
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
      return this.withSerializedAdmission(() => this.processSocketMessage(socket, data, bytes));
    }
    return this.processSocketMessage(socket, data, bytes);
  }

  private async processSocketMessage(socket: WebSocket, data: Record<string, unknown>, bytes: number): Promise<void> {
    if (typeof data.type !== "string") return;
    // A queued frame may have lost access while waiting. Re-read its attachment.
    const attachment = this.attachment(socket);
    if (!attachment || !this.record || attachment.superseded || this.currentSocket(attachment) !== socket) return;
    if (attachment.classroomAccess && ["commands", "replaceDocument", "setMode", "setLocked", "setProfile", "resync"].includes(data.type)) {
      if (!await this.reauthorizeSocket(socket, attachment)) return;
    }
    if (attachment.classroomAccess && !attachment.classroomAccess.canEdit
        && ["commands", "replaceDocument", "setMode", "setLocked"].includes(data.type)) {
      return this.rejectOperation(socket, attachment.playerId, typeof data.opId === "string" ? data.opId : "", "read_only", "You do not have editing access to this world.");
    }
    switch (data.type) {
      case "commands":
        await this.handleCommands(socket, attachment, data, bytes);
        break;
      case "replaceDocument":
        await this.handleReplaceDocument(socket, attachment, data, bytes);
        break;
      case "resync":
        this.sendSnapshot(socket);
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

  async webSocketClose(_socket: WebSocket, _code: number, _reason: string): Promise<void> {
    if (!this.record) return;
    this.broadcastPlayers();
    await this.touch();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, "WebSocket error");
    if (this.record) this.broadcastPlayers();
  }

  async alarm(): Promise<void> {
    if (!this.record) return;
    if (this.record.classroomWorldId) {
      await this.withSerializedAdmission(async () => {
        const sessions = this.openSockets().map(socket => ({ socket, attachment: this.attachment(socket) })).filter(session => session.attachment?.classroomAccess);
        if (sessions.length) {
          try {
            const results = await revalidateClassroomWorldAccessBatch(this.env, sessions.map(session => session.attachment!.classroomAccess!), this.record!.classroomWorldId!);
            for (let index = 0; index < sessions.length; index += 1) {
              const { socket, attachment } = sessions[index];
              const access = results[index]?.access;
              if (access) this.applyReauthorizedAccess(socket, attachment!, access);
              else this.revokeSocket(socket, attachment!);
            }
          } catch {
            // Unavailable permission data must never extend a session's access.
            for (const { socket, attachment } of sessions) this.revokeSocket(socket, attachment!);
          }
        }
        if (this.openSockets().length) await this.ctx.storage.setAlarm(Date.now() + 60_000);
        else await this.ctx.storage.deleteAlarm();
      });
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

    if (!await this.acceptDocument(socket, attachment, opId, result.value.document)) return;
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
    if (!attachment.isOwner) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "owner_only", "Only the room owner can replace the world.");
    }
    if (this.record!.mode !== "build") {
      return this.cacheAndReject(socket, attachment.playerId, opId, "explore_mode", "The world cannot be replaced during Explore mode.");
    }
    if (!Number.isInteger(data.expectedRevision) || data.expectedRevision !== this.record!.revision) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "revision_conflict", "The world changed while this update was prepared. Review the latest world and try again.");
    }
    if (bytes > MAX_FRAME_BYTES || encodedBytes(data.document) > LIVE_MAX_DOCUMENT_BYTES) {
      return this.cacheAndReject(socket, attachment.playerId, opId, "document_too_large", "The replacement document is too large.");
    }
    const document = validateBrickStudioDocument(data.document, { maxBricks: BRICK_STUDIO_MAX_BRICKS });
    if (!document.ok) return this.cacheAndReject(socket, attachment.playerId, opId, document.error.code, document.error.message);
    if (!this.consumeMutationBudget(socket, attachment, "control")) return;
    if (!await this.acceptDocument(socket, attachment, opId, document.document)) return;
    const outcome: CachedOperationOutcome = { opId, type: "replace", revision: this.record!.revision };
    this.rememberOutcome(attachment.playerId, outcome);
    await this.persist();
    this.broadcastSnapshot(opId);
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
    return true;
  }

  private revokeSocket(socket: WebSocket, attachment: WorldSocketAttachment): void {
    attachment.superseded = true;
    socket.serializeAttachment(attachment);
    socket.close(4003, "Classroom access changed. Rejoin from My Class.");
    this.broadcastPlayers();
  }

  private async acceptDocument(socket: WebSocket, attachment: WorldSocketAttachment, opId: string, document: BrickStudioDocument): Promise<boolean> {
    if (!this.record!.classroomWorldId) {
      this.record!.document = document;
      this.record!.revision += 1;
      return true;
    }
    try {
      const saved = await commitClassroomWorld(this.env, this.record!.classroomWorldId, document, this.record!.revision, attachment.classroomAccess!);
      this.record!.document = saved.document;
      this.record!.revision = saved.revision;
      return true;
    } catch (error) {
      if (isRecord(error) && (error.status === 401 || error.status === 403)) {
        attachment.superseded = true;
        socket.serializeAttachment(attachment);
        socket.close(4003, "Classroom access changed. Rejoin from My Class.");
        this.broadcastPlayers();
        return false;
      }
      // Never acknowledge an edit before the durable classroom save. A concurrent
      // restore/save may have advanced the database while this room was active.
      try {
        const latest = await loadClassroomWorld(this.env, this.record!.classroomWorldId);
        this.record!.document = latest.document;
        this.record!.revision = latest.revision;
        await this.persist();
        this.broadcastSnapshot();
      } catch { /* Retain the last confirmed document when storage is unavailable. */ }
      await this.cacheAndReject(socket, attachment.playerId, opId, "save_conflict", "This edit was not saved. Review the refreshed world and try again.");
      return false;
    }
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
    if (this.record!.classroomWorldId) {
      try {
        const saved = await commitClassroomWorld(this.env, this.record!.classroomWorldId, this.record!.document, this.record!.revision, attachment.classroomAccess!);
        this.record!.revision = saved.revision;
      } catch { return this.sendError(socket, "save_conflict", "Could not save this mode change. Rejoin the world and try again."); }
    } else this.record!.revision += 1;
    this.record!.mode = data.mode;
    await this.persist();
    this.broadcast({ v: LIVE_PROTOCOL_VERSION, type: "modeChanged", mode: data.mode, revision: this.record!.revision });
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
    if (now - attachment.lastPoseAt < MIN_POSE_INTERVAL_MS) return;
    const keys = ["x", "y", "z", "yaw"] as const;
    if (!keys.every((key) => typeof data[key] === "number" && Number.isFinite(data[key]) && Math.abs(data[key] as number) <= 100_000)
        || typeof data.moving !== "boolean"
        || typeof data.jumping !== "boolean") {
      return this.sendError(socket, "invalid_pose", "The pose message is invalid.");
    }
    attachment.lastPoseAt = now;
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
    if (this.record.classroomWorldId) {
      const scheduled = await this.ctx.storage.getAlarm();
      if (scheduled === null || scheduled > Date.now() + 60_000) await this.ctx.storage.setAlarm(Date.now() + 60_000);
    } else await this.ctx.storage.setAlarm(this.record.expiresAt + WORLD_ROOM_EXPIRY_GRACE_MS);
  }
}
