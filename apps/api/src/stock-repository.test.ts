import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntradaInput, Product, ProdutoInput, Receipt, StockContext } from '@erp/contracts';
import { createSupabaseStockSession } from './repositories/supabase-stock.ts';
import { ApiError } from './errors.ts';
import { createApp } from './index.ts';

const env = { SUPABASE_URL: 'https://staging-ficticio.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ficticia' };
const input: ProdutoInput = { descricao: 'Arroz', complemento: '', unidade_medida_id: '1', categoria_id: '1', perecivel: false, armazenamento: 'SECO', fator_correcao: '1', apresentacao_compra: 'Saco', quantidade_apresentacao: '5', estoque_minimo: '0', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO' };
const product: Product = { ...input, id: '9007199254740993', revisao: '2', unidade_sigla: 'kg', categoria_descricao: 'Cereais' };
const entry: EntradaInput = { data_entrada: '2026-11-09', fornecedor_id: '1', numero_nf: '001', total_nota: null, observacoes: '', itens: [{ produto_id: product.id, quantidade: '0.000001', valor_unitario: '0.000001', numero_lote: null, validade: null, camara_id: '1', temperatura: '-18.5', aspecto_embalagem: 'Íntegra', conformidade: 'CONFORME', motivo: '' }] };
const receipt: Receipt = { ...entry, id: '9007199254740994', unidade_id: '1', fornecedor: 'Fornecedor sintético', total_itens: '0.000000000001', estado: 'RASCUNHO', divergencia_aprovada: false, itens: [{ ...entry.itens[0]!, id: '4', produto: 'Arroz', unidade_medida: 'kg', local: 'Depósito' }] };
const context: StockContext = {
  medidas: [{ id: '1', sigla: 'kg', descricao: 'Quilograma' }], categorias: [{ id: '1', descricao: 'Cereais', armazenamento_padrao: 'SECO' }],
  fornecedores: [{ id: '1', razao_social: 'Fornecedor sintético' }], locais: [{ id: '1', nome: 'Depósito', tipo: 'SECO' }],
  capacidades: { produto_escrever: true, recebimento_escrever: true, divergencia_aprovar: false },
};
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', created_at: '2026-11-09T00:00:00Z', app_metadata: {}, user_metadata: {} };
function transport(options: { authStatus?: number; anonymous?: boolean; code?: string; status?: number; result?: unknown } = {}) {
  const requests: { path: string; headers: Headers; body: Record<string, unknown> | null; signal: AbortSignal | null | undefined }[] = [];
  const fetcher: typeof fetch = async (urlOrRequest, init) => {
    const url = new URL(typeof urlOrRequest === 'string' ? urlOrRequest : urlOrRequest instanceof URL ? urlOrRequest.href : urlOrRequest.url);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    requests.push({ path: url.pathname, headers, body, signal: init?.signal });
    if (url.pathname === '/auth/v1/user') return Response.json(options.authStatus ? { msg: 'Detalhe interno Auth' } : { ...user, is_anonymous: options.anonymous ?? false }, { status: options.authStatus ?? 200 });
    if (options.code) return Response.json({ code: options.code, message: 'SQL senha interno', details: 'detail SQL' }, { status: options.status ?? 400 });
    if (Object.hasOwn(options, 'result')) return Response.json(options.result);
    switch (body?.p_acao) {
      case 'contexto': return Response.json(context);
      case 'produtos': return Response.json({ produtos: [product], total: 1 });
      case 'produto_salvar': return Response.json({ produto: product });
      case 'disponiveis': return Response.json({produtos:[{...product,estoque_de_outra_unidade:'Não retornar'}],total:1});
      case 'vincular': return Response.json({produto:product});
      case 'entradas': return Response.json({ entradas: [receipt] });
      case 'entrada_criar':
      case 'entrada_confirmar':
      case 'entrada_aprovar_divergencia': return Response.json({ entrada: receipt });
      case 'saldos': return Response.json({ saldos: [{ produto_id: product.id, produto: 'Arroz', unidade_medida: 'kg', lote_id: '5', lote: 'LOTE-A', validade: null, camara_id: '1', local: 'Depósito', quantidade: '20.000001', valor_unitario: '0.000001' }] });
      default: throw Error('Ação inesperada no teste');
    }
  };
  return { requests, fetcher };
}

test('SDK de estoque valida Auth real antes da RPC e usa apenas Bearer/publicável/schema erp', async () => {
  const { requests, fetcher } = transport();
  const app = createApp(undefined, (runtime, token) => createSupabaseStockSession(runtime, token, fetcher));
  const response = await app.fetch(new Request('https://erp.test/api/unidades/1/estoque/contexto', { headers: { Authorization: 'Bearer usuario-a' } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(requests.map(row => row.path), ['/auth/v1/user', '/rest/v1/rpc/estoque_operacao']);
  for (const row of requests) {
    assert.equal(row.headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(row.headers.get('Authorization'), 'Bearer usuario-a');
    assert.ok(row.signal instanceof AbortSignal);
  }
  assert.equal(requests[1]?.headers.get('Content-Profile'), 'erp');
  assert.deepEqual(requests[1]?.body, { p_unidade: '1', p_acao: 'contexto', p_dados: {} });
});

test('catálogo usa RPC própria e elimina campos locais da resposta disponível',async()=>{
 const {requests,fetcher}=transport();const {repository}=createSupabaseStockSession(env,'usuario-a',fetcher);
 const available=await repository.availableProducts('1',{q:'arroz',offset:0});
 assert.deepEqual(Object.keys(available.produtos[0]!).sort(),['id','revisao','descricao','complemento','unidade_sigla','categoria_descricao','apresentacao_compra','armazenamento'].sort());
 assert.equal(available.produtos[0]?.id,product.id);
 const body={revisao:'2',estoque_minimo:'0.000001',estoque_maximo:null,ponto_reposicao:null};
 assert.equal((await repository.linkProduct('1',product.id,body)).produto.id,product.id);
 assert.ok(requests.every(r=>r.path==='/rest/v1/rpc/catalogo_unidade'));
 assert.deepEqual(requests[1]?.body,{p_unidade:'1',p_acao:'vincular',p_dados:{...body,id:product.id}});
});
test('oito ações usam somente RPC e mantêm IDs/revisão/decimais como strings', async () => {
  const { requests, fetcher } = transport();
  const { repository } = createSupabaseStockSession(env, 'usuario-a', fetcher);
  await repository.context('1');
  assert.equal((await repository.products('1', { q: '', status: 'ATIVO', offset: 0 })).produtos[0]?.id, product.id);
  await repository.saveProduct('1', input, product.id, '1');
  await repository.receipts('1');
  assert.equal((await repository.createReceipt('1', entry)).entrada.total_itens, '0.000000000001');
  await repository.confirmReceipt('1', receipt.id, '00000000-0000-4000-8000-000000000002');
  await repository.approveReceipt('1', receipt.id, 'Conferido pela gestão');
  assert.equal((await repository.balances('1')).saldos[0]?.quantidade, '20.000001');
  assert.deepEqual(requests.map(row => row.body?.p_acao), ['contexto', 'produtos', 'produto_salvar', 'entradas', 'entrada_criar', 'entrada_confirmar', 'entrada_aprovar_divergencia', 'saldos']);
  assert.ok(requests.every(row => row.path === '/rest/v1/rpc/estoque_operacao'));
  assert.deepEqual(requests[2]?.body?.p_dados, { ...input, id: product.id, revisao: '1' });
});
test('SQLSTATE traduz negação, conflito/revisão e validação sem vazar mensagens', async () => {
  for (const [code, expected] of [['PT403', 403], ['42501', 403], ['PT404', 404], ['PT409', 409], ['23505', 409], ['PT412', 412], ['PT422', 422], ['23514', 422], ['XX000', 503]] as const) {
    const { fetcher } = transport({ code });
    await assert.rejects(() => createSupabaseStockSession(env, 'usuario', fetcher).repository.createReceipt('1', entry), (error: unknown) => error instanceof ApiError && error.status === expected && !/SQL|senha|interno/.test(error.message));
  }
});
test('JWT expirado na Data API retorna 401 mesmo após autenticação anterior', async () => {
  const { fetcher } = transport({ code: 'JWT_EXPIRED', status: 401 });
  const session = createSupabaseStockSession(env, 'usuario', fetcher);
  await session.authenticate();
  await assert.rejects(() => session.repository.context('1'), (error: unknown) => error instanceof ApiError && error.status === 401);
});
test('Auth inválido/anônimo não se transforma em autorização de estoque', async () => {
  for (const options of [{ authStatus: 401 }, { authStatus: 403 }, { anonymous: true }]) {
    const { fetcher, requests } = transport(options);
    const session = createSupabaseStockSession(env, 'usuario', fetcher);
    await assert.rejects(() => session.authenticate(), (error: unknown) => error instanceof ApiError && error.status === 401);
    assert.ok(requests.every(row => row.path === '/auth/v1/user'));
  }
});
test('credencial administrativa e URL insegura são recusadas antes da rede', () => {
  for (const settings of [{ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_ficticio' }, { ...env, SUPABASE_URL: 'http://supabase.test' }, { ...env, SUPABASE_URL: 'https://supabase.test/?token=qualquer' }]) {
    assert.throws(() => createSupabaseStockSession(settings, 'usuario'), (error: unknown) => error instanceof ApiError && error.status === 503);
  }
});
test('bigint/decimal numérico ou catálogo de resposta inválido causam 503 sem arredondamento', async () => {
  for (const result of [{ produtos: [{ ...product, id: 9007199254740992 }], total: 1 }, { produtos: [{ ...product, fator_correcao: 1 }], total: 1 }, { produtos: [product], total: '1' }]) {
    const { fetcher } = transport({ result });
    await assert.rejects(() => createSupabaseStockSession(env, 'usuario', fetcher).repository.products('1', { q: '', status: 'ATIVO', offset: 0 }), (error: unknown) => error instanceof ApiError && error.status === 503);
  }
});
test('resposta de entrada cruza unidade ou perde precisão monetária e é rejeitada', async () => {
  for (const value of [{ ...receipt, unidade_id: '2' }, { ...receipt, total_itens: 0.000000000001 }]) {
    const { fetcher } = transport({ result: { entrada: value } });
    await assert.rejects(() => createSupabaseStockSession(env, 'usuario', fetcher).repository.createReceipt('1', entry), (error: unknown) => error instanceof ApiError && error.status === 503);
  }
});
test('resposta RPC não publica propriedades internas do produto/entrada', async () => {
  const { fetcher } = transport({ result: { entrada: { ...receipt, criado_por: 'identidade-interna', detalhes_internos: 'privado', itens: receipt.itens.map(row => ({ ...row, ator_id: 'privado' })) } } });
  const result = await createSupabaseStockSession(env, 'usuario', fetcher).repository.createReceipt('1', entry);
  assert.equal(Object.hasOwn(result.entrada, 'criado_por'), false);
  assert.equal(Object.hasOwn(result.entrada, 'detalhes_internos'), false);
  assert.equal(Object.hasOwn(result.entrada.itens[0]!, 'ator_id'), false);
});
test('clientes por requisição não compartilham Bearer', async () => {
  const { fetcher, requests } = transport();
  await Promise.all(['usuario-a', 'usuario-b'].map(token => createSupabaseStockSession(env, token, fetcher).authenticate()));
  assert.deepEqual(requests.map(row => row.headers.get('Authorization')).sort(), ['Bearer usuario-a', 'Bearer usuario-b']);
});
