import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWithdrawalAllocationInput, validateWithdrawalAllocation } from '@erp/contracts';

const context = () => ({ unidade_id: '1', quantidade_retirada: '0.3', refeicoes: [
  { id: '9007199254740993', unidade_id: '1' }, { id: '2', unidade_id: '1' }, { id: '3', unidade_id: '2' },
] });
const input = () => ({ revisao: '9007199254740997', destinos: [
  { cardapio_refeicao_id: '9007199254740993', quantidade: '0.1' }, { cardapio_refeicao_id: '2', quantidade: '0.2' },
] });

test('EST-002 distribuição 1:N soma exatamente 0.1+0.2 e não modifica retirada/contexto', () => {
  const body = input(), state = context(), before = JSON.stringify({ body, state });
  assert.equal(validateWithdrawalAllocation(body, state), 'VALIDA');
  assert.equal(JSON.stringify({ body, state }), before);
  body.destinos[1]!.quantidade = '0.200001';
  assert.equal(validateWithdrawalAllocation(body, state), 'QUANTIDADE_EXCEDIDA');
});
test('EST-002 permite vínculo parcial/pendente e limite máximo exato sem Number', () => {
  assert.equal(validateWithdrawalAllocation({ revisao: '1', destinos: [] }, context()), 'VALIDA');
  const body = { revisao: '1', destinos: [{ cardapio_refeicao_id: '2', quantidade: '999999999999.999999' }] };
  const state = { ...context(), quantidade_retirada: '999999999999.999999' };
  assert.equal(validateWithdrawalAllocation(body, state), 'VALIDA');
  body.destinos.push({ cardapio_refeicao_id: '9007199254740993', quantidade: '0.000001' });
  assert.equal(validateWithdrawalAllocation(body, state), 'QUANTIDADE_EXCEDIDA');
});
test('EST-002 nega refeição ausente ou de outra unidade e contexto ambíguo', () => {
  for (const id of ['3', '4']) assert.equal(validateWithdrawalAllocation({ revisao: '1', destinos: [
    { cardapio_refeicao_id: id, quantidade: '0.1' },
  ] }, context()), 'REFEICAO_INDISPONIVEL');
  const state = context(); state.refeicoes.push({ id: '2', unidade_id: '2' });
  assert.equal(validateWithdrawalAllocation(input(), state), 'CONTEXTO_INVALIDO');
  for (const quantity of ['-1', '0', 'NaN', '0.0000001']) {
    assert.equal(validateWithdrawalAllocation(input(), { ...context(), quantidade_retirada: quantity }), 'CONTEXTO_INVALIDO');
  }
});
test('EST-002 rejeita coerção, campos de autoridade, duplicidade e precisão inválida', () => {
  const good = input(); assert.ok(isWithdrawalAllocationInput(good));
  for (const value of [null, { ...good, revisao: 1 }, { ...good, unidade_id: '2' },
    { ...good, ator_id: '1' }, { ...good, estado: 'CONFERIDA' }, { ...good, destinos: [...good.destinos, good.destinos[0]] }]) {
    assert.equal(isWithdrawalAllocationInput(value), false);
  }
  for (const quantity of [0.1, '0', '-1', '1e2', '01', '0.0000001', '1000000000000']) {
    assert.equal(isWithdrawalAllocationInput({ revisao: '1', destinos: [{ cardapio_refeicao_id: '2', quantidade: quantity }] }), false);
  }
  assert.equal(isWithdrawalAllocationInput({ revisao: '1', destinos: [{ cardapio_refeicao_id: 2, quantidade: '1' }] }), false);
  assert.equal(isWithdrawalAllocationInput({ revisao: '1', destinos: [{ cardapio_refeicao_id: '2', quantidade: '1', unidade_id: '1' }] }), false);
  assert.equal(isWithdrawalAllocationInput({ revisao: '1', destinos: Array.from({ length: 101 }, (_, i) => ({ cardapio_refeicao_id: String(i + 1), quantidade: '1' })) }), false);
  assert.equal(validateWithdrawalAllocation({}, context()), 'ENTRADA_INVALIDA');
});
