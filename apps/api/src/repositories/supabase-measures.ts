import { createClient } from '@supabase/supabase-js';
import { isMeasure, isMeasureList, isRecord } from '@erp/contracts';
import type { MeasureSessionFactory } from './measure-repository.ts';
import type { Measure } from '@erp/contracts';
import { ApiError } from '../errors.ts';
function unavailable(): never { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Cadastro de medidas temporariamente indisponível.'); }
function clean(row: Measure): Measure { return { id: row.id, revisao: row.revisao, sigla: row.sigla, descricao: row.descricao, grandeza: row.grandeza, fator_base: row.fator_base, status: row.status, pode_excluir: row.pode_excluir }; }
export const createSupabaseMeasureSession: MeasureSessionFactory = (env, token) => measureSession(env, token);
export function measureSession(env: Parameters<MeasureSessionFactory>[0], token: string, fetcher: typeof fetch = fetch): ReturnType<MeasureSessionFactory> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) unavailable();
  let url: URL;
  try { url = new URL(env.SUPABASE_URL); } catch { unavailable(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) unavailable();
  const client = createClient(url.origin, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetcher(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) }) },
  });
  async function operation(unit: string, action: string, data: object) {
    const result = await client.schema('erp').rpc('medida_operacao', { p_unidade: unit, p_acao: action, p_dados: data });
    if (result.error) {
      const code = result.error.code;
      if (result.status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
      if (code === 'PT403' || code === '42501') throw new ApiError(403, 'ACCESS_DENIED', 'Você não tem permissão para esta ação.');
      if (code === 'PT404') throw new ApiError(404, 'NOT_FOUND', 'Medida ou unidade indisponível.');
      if (code === 'PT412') throw new ApiError(412, 'PRECONDITION_FAILED', 'Outra pessoa alterou esta medida. Sua edição foi preservada; reabra o registro.');
      if (code === 'PT413') throw new ApiError(413, 'EXPORT_LIMIT', 'A exportação excede 10000 medidas. Refine a busca.');
      if (code === 'PT409' || code === '23505') {
        if (result.error.message === 'MEDIDA_VINCULADA') throw new ApiError(409, 'MEASURE_LINKED', 'Esta medida possui vínculos. Use a inativação se tiver permissão.');
        throw new ApiError(409, 'MEASURE_DUPLICATE', 'Já existe medida com esta descrição.', { descricao: 'Use uma descrição diferente ou consulte as medidas inativas.' });
      }
      if (code === 'PT422') throw new ApiError(422, 'INVALID_MEASURE_INPUT', 'Revise os campos informados.');
      unavailable();
    }
    if (!isRecord(result.data)) unavailable();
    return result.data;
  }
  async function saved(unit: string, action: string, data: object, id?: string) {
    const result = await operation(unit, action, data);
    if (!isMeasure(result.medida) || (id !== undefined && result.medida.id !== id)) unavailable();
    return clean(result.medida);
  }
  return {
    async authenticate() {
      const { data, error } = await client.auth.getUser(token);
      if (error && (!error.status || error.status >= 500)) unavailable();
      if (error || !data.user || data.user.is_anonymous || data.user.aud !== 'authenticated') throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
    },
    repository: {
      async list(unit, query, exporting = false) {
        const result = await operation(unit, exporting ? 'exportar' : 'listar', query);
        if (!isMeasureList(result, exporting ? 10000 : 50)) unavailable();
        return { total: result.total, capacidades: { editar: result.capacidades.editar, ciclo_vida: result.capacidades.ciclo_vida }, medidas: result.medidas.map(clean) };
      },
      save: (unit, input, id, revision) => saved(unit, id ? 'editar' : 'criar', id ? { ...input, id, revisao: revision } : input, id),
      status: (unit, id, revision, status) => saved(unit, 'status', { id, revisao: revision, status }, id),
      async remove(unit, id, revision) { if ((await operation(unit, 'excluir', { id, revisao: revision })).excluida !== true) unavailable(); },
    },
  };
}
