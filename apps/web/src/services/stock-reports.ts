import { csvDocument } from '@erp/contracts';
import type { Product, Receipt, StockBalance } from '@erp/contracts';
import type { StockApi } from './stock-api.ts';

export interface ConsultationReport {
  title: string; unit: string; generatedAt: string; scope: string; headers: string[]; rows: string[][];
}
const date = (value: string | null) => value ? value.split('-').reverse().join('/') : '';
const decimal = (value: string | null) => value?.replace('.', ',') ?? '';
function report(title: string, unit: string, scope: string, headers: string[], rows: string[][]): ConsultationReport {
  return { title, unit, scope, headers, rows, generatedAt: new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
  }).format(new Date()) };
}

/** Pages use the current session/RLS; no partial report escapes on a failed or inconsistent read. */
export async function productReport(api: Pick<StockApi, 'products'>, unit: string, unitName: string, query: string, status: string): Promise<ConsultationReport> {
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
  return report('Produtos', unitName, `Busca: ${query || 'todos'} · Situação: ${status === 'ATIVO' ? 'Ativos' : 'Inativos'} · ${rows.length} produtos. Consulta durante a geração; não é fechamento contábil.`,
    ['Produto', 'Complemento', 'Categoria', 'Unidade de medida', 'Armazenamento', 'Apresentação', 'Quantidade da apresentação', 'Estoque mínimo', 'Estoque máximo', 'Ponto de reposição', 'Situação'],
    rows.map(row => [row.descricao, row.complemento, row.categoria_descricao, row.unidade_sigla, row.armazenamento, row.apresentacao_compra, decimal(row.quantidade_apresentacao), decimal(row.estoque_minimo), decimal(row.estoque_maximo), decimal(row.ponto_reposicao), row.status]));
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
