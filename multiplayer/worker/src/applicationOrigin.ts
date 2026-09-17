/** A serialized browser origin, not a callback URL or an arbitrary URL prefix. */
export function isApplicationOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    // Reject paths, credentials, queries, fragments and noncanonical spellings.
    if (url.origin !== origin) return false;
    if (["localhost", "127.0.0.1"].includes(url.hostname)) {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:" && url.port === "" && (
      url.hostname === "brickgineers.com" ||
      url.hostname === "www.brickgineers.com" ||
      url.hostname === "virtual-legos.vercel.app" ||
      /^virtual-legos-[a-z0-9-]+\.vercel\.app$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}
