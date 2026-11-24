import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUserStockPeriodAccess } from '@erp/contracts';

const user = { perfil: 'GESTOR_UNIDADE', unidades: ['1', '2'] } as const;
const linked = { ...user, unidades: [...user.unidades] };
const selection = { unidade_id: '1', fechar: true, reabrir: false };

test('RN-027 valida seleção explícita de fechamento em unidade vinculada', () => {
  assert.ok(isUserStockPeriodAccess([], linked));
  assert.ok(isUserStockPeriodAccess([selection, { unidade_id: '2', fechar: false, reabrir: false }], linked));
  assert.equal(isUserStockPeriodAccess([selection, selection], linked), false);
  assert.equal(isUserStockPeriodAccess([{ ...selection, unidade_id: '3' }], linked), false);
  assert.equal(isUserStockPeriodAccess([{ ...selection, fechar: 'true' }], linked), false);
  assert.equal(isUserStockPeriodAccess([{ unidade_id: '1', fechar: true }], linked), false);
});

test('RN-027 o cadastro reserva a seleção de reabertura ao gestor central', () => {
  const reopening = { ...selection, fechar: false, reabrir: true };
  assert.equal(isUserStockPeriodAccess([reopening], linked), false);
  assert.equal(isUserStockPeriodAccess([reopening], { ...linked, perfil: 'ADMIN' }), false);
  assert.ok(isUserStockPeriodAccess([reopening], { ...linked, perfil: 'GESTOR_CENTRAL' }));
});
