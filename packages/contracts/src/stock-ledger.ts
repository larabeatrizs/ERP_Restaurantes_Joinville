import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockDecimal, isStockId, isText } from './stock.ts';

export type StockMovementType = 'ENTRADA' | 'REQUISICAO_RAPIDA';

export interface StockLedgerFilters {
  produto_id: string;
  lote_id?: string;
  data_inicio?: string;
  data_fim?: string;
  tipo?: StockMovementType;
}

export const stockLedgerPageSize = 50;
export const stockLedgerExportLimit = 10000;

export interface StockLedgerQuery extends StockLedgerFilters {
  offset: number;
  exportar: boolean;
}

export interface StockLedgerMovement {
  id: string;
  ocorrido_em: string;
  lote_id: string;
  lote: string;
  local: string;
  tipo: StockMovementType;
  quantidade: string;
  saldo_apos: string;
}

export interface StockLedger {
  unidade_id: string;
  produto_id: string;
  lote_id: string | null;
  unidade_medida: string;
  saldo_corrente: string;
  total: number;
  itens: StockLedgerMovement[];
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

function isMovement(value: unknown, query: StockLedgerQuery): value is StockLedgerMovement {
  return isRecord(value)
    && hasExactFields(value, ['id', 'ocorrido_em', 'lote_id', 'lote', 'local', 'tipo', 'quantidade', 'saldo_apos'])
    && isStockId(value.id) && isStockId(value.lote_id) && (!query.lote_id || value.lote_id === query.lote_id)
    && isText(value.lote, 100) && isText(value.local, 200)
    && (value.tipo === 'ENTRADA' || value.tipo === 'REQUISICAO_RAPIDA') && (!query.tipo || value.tipo === query.tipo)
    && typeof value.ocorrido_em === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value.ocorrido_em)
    && isIsoDate(value.ocorrido_em.slice(0, 10)) && Number.isFinite(Date.parse(value.ocorrido_em))
    && isStockDecimal(value.quantidade, { signed: true }) && /[1-9]/.test(value.quantidade)
    && (value.quantidade.startsWith('-') === (value.tipo === 'REQUISICAO_RAPIDA'))
    && isStockDecimal(value.saldo_apos, { calculated: true, signed: true });
}

export function isStockLedger(value: unknown, unit: string, query: StockLedgerQuery): value is StockLedger {
  if (!isRecord(value) || !hasExactFields(value, ['unidade_id', 'produto_id', 'lote_id', 'unidade_medida', 'saldo_corrente', 'total', 'itens'])
    || value.unidade_id !== unit || value.produto_id !== query.produto_id || value.lote_id !== (query.lote_id ?? null)
    || !isText(value.unidade_medida, 100) || !isStockDecimal(value.saldo_corrente, { calculated: true })
    || typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.itens)) return false;

  const limit = query.exportar ? stockLedgerExportLimit : stockLedgerPageSize;
  if (value.itens.length !== Math.max(0, Math.min(limit, value.total - query.offset))) return false;
  const seen = new Set<string>();
  let previous: StockLedgerMovement | undefined;
  for (const item of value.itens) {
    if (!isMovement(item, query) || seen.has(item.id)) return false;
    if (previous && (previous.ocorrido_em > item.ocorrido_em
      || (previous.ocorrido_em === item.ocorrido_em && BigInt(previous.id) >= BigInt(item.id)))) return false;
    seen.add(item.id);
    previous = item;
  }
  return true;
}
