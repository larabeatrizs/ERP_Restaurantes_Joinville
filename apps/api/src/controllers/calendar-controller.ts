import { isCalendarSave, isIsoDate, isStockId } from '@erp/contracts';
import type { CalendarSessionFactory } from '../repositories/calendar-repository.ts';
import type { StockRuntimeEnv } from '../repositories/stock-repository.ts';
import { CalendarService } from '../services/calendar-service.ts';
import { ApiError } from '../errors.ts';
import { readJson } from './read-json.ts';
export async function calendarController(request: Request, env: StockRuntimeEnv, unit: string, day: boolean, factory: CalendarSessionFactory): Promise<Response> {
  const allow = day ? 'GET' : 'GET, PUT';
  if (!allow.split(', ').includes(request.method)) return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }), { status: 405, headers: { Allow: allow, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  if (!isStockId(unit)) throw new ApiError(400, 'INVALID_ID', 'Identificador inválido.');
  const session = factory(env, token); await session.authenticate(); const service = new CalendarService(session.repository); const url = new URL(request.url);
  const reply = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store, no-transform' } });
  if (day) {
    if (url.searchParams.size !== 1 || url.searchParams.getAll('data').length !== 1 || !isIsoDate(url.searchParams.get('data'))) throw new ApiError(400, 'INVALID_QUERY', 'Informe uma data válida em YYYY-MM-DD.');
    return reply(await service.day(unit, url.searchParams.get('data')!));
  }
  if (url.search) throw new ApiError(400, 'INVALID_QUERY', 'Não use filtros neste recurso.');
  if (request.method === 'GET') return reply(await service.read(unit));
  const input = await readJson(request);
  if (!isCalendarSave(input)) throw new ApiError(422, 'INVALID_CALENDAR', 'Revise dias, horários, capacidades, datas e motivo (3–500 caracteres).');
  return reply(await service.save(unit, input));
}
