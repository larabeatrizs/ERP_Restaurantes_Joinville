import { ApiError } from '../errors.ts';

export async function readJson(request: Request, maxBytes = 65536): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  if (!request.body) throw new ApiError(400, 'INVALID_JSON', 'Informe um objeto JSON.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', maxBytes === 65536 ? 'O conteúdo excede 64 KiB.' : 'O conteúdo excede o limite de envio.');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'JSON inválido.');
  } finally { reader.releaseLock(); }
}
