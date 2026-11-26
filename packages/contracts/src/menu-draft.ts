import { isRecord } from './index.ts';
import { mealTypes } from './calendar.ts';
import type { MealType } from './calendar.ts';
import { hasExactFields, isIsoDate, isStockId } from './stock.ts';

const periodFields = ['inicio', 'fim', 'tipo_periodo'];
export interface MenuPeriod { inicio: string; fim: string; tipo_periodo: 'SEMANAL' | 'MENSAL' }
export interface MenuMeal { data: string; tipo_refeicao: MealType }
export interface MenuGrade { refeicoes: MenuMeal[] }
export interface MenuDraft extends MenuPeriod { chave: string; refeicoes: (MenuMeal & { estimadas: number })[] }
export interface MenuDraftResult { cardapio_id: string; versao_id: string }

export function isMenuPeriod(value: unknown): value is MenuPeriod {
  if (!isRecord(value) || !hasExactFields(value, periodFields) || !isIsoDate(value.inicio) || !isIsoDate(value.fim)
    || (value.tipo_periodo !== 'SEMANAL' && value.tipo_periodo !== 'MENSAL')) return false;
  const days = (Date.parse(value.fim) - Date.parse(value.inicio)) / 86_400_000 + 1;
  return days >= 1 && days <= (value.tipo_periodo === 'SEMANAL' ? 7 : 31);
}

function validMeals(rows: unknown, period: MenuPeriod, draft: boolean): boolean {
  if (!Array.isArray(rows) || rows.length > 93 || (draft && rows.length === 0)) return false;
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row) || !hasExactFields(row, draft ? ['data', 'tipo_refeicao', 'estimadas'] : ['data', 'tipo_refeicao'])
      || !isIsoDate(row.data) || row.data < period.inicio || row.data > period.fim
      || !mealTypes.some(meal => meal === row.tipo_refeicao)) return false;
    if (draft && (typeof row.estimadas !== 'number' || !Number.isInteger(row.estimadas) || row.estimadas < 0 || row.estimadas > 2147483647)) return false;
    const key = `${row.data}:${row.tipo_refeicao}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function isMenuDraft(value: unknown): value is MenuDraft {
  if (!isRecord(value) || !hasExactFields(value, [...periodFields, 'chave', 'refeicoes'])) return false;
  const { chave, refeicoes, ...period } = value;
  return isMenuPeriod(period) && typeof chave === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)
    && validMeals(refeicoes, period, true);
}

export function isMenuGrade(value: unknown, period: MenuPeriod): value is MenuGrade {
  return isRecord(value) && hasExactFields(value, ['refeicoes']) && validMeals(value.refeicoes, period, false);
}

export function isMenuDraftResult(value: unknown): value is MenuDraftResult {
  return isRecord(value) && hasExactFields(value, ['cardapio_id', 'versao_id'])
    && isStockId(value.cardapio_id) && isStockId(value.versao_id);
}
