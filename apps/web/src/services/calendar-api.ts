import { isCalendarSnapshot, isRecord, isStockId } from '@erp/contracts';
import type { CalendarDay, CalendarSave, CalendarSnapshot } from '@erp/contracts';
import { RequestError } from './api.ts';
export class CalendarApi {
  constructor(private token: () => Promise<string | undefined>) {}
  private async request(unit: string, suffix = '', input?: CalendarSave): Promise<unknown> {
    if (!isStockId(unit)) throw new RequestError(404);
    const token = await this.token(); if (!token) throw new RequestError(401);
    const r = await fetch(`/api/unidades/${unit}/calendario${suffix}`, { method: input ? 'PUT' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new RequestError(r.status); return r.json();
  }
  async read(unit: string): Promise<CalendarSnapshot> { const data = await this.request(unit); if (!isCalendarSnapshot(data, unit)) throw new RequestError(503); return data; }
  async save(unit: string, input: CalendarSave): Promise<CalendarSnapshot> { const data = await this.request(unit, '', input); if (!isCalendarSnapshot(data, unit)) throw new RequestError(503); return data; }
  async day(unit: string, date: string): Promise<CalendarDay> {
    const data = await this.request(unit, `/funcionamento?${new URLSearchParams({ data: date })}`);
    if (!isRecord(data) || !isRecord(data.unidade) || data.unidade.id !== unit || !isRecord(data.funcionamento) || data.funcionamento.data !== date || !Array.isArray(data.funcionamento.refeicoes) || typeof data.funcionamento.aberto !== 'boolean') throw new RequestError(503);
    return data.funcionamento as unknown as CalendarDay;
  }
}
export function calendarError(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente.';
    if (error.status === 403) return 'Você não tem permissão para alterar este calendário.';
    if (error.status === 404) return 'Unidade indisponível para sua conta.';
    if (error.status === 412) return 'Outra pessoa alterou o calendário. Sua edição foi preservada. Recarregue e revise as alterações antes de salvar.';
    if (error.status === 413) return 'A configuração excede o limite de 64 KiB. Reduza o conteúdo das descrições.';
    if (error.status === 422) return 'Revise os dias, horários, capacidades, datas especiais e motivo.';
  }
  return 'Não foi possível concluir a operação. Sua edição foi preservada; tente novamente.';
}
