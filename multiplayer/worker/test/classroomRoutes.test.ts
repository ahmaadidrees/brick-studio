import { describe, it, expect, vi, afterEach } from "vitest";
import {
  canonicalWorldId,
  issueLiveTicket,
  verifyLiveTicket,
} from "../src/classroomTickets";
import { allowedOrigin, handleReleaseRequest } from "../src/classroomRoutes";
import { ClassroomService } from "../src/classroom";
import type { Env } from "../src/index";
const secret = "test-only-secret-".repeat(4);
const identity = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  worldId: "33333333-3333-4333-8333-333333333333",
  authVersion: 2,
};
describe("live ticket boundary", () => {
  it("canonicalizes only UUID or compact UUID spelling", () => {
    expect(
      canonicalWorldId(identity.worldId.replaceAll("-", "").toUpperCase()),
    ).toBe(identity.worldId);
    expect(canonicalWorldId(`-${identity.worldId}`)).toBeNull();
    expect(canonicalWorldId("../world")).toBeNull();
  });
  it("authenticates signature, audience and strict expiration", async () => {
    const ticket = await issueLiveTicket(identity, secret, 100000);
    expect(await verifyLiveTicket(ticket, secret, 159000)).toEqual(identity);
    await expect(
      verifyLiveTicket(ticket, secret, 160000),
    ).rejects.toMatchObject({ code: "invalid_live_ticket" });
    await expect(
      verifyLiveTicket(ticket, secret + "x", 100000),
    ).rejects.toMatchObject({ code: "invalid_live_ticket" });
    await expect(
      verifyLiveTicket(ticket + "x", secret, 100000),
    ).rejects.toMatchObject({ code: "invalid_live_ticket" });
  });
  it("does not issue tickets without separate configured signing secret", async () => {
    await expect(issueLiveTicket(identity)).rejects.toMatchObject({
      status: 503,
    });
  });
});
describe("public routing security", () => {
  it("allows application origins and denies lookalike origins", () => {
    expect(allowedOrigin("https://virtual-legos.vercel.app")).toBe(true);
    expect(allowedOrigin("http://127.0.0.1:5180")).toBe(true);
    expect(allowedOrigin("https://virtual-legos.vercel.app.evil.test")).toBe(
      false,
    );
    expect(allowedOrigin("https://virtual-legos.vercel.app/")).toBe(false);
  });
  it("retired routes never reach a durable object", async () => {
    for (const path of ["/rooms", "/rooms/ABCD1234/connect"]) {
      const r = await handleReleaseRequest(
        new Request(`https://worker.test${path}`, { method: "POST" }),
        {} as Env,
      );
      expect(r.status).toBe(410);
    }
  });
  it("preflights all classroom verbs and Authorization without credential reflection", async () => {
    const r = await handleReleaseRequest(
      new Request("https://worker.test/classroom/worlds", {
        method: "OPTIONS",
        headers: { origin: "https://virtual-legos.vercel.app" },
      }),
      {} as Env,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
    expect(r.headers.get("access-control-allow-methods")).toContain("DELETE");
  });
  it("rejects invalid websocket tickets before DB and DO work", async () => {
    const r = await handleReleaseRequest(
      new Request(
        `https://worker.test/worlds/${identity.worldId}/connect?ticket=invalid`,
        {
          headers: {
            "x-classroom-access": JSON.stringify(identity),
            Upgrade: "websocket",
          },
        },
      ),
      { CLASSROOM_TICKET_SECRET: secret } as Env,
    );
    expect(r.status).toBe(401);
  });
  it("rejects valid tickets replayed against another world before service lookup", async () => {
    const ticket = await issueLiveTicket(identity, secret);
    const r = await handleReleaseRequest(
      new Request(
        `https://worker.test/worlds/${identity.userId}/connect?ticket=${ticket}`,
      ),
      { CLASSROOM_TICKET_SECRET: secret } as Env,
    );
    expect(r.status).toBe(403);
  });
  it("never forwards an internal invalidation path", async () => {
    const r = await handleReleaseRequest(
      new Request("https://worker.test/internal/classroom-invalidate", {
        method: "POST",
        headers: { "x-world-init": "1" },
      }),
      {} as Env,
    );
    expect(r.status).toBe(404);
  });
});

afterEach(() => vi.restoreAllMocks());
it("forwards only newly authorized identity and discards bearer/capability query secrets", async () => {
  const authorize = vi.spyOn(ClassroomService.prototype, "rpc").mockResolvedValue({
    ...identity, username: "Current server name", role: "student", classId: identity.userId,
    canEdit: true, isTeacher: false, isOwner: false,
  });
  const rows = vi
    .spyOn(ClassroomService.prototype, "rows")
    .mockImplementation(async (table) => {
      if (table === "students")
        return [
          {
            user_id: identity.userId,
            class_id: identity.userId,
            username: "Builder",
            auth_version: 2,
          },
        ];
      if (table === "sessions") return [{ auth_version: 2 }];
      if (table === "worlds")
        return [
          {
            id: identity.worldId,
            title: "Class world",
            revision: 3,
            kind: "class",
            class_id: identity.userId,
            owner_id: identity.sessionId,
            document: {},
          },
        ];
      if (table === "classes")
        return [{ id: identity.userId, collaboration_open: true }];
      return [];
    });
  const calls: Request[] = [];
  const stub = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      calls.push(req);
      return new Response("{}", {
        status: new URL(req.url).pathname === "/init" ? 409 : 200,
      });
    },
  };
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "test",
    SUPABASE_SERVICE_ROLE_KEY: "test",
    CLASSROOM_TICKET_SECRET: secret,
    WORLD_ROOMS: { idFromName: (x: string) => x, get: () => stub },
  } as unknown as Env;
  const ticket = await issueLiveTicket(identity, secret);
  const response = await handleReleaseRequest(
    new Request(
      `https://worker.test/worlds/${identity.worldId}/connect?ticket=${ticket}&ownerToken=evil&playerId=spoof`,
      {
        headers: {
          Upgrade: "websocket",
          authorization: "Bearer do-not-forward",
          "x-classroom-access": "spoof",
        },
      },
    ),
    env,
  );
  expect(response.status).toBe(200);
  expect(rows).toHaveBeenCalled();
  expect(authorize).toHaveBeenCalledExactlyOnceWith("authorize_world", {
    p_world_id: identity.worldId, p_user_id: identity.userId,
    p_session_id: identity.sessionId, p_auth_version: identity.authVersion,
    p_teacher_allowed: false,
  });
  const forwarded = calls.at(-1)!;
  expect(JSON.parse(forwarded.headers.get("x-classroom-access")!)).toMatchObject({
    username: "Current server name", role: "student", isTeacher: false,
    sessionId: identity.sessionId, authVersion: identity.authVersion,
  });
  expect(forwarded.url).not.toContain("ticket");
  expect(forwarded.url).not.toContain("ownerToken");
  expect(forwarded.url).not.toContain("playerId");
  expect(forwarded.headers.get("authorization")).toBeNull();
  expect(JSON.parse(forwarded.headers.get("x-classroom-access")!).userId).toBe(
    identity.userId,
  );
});

