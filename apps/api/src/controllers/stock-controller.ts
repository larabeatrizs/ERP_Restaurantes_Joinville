import { readJson } from './read-json.ts';
import { hasExactFields, isEntradaInput, isProductLinkInput, isProdutoInput, isRecord, isStockId, isText } from '@erp/contracts';
import { isStockLedgerFilters } from '@erp/contracts';
import type { ProductQuery, ProductResult, StockLedgerQuery } from '@erp/contracts';
import { ApiError } from '../errors.ts';
import { StockService } from '../services/stock-service.ts';
import type { StockRuntimeEnv, StockSessionFactory } from '../repositories/stock-repository.ts';


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

function ledgerQuery(url: URL): StockLedgerQuery {
  const error = new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
  for (const key of url.searchParams.keys()) {
    if (url.searchParams.getAll(key).length !== 1) throw error;
  }
  const { offset = '0', exportar, ...filters } = Object.fromEntries(url.searchParams);
  if (!isStockLedgerFilters(filters) || !/^(0|[1-9]\d{0,9})$/.test(offset) || Number(offset) > 2147483647
    || (exportar !== undefined && (exportar !== '1' || offset !== '0'))) throw error;
  return { ...filters, offset: Number(offset), exportar: exportar === '1' };
}

export async function stockController(request: Request, env: StockRuntimeEnv, unit: string, route: string, factory: StockSessionFactory): Promise<Response> {
  const importedCompletion=/^produtos-importados\/([^/]+)\/concluir$/.exec(route);
  const productEdit = route === 'produtos/disponiveis' ? null : /^produtos\/([^/]+)$/.exec(route);
  const productLink = /^produtos\/([^/]+)\/vinculo$/.exec(route);
  const productStatus = /^produtos\/([^/]+)\/status$/.exec(route);
  const confirmation = /^entradas\/([^/]+)\/(confirmar|aprovar-divergencia)$/.exec(route);
  const allow = productEdit ? 'PATCH, DELETE' : confirmation || productLink || productStatus || importedCompletion ? 'POST' : route === 'produtos' || route === 'entradas' ? 'GET, POST' : 'GET';
  if (!allow.split(', ').includes(request.method)) return methodDenied(allow, request.method === 'HEAD');
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  if (!isStockId(unit) || (productEdit && !isStockId(productEdit[1])) || (productLink && !isStockId(productLink[1])) || (productStatus && !isStockId(productStatus[1])) || (confirmation && !isStockId(confirmation[1]))) throw new ApiError(400, 'INVALID_ID', 'Identificador inválido.');
  const session = factory(env, token);
  await session.authenticate();
  const service = new StockService(session.repository);
  if(route==='produtos-importados'){
    const url=new URL(request.url);if(url.searchParams.has('status'))throw new ApiError(400,'INVALID_QUERY','Filtros inválidos.');
    const {q,offset}=productQuery(url);return reply(await service.importedProducts(unit,{q,offset}));
  }
  if(importedCompletion){if(!isStockId(importedCompletion[1])||new URL(request.url).search)throw new ApiError(400,'INVALID_ID','Identificador inválido.');const input=await readJson(request);if(!isProdutoInput(input))invalid();return productReply(await service.completeImportedProduct(unit,importedCompletion[1],input));}
  if (route === 'produtos/disponiveis') {
    const url = new URL(request.url);
    if (url.searchParams.has('status')) throw new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
    const { q, offset } = productQuery(url);
    return reply(await service.availableProducts(unit, { q, offset }));
  }
  if (route === 'estoque/contexto') return reply(await service.context(unit));
  if (route === 'estoque/saldos') return reply(await service.balances(unit));
  if (route === 'estoque/extrato') return reply(await service.ledger(unit, ledgerQuery(new URL(request.url))));
  if (route === 'produtos' && request.method === 'GET') return reply(await service.products(unit, productQuery(new URL(request.url))));
  if (route === 'entradas' && request.method === 'GET') return reply(await service.receipts(unit));
  const data = await readJson(request);
  if (productStatus?.[1]) {
    if (!isRecord(data) || !hasExactFields(data, ['revisao', 'status']) || !isStockId(data.revisao) || (data.status !== 'ATIVO' && data.status !== 'INATIVO')) invalid();
    return productReply(await service.setProductStatus(unit, productStatus[1], data.revisao, data.status));
  }
  if (productEdit?.[1] && request.method === 'DELETE') {
    if (!isRecord(data) || !hasExactFields(data, ['revisao']) || !isStockId(data.revisao)) invalid();
    return reply(await service.deleteProduct(unit, productEdit[1], data.revisao));
  }
  if (productLink?.[1]) {
    if (!isProductLinkInput(data)) invalid();
    return productReply(await service.linkProduct(unit, productLink[1], data));
  }
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
