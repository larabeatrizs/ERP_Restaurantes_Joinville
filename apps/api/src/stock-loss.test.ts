import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewBucareinStockLoss, valueStockLoss } from '@erp/contracts';
import type { StockLossReviewContext } from '@erp/contracts';

test('RF-015 calcula a perda no custo do lote e conserva a precisão', () => {
  assert.deepEqual(valueStockLoss('5', '5', '8'), { ok: true, valor_prejuizo: '40' });
  assert.deepEqual(valueStockLoss('0.000001', '1', '0.000001'), { ok: true, valor_prejuizo: '0.000000000001' });
  assert.deepEqual(valueStockLoss('999999999999', '999999999999', '8'), { ok: true, valor_prejuizo: '7999999999992' });
  assert.deepEqual(valueStockLoss('1', '2', '0'), { ok: true, valor_prejuizo: '0' });
});

const pendingLoss: StockLossReviewContext = {
  perda: { autor_id: 'autor', unidade_id: '1', estado: 'PENDENTE', quantidade: '5' },
  revisor: { id: 'nutricionista', perfil: 'NUTRICIONISTA', unidades_ativas: ['1'] },
  politica: { unidade_id: '1', gestor_substituto_id: 'gestor-configurado' },
  periodo: 'ABERTO',
  lote: { saldo_atual: '5', valor_unitario: '8' },
};

test('RF-015 avalia aprovação e rejeição com a política de Bucarein', () => {
  const approved = { ok: true, estado: 'APROVADA', quantidade_baixa: '5', valor_prejuizo: '40' };
  assert.deepEqual(reviewBucareinStockLoss('APROVAR', pendingLoss), approved);
  for (const id of ['gestor-configurado', 'outro-gestor']) {
    const contexto = { ...pendingLoss, revisor: { id, perfil: 'GESTOR_UNIDADE', unidades_ativas: ['1'] } };
    assert.deepEqual(reviewBucareinStockLoss('APROVAR', contexto), id === 'gestor-configurado'
      ? approved : { ok: false, motivo: 'ACESSO_NEGADO' });
  }
  assert.deepEqual(reviewBucareinStockLoss('REJEITAR', pendingLoss), { ok: true, estado: 'REJEITADA' });
});

test('RF-015 nega autoaprovação, unidade alheia, nova baixa, saldo insuficiente e período indisponível', () => {
  const denials: [Partial<StockLossReviewContext>, string][] = [
    [{ revisor: { ...pendingLoss.revisor, id: 'autor' } }, 'MESMO_AUTOR'],
    [{ revisor: { ...pendingLoss.revisor, unidades_ativas: ['2'] } }, 'ACESSO_NEGADO'],
    [{ perda: { ...pendingLoss.perda, estado: 'APROVADA' } }, 'PERDA_DECIDIDA'],
    [{ lote: { ...pendingLoss.lote, saldo_atual: '4.999999' } }, 'SALDO_INSUFICIENTE'],
    [{ periodo: 'FECHADO' }, 'PERIODO_INDISPONIVEL'],
    [{ periodo: 'INDEFINIDO' }, 'PERIODO_INDISPONIVEL'],
  ];
  for (const [context, motivo] of denials) {
    assert.deepEqual(reviewBucareinStockLoss('APROVAR', { ...pendingLoss, ...context }), { ok: false, motivo });
  }
});

test('RF-015 rejeita saldo insuficiente, coerção e quantidade não positiva', () => {
  assert.deepEqual(valueStockLoss('5.000001', '5', '8'), { ok: false, motivo: 'SALDO_INSUFICIENTE' });
  for (const quantity of [1, '0', '-1', '1e0', '0.0000001']) {
    assert.deepEqual(valueStockLoss(quantity, '5', '8'), { ok: false, motivo: 'DADOS_INVALIDOS' });
  }
  assert.deepEqual(valueStockLoss('1', '5', '-8'), { ok: false, motivo: 'DADOS_INVALIDOS' });
});
