import { isSupplier, isSupplierList, isRecord, isStockId, supplierFields } from '@erp/contracts';
import type { Supplier, SupplierInput, SupplierList, SupplierQuery } from '@erp/contracts';
import { RequestError } from './api.ts';
export class SupplierRequestError extends RequestError {
  constructor(status: number, public messageText: string, public fields: Record<string, string> = {}) { super(status); }
}
export class SupplierApi {
  constructor(private token: () => Promise<string | undefined>) {}
  private async request(unit: string, route: string, method = 'GET', body?: unknown): Promise<Response> {
    if (!isStockId(unit)) throw new RequestError(404);
    const token = await this.token(); if (!token) throw new RequestError(401);
    const response = await fetch(`/api/unidades/${unit}/fornecedores${route}`, { method, cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const problem = isRecord(data) && isRecord(data.error) ? data.error : {};
      const fields = isRecord(problem.fields) ? Object.fromEntries(Object.entries(problem.fields).filter((entry): entry is [string, string] => supplierFields.includes(entry[0]) && typeof entry[1] === 'string')) : {};
      throw new SupplierRequestError(response.status, typeof problem.message === 'string' ? problem.message : 'Não foi possível concluir a operação.', fields);
    }
    return response;
  }
  private params(query: SupplierQuery) { return new URLSearchParams({ ...query, offset: String(query.offset) }); }
  async list(unit: string, query: SupplierQuery): Promise<SupplierList> {
    const result: unknown = await (await this.request(unit, `?${this.params(query)}`)).json();
    if (!isSupplierList(result)) throw new RequestError(503); return result;
  }
  async save(unit: string, input: SupplierInput, selected?: Supplier): Promise<Supplier> {
    const result: unknown = await (await this.request(unit, selected ? `/${selected.id}` : '', selected ? 'PATCH' : 'POST', selected ? { ...input, revisao: selected.revisao } : input)).json();
    if (!isRecord(result) || !isSupplier(result.fornecedor)) throw new RequestError(503); return result.fornecedor;
  }
  async status(unit: string, selected: Supplier): Promise<void> { await this.request(unit, `/${selected.id}/status`, 'POST', { revisao: selected.revisao, status: selected.status === 'ATIVO' ? 'INATIVO' : 'ATIVO' }); }
  async remove(unit: string, selected: Supplier): Promise<void> { await this.request(unit, `/${selected.id}`, 'DELETE', { revisao: selected.revisao }); }
  async exportCsv(unit: string, query: SupplierQuery): Promise<Blob> { return (await this.request(unit, `/exportar?${this.params({ ...query, offset: 0 })}`)).blob(); }
}
export function supplierError(error: unknown): string {
  if (error instanceof SupplierRequestError) return error.messageText;
  if (error instanceof RequestError && error.status === 401) return 'Sua sessão expirou. Entre novamente.';
  return 'Não foi possível concluir a operação. Seus dados foram preservados; tente novamente.';
}
