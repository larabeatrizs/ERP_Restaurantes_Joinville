import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockDecimal, isStockId, isText } from './stock.ts';

export type StockLossReviewState = 'APROVADA' | 'REJEITADA';

export interface PendingStockLoss {
  id: string;
  data_registro: string;
  produto: string;
  lote: string;
  local: string;
  unidade_medida: string;
  motivo: string;
  justificativa: string;
  quantidade: string;
  valor_prejuizo: string;
}

export interface StockLossPanel {
  unidade_id: string;
  perdas: PendingStockLoss[];
}

export function isStockLossDecision(value: unknown): value is StockLossReviewState {
  return value === 'APROVADA' || value === 'REJEITADA';
}

export function isStockLossPanel(value: unknown, unit: string): value is StockLossPanel {
  return isRecord(value) && hasExactFields(value, ['unidade_id', 'perdas'])
    && value.unidade_id === unit && Array.isArray(value.perdas) && value.perdas.length <= 50
    && value.perdas.every(row => isRecord(row) && hasExactFields(row, [
      'id', 'data_registro', 'produto', 'lote', 'local', 'unidade_medida',
      'motivo', 'justificativa', 'quantidade', 'valor_prejuizo',
    ]) && isStockId(row.id) && isIsoDate(row.data_registro)
      && isText(row.produto, 200) && isText(row.lote, 100) && isText(row.local, 200)
      && isText(row.unidade_medida, 100) && isText(row.motivo, 200) && typeof row.justificativa === 'string'
      && row.justificativa.length <= 2000 && isStockDecimal(row.quantidade, { positive: true })
      && isStockDecimal(row.valor_prejuizo, { calculated: true }));
}