it("awaits durable socket invalidation before reporting a world control success", async () => {
  const world = {
    id: identity.worldId,
    title: "World",
    revision: 3,
    owner_id: identity.userId,
    class_id: identity.userId,
    kind: "class",
    document: {},
  };
  vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({
    id: identity.userId,
    username: "Teacher",
    rosterName: "Teacher",
    role: "teacher",
    resetRequired: false,
    authVersion: 0,
    sessionId: identity.sessionId,
    token: "test",
  });
  vi.spyOn(ClassroomService.prototype, "worldFor").mockResolvedValue(world);
  vi.spyOn(ClassroomService.prototype, "rate").mockResolvedValue(undefined);
  vi.spyOn(ClassroomService.prototype, "rpc").mockResolvedValue({
    ...world,
    revision: 4,
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let notified = false,
    finished = false;
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "test",
    SUPABASE_SERVICE_ROLE_KEY: "test",
    WORLD_ROOMS: {
      idFromName: (x: string) => x,
      get: () => ({
        fetch: async () => {
          notified = true;
          await pending;
          return new Response("{}");
        },
      }),
    },
  } as unknown as Env;
  const result = handleReleaseRequest(
    new Request(`https://worker.test/classroom/worlds/${identity.worldId}`, {
      method: "PATCH",
      headers: {
        authorization: "Bearer test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "New title" }),
    }),
    env,
  ).then((r) => {
    finished = true;
    return r;
  });
  await vi.waitFor(() => expect(notified).toBe(true));
  expect(finished).toBe(false);
  release();
  expect((await result).status).toBe(200);
});

it("requires a current account before looking up a legacy owner capability", async () => {
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "test",
    SUPABASE_SERVICE_ROLE_KEY: "test",
  } as Env;
  const response = await handleReleaseRequest(
    new Request(
      "https://worker.test/classroom/legacy-worlds/11111111111141118111111111111111/import",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerToken: "a".repeat(64) }),
      },
    ),
    env,
  );
  expect(response.status).toBe(401);
});

