import { isRecord } from './index.ts';
import { hasExactFields, isStockId, isStorageType, isText } from './stock.ts';
import type { ActiveStatus, StorageType } from './stock.ts';
export interface CategoryInput { descricao: string; tipo_item: 'ALIMENTO' | 'LIMPEZA' | 'DESCARTAVEL'; armazenamento_padrao: StorageType; dias_alerta_validade: number | null }
export interface Category extends CategoryInput { id: string; revisao: string; status: ActiveStatus; pode_excluir: boolean }
export interface CategoryQuery { q: string; status: ActiveStatus; ordem: 'asc' | 'desc'; offset: number }
export interface CategoryList { categorias: Category[]; total: number; capacidades: { editar: boolean; ciclo_vida: boolean } }
export const categoryFields = ['descricao', 'tipo_item', 'armazenamento_padrao', 'dias_alerta_validade'] as const;
export function categoryErrors(value: unknown): Record<string, string> {
  if (!isRecord(value) || !hasExactFields(value, categoryFields)) return { formulario: 'Informe somente os campos previstos.' };
  const fields: Record<string, string> = {};
  if (!isText(value.descricao, 200)) fields.descricao = 'Informe a descrição com até 200 caracteres.';
  if (typeof value.tipo_item !== 'string' || !['ALIMENTO', 'LIMPEZA', 'DESCARTAVEL'].includes(value.tipo_item)) fields.tipo_item = 'Selecione o tipo de item.';
  if (!isStorageType(value.armazenamento_padrao)) fields.armazenamento_padrao = 'Selecione o armazenamento padrão.';
  if (value.dias_alerta_validade !== null && (typeof value.dias_alerta_validade !== 'number' || !Number.isInteger(value.dias_alerta_validade) || value.dias_alerta_validade < 0 || value.dias_alerta_validade > 2147483647)) fields.dias_alerta_validade = 'Informe um inteiro de 0 a 2147483647 ou deixe vazio.';
  return fields;
}
export function isCategoryInput(value: unknown): value is CategoryInput { return Object.keys(categoryErrors(value)).length === 0; }
export function isCategory(value: unknown): value is Category {
  if (!isRecord(value)) return false;
  return isCategoryInput(Object.fromEntries(categoryFields.map(key => [key, value[key]]))) && isStockId(value.id) && isStockId(value.revisao)
    && (value.status === 'ATIVO' || value.status === 'INATIVO') && typeof value.pode_excluir === 'boolean';
}
export function isCategoryList(value: unknown, limit = 50): value is CategoryList {
  return isRecord(value) && Array.isArray(value.categorias) && value.categorias.length <= limit && value.categorias.every(isCategory)
    && Number.isSafeInteger(value.total) && (value.total as number) >= value.categorias.length && isRecord(value.capacidades)
    && typeof value.capacidades.editar === 'boolean' && typeof value.capacidades.ciclo_vida === 'boolean';
}
export function categoriesCsv(rows: Category[]): string {
  const cell = (value: string) => '"' + (/^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const types = { ALIMENTO: 'Alimento', LIMPEZA: 'Material de limpeza', DESCARTAVEL: 'Descartável' };
  const storage = { SECO: 'Seco', RESFRIADO: 'Resfriado', CONGELADO: 'Congelado' };
  return '\uFEFF' + [['Descrição', 'Tipo de item', 'Armazenamento padrão', 'Dias de alerta', 'Status'], ...rows.map(row => [row.descricao, types[row.tipo_item], storage[row.armazenamento_padrao], row.dias_alerta_validade === null ? '' : String(row.dias_alerta_validade), row.status === 'ATIVO' ? 'Ativo' : 'Inativo'])].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
