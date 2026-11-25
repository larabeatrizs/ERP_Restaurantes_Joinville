import { csvDocument, stockTotalCents } from '@erp/contracts';
import type { ActiveStatus, Product, Receipt, StockBalance, StockExpiry } from '@erp/contracts';
import { decimalLabel, decimalUnits } from './stock-api.ts';
import type { StockApi } from './stock-api.ts';
import type { StockLossReport, StockLossReportFilter, StockLossReportQuery } from '@erp/contracts';

export interface ConsultationReport {
  title: string; unit: string; generatedAt: string; scope: string; headers: string[]; rows: string[][];
  warningRows?: ReadonlySet<number>;
}
const date = (value: string | null) => value ? value.split('-').reverse().join('/') : '';
const decimal = (value: string | null) => value?.replace('.', ',') ?? '';
function report(title: string, unit: string, scope: string, headers: string[], rows: string[][]): ConsultationReport {
  return { title, unit, scope, headers, rows, generatedAt: new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
  }).format(new Date()) };
}

export const stockLossReportFilterLabels: Record<StockLossReportFilter, string> = {
  produto: 'Produto', categoria: 'Categoria', lote: 'Lote', fornecedor: 'Fornecedor', motivo: 'Motivo',
};

export function stockLossReport(data: StockLossReport, unit: string, userName: string, query: StockLossReportQuery): ConsultationReport {
  function money(value: string): string {
    const cents = (decimalUnits(value) + 5_000_000_000n) / 10_000_000_000n;
    return `R$ ${decimalLabel(`${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, 2)}`;
  }
  function period(value: string): string {
    return data.periodicidade === 'anual' ? value.slice(0, 4) : value.slice(0, 7).split('-').reverse().join('/');
  }
  const filters = (Object.keys(stockLossReportFilterLabels) as StockLossReportFilter[])
    .filter(field => query[field]).map(field => `${stockLossReportFilterLabels[field]}: ${query[field]}`);
  const filterSummary = filters.length ? ` Filtros: ${filters.join(' · ')}.` : '';
  const scope = `Competência ${period(data.inicio)} · ${money(data.prejuizo_atual)} em perdas aprovadas. Período anterior ${period(data.inicio_anterior)} · ${money(data.prejuizo_anterior)}.${filterSummary} Emitido por ${userName || 'Conta conectada'}.`;
  const units = data.unidades && new Map(data.unidades.map(row => [row.id, row.nome]));
  return report('Perdas e descartes', units ? [...units.values()].join(' · ') : unit, scope,
    [...(units ? ['Unidade do lote'] : []), 'Categoria', 'Produto', 'Lote', 'Motivo', 'Prejuízo'],
    data.itens.map(row => [...(units ? [units.get(row.unidade_id ?? '') ?? ''] : []),
      row.categoria, row.produto, row.lote, row.motivo, money(row.prejuizo)]));
}

/** Pages use the current session and fail as a whole on an inconsistent read. */
async function reportProducts(api: Pick<StockApi, 'products'>, unit: string, query: string, status: string): Promise<Product[]> {
  const rows: Product[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  do {
    const page = await api.products(unit, query, status, rows.length);
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.total > 10000) throw new Error('O relatório aceita até 10.000 produtos. Refine a busca e tente novamente.');
    total ??= page.total;
    if (page.total !== total || page.produtos.length !== Math.min(50, total - rows.length)) throw new Error('A consulta mudou durante a geração. Atualize os produtos e tente novamente.');
    for (const row of page.produtos) {
      if (ids.has(row.id) || row.status !== status) throw new Error('A consulta mudou durante a geração. Atualize os produtos e tente novamente.');
      ids.add(row.id); rows.push(row);
    }
  } while (rows.length < total);
  return rows;
}

export async function productReport(api: Pick<StockApi, 'products'>, unit: string, unitName: string, query: string, status: string): Promise<ConsultationReport> {
  const rows = await reportProducts(api, unit, query, status);
  return report('Produtos', unitName, `Busca: ${query || 'todos'} · Situação: ${status === 'ATIVO' ? 'Ativos' : 'Inativos'} · ${rows.length} produtos. Consulta durante a geração; não é fechamento contábil.`,
    ['Produto', 'Complemento', 'Categoria', 'Unidade de medida', 'Armazenamento', 'Apresentação', 'Quantidade da apresentação', 'Estoque mínimo', 'Estoque máximo', 'Ponto de reposição', 'Situação'],
    rows.map(row => [row.descricao, row.complemento, row.categoria_descricao, row.unidade_sigla, row.armazenamento, row.apresentacao_compra, decimal(row.quantidade_apresentacao), decimal(row.estoque_minimo), decimal(row.estoque_maximo), decimal(row.ponto_reposicao), row.status]));
}

export function stockValue(rows: Parameters<typeof stockTotalCents>[0]): string {
  const cents = stockTotalCents(rows);
  return decimalLabel(`${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, 2);
}