it("imports a proven legacy document through validation into the current account private worlds", async () => {
  const { createBrickStudioDocument } = await import("@brick-studio/core");
  const document = createBrickStudioDocument([]);
  vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({
    id: identity.userId,
    username: "Builder",
    rosterName: "Student",
    role: "student",
    resetRequired: false,
    authVersion: 2,
    sessionId: identity.sessionId,
    token: "test",
  });
  vi.spyOn(ClassroomService.prototype, "rate").mockResolvedValue(undefined);
  const insert = vi
    .spyOn(ClassroomService.prototype, "insert")
    .mockImplementation(async (_table, data) => [
      { ...data, id: identity.worldId, revision: 1 },
    ]);
  const stub = {
    fetch: async () =>
      new Response(JSON.stringify({ title: "Old build", document })),
  };
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "test",
    SUPABASE_SERVICE_ROLE_KEY: "test",
    WORLD_ROOMS: { idFromName: (x: string) => x, get: () => stub },
  } as unknown as Env;
  const response = await handleReleaseRequest(
    new Request(
      "https://worker.test/classroom/legacy-worlds/11111111111141118111111111111111/import",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ownerToken: "a".repeat(64),
          kind: "class",
          owner_id: identity.sessionId,
        }),
      },
    ),
    env,
  );
  expect(response.status).toBe(201);
  expect(insert).toHaveBeenCalledWith(
    "worlds",
    expect.objectContaining({
      owner_id: identity.userId,
      kind: "personal",
      class_id: null,
      document,
    }),
  );
});


it("authorizes and initializes a cold compact classroom world instead of treating its missing DO as a lost guest room", async () => {
  const world = { id: identity.worldId, title: "Cold class world", revision: 1, kind: "class", class_id: identity.userId, owner_id: identity.userId, document: {} };
  vi.spyOn(ClassroomService.prototype, "authenticate").mockResolvedValue({
    id: identity.userId, username: "Student", rosterName: "Student", role: "student",
    resetRequired: false, authVersion: 2, sessionId: identity.sessionId, token: "test",
  });
  const authorized = vi.spyOn(ClassroomService.prototype, "worldFor").mockResolvedValue(world);
  vi.spyOn(ClassroomService.prototype, "rows").mockResolvedValue([world]);
  const paths: string[] = [];
  const stub = { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), path = new URL(request.url).pathname;
    paths.push(path);
    if (path === "/internal/room-kind") return new Response(JSON.stringify({ kind: "missing" }));
    if (path === "/init") {
      expect(await request.json()).toMatchObject({ classroomWorldId: identity.worldId });
      return new Response("{}", { status: 201 });
    }
    expect(JSON.parse(request.headers.get("x-classroom-access")!)).toMatchObject({ worldId: identity.worldId, userId: identity.userId });
    return new Response(JSON.stringify({ title: world.title }));
  } };
  const env = { SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test", WORLD_ROOMS: { idFromName: (id: string) => id, get: () => stub } } as unknown as Env;
  const response = await handleReleaseRequest(new Request(`https://worker.test/worlds/${identity.worldId.replaceAll("-", "")}`, { headers: { authorization: "Bearer test" } }), env);
  expect(response.status).toBe(200);
  expect(authorized).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: identity.userId }), identity.worldId, true, true);
  expect(paths).toEqual(["/internal/room-kind", "/init", `/worlds/${identity.worldId.replaceAll("-", "")}`]);
});
