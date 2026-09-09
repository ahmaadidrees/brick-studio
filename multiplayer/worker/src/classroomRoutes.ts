import { readClassroomBody, ClassroomBodyError } from "./classroom/readBody";
import type { Env } from "./index";
import {
  authorizeClassroomWorld,
  revalidateClassroomWorldAccess,
  handleClassroomRequest,
  listClassroomWorldIds,
  loadClassroomWorld,
  ClassroomHttpError,
  ClassroomService,
  type ClassroomAccessChange,
} from "./classroom";
import {
  canonicalWorldId,
  issueLiveTicket,
  verifyLiveTicket,
} from "./classroomTickets";
import { newOwnerToken, ownerTokenVerifier } from "./worldRoom";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
export function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return (
      u.origin === origin &&
      ((u.protocol === "https:" &&
        (u.hostname === "virtual-legos.vercel.app" ||
          /^virtual-legos-[a-z0-9-]+\.vercel\.app$/.test(u.hostname))) ||
        (["localhost", "127.0.0.1"].includes(u.hostname) &&
          ["http:", "https:"].includes(u.protocol)))
    );
  } catch {
    return false;
  }
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
  await Promise.all(
    ids.map(async (id) => {
      const stub = env.WORLD_ROOMS.get(
        env.WORLD_ROOMS.idFromName(id.replaceAll("-", "")),
      );
      const r = await stub.fetch(
        "https://world.internal/internal/classroom-invalidate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: event.userId, reason: event.reason }),
        },
      );
      if (!r.ok && r.status !== 404)
        throw new ClassroomHttpError(
          503,
          "live_invalidation_failed",
          "Access changed, but live sessions could not be updated. Try again.",
        );
    }),
  );
}
async function ensureRoom(env: Env, worldId: string) {
  const world = await loadClassroomWorld(env, worldId),
    roomId = worldId.replaceAll("-", "");
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
    for (const name of ["x-classroom-access", "x-world-init", "x-room-init"])
      headers.delete(name);
    const request = new Request(external, { headers }),
      url = new URL(request.url);
    if (
      url.pathname === "/rooms" ||
      url.pathname.startsWith("/rooms/") ||
      url.pathname === "/worlds"
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
      const id = canonicalWorldId(route[1]);
      if (!id)
        throw new ClassroomHttpError(404, "not_found", "World not found.");
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
