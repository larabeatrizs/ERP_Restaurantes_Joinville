import type { StockBalance } from './stock.ts';
import { csvDocument } from './csv.ts';
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
export function filterBalances(rows: StockBalance[], query: string): StockBalance[] {
  const q = normalize(query);
  return rows.filter(row => normalize(`${row.produto} ${row.lote} ${row.local}`).includes(q));
}
function units(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000000000n + BigInt(fraction.padEnd(12, '0'));
}
/** Quantity and price stay exact; only the displayed total rounds half up to cents. */
export function stockTotalCents(rows: Pick<StockBalance, 'quantidade' | 'valor_unitario'>[]): bigint {
  const total = rows.reduce((sum, row) => sum + units(row.quantidade) * units(row.valor_unitario), 0n);
  const centScale = 10n ** 22n;
  return (total + centScale / 2n) / centScale;
}
export function balancesCsv(rows: StockBalance[], unit: string): string {
  return csvDocument([['Unidade', 'Produto', 'Lote', 'Validade', 'Local', 'Quantidade', 'Unidade de medida', 'Valor unitário'], ...rows.map(row => [unit, row.produto, row.lote, row.validade?.split('-').reverse().join('/') ?? '', row.local, row.quantidade.replace('.', ','), row.unidade_medida, row.valor_unitario.replace('.', ',')])]);
}