export async function stockMinimumReport(
  api: Pick<StockApi, 'balances' | 'products'>, unit: string, unitName: string,
): Promise<ConsultationReport> {
  const [{ saldos }, products] = await Promise.all([api.balances(unit), reportProducts(api, unit, '', 'ATIVO')]);
  const sums = new Map<string, bigint>();
  for (const row of saldos) {
    sums.set(row.produto_id, (sums.get(row.produto_id) ?? 0n) + decimalUnits(row.quantidade));
  }
  const format = (units: bigint) => decimalLabel(`${units / 1000000000000n}.${String(units % 1000000000000n).padStart(12, '0')}`);
  const warningRows = new Set<number>();
  const rows = products.map((product, index) => {
    const current = sums.get(product.id) ?? 0n;
    const minimum = decimalUnits(product.estoque_minimo);
    if (current <= minimum) warningRows.add(index);
    return [product.descricao, product.complemento, product.unidade_sigla, format(current),
      format(minimum), format(current < minimum ? minimum - current : 0n),
      current <= minimum ? '⚠ No mínimo ou abaixo' : 'Acima do mínimo'];
  });
  return { ...report('Estoque mínimo', unitName, 'Saldo agregado por produto ativo da unidade.',
    ['Produto', 'Complemento', 'Medida', 'Saldo', 'Mínimo', 'Falta para o mínimo', 'Situação'], rows), warningRows };
}

export function stockExpiryReport(data: StockExpiry, unitName: string): ConsultationReport {
  return report('Validade e vencimentos', unitName,
    `Referência: ${date(data.data_referencia)}. ${data.lotes.length ? 'Lotes com saldo, por ordem de validade.' : 'Nenhum lote vencido ou a vencer com saldo.'}`,
    ['Produto', 'Lote', 'Validade', 'Situação', 'Saldo', 'Unidade de medida', 'Valor em risco (R$)'],
    data.lotes.map(lot => [
      lot.produto, lot.lote, date(lot.validade), lot.situacao === 'VENCIDO' ? 'Vencido' : 'A vencer',
      decimal(lot.quantidade), lot.unidade_medida, stockValue([lot]),
    ]));
}

export async function stockValueReport(
  api: Pick<StockApi, 'balances' | 'products'>, unit: string, unitName: string,
): Promise<ConsultationReport> {
  const { saldos } = await api.balances(unit);
  const rows = saldos.filter(row => /[1-9]/.test(row.quantidade));
  const statuses: ActiveStatus[] = ['ATIVO', 'INATIVO'];
  const catalog = rows.length ? (await Promise.all(statuses.map(status => reportProducts(api, unit, '', status)))).flat() : [];
  const products = new Map(catalog.map(product => [product.id, product]));
  const changed = 'O catálogo mudou durante a consulta. Atualize o relatório e tente novamente.';
  if (products.size !== catalog.length) throw new Error(changed);

  const categories = new Map<string, { name: string; balances: StockBalance[] }>();
  for (const row of rows) {
    const product = products.get(row.produto_id);
    if (!product) throw new Error(changed);
    const group = categories.get(product.categoria_id) ?? { name: product.categoria_descricao, balances: [] };
    if (group.name !== product.categoria_descricao) throw new Error(changed);
    group.balances.push(row);
    categories.set(product.categoria_id, group);
  }

  const subtotals = [...categories.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map(group => [group.name, stockValue(group.balances)]);
  return report('Valor imobilizado em estoque', unitName, 'Saldo atual de todos os lotes da unidade.',
    ['Categoria', 'Valor em reais'], [...subtotals, ['Total da unidade', stockValue(rows)]]);
}
export function receiptReport(rows: Receipt[], unitName: string): ConsultationReport {
  return report('Recebimentos', unitName, `${rows.length} recebimentos · Até 50 registros mais recentes da consulta carregada; não representa o histórico completo. Cada linha corresponde a um item; rascunhos e itens recusados não creditam estoque.`,
    ['Nota fiscal', 'Fornecedor', 'Data', 'Situação', 'Total da nota', 'Total dos itens', 'Produto', 'Quantidade', 'Unidade de medida', 'Valor unitário', 'Lote informado', 'Validade', 'Local', 'Conformidade'],
    rows.flatMap(row => row.itens.map(item => [row.numero_nf, row.fornecedor, date(row.data_entrada), row.estado, decimal(row.total_nota), decimal(row.total_itens), item.produto, decimal(item.quantidade), item.unidade_medida, decimal(item.valor_unitario), item.numero_lote ?? '', date(item.validade), item.local, item.conformidade])));
}
export function balanceReport(rows: StockBalance[], unitName: string, query: string): ConsultationReport {
  return report('Saldos', unitName, `Pesquisa: ${query || 'todas as posições'} · ${rows.length} posições por lote/local da consulta carregada.`,
    ['Produto', 'Lote', 'Validade', 'Local', 'Quantidade', 'Unidade de medida', 'Valor unitário'],
    rows.map(row => [row.produto, row.lote, date(row.validade), row.local, decimal(row.quantidade), row.unidade_medida, decimal(row.valor_unitario)]));
}
export function reportCsv(data: ConsultationReport): string {
  return csvDocument([['Unidade', 'Gerado em (America/Sao_Paulo)', 'Escopo', ...data.headers],
    ...data.rows.map(row => [data.unit, data.generatedAt, data.scope, ...row])]);
}
export function downloadReport(data: ConsultationReport): void {
  const url = URL.createObjectURL(new Blob([reportCsv(data)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${data.title.toLocaleLowerCase('pt-BR')}.csv`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
