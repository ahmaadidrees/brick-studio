import { LIVE_MAX_DOCUMENT_BYTES } from "@brick-studio/core";
import { isPlatformerDocument } from "@brick-studio/platformer-core/document";
import { levelFromJson, levelToJson } from "@brick-studio/platformer-core/engine/level";
import { isApplicationOrigin } from "./applicationOrigin";
import { worldCreationLimiterKey } from "./worldCreationLimiter";
import { readClassroomBody, ClassroomBodyError } from "./classroom/readBody";
import type { Env } from "./index";
import {
  authorizeClassroomWorld,
  revalidateClassroomWorldAccess,
  handleClassroomRequest,
  listClassroomWorldIds,
  loadClassroomLevel,
  loadClassroomWorld,
  ClassroomHttpError,
  ClassroomService,
  PRESENCE_ROOM_LIMIT,
  type ClassroomAccessChange,
} from "./classroom";
import {
  canonicalWorldId,
  issueLiveTicket,
  verifyLiveTicket,
} from "./classroomTickets";
import { newOwnerToken, newWorldId, ownerTokenVerifier, validateCreateWorldRequest } from "./worldRoom";
import type { PlatformerConnectGrant, PlatformerInit } from "./platformerRoom";

/** 2D guest rooms: one level, a few hundred KB at most. */
const PLATFORMER_MAX_BODY_BYTES = 400 * 1024;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
export function allowedOrigin(origin: string | null): boolean {
  // Non-browser clients may omit Origin; the literal opaque origin "null" is
  // rejected. Authentication/capability checks still apply without the header.
  return origin === null || isApplicationOrigin(origin);
}
function outgoing(response: Response, origin: string | null) {
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.set("cache-control", "no-store");
  result.headers.set("vary", "Origin");
  if (origin) {
    result.headers.set("access-control-allow-origin", origin);
    result.headers.set(
      "access-control-allow-methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    result.headers.set(
      "access-control-allow-headers",
      "content-type, authorization",
    );
  }
  return result;
}
async function invalidate(env: Env, event: ClassroomAccessChange) {
  const ids = event.worldId
    ? [event.worldId]
    : await listClassroomWorldIds(env, event);
  // A world id names a 3D room or a 2D room, never both; the other answers 404 and is skipped.
  const stubsFor = (roomId: string): Array<{ fetch: (input: string, init?: RequestInit) => Promise<Response> }> => {
    const stubs: Array<{ fetch: (input: string, init?: RequestInit) => Promise<Response> }> = [env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(roomId))];
    // Partial environments (older tests, tools) may not bind the 2D rooms; production always does.
    if (env.PLATFORMER_ROOMS) stubs.push(env.PLATFORMER_ROOMS.get(env.PLATFORMER_ROOMS.idFromName(roomId)));
    return stubs;
  };
  await Promise.all(
    ids.flatMap((id) => stubsFor(id.replaceAll("-", "")).map(async (stub) => {
      const r = await stub.fetch(
        "https://world.internal/internal/classroom-invalidate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: event.userId, reason: event.reason, change: event.change }),
        },
      );
      if (!r.ok && r.status !== 404)
        throw new ClassroomHttpError(
          503,
          "live_invalidation_failed",
          "Access changed, but live sessions could not be updated. Try again.",
        );
    })),
  );
}
/**
 * Distinct classroom accounts connected to these rooms right now. Presence lives only in the WorldRoom
 * objects, so each id costs one internal fetch; there is no registry of rooms that have opened, so an id
 * that never did instantiates a cold object that answers with nobody. ClassroomService.buildingNow bounds
 * the total per request and per teacher; this guard only refuses a single oversized batch.
 * Returns null (unknown) rather than a guess when the fan-out is too large or a room cannot answer.
 */
