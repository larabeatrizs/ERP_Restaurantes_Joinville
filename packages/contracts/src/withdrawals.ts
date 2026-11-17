import { isRecord } from './index.ts';
import { hasExactFields, isStockDecimal, isStockId } from './stock.ts';

/** EST-002/C1: substituição integral da distribuição de UM item retirado. */
export interface WithdrawalAllocationInput {
  revisao: string;
  destinos: { cardapio_refeicao_id: string; quantidade: string }[];
}

export function isWithdrawalAllocationInput(value: unknown): value is WithdrawalAllocationInput {
  if (!isRecord(value) || !hasExactFields(value, ['revisao', 'destinos'])
    || !isStockId(value.revisao) || !Array.isArray(value.destinos) || value.destinos.length > 100) return false;
  const ids = new Set<string>();
  return value.destinos.every(destination => {
    if (!isRecord(destination) || !hasExactFields(destination, ['cardapio_refeicao_id', 'quantidade'])
      || !isStockId(destination.cardapio_refeicao_id) || !isStockDecimal(destination.quantidade, { positive: true })
      || ids.has(destination.cardapio_refeicao_id)) return false;
    ids.add(destination.cardapio_refeicao_id);
    return true;
  });
}

export interface WithdrawalAllocationContext {
  unidade_id: string;
  quantidade_retirada: string;
  /** Origem confiável: refeições existentes lidas pelo servidor, nunca o corpo HTTP. */
  refeicoes: { id: string; unidade_id: string }[];
}

function micros(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

/** Invariante pura. Não autoriza, não persiste, não altera saldo ou estado de conferência. */
export function validateWithdrawalAllocation(input: unknown, context: WithdrawalAllocationContext):
  'VALIDA' | 'ENTRADA_INVALIDA' | 'CONTEXTO_INVALIDO' | 'REFEICAO_INDISPONIVEL' | 'QUANTIDADE_EXCEDIDA' {
  if (!isWithdrawalAllocationInput(input)) return 'ENTRADA_INVALIDA';
  if (!isStockId(context.unidade_id) || !isStockDecimal(context.quantidade_retirada, { positive: true })
    || !Array.isArray(context.refeicoes)) return 'CONTEXTO_INVALIDO';
  const meals = new Map<string, string>();
  for (const meal of context.refeicoes) {
    if (!isStockId(meal.id) || !isStockId(meal.unidade_id) || meals.has(meal.id)) return 'CONTEXTO_INVALIDO';
    meals.set(meal.id, meal.unidade_id);
  }
  let distributed = 0n;
  for (const destination of input.destinos) {
    if (meals.get(destination.cardapio_refeicao_id) !== context.unidade_id) return 'REFEICAO_INDISPONIVEL';
    distributed += micros(destination.quantidade);
  }
  return distributed > micros(context.quantidade_retirada) ? 'QUANTIDADE_EXCEDIDA' : 'VALIDA';
}
