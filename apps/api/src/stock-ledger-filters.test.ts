import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStockLedgerFilters } from '@erp/contracts';

test('RF-017 aceita produto, lote e períodos abertos ou fechados sem converter IDs', () => {
  const produto_id = '9223372036854775807';
  assert.ok(isStockLedgerFilters({ produto_id }));
  assert.ok(isStockLedgerFilters({ produto_id, data_fim: '2026-11-23' }));
  assert.ok(isStockLedgerFilters({ produto_id, lote_id: '1', data_inicio: '2026-11-23' }));
  assert.ok(isStockLedgerFilters({
    produto_id, lote_id: '1', data_inicio: '2028-02-29', data_fim: '2028-02-29', tipo: 'REQUISICAO_RAPIDA',
  }));
  assert.ok(isStockLedgerFilters({ produto_id, tipo: 'ENTRADA' }));
});

test('RF-017 rejeita seleção e datas inválidas, tipos futuros e campos de autoridade', () => {
  assert.equal(isStockLedgerFilters({ lote_id: '1' }), false);
  assert.equal(isStockLedgerFilters({ produto_id: 1 }), false);
  assert.equal(isStockLedgerFilters({ produto_id: '9223372036854775808' }), false);
  for (const invalid of [
    { lote_id: null },
    { lote_id: '0' },
    { data_inicio: '2026-02-29' },
    { data_inicio: '2026-11-24', data_fim: '2026-11-23' },
    { data_fim: '2026-11-23T00:00:00Z' },
    { tipo: 'ESTORNO' },
    { unidade_id: '2' },
    { saldo_corrente: '15' },
  ]) {
    assert.equal(isStockLedgerFilters({ produto_id: '1', ...invalid }), false);
  }
});
