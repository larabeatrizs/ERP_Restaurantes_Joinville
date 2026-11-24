import { isStockDecimal } from './stock.ts';

export type StockLossValuation =
  | { ok: true; valor_prejuizo: string }
  | { ok: false; motivo: 'DADOS_INVALIDOS' | 'SALDO_INSUFICIENTE' };

function millionths(value: string): bigint {
  const [integer = '0', fraction = ''] = value.split('.');
  return BigInt(integer) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

/** Prévia de uma perda em um lote/local. A aprovação deve revalidar o saldo persistido. */
export function valueStockLoss(quantity: unknown, balance: unknown, lotUnitValue: unknown): StockLossValuation {
  if (!isStockDecimal(quantity, { positive: true }) || !isStockDecimal(balance) || !isStockDecimal(lotUnitValue)) {
    return { ok: false, motivo: 'DADOS_INVALIDOS' };
  }
  const loss = millionths(quantity);
  if (loss > millionths(balance)) return { ok: false, motivo: 'SALDO_INSUFICIENTE' };

  const amount = loss * millionths(lotUnitValue);
  const scale = 1_000_000_000_000n;
  const fraction = String(amount % scale).padStart(12, '0').replace(/0+$/, '');
  return { ok: true, valor_prejuizo: fraction ? `${amount / scale}.${fraction}` : String(amount / scale) };
}

export type StockLossStatus = 'PENDENTE' | 'APROVADA' | 'REJEITADA';
export type StockLossDecision = 'APROVAR' | 'REJEITAR';

export interface StockLossReviewContext {
  perda: { autor_id: string; unidade_id: string; estado: StockLossStatus; quantidade: string };
  revisor: { id: string; perfil: string; unidades_ativas: readonly string[] };
  politica: { unidade_id: string; gestor_substituto_id: string | null };
  periodo: 'ABERTO' | 'FECHADO' | 'INDEFINIDO';
  lote: { saldo_atual: string; valor_unitario: string };
}

export type StockLossReviewResult =
  | { ok: true; estado: 'APROVADA'; quantidade_baixa: string; valor_prejuizo: string }
  | { ok: true; estado: 'REJEITADA' }
  | { ok: false; motivo: 'ACESSO_NEGADO' | 'MESMO_AUTOR' | 'PERDA_DECIDIDA' | 'PERIODO_INDISPONIVEL' | 'DADOS_INVALIDOS' | 'SALDO_INSUFICIENTE' };

/** Usa fatos carregados pelo servidor para a política confirmada de Bucarein. */
export function reviewBucareinStockLoss(decision: StockLossDecision, context: StockLossReviewContext): StockLossReviewResult {
  const { perda, revisor, politica, periodo, lote } = context;
  const isApprover = revisor.perfil === 'NUTRICIONISTA'
    || (revisor.perfil === 'GESTOR_UNIDADE' && revisor.id === politica.gestor_substituto_id);
  if (politica.unidade_id !== perda.unidade_id || !revisor.unidades_ativas.includes(perda.unidade_id) || !isApprover) {
    return { ok: false, motivo: 'ACESSO_NEGADO' };
  }
  if (revisor.id === perda.autor_id) return { ok: false, motivo: 'MESMO_AUTOR' };
  if (perda.estado !== 'PENDENTE') return { ok: false, motivo: 'PERDA_DECIDIDA' };
  if (decision === 'REJEITAR') return { ok: true, estado: 'REJEITADA' };
  if (periodo !== 'ABERTO') return { ok: false, motivo: 'PERIODO_INDISPONIVEL' };

  const valuation = valueStockLoss(perda.quantidade, lote.saldo_atual, lote.valor_unitario);
  if (!valuation.ok) return valuation;
  return { ok: true, estado: 'APROVADA', quantidade_baixa: perda.quantidade, valor_prejuizo: valuation.valor_prejuizo };
}
