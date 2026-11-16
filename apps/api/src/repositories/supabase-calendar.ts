import { createClient } from '@supabase/supabase-js';
import { calendarInput, isCalendarSnapshot } from '@erp/contracts';
import type { CalendarSessionFactory } from './calendar-repository.ts';
import { ApiError } from '../errors.ts';
function unavailable(): never { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Calendário temporariamente indisponível.'); }
export const createCalendarSession: CalendarSessionFactory = (env, token) => calendarSession(env, token);
export function calendarSession(env: Parameters<CalendarSessionFactory>[0], token: string, fetcher: typeof fetch = fetch): ReturnType<CalendarSessionFactory> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) unavailable();
  let url: URL; try { url = new URL(env.SUPABASE_URL); } catch { unavailable(); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) unavailable();
  const client = createClient(url.origin, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetcher(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) } });
  async function operation(unit: string, action: string, data: object) {
    const result = await client.schema('erp').rpc('calendario_operacao', { p_unidade: unit, p_acao: action, p_dados: data });
    if (result.error) {
      if (result.status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
      if (['PT403', '42501'].includes(result.error.code)) throw new ApiError(403, 'ACCESS_DENIED', 'Você não tem permissão para esta ação.');
      if (result.error.code === 'PT404') throw new ApiError(404, 'NOT_FOUND', 'Unidade indisponível.');
      if (result.error.code === 'PT412') throw new ApiError(412, 'PRECONDITION_FAILED', 'Outra pessoa alterou o calendário. Sua edição foi preservada; recarregue antes de salvar.');
      if (result.error.code === 'PT422') throw new ApiError(422, 'INVALID_CALENDAR', 'Revise dias, horários, capacidades e datas especiais.');
      unavailable();
    }
    if (!isCalendarSnapshot(result.data, unit)) unavailable();
    const s = result.data;
    return { unidade: { id: s.unidade.id, codigo: s.unidade.codigo, nome: s.unidade.nome }, pode_editar: s.pode_editar,
      calendario: s.calendario ? { ...calendarInput(s.calendario), unidade_id: unit, revisao: s.calendario.revisao } : null };
  }
  return { async authenticate() {
    const { data, error } = await client.auth.getUser(token);
    if (error && (!error.status || error.status >= 500)) unavailable();
    if (error || !data.user || data.user.is_anonymous || data.user.aud !== 'authenticated') throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  }, repository: { read: unit => operation(unit, 'ler', {}), save: (unit, input) => operation(unit, 'salvar', input) } };
}
