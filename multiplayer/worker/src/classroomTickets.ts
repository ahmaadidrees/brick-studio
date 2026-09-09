import { ClassroomHttpError } from "./classroom";
export interface LiveTicketIdentity {
  userId: string;
  sessionId: string;
  authVersion: number;
  worldId: string;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function canonicalWorldId(value: string): string | null {
  const compact = value.toLowerCase().replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/.test(compact)) return null;
  const id = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  return value.toLowerCase() === compact || value.toLowerCase() === id
    ? id
    : null;
}
function encode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function decode(value: string): Uint8Array {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
async function key(secret?: string) {
  if (!secret || secret.length < 32)
    throw new ClassroomHttpError(
      503,
      "live_not_configured",
      "Live collaboration is not configured.",
    );
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function issueLiveTicket(
  identity: LiveTicketIdentity,
  secret?: string,
  now = Date.now(),
) {
  const payload = encode(
    new TextEncoder().encode(
      JSON.stringify({
        ...identity,
        exp: Math.floor(now / 1000) + 60,
        aud: "brick-live-v1",
      }),
    ),
  );
  const signature = encode(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await key(secret),
        new TextEncoder().encode(payload),
      ),
    ),
  );
  return `${payload}.${signature}`;
}
export async function verifyLiveTicket(
  ticket: string,
  secret?: string,
  now = Date.now(),
): Promise<LiveTicketIdentity> {
  const signingKey = await key(secret);
  try {
    if (
      ticket.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)
    )
      throw Error();
    const [payload, signature] = ticket.split(".");
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        signingKey,
        decode(signature),
        new TextEncoder().encode(payload),
      ))
    )
      throw Error();
    const value = JSON.parse(new TextDecoder().decode(decode(payload)));
    const seconds = Math.floor(now / 1000);
    if (
      value.aud !== "brick-live-v1" ||
      !Number.isInteger(value.exp) ||
      value.exp <= seconds ||
      value.exp > seconds + 60 ||
      !UUID.test(value.userId) ||
      !UUID.test(value.sessionId) ||
      !UUID.test(value.worldId) ||
      !Number.isInteger(value.authVersion) ||
      value.authVersion < 0
    )
      throw Error();
    return {
      userId: value.userId,
      sessionId: value.sessionId,
      worldId: value.worldId,
      authVersion: value.authVersion,
    };
  } catch {
    throw new ClassroomHttpError(
      401,
      "invalid_live_ticket",
      "Sign in and rejoin this world.",
    );
  }
}
