import { isRecord, isPositiveBigint } from '@erp/contracts';
import type { AvailableProductList, ProductLinkInput, ProdutoInput, Product, EntradaInput, Receipt, StockContext, ProductList, ReceiptList, StockBalances } from '@erp/contracts';
import { RequestError } from './api.ts';

export class StockApi {
  constructor(private token: () => Promise<string | undefined>) {}

  private async request(unit: string, route: string, body?: unknown, method = 'POST'): Promise<Record<string, unknown>> {
    if (!isPositiveBigint(unit)) throw new RequestError(404);
    const token = await this.token();
    if (!token) throw new RequestError(401);
    const response = await fetch(`/api/unidades/${unit}${route}`, {
      method: body === undefined ? 'GET' : method,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new RequestError(response.status);
    const data: unknown = await response.json();
    if (!isRecord(data)) throw new RequestError(503);
    return data;
  }

  async context(unit: string): Promise<StockContext> {
    const data = await this.request(unit, '/estoque/contexto');
    if (!['medidas', 'categorias', 'fornecedores', 'locais'].every(key => Array.isArray(data[key])) || !isRecord(data.capacidades)
      || !['produto_escrever', 'recebimento_escrever', 'divergencia_aprovar'].every(key => typeof (data.capacidades as Record<string, unknown>)[key] === 'boolean')) throw new RequestError(503);
    return data as unknown as StockContext;
  }

  async products(unit: string, query = '', status = 'ATIVO', offset = 0): Promise<ProductList> {
    const params = new URLSearchParams({ q: query, status, offset: String(offset) });
    const data = await this.request(unit, `/produtos?${params}`);
    if (!Array.isArray(data.produtos) || !Number.isSafeInteger(data.total)) throw new RequestError(503);
    return data as unknown as ProductList;
  }

  async saveProduct(unit: string, input: ProdutoInput, product?: Product): Promise<Product> {
    const data = await this.request(unit, product ? `/produtos/${product.id}` : '/produtos',
      product ? { ...input, revisao: product.revisao } : input, product ? 'PATCH' : 'POST');
    if (!isRecord(data.produto) || typeof data.produto.id !== 'string' || typeof data.produto.revisao !== 'string') throw new RequestError(503);
    return data.produto as unknown as Product;
  }
  async availableProducts(unit: string, query = '', offset = 0): Promise<AvailableProductList> {
    const data = await this.request(unit, `/produtos/disponiveis?${new URLSearchParams({ q: query, offset: String(offset) })}`);
    if (!Array.isArray(data.produtos) || !Number.isSafeInteger(data.total)) throw new RequestError(503);
    return data as unknown as AvailableProductList;
  }
  async linkProduct(unit: string, id: string, input: ProductLinkInput): Promise<Product> {
    if (!isPositiveBigint(id)) throw new RequestError(404);
    const data = await this.request(unit, `/produtos/${id}/vinculo`, input);
    if (!isRecord(data.produto) || data.produto.id !== id || typeof data.produto.revisao !== 'string') throw new RequestError(503);
    return data.produto as unknown as Product;
  }

  async receipts(unit: string): Promise<ReceiptList> {
    const data = await this.request(unit, '/entradas');
    if (!Array.isArray(data.entradas)) throw new RequestError(503);
    return data as unknown as ReceiptList;
  }

  private async receiptMutation(unit: string, route: string, body: unknown): Promise<Receipt> {
    const data = await this.request(unit, route, body);
    if (!isRecord(data.entrada) || typeof data.entrada.id !== 'string' || !Array.isArray(data.entrada.itens)) throw new RequestError(503);
    return data.entrada as unknown as Receipt;
  }

  createReceipt(unit: string, input: EntradaInput): Promise<Receipt> {
    return this.receiptMutation(unit, '/entradas', input);
  }
  confirmReceipt(unit: string, id: string, key: string): Promise<Receipt> {
    return this.receiptMutation(unit, `/entradas/${id}/confirmar`, { chave: key });
  }
  approveReceipt(unit: string, id: string, reason: string): Promise<Receipt> {
    return this.receiptMutation(unit, `/entradas/${id}/aprovar-divergencia`, { motivo: reason });
  }
  async balances(unit: string): Promise<StockBalances> {
    const data = await this.request(unit, '/estoque/saldos');
    if (!Array.isArray(data.saldos)) throw new RequestError(503);
    return data as unknown as StockBalances;
  }
}

export function stockError(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.status === 401) return 'Sua sessão precisa ser renovada. Entre novamente para continuar.';
    if (error.status === 403) return 'Você não tem permissão para esta ação. A aprovação também exige uma pessoa diferente de quem registrou a entrada.';
    if (error.status === 404) return 'Registro indisponível para esta unidade. Atualize a consulta.';
    if (error.status === 409) return 'Operação em conflito. Confira se a nota já foi registrada ou se há uma divergência pendente de aprovação.';
    if (error.status === 412) return 'Outra pessoa alterou este produto. Sua edição foi preservada; volte à lista e reabra o registro para carregar a versão atual.';
    if (error.status === 400 || error.status === 422) return 'Verifique os campos informados. Os dados digitados foram preservados.';
  }
  return 'Não foi possível concluir a operação. Seus dados foram preservados. Tente novamente.';
}

/** Presentation keeps decimal strings exact; identifiers never pass through Number. */
export function decimalLabel(value: string, minimumFraction = 0): string {
  const [whole = '0', raw = ''] = value.split('.');
  const fraction = raw.replace(/0+$/, '').padEnd(minimumFraction, '0');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction ? `,${fraction}` : '');
}
export function decimalInput(value: string, signed = false): string {
  const clean = value.trim().replace(',', '.');
  if (!(signed ? /^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/ : /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/).test(clean)) throw new Error('Informe números com até seis casas decimais, sem separador de milhar.');
  return clean;
}
export function decimalUnits(value: string): bigint {
  if (!/^-?\d+(\.\d{1,12})?$/.test(value)) throw new Error('Decimal inválido.');
  const normalized = value;
  const negative = normalized.startsWith('-');
  const [integer = '0', fraction = ''] = normalized.replace(/^-/, '').split('.');
  const amount = BigInt(integer) * 1000000000000n + BigInt(fraction.padEnd(12, '0'));
  return negative ? -amount : amount;
}
