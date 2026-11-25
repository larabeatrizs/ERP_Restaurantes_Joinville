import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockDecimal, isStockId, isText } from './stock.ts';

export type StockLossReviewState = 'APROVADA' | 'REJEITADA';
export const stockLossAttachmentMaxBytes = 2 * 1024 * 1024;
const maxBase64Length = 4 * Math.ceil(stockLossAttachmentMaxBytes / 3);

export interface StockLossAttachment {
  mime: 'image/jpeg' | 'image/png';
  base64: string;
}

export function isStockLossAttachment(value: unknown): value is StockLossAttachment {
  return isRecord(value) && hasExactFields(value, ['mime', 'base64'])
    && (value.mime === 'image/jpeg' || value.mime === 'image/png')
    && typeof value.base64 === 'string' && value.base64.length >= 4
    && value.base64.length <= maxBase64Length && value.base64.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value.base64);
}

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
  tem_anexo?: boolean;
}

export interface StockLossPanel {
  unidade_id: string;
  perdas: PendingStockLoss[];
}

export interface StockLossRegistration {
  lote_id: string;
  camara_id: string;
  data_registro: string;
  quantidade: string;
  motivo_id: string;
  justificativa: string;
  chave: string;
  anexo?: StockLossAttachment;
}

export interface StockLossPosition {
  lote_id: string;
  camara_id: string;
  produto: string;
  lote: string;
  local: string;
  unidade_medida: string;
  quantidade: string;
  valor_unitario: string;
}

export interface StockLossRegistrationContext {
  unidade_id: string;
  data_referencia: string;
  motivos: { id: string; descricao: string; exige_anexo?: boolean }[];
  posicoes: StockLossPosition[];
}

export function isStockLossRegistration(value: unknown): value is StockLossRegistration {
  return isRecord(value) && hasExactFields(value, ['lote_id', 'camara_id', 'data_registro', 'quantidade', 'motivo_id', 'justificativa', 'chave'], ['anexo'])
    && isStockId(value.lote_id) && isStockId(value.camara_id) && isIsoDate(value.data_registro)
    && isStockDecimal(value.quantidade, { positive: true }) && isStockId(value.motivo_id)
    && isText(value.justificativa, 2000, true) && typeof value.chave === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.chave)
    && (!Object.hasOwn(value, 'anexo') || isStockLossAttachment(value.anexo));
}

export function isStockLossRegistrationContext(value: unknown, unit: string): value is StockLossRegistrationContext {
  return isRecord(value) && hasExactFields(value, ['unidade_id', 'data_referencia', 'motivos', 'posicoes'])
    && value.unidade_id === unit && isIsoDate(value.data_referencia)
    && Array.isArray(value.motivos) && value.motivos.every(row => isRecord(row)
      && hasExactFields(row, ['id', 'descricao'], ['exige_anexo']) && isStockId(row.id) && isText(row.descricao, 200)
      && (row.exige_anexo === undefined || typeof row.exige_anexo === 'boolean'))
    && Array.isArray(value.posicoes) && value.posicoes.every(row => isRecord(row) && hasExactFields(row, [
      'lote_id', 'camara_id', 'produto', 'lote', 'local', 'unidade_medida', 'quantidade', 'valor_unitario',
    ]) && isStockId(row.lote_id) && isStockId(row.camara_id) && isText(row.produto, 200)
      && isText(row.lote, 100) && isText(row.local, 200) && isText(row.unidade_medida, 100)
      && isStockDecimal(row.quantidade, { positive: true }) && isStockDecimal(row.valor_unitario));
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
    ], ['tem_anexo']) && isStockId(row.id) && isIsoDate(row.data_registro)
      && (row.tem_anexo === undefined || typeof row.tem_anexo === 'boolean')
      && isText(row.produto, 200) && isText(row.lote, 100) && isText(row.local, 200)
      && isText(row.unidade_medida, 100) && isText(row.motivo, 200) && typeof row.justificativa === 'string'
      && row.justificativa.length <= 2000 && isStockDecimal(row.quantidade, { positive: true })
      && isStockDecimal(row.valor_prejuizo, { calculated: true }));
}
