import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockDecimal, isText } from './stock.ts';

export const stockLossReportFilterFields = {
  produto: 200, categoria: 200, lote: 100, fornecedor: 200, motivo: 200,
} as const;
export type StockLossReportFilter = keyof typeof stockLossReportFilterFields;

export interface StockLossReportQuery extends Partial<Record<StockLossReportFilter, string>> {
  inicio: string;
  periodicidade: 'mensal' | 'anual';
}

export interface StockLossReport extends Pick<StockLossReportQuery, 'inicio' | 'periodicidade'> {
  unidade_id: string;
  inicio_anterior: string;
  prejuizo_atual: string;
  prejuizo_anterior: string;
  itens: { motivo: string; lote: string; produto: string; categoria: string; prejuizo: string }[];
}

export function isStockLossReportQuery(value: unknown): value is StockLossReportQuery {
  return isRecord(value) && hasExactFields(value, ['inicio', 'periodicidade'], Object.keys(stockLossReportFilterFields))
    && isIsoDate(value.inicio) && value.inicio.slice(0, 4) >= '0002' && value.inicio.slice(0, 4) <= '9998'
    && value.inicio.endsWith('-01')
    && Object.entries(stockLossReportFilterFields).every(([field, max]) => !Object.hasOwn(value, field)
      || (isText(value[field], max) && !/[\u0000-\u001f\u007f-\u009f]/.test(value[field])))
    && (value.periodicidade === 'mensal' || (value.periodicidade === 'anual' && value.inicio.endsWith('-01-01')));
}

export function isStockLossReport(value: unknown, unit: string, query: StockLossReportQuery): value is StockLossReport {
  return isRecord(value) && hasExactFields(value, ['unidade_id', 'inicio', 'inicio_anterior', 'periodicidade', 'prejuizo_atual', 'prejuizo_anterior', 'itens'])
    && value.unidade_id === unit && value.inicio === query.inicio && value.periodicidade === query.periodicidade
    && isIsoDate(value.inicio_anterior) && isStockDecimal(value.prejuizo_atual, { calculated: true })
    && isStockDecimal(value.prejuizo_anterior, { calculated: true }) && Array.isArray(value.itens)
    && value.itens.length <= 10000 && value.itens.every(row => isRecord(row)
      && hasExactFields(row, ['motivo', 'lote', 'produto', 'categoria', 'prejuizo'])
      && isText(row.motivo, 200) && isText(row.lote, 100) && isText(row.produto, 200) && isText(row.categoria, 200)
      && isStockDecimal(row.prejuizo, { calculated: true }));
}
