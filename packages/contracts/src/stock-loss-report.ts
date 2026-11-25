import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockDecimal, isStockId, isText } from './stock.ts';

export const stockLossReportFilterFields = {
  produto: 200, categoria: 200, lote: 100, fornecedor: 200, motivo: 200,
} as const;
export type StockLossReportFilter = keyof typeof stockLossReportFilterFields;

export interface StockLossReportQuery extends Partial<Record<StockLossReportFilter, string>> {
  inicio: string;
  periodicidade: 'mensal' | 'anual';
  escopo?: 'consolidado';
}

export interface StockLossReport extends Pick<StockLossReportQuery, 'inicio' | 'periodicidade'> {
  unidade_id: string;
  inicio_anterior: string;
  prejuizo_atual: string;
  prejuizo_anterior: string;
  unidades?: { id: string; nome: string }[];
  itens: { unidade_id?: string; motivo: string; lote: string; produto: string; categoria: string; prejuizo: string }[];
}

export function isStockLossReportQuery(value: unknown): value is StockLossReportQuery {
  return isRecord(value) && hasExactFields(value, ['inicio', 'periodicidade'], ['escopo', ...Object.keys(stockLossReportFilterFields)])
    && (!Object.hasOwn(value, 'escopo') || value.escopo === 'consolidado')
    && isIsoDate(value.inicio) && value.inicio.slice(0, 4) >= '0002' && value.inicio.slice(0, 4) <= '9998'
    && value.inicio.endsWith('-01')
    && Object.entries(stockLossReportFilterFields).every(([field, max]) => !Object.hasOwn(value, field)
      || (isText(value[field], max) && !/[\u0000-\u001f\u007f-\u009f]/.test(value[field])))
    && (value.periodicidade === 'mensal' || (value.periodicidade === 'anual' && value.inicio.endsWith('-01-01')));
}

export function isStockLossReport(value: unknown, unit: string, query: StockLossReportQuery): value is StockLossReport {
  if (!isRecord(value)) return false;
  const units = new Set<string>();
  if (query.escopo === 'consolidado') {
    if (!Array.isArray(value.unidades)) return false;
    for (const row of value.unidades) {
      if (!isRecord(row) || !hasExactFields(row, ['id', 'nome']) || !isStockId(row.id)
        || !isText(row.nome, 200) || units.has(row.id)) return false;
      units.add(row.id);
    }
    if (!units.has(unit)) return false;
  }
  const extra = query.escopo === 'consolidado' ? ['unidades'] : [];
  const itemExtra = query.escopo === 'consolidado' ? ['unidade_id'] : [];
  return hasExactFields(value, ['unidade_id', 'inicio', 'inicio_anterior', 'periodicidade', 'prejuizo_atual', 'prejuizo_anterior', 'itens', ...extra])
    && value.unidade_id === unit && value.inicio === query.inicio && value.periodicidade === query.periodicidade
    && isIsoDate(value.inicio_anterior) && isStockDecimal(value.prejuizo_atual, { calculated: true })
    && isStockDecimal(value.prejuizo_anterior, { calculated: true }) && Array.isArray(value.itens)
    && value.itens.length <= 10000 && value.itens.every(row => isRecord(row)
      && hasExactFields(row, ['motivo', 'lote', 'produto', 'categoria', 'prejuizo', ...itemExtra])
      && (query.escopo !== 'consolidado' || (isStockId(row.unidade_id) && units.has(row.unidade_id)))
      && isText(row.motivo, 200) && isText(row.lote, 100) && isText(row.produto, 200) && isText(row.categoria, 200)
      && isStockDecimal(row.prejuizo, { calculated: true }));
}
