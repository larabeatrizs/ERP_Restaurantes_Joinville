import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockDecimal, isStockId, isText } from './stock.ts';

export interface ExpiringStockLot {
  lote_id: string;
  lote: string;
  produto: string;
  validade: string;
  unidade_medida: string;
  quantidade: string;
  valor_unitario: string;
  situacao: 'VENCIDO' | 'A_VENCER';
}

export interface StockExpiry {
  unidade_id: string;
  data_referencia: string;
  lotes: ExpiringStockLot[];
}

export function isStockExpiry(value: unknown, unit: string): value is StockExpiry {
  if (!isRecord(value) || !hasExactFields(value, ['unidade_id', 'data_referencia', 'lotes'])
    || value.unidade_id !== unit || !isIsoDate(value.data_referencia) || !Array.isArray(value.lotes)) return false;
  const seen = new Set<string>();
  let previousDate = '';
  let previousId = 0n;
  for (const lot of value.lotes as unknown[]) {
    if (!isRecord(lot) || !hasExactFields(lot, ['lote_id', 'lote', 'produto', 'validade', 'unidade_medida', 'quantidade', 'valor_unitario', 'situacao'])
      || !isStockId(lot.lote_id) || seen.has(lot.lote_id) || !isIsoDate(lot.validade)
      || !isText(lot.lote, 100) || !isText(lot.produto, 200) || !isText(lot.unidade_medida, 100)
      || !isStockDecimal(lot.quantidade, { calculated: true, positive: true }) || !isStockDecimal(lot.valor_unitario)
      || lot.situacao !== (lot.validade < value.data_referencia ? 'VENCIDO' : 'A_VENCER')) return false;
    const id = BigInt(lot.lote_id);
    if (lot.validade < previousDate || (lot.validade === previousDate && id <= previousId)) return false;
    previousDate = lot.validade;
    previousId = id;
    seen.add(lot.lote_id);
  }
  return true;
}
