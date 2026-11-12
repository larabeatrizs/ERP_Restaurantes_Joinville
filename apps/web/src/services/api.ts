import {
  isRecord,
  isConfigurationPatch,
  isPositiveBigint,
} from '@erp/contracts';
import type {
  Configuration,
  ConfigurationPatch,
  ConfigurationResult,
  UnitSummary,
} from '@erp/contracts';
export class RequestError extends Error {
  constructor(public status: number) {
    super('Não foi possível concluir a solicitação.');
  }
}
function configuration(value: unknown): value is Configuration {
  if (
    !isRecord(value) ||
    typeof value.unidade_id !== 'string' ||
    typeof value.revisao !== 'string'
  )
    return false;
  const { unidade_id, revisao, ...campos } = value;
  return (
    isPositiveBigint(unidade_id) &&
    isPositiveBigint(revisao) &&
    isConfigurationPatch({ campos, motivo: 'validar' })
  );
}
export interface SettingsSnapshot extends ConfigurationResult {
  etag: string;
}
export class SettingsApi {
  constructor(private token: () => Promise<string | undefined>) {}
  async identity(): Promise<{ nome: string }> {
    const value: unknown = await (await this.request('/me')).json();
    if (!isRecord(value) || typeof value.nome !== 'string' || !value.nome.trim()) throw new RequestError(503);
    return { nome: value.nome };
  }
  private async request(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.token();
    if (!token) throw new RequestError(401);
    const response = await fetch(`/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new RequestError(response.status);
    return response;
  }
  async units(): Promise<UnitSummary[]> {
    const data: unknown = await (await this.request('/unidades')).json();
    if (
      !isRecord(data) ||
      !Array.isArray(data.unidades) ||
      !data.unidades.every(
        (unit) =>
          isRecord(unit) &&
          typeof unit.id === 'string' &&
          isPositiveBigint(unit.id) &&
          typeof unit.nome === 'string' &&
          typeof unit.codigo === 'string',
      )
    )
      throw new RequestError(503);
    return data.unidades as UnitSummary[];
  }
  async read(unit: string): Promise<SettingsSnapshot> {
    const response = await this.request(`/unidades/${unit}/configuracoes`);
    const data: unknown = await response.json();
    if (
      !isRecord(data) ||
      !configuration(data.configuracao) ||
      data.configuracao.unidade_id !== unit ||
      typeof data.pode_editar !== 'boolean' ||
      response.headers.get('ETag') !==
        `"cfg-${unit}-${data.configuracao.revisao}"`
    )
      throw new RequestError(503);
    return {
      configuracao: data.configuracao,
      pode_editar: data.pode_editar,
      etag: response.headers.get('ETag')!,
    };
  }
  async save(
    unit: string,
    etag: string,
    patch: ConfigurationPatch,
  ): Promise<{ configuracao: Configuration; etag: string }> {
    const response = await this.request(`/unidades/${unit}/configuracoes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(patch),
    });
    const data: unknown = await response.json();
    if (
      !isRecord(data) ||
      !configuration(data.configuracao) ||
      data.configuracao.unidade_id !== unit ||
      response.headers.get('ETag') !==
        `"cfg-${unit}-${data.configuracao.revisao}"`
    )
      throw new RequestError(503);
    return {
      configuracao: data.configuracao,
      etag: response.headers.get('ETag')!,
    };
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.status === 401)
      return 'Sua sessão precisa ser renovada. Entre novamente para continuar.';
    if (error.status === 403)
      return 'Você não tem permissão para esta ação. Sua edição foi preservada.';
    if (error.status === 404)
      return 'Configuração indisponível para esta unidade.';
    if (error.status === 422)
      return 'Verifique os valores informados. Sua edição foi preservada.';
  }
  return 'Serviço indisponível. Tente novamente. Sua edição foi preservada.';
}
