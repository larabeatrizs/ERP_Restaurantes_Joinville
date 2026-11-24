import { isRecord } from './index.ts';
import type { AdminUserInput } from './admin-users.ts';
import { hasExactFields, isStockId } from './stock.ts';

export interface UserStockPeriodAccess {
  unidade_id: string;
  fechar: boolean;
  reabrir: boolean;
}

/** Valida a seleção para unidades e perfil já validados no cadastro. */
export function isUserStockPeriodAccess(
  value: unknown, user: Pick<AdminUserInput, 'perfil' | 'unidades'>,
): value is UserStockPeriodAccess[] {
  if (!Array.isArray(value)) return false;
  const units = new Set(user.unidades);
  const selected = new Set<string>();
  for (const row of value as unknown[]) {
    if (!isRecord(row) || !hasExactFields(row, ['unidade_id', 'fechar', 'reabrir'])
      || !isStockId(row.unidade_id) || !units.has(row.unidade_id) || selected.has(row.unidade_id)
      || typeof row.fechar !== 'boolean' || typeof row.reabrir !== 'boolean'
      || (row.reabrir && user.perfil !== 'GESTOR_CENTRAL')) return false;
    selected.add(row.unidade_id);
  }
  return true;
}
