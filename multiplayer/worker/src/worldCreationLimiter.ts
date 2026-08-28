import { DurableObject } from "cloudflare:workers";

type LimiterRecord = {
  windowStartedAt: number;
  count: number;
};

export interface WorldCreationLimiterEnv {}

export const WORLD_CREATION_LIMIT = 60;
export const WORLD_CREATION_WINDOW_MS = 60 * 60 * 1000;

const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
});

export function worldCreationLimiterKey(connectingIp: string | null): string {
  const normalized = connectingIp?.trim().toLowerCase() ?? "";
  const trustedIp = normalized.length <= 64 && /^[0-9a-f:.]+$/.test(normalized)
    ? normalized
    : "unknown";
  return `world-create:${trustedIp}`;
}

export class WorldCreationLimiter extends DurableObject<WorldCreationLimiterEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/consume") {
      return json({ error: "not_found" }, 404);
    }

    const now = Date.now();
    let record = await this.ctx.storage.get<LimiterRecord>("window");
    if (!record || now - record.windowStartedAt >= WORLD_CREATION_WINDOW_MS) {
      record = { windowStartedAt: now, count: 0 };
    }
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((record.windowStartedAt + WORLD_CREATION_WINDOW_MS - now) / 1000),
    );
    if (record.count >= WORLD_CREATION_LIMIT) {
      return json(
        { allowed: false, retryAfterSeconds },
        429,
        { "retry-after": String(retryAfterSeconds) },
      );
    }

    record.count += 1;
    await this.ctx.storage.put("window", record);
    await this.ctx.storage.setAlarm(record.windowStartedAt + WORLD_CREATION_WINDOW_MS);
    return json({
      allowed: true,
      remaining: WORLD_CREATION_LIMIT - record.count,
      retryAfterSeconds,
    });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
