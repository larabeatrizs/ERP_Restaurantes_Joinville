import { measuresCsv, measureErrors, hasExactFields, isMeasureInput, isRecord, isStockId } from '@erp/contracts';
import type { MeasureQuery } from '@erp/contracts';
import type { MeasureSessionFactory } from '../repositories/measure-repository.ts';
import type { StockRuntimeEnv } from '../repositories/stock-repository.ts';
import { MeasureService } from '../services/measure-service.ts';
import { ApiError } from '../errors.ts';
import { readJson } from './read-json.ts';

function query(url: URL): MeasureQuery {
  for (const key of url.searchParams.keys()) if (!['q', 'status', 'ordem', 'offset'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
  const q = url.searchParams.get('q') ?? '', status = url.searchParams.get('status') ?? 'ATIVO', ordem = url.searchParams.get('ordem') ?? 'asc', offset = url.searchParams.get('offset') ?? '0';
  if (q.length > 200 || !['ATIVO', 'INATIVO'].includes(status) || !['asc', 'desc'].includes(ordem) || !/^(0|[1-9]\d{0,9})$/.test(offset) || Number(offset) > 2147483647) throw new ApiError(400, 'INVALID_QUERY', 'Filtros inválidos.');
  return { q, status: status as MeasureQuery['status'], ordem: ordem as MeasureQuery['ordem'], offset: Number(offset) };
}
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store, no-transform' } });
export async function measureController(request: Request, env: StockRuntimeEnv, unit: string, route: string, factory: MeasureSessionFactory) {
  const exportCsv = route === 'exportar', match = /^([^/]+)(\/status)?$/.exec(route), id = exportCsv ? undefined : match?.[1];
  const statusAction = !!match?.[2], allow = exportCsv ? 'GET' : id ? statusAction ? 'POST' : 'PATCH, DELETE' : 'GET, POST';
  if (!allow.split(', ').includes(request.method)) return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }), { status: 405, headers: { Allow: allow, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  if (!isStockId(unit) || (id && !isStockId(id))) throw new ApiError(400, 'INVALID_ID', 'Identificador inválido.');
  const session = factory(env, token); await session.authenticate(); const service = new MeasureService(session.repository);
  if (request.method === 'GET') {
    const filters = query(new URL(request.url));
    if (exportCsv && filters.offset !== 0) throw new ApiError(400, 'INVALID_QUERY', 'Exporte todos os resultados filtrados sem offset.');
    const result = await service.list(unit, filters, exportCsv);
    return exportCsv ? new Response(measuresCsv(result.medidas), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="medidas.csv"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : reply(result);
  }
  if (new URL(request.url).search) throw new ApiError(400, 'INVALID_QUERY', 'Não use filtros na gravação.');
  const data = await readJson(request);
  if (!isRecord(data)) throw new ApiError(422, 'INVALID_MEASURE_INPUT', 'Informe um objeto JSON.');
  if (id) {
    if (!isStockId(data.revisao)) throw new ApiError(422, 'INVALID_MEASURE_INPUT', 'Informe a revisão do registro.');
    if (statusAction || request.method === 'DELETE') {
      if (!hasExactFields(data, statusAction ? ['revisao', 'status'] : ['revisao']) || (statusAction && data.status !== 'ATIVO' && data.status !== 'INATIVO')) throw new ApiError(422, 'INVALID_MEASURE_INPUT', 'Revise os campos informados.');
      if (statusAction) return reply({ medida: await service.status(unit, id, data.revisao, data.status as 'ATIVO' | 'INATIVO') });
      await service.remove(unit, id, data.revisao); return reply({ excluida: true });
    }
    const { revisao, ...input } = data;
    if (!isMeasureInput(input)) throw new ApiError(422, 'INVALID_MEASURE_INPUT', 'Revise os campos informados.', measureErrors(input));
    return reply({ medida: await service.save(unit, input, id, revisao) });
  }
  if (!isMeasureInput(data)) throw new ApiError(422, 'INVALID_MEASURE_INPUT', 'Revise os campos informados.', measureErrors(data));
  return reply({ medida: await service.save(unit, data) }, 201);
}
