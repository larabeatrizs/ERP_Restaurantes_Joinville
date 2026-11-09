import { createClient } from '@supabase/supabase-js';
import { isPositiveBigint, isRecord, isConfigurationPatch } from '@erp/contracts';
import type { Configuration, ConfigurationFields } from '@erp/contracts';
import type { RuntimeEnv, SettingsSession } from './settings-repository.ts';
import { ApiError } from '../errors.ts';

const columns = 'unidade_id::text,revisao::text,modo_saida,margem_percentual::text,dias_alerta_validade,prazo_amostra_horas,periodicidade_inventario_dias,referencia_preco,alerta_email_habilitado';
function unavailable(): never { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Serviço de configuração indisponível.'); }
function translateError(error: { code?: string } | null, status?: number): void {
  if (!error) return;
  if (status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  switch (error.code) {
    case '42501': throw new ApiError(403, 'ACCESS_DENIED', 'Acesso negado.');
    case 'PT404': throw new ApiError(404, 'NOT_FOUND', 'Configuração não encontrada.');
    case 'PT412': throw new ApiError(412, 'PRECONDITION_FAILED', 'A configuração foi alterada. Recarregue e revise sua edição.');
    case 'PT428': throw new ApiError(428, 'PRECONDITION_REQUIRED', 'Informe a revisão da configuração.');
    case 'PT422': throw new ApiError(422, 'INVALID_CONFIGURATION', 'Configuração inválida.');
    default: unavailable();
  }
}
function normalize(value: unknown): Configuration {
  if (!isRecord(value) || typeof value.unidade_id !== 'string' || typeof value.revisao !== 'string'
    || !isPositiveBigint(value.unidade_id) || !isPositiveBigint(value.revisao)) unavailable();
  const fields = {
    modo_saida: value.modo_saida, margem_percentual: value.margem_percentual,
    dias_alerta_validade: value.dias_alerta_validade, prazo_amostra_horas: value.prazo_amostra_horas,
    periodicidade_inventario_dias: value.periodicidade_inventario_dias,
    referencia_preco: value.referencia_preco, alerta_email_habilitado: value.alerta_email_habilitado,
  };
  if (!isConfigurationPatch({ campos: fields, motivo: 'Validação do retorno' })) unavailable();
  return { ...(fields as ConfigurationFields), unidade_id: value.unidade_id, revisao: value.revisao };
}

/** Cliente por requisição; não persiste sessão nem utiliza credencial administrativa. */
export function createSupabaseSession(env: RuntimeEnv, token: string, fetcher: typeof fetch = fetch): SettingsSession {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) unavailable();
  let url: URL;
  try { url = new URL(env.SUPABASE_URL); } catch { unavailable(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') unavailable();
  const client = createClient(url.origin, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetcher(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      }),
    },
  });
  const database = client.schema('erp');
  return {
    async authenticate() {
      const { data, error } = await client.auth.getUser(token);
      if (error && (!error.status || error.status >= 500)) unavailable();
      if (error || !data.user || data.user.is_anonymous || data.user.aud !== 'authenticated') {
        throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
      }
    },
    repository: {
      async listUnits() {
        const { data, error, status } = await database.from('unidade').select('id::text,codigo,nome').eq('status', 'ATIVO').order('nome');
        translateError(error, status);
        if (!Array.isArray(data)) unavailable();
        return data.map((item: unknown) => {
          if (!isRecord(item) || typeof item.id !== 'string' || !isPositiveBigint(item.id)
            || typeof item.nome !== 'string' || !item.nome.trim() || typeof item.codigo !== 'string') unavailable();
          return { id: item.id, nome: item.nome, codigo: item.codigo };
        });
      },
      async read(unit) {
        const { data, error, status } = await database.from('parametro_unidade').select(columns).eq('unidade_id', unit).maybeSingle();
        translateError(error, status);
        if (!data) throw new ApiError(404, 'NOT_FOUND', 'Configuração não encontrada.');
        const configuration = normalize(data);
        if (configuration.unidade_id !== unit) unavailable();
        const permissions = await database.from('perfil_permissao').select('permissao').eq('permissao', 'CONFIGURACAO_EDITAR');
        translateError(permissions.error, permissions.status);
        const editable = Array.isArray(permissions.data) && permissions.data.some((item: unknown) => isRecord(item) && item.permissao === 'CONFIGURACAO_EDITAR');
        return { configuracao: configuration, pode_editar: editable };
      },
      async update(unit, revision, patch) {
        const { data, error, status } = await database.rpc('atualizar_configuracao', {
          p_unidade: unit, p_revisao: revision, p_campos: patch.campos, p_motivo: patch.motivo.trim(),
        }).select(columns).single();
        translateError(error, status);
        const configuration = normalize(data);
        if (configuration.unidade_id !== unit) unavailable();
        return configuration;
      },
    },
  };
}
