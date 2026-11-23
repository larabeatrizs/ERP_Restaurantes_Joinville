import { isRecord } from './index.ts';
import { isIsoDate, isStockId } from './stock.ts';

export type StockMovementType = 'ENTRADA' | 'REQUISICAO_RAPIDA';

export interface StockLedgerFilters {
  produto_id: string;
  lote_id?: string;
  data_inicio?: string;
  data_fim?: string;
  tipo?: StockMovementType;
}

const filterFields = new Set(['produto_id', 'lote_id', 'data_inicio', 'data_fim', 'tipo']);

export function isStockLedgerFilters(value: unknown): value is StockLedgerFilters {
  if (!isRecord(value) || !Object.hasOwn(value, 'produto_id') || !isStockId(value.produto_id)) return false;
  if (!Object.keys(value).every(field => filterFields.has(field))) return false;

  const { lote_id, data_inicio, data_fim, tipo } = value;
  if (lote_id !== undefined && !isStockId(lote_id)) return false;
  if (data_inicio !== undefined && !isIsoDate(data_inicio)) return false;
  if (data_fim !== undefined && !isIsoDate(data_fim)) return false;
  if (tipo !== undefined && tipo !== 'ENTRADA' && tipo !== 'REQUISICAO_RAPIDA') return false;

  return data_inicio === undefined || data_fim === undefined || data_inicio <= data_fim;
}
