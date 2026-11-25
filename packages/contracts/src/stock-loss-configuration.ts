import { isRecord, isStockId, isText, hasExactFields } from './index.ts';

interface LossReasonFields { descricao: string; exige_anexo: boolean; ativo: boolean }
export interface LossReason extends LossReasonFields { id: string }
export interface LossConfiguration {
  revisao: string;
  bucarein: boolean;
  substituto: string | null;
  motivos: LossReason[];
  gestores: { id: string; nome: string }[];
}
export type LossConfigurationChange =
  | ({ acao: 'motivo'; revisao: string; id: string | null } & LossReasonFields)
  | { acao: 'substituto'; revisao: string; usuario_id: string | null };

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isRevision(value: unknown): value is string {
  return value === '0' || isStockId(value);
}

function isReason(value: Record<string, unknown>): boolean {
  return isText(value.descricao, 200) && typeof value.exige_anexo === 'boolean' && typeof value.ativo === 'boolean';
}

export function isLossConfigurationChange(value: unknown): value is LossConfigurationChange {
  if (!isRecord(value) || !isRevision(value.revisao)) return false;
  if (value.acao === 'motivo') {
    return hasExactFields(value, ['acao', 'revisao', 'id', 'descricao', 'exige_anexo', 'ativo'])
      && (value.id === null || isStockId(value.id)) && isReason(value);
  }
  return value.acao === 'substituto' && hasExactFields(value, ['acao', 'revisao', 'usuario_id'])
    && (value.usuario_id === null || isUuid(value.usuario_id));
}

export function isLossConfiguration(value: unknown): value is LossConfiguration {
  return isRecord(value) && isRevision(value.revisao) && typeof value.bucarein === 'boolean'
    && (value.substituto === null || isUuid(value.substituto))
    && Array.isArray(value.motivos) && value.motivos.every(row => isRecord(row) && isStockId(row.id) && isReason(row))
    && Array.isArray(value.gestores) && value.gestores.every(row => isRecord(row) && isUuid(row.id) && isText(row.nome, 200));
}
