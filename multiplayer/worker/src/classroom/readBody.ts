export class ClassroomBodyError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const MAX_BODY_BYTES = 2_000_000;

/** Bound allocation even when a client omits Content-Length or streams chunks. */
export async function readClassroomBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const tooLarge = () => new ClassroomBodyError(413, 'too_large', 'This request is too large.');
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new ClassroomBodyError(400, 'invalid_json', 'Send a JSON object.');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ClassroomBodyError) throw error;
    await reader.cancel().catch(() => undefined);
  } finally {
    reader.releaseLock();
  }
  throw new ClassroomBodyError(400, 'invalid_json', 'Send a JSON object.');
}
