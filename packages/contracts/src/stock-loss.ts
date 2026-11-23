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
