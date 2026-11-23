import assert from 'node:assert/strict';
import { test } from 'node:test';
import { valueStockLoss } from '@erp/contracts';

test('RF-015 calcula a perda no custo do lote e conserva a precisão', () => {
  assert.deepEqual(valueStockLoss('5', '5', '8'), { ok: true, valor_prejuizo: '40' });
  assert.deepEqual(valueStockLoss('0.000001', '1', '0.000001'), { ok: true, valor_prejuizo: '0.000000000001' });
  assert.deepEqual(valueStockLoss('999999999999', '999999999999', '8'), { ok: true, valor_prejuizo: '7999999999992' });
  assert.deepEqual(valueStockLoss('1', '2', '0'), { ok: true, valor_prejuizo: '0' });
});

test('RF-015 rejeita saldo insuficiente, coerção e quantidade não positiva', () => {
  assert.deepEqual(valueStockLoss('5.000001', '5', '8'), { ok: false, motivo: 'SALDO_INSUFICIENTE' });
  for (const quantity of [1, '0', '-1', '1e0', '0.0000001']) {
    assert.deepEqual(valueStockLoss(quantity, '5', '8'), { ok: false, motivo: 'DADOS_INVALIDOS' });
  }
  assert.deepEqual(valueStockLoss('1', '5', '-8'), { ok: false, motivo: 'DADOS_INVALIDOS' });
});
