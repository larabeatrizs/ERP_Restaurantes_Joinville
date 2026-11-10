import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntradaInput, Product, ProdutoInput, Receipt, StockContext } from '@erp/contracts';
import { createApp } from './index.ts';
import { ApiError } from './errors.ts';
import type { StockRepository } from './repositories/stock-repository.ts';

const input: ProdutoInput = {
  descricao: 'Arroz', complemento: '', unidade_medida_id: '1', categoria_id: '1', perecivel: false,
  armazenamento: 'SECO', fator_correcao: '1', apresentacao_compra: 'Saco', quantidade_apresentacao: '5',
  estoque_minimo: '0', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO',
};
const product: Product = { ...input, id: '9007199254740993', revisao: '2', unidade_sigla: 'kg', categoria_descricao: 'Cereais' };
const entry: EntradaInput = {
  data_entrada: '2026-11-09', fornecedor_id: '1', numero_nf: '000123', total_nota: '20', observacoes: '',
  itens: [{ produto_id: product.id, quantidade: '20', valor_unitario: '1', numero_lote: null, validade: null,
    camara_id: '1', temperatura: null, aspecto_embalagem: 'Íntegra', conformidade: 'CONFORME', motivo: '' }],
};
const receipt: Receipt = {
  ...entry, id: '9007199254740994', unidade_id: '1', fornecedor: 'Fornecedor sintético', total_itens: '20',
  estado: 'RASCUNHO', divergencia_aprovada: false,
  itens: [{ ...entry.itens[0]!, id: '3', produto: product.descricao, unidade_medida: 'kg', local: 'Depósito' }],
};
const context: StockContext = { medidas: [], categorias: [], fornecedores: [], locais: [], capacidades: {
  produto_escrever: true, recebimento_escrever: true, divergencia_aprovar: false,
} };
const base = 'https://erp.test/api/unidades/1';
const key = '00000000-0000-4000-8000-000000000001';
function request(path: string, method = 'GET', data?: unknown, headers: Record<string, string> = {}) {
  return new Request(base + path, {
    method, headers: { Authorization: 'Bearer sessao-estoque', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
function fixture(options: { authError?: Error; repositoryError?: Error } = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const collect = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    if (options.repositoryError) throw options.repositoryError;
  };
  const repository: StockRepository = {
    async context(unit) { collect('context', unit); return context; },
    async products(unit, query) { collect('products', unit, query); return { produtos: [product], total: 1 }; },
    async saveProduct(unit, value, id, revision) { collect('saveProduct', unit, value, id, revision); return { produto: product }; },
    async receipts(unit) { collect('receipts', unit); return { entradas: [receipt] }; },
    async createReceipt(unit, value) { collect('createReceipt', unit, value); return { entrada: receipt }; },
    async confirmReceipt(unit, id, confirmation) { collect('confirmReceipt', unit, id, confirmation); return { entrada: { ...receipt, estado: 'CONFIRMADA' } }; },
    async approveReceipt(unit, id, reason) { collect('approveReceipt', unit, id, reason); return { entrada: { ...receipt, divergencia_aprovada: true } }; },
    async balances(unit) { collect('balances', unit); return { saldos: [] }; },
  };
  return { calls, app: createApp(() => { throw Error('Estoque não deve usar sessão de configurações.'); }, (_env, token) => {
    assert.equal(token, 'sessao-estoque');
    return { repository, async authenticate() { if (options.authError) throw options.authError; } };
  }) };
}

test('estoque exige Bearer e não consulta dados sem identidade', async () => {
  const { app, calls } = fixture();
  const response = await app.fetch(new Request(base + '/estoque/contexto'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal(calls.length, 0);
});
test('contexto e listagens usam sessão própria e preservam IDs bigint textuais', async () => {
  const { app, calls } = fixture();
  for (const path of ['/estoque/contexto', '/estoque/saldos', '/produtos', '/entradas']) {
    const response = await app.fetch(request(path));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const result = await response.json();
    if (path === '/produtos') assert.equal(result.produtos[0].id, '9007199254740993');
  }
  assert.deepEqual(calls.map(call => call.name), ['context', 'balances', 'products', 'receipts']);
});
test('negação de autenticação impede consultas ao repository', async () => {
  const { app, calls } = fixture({ authError: new ApiError(401, 'UNAUTHORIZED', 'Sessão expirada.') });
  assert.equal((await app.fetch(request('/produtos'))).status, 401);
  assert.equal(calls.length, 0);
});
test('unidade e IDs inválidos são recusados sem consulta', async () => {
  const { app, calls } = fixture();
  assert.equal((await app.fetch(new Request('https://erp.test/api/unidades/0/estoque/contexto', { headers: { Authorization: 'Bearer sessao-estoque' } }))).status, 400);
  assert.equal((await app.fetch(request('/produtos/abc', 'PATCH', input))).status, 400);
  assert.equal((await app.fetch(request('/entradas/9223372036854775808/confirmar', 'POST', { chave: key }))).status, 400);
  assert.equal(calls.length, 0);
});
test('busca/paginação aceitam somente filtros previstos e não arredondam IDs', async () => {
  const { app, calls } = fixture();
  assert.equal((await app.fetch(request('/produtos?q=Arroz&status=INATIVO&offset=50'))).status, 200);
  assert.deepEqual(calls[0]?.args, ['1', { q: 'Arroz', status: 'INATIVO', offset: 50 }]);
  for (const suffix of ['?status=TODOS', '?offset=-1', '?offset=1e2', '?offset=2147483648', '?q=a&q=b', '?ator=1']) {
    assert.equal((await app.fetch(request('/produtos' + suffix))).status, 400);
  }
  assert.equal(calls.length, 1);
});
test('produto criado retorna 201 e revisão ETag; edição encaminha revisão textual', async () => {
  const { app, calls } = fixture();
  const created = await app.fetch(request('/produtos', 'POST', input));
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('ETag'), '"prod-9007199254740993-2"');
  assert.equal(created.headers.get('Cache-Control'), 'no-store, no-transform');
  const updated = await app.fetch(request('/produtos/' + product.id, 'PATCH', { ...input, revisao: '1' }));
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get('Cache-Control'), 'no-store, no-transform');
  assert.deepEqual(calls[1]?.args, ['1', input, product.id, '1']);
});
test('produto recusa ator/saldo injetados, decimais numéricos, expoentes e máximo menor que mínimo', async () => {
  const { app, calls } = fixture();
  for (const value of [{ ...input, ator: '1' }, { ...input, saldo: '100' }, { ...input, fator_correcao: 1 }, { ...input, fator_correcao: '1e2' },
    { ...input, quantidade_apresentacao: '0' }, { ...input, estoque_minimo: '10', estoque_maximo: '9.999999' }, { ...input, categoria_id: 1 }]) {
    assert.equal((await app.fetch(request('/produtos', 'POST', value))).status, 422);
  }
  assert.equal((await app.fetch(request('/produtos/' + product.id, 'PATCH', input))).status, 422);
  assert.equal(calls.length, 0);
});
test('compra de 20 kg e confirmação idempotente preservam quantidade e chave', async () => {
  const { app, calls } = fixture();
  const created = await app.fetch(request('/entradas', 'POST', entry));
  assert.equal(created.status, 201);
  assert.deepEqual(calls[0]?.args, ['1', entry]);
  const confirmed = await app.fetch(request(`/entradas/${receipt.id}/confirmar`, 'POST', { chave: key }));
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).entrada.estado, 'CONFIRMADA');
  assert.deepEqual(calls[1]?.args, ['1', receipt.id, key]);
});
test('recebimento rejeita itens vazios, data inexistente, quantidades inválidas e ressalva sem motivo', async () => {
  const { app, calls } = fixture();
  for (const value of [{ ...entry, itens: [] }, { ...entry, data_entrada: '2026-02-30' }, { ...entry, itens: [{ ...entry.itens[0], quantidade: '-1' }] },
    { ...entry, itens: [{ ...entry.itens[0], quantidade: '0' }] }, { ...entry, itens: [{ ...entry.itens[0], conformidade: 'RESSALVA', motivo: '' }] },
    { ...entry, itens: [{ ...entry.itens[0], valor_unitario: '0.0000001' }] }, { ...entry, unidade_id: '2' }]) {
    assert.equal((await app.fetch(request('/entradas', 'POST', value))).status, 422);
  }
  assert.equal(calls.length, 0);
});
test('confirmação e aprovação rejeitam campos extras e preservam motivo', async () => {
  const { app, calls } = fixture();
  assert.equal((await app.fetch(request(`/entradas/${receipt.id}/confirmar`, 'POST', { chave: 'invalida' }))).status, 422);
  assert.equal((await app.fetch(request(`/entradas/${receipt.id}/confirmar`, 'POST', { chave: key, ator: '1' }))).status, 422);
  assert.equal((await app.fetch(request(`/entradas/${receipt.id}/aprovar-divergencia`, 'POST', { motivo: ' a ' }))).status, 422);
  assert.equal((await app.fetch(request(`/entradas/${receipt.id}/aprovar-divergencia`, 'POST', { motivo: ' Conferido pela gestão ' }))).status, 200);
  assert.deepEqual(calls[0]?.args, ['1', receipt.id, 'Conferido pela gestão']);
});
test('content-type, JSON inválido e limite de corpo não chegam ao serviço', async () => {
  const { app, calls } = fixture();
  assert.equal((await app.fetch(request('/produtos', 'POST', input, { 'Content-Type': 'text/plain' }))).status, 415);
  for (const [text, expected] of [['{', 400], [' '.repeat(65537), 413]] as const) {
    assert.equal((await app.fetch(new Request(base + '/produtos', { method: 'POST', headers: { Authorization: 'Bearer sessao-estoque', 'Content-Type': 'application/json' }, body: text }))).status, expected);
  }
  assert.equal(calls.length, 0);
});
test('métodos não suportados preservam Allow e HEAD sem corpo', async () => {
  const { app } = fixture();
  const response = await app.fetch(request('/produtos', 'DELETE'));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, POST');
  const head = await app.fetch(request('/estoque/saldos', 'HEAD'));
  assert.equal(head.status, 405);
  assert.equal(await head.text(), '');
});
test('negação por unidade/permissão, conflito e revisão vencida mantêm status', async () => {
  for (const status of [403, 404, 409, 412, 422]) {
    const { app } = fixture({ repositoryError: new ApiError(status, 'STOCK_ERROR', 'Operação negada.') });
    const response = await app.fetch(request('/produtos', 'POST', input));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
test('erros inesperados do adaptador não expõem SQL ou detalhes internos', async () => {
  const { app } = fixture({ repositoryError: Error('segredo SQL interno') });
  const response = await app.fetch(request('/produtos'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /segredo|SQL|interno/);
});
