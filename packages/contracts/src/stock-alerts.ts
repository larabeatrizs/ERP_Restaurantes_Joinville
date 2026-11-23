import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockId, isText } from './stock.ts';

export interface StockAlert {
  id: string;
  produto: string;
  tipo: 'ESTOQUE_MINIMO' | 'LOTE_VENCIDO' | 'LOTE_A_VENCER';
  lote: string | null;
  validade: string | null;
}

export interface StockAlerts {
  unidade_id: string;
  alertas: StockAlert[];
}

export function isStockAlerts(value: unknown, unit: string): value is StockAlerts {
  return isRecord(value) && hasExactFields(value, ['unidade_id', 'alertas'])
    && value.unidade_id === unit && Array.isArray(value.alertas)
    && value.alertas.every((row: unknown) => isRecord(row)
      && hasExactFields(row, ['id', 'produto', 'tipo', 'lote', 'validade'])
      && isStockId(row.id) && isText(row.produto, 200)
      && (row.tipo === 'ESTOQUE_MINIMO' ? row.lote === null && row.validade === null
        : (row.tipo === 'LOTE_VENCIDO' || row.tipo === 'LOTE_A_VENCER') && isText(row.lote, 100) && isIsoDate(row.validade)));
}
