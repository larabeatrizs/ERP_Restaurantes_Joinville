export const API_VERSION = '0.1.0';
export * from './stock.ts';

/** Liveness do processo; não certifica banco, Auth ou prontidão operacional. */
export interface HealthResponse {
  status: 'ok';
  service: 'erp-api';
  version: string;
}

export interface ErrorResponse {
  error: { code: string; message: string };
}

export interface ConfigurationFields {
  modo_saida: 'PREVIA' | 'POSTERIOR';
  margem_percentual: string;
  dias_alerta_validade: number;
  prazo_amostra_horas: number;
  periodicidade_inventario_dias: number;
  referencia_preco: 'MENOR_COTACAO' | 'ULTIMO_PAGO' | 'MEDIA_LOTES';
  alerta_email_habilitado: boolean;
}
export interface Configuration extends ConfigurationFields { unidade_id: string; revisao: string }
export interface ConfigurationPatch { campos: Partial<ConfigurationFields>; motivo: string }
export interface ConfigurationResult { configuracao: Configuration; pode_editar: boolean }
export interface UnitSummary { id: string; codigo: string; nome: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isPositiveBigint(value: string): boolean {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
export function isConfigurationPatch(value: unknown): value is ConfigurationPatch {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'campos,motivo') return false;
  if (typeof value.motivo !== 'string' || value.motivo.trim().length < 3 || value.motivo.length > 500) return false;
  if (!isRecord(value.campos) || Object.keys(value.campos).length === 0) return false;
  return Object.entries(value.campos).every(([key, field]) => {
    switch (key) {
      case 'modo_saida': return field === 'PREVIA' || field === 'POSTERIOR';
      case 'referencia_preco': return typeof field === 'string' && ['MENOR_COTACAO', 'ULTIMO_PAGO', 'MEDIA_LOTES'].includes(field);
      case 'margem_percentual': return typeof field === 'string' && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(field) && Number(field) <= 100;
      case 'dias_alerta_validade': return typeof field === 'number' && Number.isInteger(field) && field >= 0 && field <= 2147483647;
      case 'prazo_amostra_horas':
      case 'periodicidade_inventario_dias': return typeof field === 'number' && Number.isInteger(field) && field > 0 && field <= 2147483647;
      case 'alerta_email_habilitado': return typeof field === 'boolean';
      default: return false;
    }
  });
}
export * from './categories.ts';
export * from './password.ts';
export * from './login.ts';
export * from './measures.ts';
export * from './csv.ts';
export * from './stock-summary.ts';
