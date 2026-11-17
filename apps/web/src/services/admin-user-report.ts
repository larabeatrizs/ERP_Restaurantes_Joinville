import { adminProfileLabels, csvDocument } from '@erp/contracts';
import type { AdminUserRow, AdminUsersSnapshot } from '@erp/contracts';
import type { SettingsApi } from './api.ts';

export class AdminUserReportError extends Error {}
export interface AdminUserReport {
  rows: AdminUserRow[]; units: AdminUsersSnapshot['unidades']; query: string; generatedAt: string;
}
/** Current-session reads only. Never download a partial/obviously changing pagination. */
export async function adminUserReport(api: Pick<SettingsApi,'adminUsers'>, query: string): Promise<AdminUserReport> {
  const rows: AdminUserRow[] = [], ids = new Set<string>();
  let total: number | undefined, units: AdminUsersSnapshot['unidades'] | undefined;
  do {
    const page = await api.adminUsers(query, rows.length);
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.total > 10000) throw new AdminUserReportError('O CSV aceita até 10.000 usuários. Refine a pesquisa e tente novamente.');
    total ??= page.total; units ??= page.unidades;
    if (page.total !== total || page.usuarios.length !== Math.min(25,total-rows.length) || JSON.stringify(page.unidades)!==JSON.stringify(units)) throw new AdminUserReportError('A consulta mudou durante a exportação. Atualize a pesquisa e tente novamente.');
    for (const user of page.usuarios) {
      if (ids.has(user.id)) throw new AdminUserReportError('A consulta mudou durante a exportação. Atualize a pesquisa e tente novamente.');
      ids.add(user.id); rows.push(user);
    }
  } while (rows.length < total);
  return { rows, units, query, generatedAt: new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date()) };
}
export function adminUserReportCsv(report: AdminUserReport): string {
  return csvDocument([['Nome','Login','Email','Perfil','Unidades permitidas','Situação','Pesquisa','Gerado em (America/Sao_Paulo)','Escopo'],
    ...report.rows.map(user=>[user.nome,user.login??'Acesso existente',user.email??'Não disponível',adminProfileLabels[user.perfil],
      user.unidades.map(id=>{const unit=report.units.find(unit=>unit.id===id);return unit?`${unit.codigo} — ${unit.nome}`:'Unidade indisponível';}).join(' | '),
      user.primeiro_acesso?'Aguardando primeiro acesso':user.status==='ATIVO'?'Ativo':user.status==='INATIVO'?'Inativo':'Bloqueado',report.query||'Todos',report.generatedAt,
      'Consulta administrativa durante a geração; não é um instantâneo transacional.'])]);
}
export function downloadAdminUserReport(report: AdminUserReport): void {
  const url=URL.createObjectURL(new Blob([adminUserReportCsv(report)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='usuarios.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
