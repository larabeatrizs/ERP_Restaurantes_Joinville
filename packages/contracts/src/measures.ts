import { isRecord } from './index.ts';
import { hasExactFields, isStockDecimal, isStockId, isText } from './stock.ts';
import type { ActiveStatus } from './stock.ts';
export type MeasureDimension = 'MASSA' | 'VOLUME' | 'CONTAGEM';
export interface MeasureInput { sigla: string; descricao: string; grandeza: MeasureDimension; fator_base: string | null }
export interface Measure extends MeasureInput { id: string; revisao: string; status: ActiveStatus; pode_excluir: boolean }
export interface MeasureQuery { q: string; status: ActiveStatus; ordem: 'asc' | 'desc'; offset: number }
export interface MeasureList { medidas: Measure[]; total: number; capacidades: { editar: boolean; ciclo_vida: boolean } }
export const measureFields = ['sigla', 'descricao', 'grandeza', 'fator_base'] as const;
export function measureErrors(value: unknown): Record<string, string> {
  if (!isRecord(value) || !hasExactFields(value, measureFields)) return { formulario: 'Informe somente os campos previstos.' };
  const fields: Record<string, string> = {};
  if (!isText(value.sigla, 12)) fields.sigla = 'Informe a sigla com até 12 caracteres.';
  if (!isText(value.descricao, 200)) fields.descricao = 'Informe a descrição com até 200 caracteres.';
  if (typeof value.grandeza !== 'string' || !['MASSA', 'VOLUME', 'CONTAGEM'].includes(value.grandeza)) fields.grandeza = 'Selecione Massa, Volume ou Contagem.';
  if (value.fator_base !== null && !isStockDecimal(value.fator_base, { positive: true })) fields.fator_base = 'Informe um fator positivo com até seis casas decimais ou deixe vazio.';
  return fields;
}
export function isMeasureInput(value: unknown): value is MeasureInput { return Object.keys(measureErrors(value)).length === 0; }
export function isMeasure(value: unknown): value is Measure {
  return isRecord(value) && isMeasureInput(Object.fromEntries(measureFields.map(key => [key, value[key]]))) && isStockId(value.id) && isStockId(value.revisao)
    && (value.status === 'ATIVO' || value.status === 'INATIVO') && typeof value.pode_excluir === 'boolean';
}
export function isMeasureList(value: unknown, limit = 50): value is MeasureList {
  return isRecord(value) && Array.isArray(value.medidas) && value.medidas.length <= limit && value.medidas.every(isMeasure)
    && Number.isSafeInteger(value.total) && (value.total as number) >= value.medidas.length && isRecord(value.capacidades)
    && typeof value.capacidades.editar === 'boolean' && typeof value.capacidades.ciclo_vida === 'boolean';
}
export function measuresCsv(rows: Measure[]): string {
  const cell = (value: string) => '"' + (/^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const dimensions = { MASSA: 'Massa', VOLUME: 'Volume', CONTAGEM: 'Contagem' };
  return '\uFEFF' + [['Sigla', 'Descrição', 'Grandeza', 'Fator-base', 'Status'], ...rows.map(row => [row.sigla, row.descricao, dimensions[row.grandeza], row.fator_base?.replace('.', ',') ?? '', row.status === 'ATIVO' ? 'Ativo' : 'Inativo'])].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
