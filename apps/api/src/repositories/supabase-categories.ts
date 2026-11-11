import { createClient } from '@supabase/supabase-js';
import { isCategory, isCategoryList, isRecord } from '@erp/contracts';
import type { CategorySessionFactory } from './category-repository.ts';
import type { Category } from '@erp/contracts';
import { ApiError } from '../errors.ts';
function unavailable(): never { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Cadastro de categorias temporariamente indisponível.'); }
function clean(row: Category): Category { return { id: row.id, revisao: row.revisao, descricao: row.descricao, tipo_item: row.tipo_item, armazenamento_padrao: row.armazenamento_padrao, dias_alerta_validade: row.dias_alerta_validade, status: row.status, pode_excluir: row.pode_excluir }; }
export const createSupabaseCategorySession: CategorySessionFactory = (env, token) => categorySession(env, token);
export function categorySession(env: Parameters<CategorySessionFactory>[0], token: string, fetcher: typeof fetch = fetch): ReturnType<CategorySessionFactory> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) unavailable();
  let url: URL;
  try { url = new URL(env.SUPABASE_URL); } catch { unavailable(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) unavailable();
  const client = createClient(url.origin, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetcher(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) }) },
  });
  async function operation(unit: string, action: string, data: object) {
    const result = await client.schema('erp').rpc('categoria_operacao', { p_unidade: unit, p_acao: action, p_dados: data });
    if (result.error) {
      const code = result.error.code;
      if (result.status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
      if (code === 'PT403' || code === '42501') throw new ApiError(403, 'ACCESS_DENIED', 'Você não tem permissão para esta ação.');
      if (code === 'PT404') throw new ApiError(404, 'NOT_FOUND', 'Categoria ou unidade indisponível.');
      if (code === 'PT412') throw new ApiError(412, 'PRECONDITION_FAILED', 'Outra pessoa alterou esta categoria. Sua edição foi preservada; reabra o registro.');
      if (code === 'PT413') throw new ApiError(413, 'EXPORT_LIMIT', 'A exportação excede 10000 categorias. Refine a busca.');
      if (code === 'PT409' || code === '23505') {
        if (result.error.message === 'CATEGORIA_VINCULADA') throw new ApiError(409, 'CATEGORY_LINKED', 'Esta categoria possui vínculos. Use a inativação se tiver permissão.');
        throw new ApiError(409, 'CATEGORY_DUPLICATE', 'Já existe categoria com esta descrição.', { descricao: 'Use uma descrição diferente ou consulte as categorias inativas.' });
      }
      if (code === 'PT422') throw new ApiError(422, 'INVALID_CATEGORY_INPUT', 'Revise os campos informados.');
      unavailable();
    }
    if (!isRecord(result.data)) unavailable();
    return result.data;
  }
  async function saved(unit: string, action: string, data: object, id?: string) {
    const result = await operation(unit, action, data);
    if (!isCategory(result.categoria) || (id !== undefined && result.categoria.id !== id)) unavailable();
    return clean(result.categoria);
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
        if (!isCategoryList(result, exporting ? 10000 : 50)) unavailable();
        return { total: result.total, capacidades: { editar: result.capacidades.editar, ciclo_vida: result.capacidades.ciclo_vida }, categorias: result.categorias.map(clean) };
      },
      save: (unit, input, id, revision) => saved(unit, id ? 'editar' : 'criar', id ? { ...input, id, revisao: revision } : input, id),
      status: (unit, id, revision, status) => saved(unit, 'status', { id, revisao: revision, status }, id),
      async remove(unit, id, revision) { if ((await operation(unit, 'excluir', { id, revisao: revision })).excluida !== true) unavailable(); },
    },
  };
}
