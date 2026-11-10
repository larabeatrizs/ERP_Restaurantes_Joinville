import { hasExactFields, isEntradaInput, isProdutoInput, isRecord, isStockId, isText } from '@erp/contracts';
import type { ProductQuery, ProductResult } from '@erp/contracts';
import { ApiError } from '../errors.ts';
import { StockService } from '../services/stock-service.ts';
import type { StockRuntimeEnv, StockSessionFactory } from '../repositories/stock-repository.ts';

async function readJson(request: Request): Promise<unknown> {
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
      if (size > 65536) {
        await reader.cancel();
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'O conteúdo excede 64 KiB.');
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
function invalid(): never { throw new ApiError(422, 'INVALID_STOCK_INPUT', 'Revise os campos informados.'); }
function reply(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
function productReply(value: ProductResult, status = 200): Response {
  return reply(value, status, { ETag: `"prod-${value.produto.id}-${value.produto.revisao}"`, 'Cache-Control': 'no-store, no-transform' });
}
function methodDenied(allow: string, head: boolean): Response {
  const response = reply({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }, 405, { Allow: allow });
  return head ? new Response(null, response) : response;
}
function productQuery(url: URL): ProductQuery {
  for (const key of url.searchParams.keys()) {
    if (!['q', 'status', 'offset'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
  }
  const q = url.searchParams.get('q') ?? '';
  const status = url.searchParams.get('status') ?? 'ATIVO';
  const offset = url.searchParams.get('offset') ?? '0';
  if (q.length > 200 || !['ATIVO', 'INATIVO'].includes(status) || !/^(0|[1-9]\d{0,9})$/.test(offset) || Number(offset) > 2147483647) throw new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
  return { q, status: status as ProductQuery['status'], offset: Number(offset) };
}

export async function stockController(request: Request, env: StockRuntimeEnv, unit: string, route: string, factory: StockSessionFactory): Promise<Response> {
  const productEdit = /^produtos\/([^/]+)$/.exec(route);
  const confirmation = /^entradas\/([^/]+)\/(confirmar|aprovar-divergencia)$/.exec(route);
  const allow = productEdit ? 'PATCH' : confirmation ? 'POST' : route === 'produtos' || route === 'entradas' ? 'GET, POST' : 'GET';
  if (!allow.split(', ').includes(request.method)) return methodDenied(allow, request.method === 'HEAD');
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  if (!isStockId(unit) || (productEdit && !isStockId(productEdit[1])) || (confirmation && !isStockId(confirmation[1]))) throw new ApiError(400, 'INVALID_ID', 'Identificador inválido.');
  const session = factory(env, token);
  await session.authenticate();
  const service = new StockService(session.repository);
  if (route === 'estoque/contexto') return reply(await service.context(unit));
  if (route === 'estoque/saldos') return reply(await service.balances(unit));
  if (route === 'produtos' && request.method === 'GET') return reply(await service.products(unit, productQuery(new URL(request.url))));
  if (route === 'entradas' && request.method === 'GET') return reply(await service.receipts(unit));
  const data = await readJson(request);
  if (route === 'produtos') {
    if (!isProdutoInput(data)) invalid();
    return productReply(await service.saveProduct(unit, data), 201);
  }
  if (productEdit?.[1]) {
    if (!isRecord(data) || !isStockId(data.revisao)) invalid();
    const { revisao, ...input } = data;
    if (!isProdutoInput(input)) invalid();
    return productReply(await service.saveProduct(unit, input, productEdit[1], revisao));
  }
  if (route === 'entradas') {
    if (!isEntradaInput(data)) invalid();
    return reply(await service.createReceipt(unit, data), 201);
  }
  if (confirmation?.[1] && confirmation[2] === 'confirmar') {
    if (!isRecord(data) || !hasExactFields(data, ['chave']) || typeof data.chave !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.chave)) invalid();
    return reply(await service.confirmReceipt(unit, confirmation[1], data.chave));
  }
  if (confirmation?.[1] && confirmation[2] === 'aprovar-divergencia') {
    if (!isRecord(data) || !hasExactFields(data, ['motivo']) || !isText(data.motivo, 500) || data.motivo.trim().length < 3) invalid();
    return reply(await service.approveReceipt(unit, confirmation[1], data.motivo.trim()));
  }
  throw new ApiError(404, 'NOT_FOUND', 'Rota não encontrada.');
}
