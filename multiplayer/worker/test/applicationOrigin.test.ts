import { afterEach, describe, expect, it, vi } from "vitest";
import { isApplicationOrigin } from "../src/applicationOrigin";
import { allowedOrigin, handleReleaseRequest } from "../src/classroomRoutes";
import { teacherGoogleAuthorizationUrl } from "../src/classroom/googleOAuth";
import { ClassroomService } from "../src/classroom";
import type { Env } from "../src/index";

const allowed = [
  "https://brickgineers.com", "https://www.brickgineers.com",
  "https://virtual-legos.vercel.app",
  "https://virtual-legos-m41egxddv-ahmaadidrees-projects.vercel.app",
  "http://localhost:5190", "http://127.0.0.1:5180", "https://localhost:5190",
];
const rejected = [
  "", "null", "not a url", "https://", "file:///brickgineers.com",
  "http://brickgineers.com", "http://www.brickgineers.com",
  "https://brickgineers.com.evil.test", "https://www.brickgineers.com.evil.test",
  "https://evilbrickgineers.com", "https://app.brickgineers.com",
  "https://brickgineers.com@evil.test", "https://user:password@brickgineers.com",
  "https://brickgineers.com:8443", "https://brickgineers.com:443",
  "https://www.brickgineers.com:8443", "https://virtual-legos.vercel.app:8443",
  "https://virtual-legos-preview.vercel.app:8443", "http://virtual-legos.vercel.app",
  "https://virtual-legos-preview.vercel.app.evil.test", "https://unrelated.vercel.app",
  "https://brickgineers.com/", "https://brickgineers.com/auth/teacher-callback",
  "https://brickgineers.com?next=https://evil.test", "https://brickgineers.com#evil",
  "https://brickgineers.com.", " https://brickgineers.com", "https://brickgineers.com\n",
  "http://localhost.evil.test:5190", "https://portalblaster.com",
];
const challenge = "a".repeat(43), state = "b".repeat(43);
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-service", SUPABASE_ANON_KEY: "test-anon" } as Env;
afterEach(() => vi.restoreAllMocks());

describe("shared application origin policy", () => {
  it.each(allowed)("accepts %s consistently for CORS and OAuth", origin => {
    expect(isApplicationOrigin(origin)).toBe(true);
    expect(allowedOrigin(origin)).toBe(true);
    const url = new URL(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, origin, challenge, state)!);
    expect(url.searchParams.get("redirect_to")).toBe(`${origin}/auth/teacher-callback?state=${state}`);
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  });

  it.each(rejected)("rejects %s consistently for CORS and OAuth", origin => {
    expect(isApplicationOrigin(origin)).toBe(false);
    expect(allowedOrigin(origin)).toBe(false);
    expect(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, origin, challenge, state)).toBeNull();
  });

  it("permits an omitted HTTP Origin without inventing an OAuth return destination", async () => {
    expect(isApplicationOrigin(null)).toBe(false);
    expect(allowedOrigin(null)).toBe(true);
    expect(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, null, challenge, state)).toBeNull();
    const response = await handleReleaseRequest(new Request("https://worker.test/rooms"), env);
    expect(response.status).toBe(410);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});

describe("new domain public routing", () => {
  it.each(allowed.slice(0, 2))("supports preflight and OAuth start from %s", async origin => {
    const preflight = await handleReleaseRequest(new Request("https://worker.test/classroom/auth/teacher-google-start", {
      method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type, authorization" },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("vary")).toBe("Origin");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(preflight.headers.has("access-control-allow-credentials")).toBe(false);

    vi.spyOn(ClassroomService.prototype, "rate").mockResolvedValue(undefined);
    const response = await handleReleaseRequest(new Request("https://worker.test/classroom/auth/teacher-google-start", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ codeChallenge: challenge, state }),
    }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    const body = await response.json<{ url: string }>();
    expect(new URL(body.url).searchParams.get("redirect_to")).toBe(`${origin}/auth/teacher-callback?state=${state}`);
  });

  it.each(["null", "https://brickgineers.com.evil.test", "https://brickgineers.com:8443"])("blocks HTTP and WebSocket requests from %s before service access", async origin => {
    for (const request of [
      new Request("https://worker.test/classroom/worlds", { method: "OPTIONS", headers: { origin } }),
      new Request("https://worker.test/classroom/worlds", { headers: { origin } }),
      new Request(`https://worker.test/worlds/${"a".repeat(32)}/connect`, { headers: { origin, Upgrade: "websocket" } }),
    ]) {
      const response = await handleReleaseRequest(request, {} as Env);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: "origin_not_allowed" });
      expect(response.headers.has("access-control-allow-origin")).toBe(false);
    }
  });
});
