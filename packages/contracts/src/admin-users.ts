import { isRecord } from './index.ts';
import { normalizeLogin } from './login.ts';
import { hasExactFields, isStockId } from './stock.ts';

/** RF-008 / ADM-002: domain draft only. Validation never authorizes provisioning. */
export const adminProfileCodes = [
  'ADMIN', 'GESTOR_CENTRAL', 'GESTOR_UNIDADE', 'NUTRICIONISTA',
  'ESTOQUISTA', 'COZINHA', 'ATENDIMENTO_SOCIAL', 'AUDITOR',
] as const;
export type AdminProfileCode = typeof adminProfileCodes[number];
export type AdminUserStatus = 'ATIVO' | 'INATIVO' | 'BLOQUEADO';
export interface AdminUserInput {
  login: string;
  nome: string;
  email: string;
  perfil: AdminProfileCode;
  unidades: string[];
  status: AdminUserStatus;
}
export interface AdminUserSave extends AdminUserInput {
  revisao: string | null;
  motivo: string;
}
export type AdminUserField = keyof AdminUserSave;
export type AdminUserValidation =
  | { ok: true; value: AdminUserSave }
  | { ok: false; field: AdminUserField | 'formulario'; message: string };

const fields = ['login', 'nome', 'email', 'perfil', 'unidades', 'status', 'revisao', 'motivo'] as const;
const controls = /[\u0000-\u001f\u007f-\u009f]/;
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !controls.test(value);
}
function fail(field: AdminUserField | 'formulario', message: string): AdminUserValidation {
  return { ok: false, field, message };
}

/** Pure syntax validation. Uniqueness, authority, live unit links and Auth state are server concerns. */
export function validateAdminUserSave(value: unknown): AdminUserValidation {
  if (!isRecord(value) || !hasExactFields(value, fields)) return fail('formulario', 'Revise os campos do cadastro.');
  if (typeof value.login !== 'string') return fail('login', 'Informe o nome de login.');
  const login = normalizeLogin(value.login);
  if (login === null || controls.test(value.login)) return fail('login', 'Use de 3 a 40 letras sem acentos, números, ponto, hífen ou sublinhado; comece com letra ou número.');
  if (!text(value.nome, 200)) return fail('nome', 'Informe o nome de identificação com até 200 caracteres.');
  if (!text(value.email, 254)) return fail('email', 'Informe um email válido com até 254 caracteres.');
  const email = value.email.trim().toLowerCase();
  // Conservative initial form syntax; successful parsing is not email ownership verification.
  const emailParts = email.split('@');
  if (emailParts.length !== 2) return fail('email', 'Informe um email válido.');
  const [local, domain] = emailParts;
  if (!local || !domain || local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)
    || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !domain.includes('.') || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return fail('email', 'Informe um email válido.');
  }
  if (!adminProfileCodes.some(profile => profile === value.perfil)) return fail('perfil', 'Selecione um perfil previsto no sistema.');
  if (!Array.isArray(value.unidades) || value.unidades.length === 0 || !value.unidades.every(isStockId)
    || new Set(value.unidades).size !== value.unidades.length) return fail('unidades', 'Selecione uma ou mais unidades distintas.');
  if (value.status !== 'ATIVO' && value.status !== 'INATIVO' && value.status !== 'BLOQUEADO') return fail('status', 'Selecione um status válido.');
  if (value.revisao !== null && !isStockId(value.revisao)) return fail('revisao', 'Atualize a revisão do cadastro.');
  if (!text(value.motivo, 500) || value.motivo.trim().length < 3) return fail('motivo', 'Informe um motivo de 3 a 500 caracteres.');
  return { ok: true, value: {
    login, nome: value.nome.trim(), email, perfil: value.perfil as AdminProfileCode,
    unidades: [...value.unidades], status: value.status, revisao: value.revisao,
    motivo: value.motivo.trim(),
  } };
}
