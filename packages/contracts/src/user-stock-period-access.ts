import { isRecord } from './index.ts';
import { validateAdminUserSave } from './admin-users.ts';
import type { AdminUserInput, AdminUserSave, AdminUserValidation } from './admin-users.ts';
import { hasExactFields, isStockId } from './stock.ts';

export interface UserStockPeriodAccess {
  unidade_id: string;
  fechar: boolean;
  reabrir: boolean;
}

export type AdminUserCreation = AdminUserSave & { acessos_periodo?: UserStockPeriodAccess[] };

export function validateAdminUserCreation(value: unknown):
  | { ok: true; value: AdminUserCreation }
  | Extract<AdminUserValidation, { ok: false }> {
  if (!isRecord(value) || !Object.hasOwn(value, 'acessos_periodo')) return validateAdminUserSave(value);
  const { acessos_periodo, ...base } = value;
  const result = validateAdminUserSave(base);
  if (!result.ok) return result;
  if (!isUserStockPeriodAccess(acessos_periodo, result.value)) {
    return { ok: false, field: 'formulario', message: 'Revise os acessos de estoque nas unidades selecionadas.' };
  }
  const selections = acessos_periodo.filter(row => row.fechar || row.reabrir)
    .sort((a, b) => a.unidade_id.localeCompare(b.unidade_id));
  return { ok: true, value: selections.length ? { ...result.value, acessos_periodo: selections } : result.value };
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