async function liveParticipants(env: Env, worldIds: string[]): Promise<string[] | null> {
  if (worldIds.length > PRESENCE_ROOM_LIMIT) return null;
  try {
    const rooms = await Promise.all(worldIds.map(async (id) => {
      const stub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(id.replaceAll("-", "")));
      const r = await stub.fetch("https://world.internal/internal/classroom-presence");
      if (!r.ok) throw new Error("presence_unavailable");
      const { userIds } = await r.json<{ userIds: unknown }>();
      return Array.isArray(userIds) ? userIds.filter((value): value is string => typeof value === "string") : [];
    }));
    return [...new Set(rooms.flat())];
  } catch {
    return null;
  }
}
/**
 * The same fan-out keyed by world for `GET /worlds?presence=1`: who is in each room. One internal fetch per id,
 * so ClassroomService.presenceByWorld bounds the batch and the per-caller rate; this guard only refuses one
 * oversized batch. Null (unknown) for the whole batch when any room cannot answer, never a guess.
 */
async function liveParticipantsByWorld(env: Env, worldIds: string[]): Promise<Map<string, string[]> | null> {
  if (worldIds.length > PRESENCE_ROOM_LIMIT) return null;
  try {
    const rooms = await Promise.all(worldIds.map(async (id): Promise<[string, string[]]> => {
      const stub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(id.replaceAll("-", "")));
      const r = await stub.fetch("https://world.internal/internal/classroom-presence");
      if (!r.ok) throw new Error("presence_unavailable");
      const { userIds } = await r.json<{ userIds: unknown }>();
      return [id, Array.isArray(userIds) ? userIds.filter((value): value is string => typeof value === "string") : []];
    }));
    return new Map(rooms);
  } catch {
    return null;
  }
}
async function ensureRoom(env: Env, worldId: string) {
  const world = await loadClassroomWorld(env, worldId),
    roomId = worldId.replaceAll("-", "");
  if (isPlatformerDocument(world.document))
    throw new ClassroomHttpError(409, "wrong_world_kind", "This world is a 2D level. Open it in the 2D builder.");
  const stub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(roomId));
  const r = await stub.fetch("https://world.internal/init", {
    method: "POST",
    headers: { "content-type": "application/json", "x-world-init": "1" },
    body: JSON.stringify({
      roomId,
      classroomWorldId: worldId,
      revision: world.revision,
      title: world.title,
      document: world.document,
      initialOwnerProfile: { displayName: "Builder" },
      ownerTokenVerifier: await ownerTokenVerifier(newOwnerToken()),
    }),
  });
  if (!r.ok && r.status !== 409)
    throw new ClassroomHttpError(
      503,
      "live_unavailable",
      "This world could not be opened. Try again.",
    );
  return stub;
}
/** The live 2D room of an account level: created from the stored level on first open (docs/PLATFORMER.md). */
async function ensurePlatformerRoom(env: Env, worldId: string) {
  const world = await loadClassroomLevel(env, worldId),
    roomId = worldId.replaceAll("-", "");
  const stub = env.PLATFORMER_ROOMS.get(env.PLATFORMER_ROOMS.idFromName(roomId));
  const init: PlatformerInit = { kind: "classroom", roomId, classroomWorldId: worldId, title: world.title, level: world.document.level, dbRevision: world.revision };
  const r = await stub.fetch("https://platformer.internal/init", {
    method: "POST",
    headers: { "content-type": "application/json", "x-platformer-init": "1" },
    body: JSON.stringify(init),
  });
  if (!r.ok && r.status !== 409)
    throw new ClassroomHttpError(503, "live_unavailable", "This level could not be opened. Try again.");
  return stub;
}
/** Forward a WebSocket upgrade to a 2D room with the router's own grant; nothing else from the request passes. */
function platformerConnect(stub: DurableObjectStub, request: Request, grant: PlatformerConnectGrant) {
  const headers = new Headers({ "x-platformer-access": JSON.stringify(grant) });
  headers.set("Upgrade", request.headers.get("Upgrade") ?? "");
  return stub.fetch(new Request("https://platformer.internal/connect", { headers }));
}
async function consumeCreation(env: Env, key: string): Promise<Response | null> {
  const limiter = env.WORLD_CREATION_LIMITER.get(env.WORLD_CREATION_LIMITER.idFromName(key));
  const limitResponse = await limiter.fetch("https://limiter.internal/consume", { method: "POST" });
  if (limitResponse.status === 429) {
    const limit = await limitResponse.json<{ retryAfterSeconds: number }>();
    const response = json({ error: "creation_rate_limited", retryAfterSeconds: limit.retryAfterSeconds }, 429);
    response.headers.set("retry-after", String(limit.retryAfterSeconds));
    response.headers.set("access-control-expose-headers", "retry-after");
    return response;
  }
  if (!limitResponse.ok) return json({ error: "creation_limiter_unavailable" }, 503);
  return null;
}
async function handlePlatformerRequest(request: Request, env: Env, url: URL): Promise<Response | null> {
  // A guest room: POST /platformer/rooms with { level } → { roomId, ownerToken }.
  if (url.pathname === "/platformer/rooms") {
    if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);
    // Its own window, so 2D rooms never use up the 3D quota for a school that shares one address.
    const limited = await consumeCreation(env, worldCreationLimiterKey(request.headers.get("cf-connecting-ip")).replace("world-create:", "platformer-create:"));
    if (limited) return limited;
    const input = await readClassroomBody(request, PLATFORMER_MAX_BODY_BYTES);
    let level: unknown;
    try { level = levelToJson(levelFromJson(input.level)); } catch { return json({ error: "invalid_level", message: "That level could not be read." }, 400); }
    const roomId = newWorldId(), ownerToken = newOwnerToken();
    const stub = env.PLATFORMER_ROOMS.get(env.PLATFORMER_ROOMS.idFromName(roomId));
    const init: PlatformerInit = { kind: "guest", roomId, level, ownerTokenVerifier: await ownerTokenVerifier(ownerToken) };
    const created = await stub.fetch("https://platformer.internal/init", {
      method: "POST",
      headers: { "content-type": "application/json", "x-platformer-init": "1" },
      body: JSON.stringify(init),
    });
    if (!created.ok) return json({ error: "room_creation_failed" }, 503);
    return json({ roomId, ownerToken }, 201);
  }
  const guest = url.pathname.match(/^\/platformer\/rooms\/([a-f0-9]{32})(\/connect)?$/);
  if (guest) {
    if (request.method !== "GET") return json({ code: "method_not_allowed" }, 405);
    const stub = env.PLATFORMER_ROOMS.get(env.PLATFORMER_ROOMS.idFromName(guest[1]));
    const kind = await (await stub.fetch("https://platformer.internal/internal/room-kind")).json<{ kind: string }>();
    // Class rooms are never opened by a guest link, whatever the id.
    if (kind.kind !== "guest") return json({ error: "room_not_found" }, 404);
    if (!guest[2]) return stub.fetch("https://platformer.internal/info");
    const ownerToken = url.searchParams.get("ownerToken") ?? undefined;
    return platformerConnect(stub, request, { kind: "guest", ownerToken });
  }
  // Authenticated recovery of snapshots that outlive the live room. Do not create or refresh a room here.
  const recoveryRoute = url.pathname.match(/^\/classroom\/worlds\/([^/]+)\/platformer-recovery(?:\/([^/]+))?$/);
  if (recoveryRoute) {
    if (request.method !== "GET" && !(request.method === "DELETE" && recoveryRoute[2])) return json({ code: "method_not_allowed" }, 405);
    const id = canonicalWorldId(recoveryRoute[1]);
    if (!id) throw new ClassroomHttpError(404, "not_found", "World not found.");
    const copyId = recoveryRoute[2];
    if (copyId && copyId !== "legacy" && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(copyId)) {
      return json({ error: "not_found" }, 404);
    }
    const access = await authorizeClassroomWorld(request, env, id);
    if (!access.isOwner && !access.isTeacher) return json({ error: "access_required" }, 403);
    await loadClassroomLevel(env, id); // Recovery documents belong only to 2D classroom worlds.
    const stub = env.PLATFORMER_ROOMS.get(env.PLATFORMER_ROOMS.idFromName(id.replaceAll("-", "")));
    const path = `/internal/recovery${copyId ? `/${copyId}` : ""}`;
    return stub.fetch(`https://platformer.internal${path}`, {
      method: request.method,
      headers: { "x-platformer-access": JSON.stringify({ kind: "classroom", access } satisfies PlatformerConnectGrant) },
    });
  }
  // A class level's room: a signed-in ticket for this level, then the socket.
  const ticketRoute = url.pathname.match(/^\/classroom\/worlds\/([^/]+)\/platformer-ticket$/);
  if (ticketRoute) {
    if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);
    const id = canonicalWorldId(ticketRoute[1]);
    if (!id) throw new ClassroomHttpError(404, "not_found", "World not found.");
    const access = await authorizeClassroomWorld(request, env, id);
    await ensurePlatformerRoom(env, id);
    const ticket = await issueLiveTicket(access, env.CLASSROOM_TICKET_SECRET, Date.now(), "brick-2d-v1");
    return json({ ticket, expiresIn: 60 });
  }
  const classRoute = url.pathname.match(/^\/platformer\/worlds\/([a-fA-F0-9-]+)\/connect$/);
  if (classRoute) {
    if (request.method !== "GET") return json({ code: "method_not_allowed" }, 405);
    const id = canonicalWorldId(classRoute[1]);
    if (!id) throw new ClassroomHttpError(404, "not_found", "World not found.");
    const ticket = url.searchParams.get("ticket");
    if (!ticket) throw new ClassroomHttpError(401, "sign_in_required", "Sign in to open this class level.");
    const identity = await verifyLiveTicket(ticket, env.CLASSROOM_TICKET_SECRET, Date.now(), "brick-2d-v1");
    if (identity.worldId !== id) throw new ClassroomHttpError(403, "wrong_world", "This ticket belongs to another level.");
    const access = await revalidateClassroomWorldAccess(env, identity, id);
    const stub = await ensurePlatformerRoom(env, id);
    return platformerConnect(stub, request, { kind: "classroom", access });
  }
  return null;
}
export async function handleReleaseRequest(
  external: Request,
  env: Env,
): Promise<Response> {
  const origin = external.headers.get("origin");
  if (!allowedOrigin(origin)) return json({ code: "origin_not_allowed" }, 403);
  try {
    if (external.method === "OPTIONS")
      return outgoing(new Response(null, { status: 204 }), origin);
    const headers = new Headers(external.headers);
    for (const name of ["x-classroom-access", "x-world-init", "x-room-init", "x-guest-world-access", "x-platformer-access", "x-platformer-init"])
      headers.delete(name);
    const request = new Request(external, { headers }),
      url = new URL(request.url);
    if (
      url.pathname === "/rooms" ||
      url.pathname.startsWith("/rooms/")
    )
      return outgoing(
        json(
          {
            error: "Open collaboration from My Class.",
            code: "legacy_collaboration_retired",
          },
          410,
        ),
        origin,
      );
    if (url.pathname.startsWith("/platformer/") || url.pathname.endsWith("/platformer-ticket")
        || /^\/classroom\/worlds\/[^/]+\/platformer-recovery(?:\/[^/]+)?$/.test(url.pathname)) {
      const handled = await handlePlatformerRequest(request, env, url);
      if (handled) return outgoing(handled, origin);
    }
    if (url.pathname === "/worlds") {
      if (request.method !== "POST")
        return outgoing(json({ code: "method_not_allowed" }, 405), origin);
      const limiter = env.WORLD_CREATION_LIMITER.get(env.WORLD_CREATION_LIMITER.idFromName(
        worldCreationLimiterKey(request.headers.get("cf-connecting-ip")),
      ));
      const limitResponse = await limiter.fetch("https://limiter.internal/consume", { method: "POST" });
      if (limitResponse.status === 429) {
        const limit = await limitResponse.json<{ retryAfterSeconds: number }>();
        const response = json({ error: "creation_rate_limited", retryAfterSeconds: limit.retryAfterSeconds }, 429);
        response.headers.set("retry-after", String(limit.retryAfterSeconds));
        response.headers.set("access-control-expose-headers", "retry-after");
        return outgoing(response, origin);
      }
      if (!limitResponse.ok) return outgoing(json({ error: "creation_limiter_unavailable" }, 503), origin);
      const input = await readClassroomBody(request, LIVE_MAX_DOCUMENT_BYTES + 16 * 1024);
      const validated = validateCreateWorldRequest(input);
      if (!validated.ok) return outgoing(json({ error: validated.code, message: validated.message }, 400), origin);
      const roomId = newWorldId(), ownerToken = newOwnerToken();
      const stub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(roomId));
      const created = await stub.fetch("https://world.internal/init", {
        method: "POST",
        headers: { "content-type": "application/json", "x-world-init": "1" },
        body: JSON.stringify({
          roomId, title: validated.value.title, document: validated.value.document,
          initialOwnerProfile: validated.value.profile, ownerTokenVerifier: await ownerTokenVerifier(ownerToken),
        }),
      });
      if (!created.ok) return outgoing(json({ error: "world_creation_failed" }, 503), origin);
      return outgoing(json({ roomId, ownerToken }, 201), origin);
    }
    const legacyRoute = url.pathname.match(
      /^\/classroom\/legacy-worlds\/([a-f0-9]{32})\/import$/,
    );
    if (legacyRoute) {
      if (request.method !== "POST")
        return outgoing(json({ code: "method_not_allowed" }, 405), origin);
      const service = new ClassroomService(env);
      const bearer =
        request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ||
        "";
      const caller = await service.authenticate(bearer);
      await service.rate(`legacy-import:${caller.id}`, 10, 60);
      const input = await readClassroomBody(request);
      if (
        typeof input.ownerToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(input.ownerToken)
      ) {
        throw new ClassroomHttpError(
          404,
          "legacy_world_unavailable",
          "This old owner link cannot recover a saved world.",
        );
      }
      const stub = env.WORLD_ROOMS.get(
        env.WORLD_ROOMS.idFromName(legacyRoute[1]),
      );
      const recovered = await stub.fetch(
        "https://world.internal/internal/legacy-export",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ownerToken: input.ownerToken }),
        },
      );
      if (!recovered.ok)
        throw new ClassroomHttpError(
          404,
          "legacy_world_unavailable",
          "This old owner link cannot recover a saved world.",
        );
      const legacy = await recovered.json<{
        title: string;
        document: unknown;
      }>();
      const create = new Request(new URL("/classroom/worlds", request.url), {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: legacy.title,
          document: legacy.document,
          kind: "personal",
        }),
      });
      const imported = await handleClassroomRequest(create, env);
      if (!imported)
        throw new ClassroomHttpError(
          503,
          "import_unavailable",
          "This world could not be imported. Try again.",
        );
      return outgoing(imported, origin);
    }
    const ticketRoute = url.pathname.match(
      /^\/classroom\/worlds\/([^/]+)\/live-ticket$/,
    );
    if (ticketRoute) {
      if (request.method !== "POST")
        return outgoing(json({ code: "method_not_allowed" }, 405), origin);
      const id = canonicalWorldId(ticketRoute[1]);
      if (!id)
        throw new ClassroomHttpError(404, "not_found", "World not found.");
      const access = await authorizeClassroomWorld(request, env, id),
        ticket = await issueLiveTicket(access, env.CLASSROOM_TICKET_SECRET);
      await ensureRoom(env, id);
      return outgoing(json({ ticket, expiresIn: 60 }), origin);
    }
    const route = url.pathname.match(/^\/worlds\/([a-fA-F0-9-]+)(\/connect)?$/);
    if (route) {
      if (request.method !== "GET")
        return outgoing(json({ code: "method_not_allowed" }, 405), origin);
      // Guest capabilities never authorize classroom records. The immutable DO
      // record type, not a client flag or header, decides this branch. Existing
      // compact guest links retain their storage identity and protocol.
      if (/^[a-f0-9]{32}$/.test(route[1]) && !url.searchParams.has("ticket")) {
        const guestStub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(route[1]));
        const kindResponse = await guestStub.fetch("https://world.internal/internal/room-kind");
        if (!kindResponse.ok) return outgoing(json({ code: "service_unavailable" }, 503), origin);
        const { kind } = await kindResponse.json<{ kind: string }>();
        if (kind === "guest") {
          const internal = new URL(`https://world.internal/worlds/${route[1]}${route[2] ?? ""}`);
          for (const key of ["playerId", "ownerToken", "reconnectToken", "profile", "documentSchema"]) {
            const value = url.searchParams.get(key);
            if (value !== null) internal.searchParams.set(key, value);
          }
          const guestHeaders = new Headers({ "x-guest-world-access": "1" });
          if (route[2]) guestHeaders.set("Upgrade", request.headers.get("Upgrade") ?? "");
          return outgoing(await guestStub.fetch(new Request(internal, { headers: guestHeaders })), origin);
        }
        // A cloud world may not have initialized its live DO yet. Missing
        // records must pass through normal authorization and ensureRoom.
        if (kind !== "classroom" && kind !== "missing") return outgoing(json({ code: "service_unavailable" }, 503), origin);
      }
      const id = canonicalWorldId(route[1]);
      if (!id)
        throw new ClassroomHttpError(404, "not_found", "World not found.");
      if ((route[2] && !url.searchParams.get("ticket")) ||
          (!route[2] && !/^Bearer .+/i.test(request.headers.get("authorization") ?? ""))) {
        throw new ClassroomHttpError(401, "sign_in_required", "Sign in to open this classroom world.");
      }
      const access = route[2]
        ? await (async () => {
            const identity = await verifyLiveTicket(
              url.searchParams.get("ticket") ?? "",
              env.CLASSROOM_TICKET_SECRET,
            );
            if (identity.worldId !== id)
              throw new ClassroomHttpError(
                403,
                "wrong_world",
                "This ticket belongs to another world.",
              );
            return revalidateClassroomWorldAccess(env, identity, id);
          })()
        : await authorizeClassroomWorld(request, env, id);
      const stub = await ensureRoom(env, id),
        internal = new URL(
          `https://world.internal/worlds/${id.replaceAll("-", "")}${route[2] ?? ""}`,
        );
      if (url.searchParams.get("documentSchema") === "3") internal.searchParams.set("documentSchema", "3");
      const profile = url.searchParams.get("profile");
      if (profile) internal.searchParams.set("profile", profile);
      const trustedHeaders = new Headers();
      if (route[2])
        trustedHeaders.set("Upgrade", request.headers.get("Upgrade") ?? "");
      trustedHeaders.set("x-classroom-access", JSON.stringify(access));
      return outgoing(
        await stub.fetch(new Request(internal, { headers: trustedHeaders })),
        origin,
      );
    }
    const response = await handleClassroomRequest(request, env, {
      onAccessChanged: (event) => invalidate(env, event),
      liveParticipants: (worldIds) => liveParticipants(env, worldIds),
      liveParticipantsByWorld: (worldIds) => liveParticipantsByWorld(env, worldIds),
    });
    return outgoing(response ?? json({ code: "not_found" }, 404), origin);
  } catch (error) {
    if (error instanceof ClassroomBodyError)
      return outgoing(
        json({ error: error.message, code: error.code }, error.status),
        origin,
      );
    return outgoing(
      error instanceof ClassroomHttpError
        ? json(
            { error: error.message, code: error.code, ...error.details },
            error.status,
          )
        : json(
            {
              error: "Service temporarily unavailable.",
              code: "service_unavailable",
            },
            503,
          ),
      origin,
    );
  }
}
