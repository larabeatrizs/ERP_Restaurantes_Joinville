import { isCategory, isCategoryList, isRecord, isStockId } from '@erp/contracts';
import type { Category, CategoryInput, CategoryList, CategoryQuery } from '@erp/contracts';
import { RequestError } from './api.ts';
export class CategoryRequestError extends RequestError {
  constructor(status: number, public messageText: string, public fields: Record<string, string> = {}) { super(status); }
}
export class CategoryApi {
  constructor(private token: () => Promise<string | undefined>) {}
  private async request(unit: string, route: string, method = 'GET', body?: unknown): Promise<Response> {
    if (!isStockId(unit)) throw new RequestError(404);
    const token = await this.token(); if (!token) throw new RequestError(401);
    const response = await fetch(`/api/unidades/${unit}/categorias${route}`, { method, cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const problem = isRecord(data) && isRecord(data.error) ? data.error : {};
      const fields = isRecord(problem.fields) ? Object.fromEntries(Object.entries(problem.fields).filter((entry): entry is [string, string] => ['descricao', 'tipo_item', 'armazenamento_padrao', 'dias_alerta_validade'].includes(entry[0]) && typeof entry[1] === 'string')) : {};
      throw new CategoryRequestError(response.status, typeof problem.message === 'string' ? problem.message : 'Não foi possível concluir a operação.', fields);
    }
    return response;
  }
  private params(query: CategoryQuery) { return new URLSearchParams({ ...query, offset: String(query.offset) }); }
  async list(unit: string, query: CategoryQuery): Promise<CategoryList> {
    const result: unknown = await (await this.request(unit, `?${this.params(query)}`)).json();
    if (!isCategoryList(result)) throw new RequestError(503); return result;
  }
  async save(unit: string, input: CategoryInput, selected?: Category): Promise<Category> {
    const result: unknown = await (await this.request(unit, selected ? `/${selected.id}` : '', selected ? 'PATCH' : 'POST', selected ? { ...input, revisao: selected.revisao } : input)).json();
    if (!isRecord(result) || !isCategory(result.categoria)) throw new RequestError(503); return result.categoria;
  }
  async status(unit: string, selected: Category): Promise<void> { await this.request(unit, `/${selected.id}/status`, 'POST', { revisao: selected.revisao, status: selected.status === 'ATIVO' ? 'INATIVO' : 'ATIVO' }); }
  async remove(unit: string, selected: Category): Promise<void> { await this.request(unit, `/${selected.id}`, 'DELETE', { revisao: selected.revisao }); }
  async exportCsv(unit: string, query: CategoryQuery): Promise<Blob> { return (await this.request(unit, `/exportar?${this.params({ ...query, offset: 0 })}`)).blob(); }
}
export function categoryError(error: unknown): string {
  if (error instanceof CategoryRequestError) return error.messageText;
  if (error instanceof RequestError && error.status === 401) return 'Sua sessão expirou. Entre novamente.';
  return 'Não foi possível concluir a operação. Seus dados foram preservados; tente novamente.';
}
