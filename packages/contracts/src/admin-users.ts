import { isRecord } from './index.ts';
import { normalizeLogin } from './login.ts';
import { hasExactFields, isStockId } from './stock.ts';

/** RF-008 / ADM-002: domain draft only. Validation never authorizes provisioning. */
export const adminProfileCodes = [
  'ADMIN', 'GESTOR_CENTRAL', 'GESTOR_UNIDADE', 'NUTRICIONISTA',
  'ESTOQUISTA', 'COZINHA', 'ATENDIMENTO_SOCIAL', 'AUDITOR',
] as const;
export type AdminProfileCode = typeof adminProfileCodes[number];
export const adminProfileLabels: Record<AdminProfileCode, string> = { ADMIN:'Administrador',GESTOR_CENTRAL:'Gestor central',GESTOR_UNIDADE:'Gestor da unidade',NUTRICIONISTA:'Nutricionista',ESTOQUISTA:'Estoquista',COZINHA:'Cozinha',ATENDIMENTO_SOCIAL:'Atendimento social',AUDITOR:'Auditor / consulta' };
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
export interface AdminUserRow {
  id: string; nome: string; login: string | null; email: string | null; perfil: AdminProfileCode;
  status: AdminUserStatus; primeiro_acesso: boolean; unidades: string[];
}
export interface AdminUsersSnapshot {
  pode_criar: boolean; unidades: { id: string; codigo: string; nome: string }[];
  perfis: AdminProfileCode[]; usuarios: AdminUserRow[]; total: number;
}
export function isAdminUsersSnapshot(value: unknown): value is AdminUsersSnapshot {
  return isRecord(value) && typeof value.pode_criar === 'boolean' && Array.isArray(value.unidades)
    && value.unidades.every(u => isRecord(u) && isStockId(u.id) && typeof u.codigo === 'string' && typeof u.nome === 'string')
    && Array.isArray(value.perfis) && value.perfis.every(p => adminProfileCodes.some(code => code === p))
    && typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total >= 0
    && Array.isArray(value.usuarios) && value.usuarios.length <= 25 && value.usuarios.every(u => isRecord(u)
      && typeof u.id === 'string' && /^[a-f0-9-]{36}$/i.test(u.id) && typeof u.nome === 'string'
      && (u.login === null || typeof u.login === 'string') && (u.email === null || typeof u.email === 'string')
      && adminProfileCodes.some(p => p === u.perfil) && ['ATIVO','INATIVO','BLOQUEADO'].includes(String(u.status))
      && typeof u.primeiro_acesso === 'boolean' && Array.isArray(u.unidades) && u.unidades.every(isStockId));
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

/** Syntax only; the server must authorize and audit every change. */
export interface AdminUserEdit {
  nome: string; perfil: AdminProfileCode; unidades: string[]; revisao: string; motivo: string;
}
export type AdminUserEditValidation = { ok: true; value: AdminUserEdit }
  | { ok: false; field: keyof AdminUserEdit | 'formulario'; message: string };
export function validateAdminUserEdit(value: unknown): AdminUserEditValidation {
  if (!isRecord(value) || !hasExactFields(value,['nome','perfil','unidades','revisao','motivo'])) return {ok:false,field:'formulario',message:'Informe somente os campos da edição.'};
  if (!text(value.nome,200)) return {ok:false,field:'nome',message:'Informe o nome de identificação com até 200 caracteres.'};
  if (!adminProfileCodes.some(profile=>profile===value.perfil)) return {ok:false,field:'perfil',message:'Selecione um perfil previsto no sistema.'};
  if (!Array.isArray(value.unidades) || !value.unidades.length || !value.unidades.every(isStockId) || new Set(value.unidades).size!==value.unidades.length) return {ok:false,field:'unidades',message:'Selecione uma ou mais unidades distintas.'};
  if (!isStockId(value.revisao)) return {ok:false,field:'revisao',message:'Recarregue a revisão do cadastro antes de editar.'};
  if (!text(value.motivo,500) || value.motivo.trim().length<3) return {ok:false,field:'motivo',message:'Informe um motivo de 3 a 500 caracteres.'};
  return {ok:true,value:{nome:value.nome.trim(),perfil:value.perfil as AdminProfileCode,unidades:[...value.unidades],revisao:value.revisao,motivo:value.motivo.trim()}};
}
export interface AdminUserDetail extends Omit<AdminUserEdit,'motivo'> {
  id: string; status: AdminUserStatus; primeiro_acesso: boolean; proprio: boolean; pode_editar: boolean;
}
export function isAdminUserDetail(value: unknown): value is AdminUserDetail {
  if(!isRecord(value)||!hasExactFields(value,['id','nome','perfil','status','primeiro_acesso','unidades','revisao','proprio','pode_editar'])||typeof value.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id)
    ||!['ATIVO','INATIVO','BLOQUEADO'].includes(String(value.status))||typeof value.primeiro_acesso!=='boolean'||typeof value.proprio!=='boolean'||typeof value.pode_editar!=='boolean')return false;
  return validateAdminUserEdit({nome:value.nome,perfil:value.perfil,unidades:value.unidades,revisao:value.revisao,motivo:'Validar resposta'}).ok;
}
