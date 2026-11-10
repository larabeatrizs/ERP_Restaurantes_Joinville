import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

let db, close;
const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = (n = 1) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-01-02';
const product = (extra = {}) => ({ descricao: 'Arroz agulhinha', complemento: '', unidade_medida_id: '1', categoria_id: '1', perecivel: false, armazenamento: 'SECO', fator_correcao: '1', apresentacao_compra: 'Saco de 5 kg', quantidade_apresentacao: '5', estoque_minimo: '10', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO', ...extra });
const line = (id, extra = {}) => ({ produto_id: id, quantidade: '20', valor_unitario: '2.75', numero_lote: 'LOTE-SINTETICO', validade: null, camara_id: '1', temperatura: null, aspecto_embalagem: 'Íntegra', conformidade: 'CONFORME', motivo: '', ...extra });
const receipt = (id, extra = {}) => ({ data_entrada: date, fornecedor_id: '1', numero_nf: 'NF-SINTETICA-001', total_nota: '55', observacoes: '', itens: [line(id)], ...extra });

before(async () => {
  if (process.env.DATABASE_STOCK_TEST_URL) {
    const target = new URL(process.env.DATABASE_STOCK_TEST_URL);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/erp_stock_test') throw Error('Somente banco descartável local erp_stock_test.');
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect(); db = { exec: (sql) => client.query(sql), query: (sql, args) => client.query(sql, args) }; close = () => client.end();
  } else { db = new PGlite(); close = () => db.close(); }
  await db.exec(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  const root = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(root)).filter((name) => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, root), 'utf8'));
  await db.exec(`
    insert into auth.users(id) values ${[1, 2, 3, 4, 5, 6, 7].map((n) => `('${uid(n)}')`).join(',')};
    insert into erp.perfil(codigo) values ('ESTOQUISTA'),('GESTOR_UNIDADE'),('AUDITOR'),('NUTRICIONISTA');
    insert into erp.perfil_permissao(perfil_id,permissao) values
      (1,'PRODUTO_LER'),(1,'PRODUTO_GERIR'),(1,'ESTOQUE_LER'),(1,'RECEBIMENTO_GERIR'),
      (2,'PRODUTO_LER'),(2,'PRODUTO_GERIR'),(2,'ESTOQUE_LER'),(2,'RECEBIMENTO_APROVAR_DIVERGENCIA'),
      (3,'PRODUTO_LER'),(3,'ESTOQUE_LER'),(4,'CONFIGURACAO_EDITAR');
    insert into erp.usuario(id,perfil_id,nome,status) values
      ('${uid(1)}',1,'Estoquista sintético A','ATIVO'),('${uid(2)}',1,'Estoquista sintético B','ATIVO'),
      ('${uid(3)}',3,'Leitor sintético A','ATIVO'),('${uid(4)}',2,'Gestor sintético A','ATIVO'),
      ('${uid(5)}',1,'Inativo sintético','INATIVO'),('${uid(6)}',1,'Sem vínculo sintético','ATIVO'),('${uid(7)}',4,'Só configurações sintético','ATIVO');
    insert into erp.unidade(codigo,nome) values ('TEST-STOCK-A','Unidade sintética A'),('TEST-STOCK-B','Unidade sintética B');
    insert into erp.usuario_unidade values ('${uid(1)}',1),('${uid(2)}',2),('${uid(3)}',1),('${uid(4)}',1),('${uid(5)}',1),('${uid(7)}',1);
    insert into erp.unidade_medida(sigla,descricao,grandeza) values ('KG','Quilograma','MASSA'),('UN','Unidade','CONTAGEM');
    insert into erp.categoria(descricao) values ('Mercearia');
    insert into erp.fornecedor(razao_social,cnpj_cpf) values ('Fornecedor sintético','11222333000181');
    insert into erp.camara(unidade_id,nome,tipo) values (1,'Almoxarifado A','SECO'),(2,'Almoxarifado B','SECO'),(1,'Congelada A','CONGELADO');
  `);
});
after(async () => { if (close) await close(); });

async function actor(n, callback, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [n === null ? '' : uid(n)]);
    if (role !== 'owner') await db.exec(`set local role ${role}`);
    await callback();
  } finally { await db.exec('rollback'); }
}
async function rpc(action, data = {}, unit = 1, client = db) {
  return (await client.query('select erp.estoque_operacao($1,$2,$3::jsonb) as result', [unit, action, JSON.stringify(data)])).rows[0].result;
}
async function rejects(action, data, code = 'PT422', unit = 1) {
  await db.exec('savepoint invalid');
  await assert.rejects(() => rpc(action, data, unit), { code });
  await db.exec('rollback to savepoint invalid');
}
async function sqlRejects(sql, code = '42501') {
  await db.exec('savepoint denied'); await assert.rejects(() => db.exec(sql), { code }); await db.exec('rollback to savepoint denied');
}
async function create(extra) { return (await rpc('produto_salvar', product(extra))).produto; }
async function receive(id, extra) { return (await rpc('entrada_criar', receipt(id, extra))).entrada; }
async function confirm(id, n = 1) { return (await rpc('entrada_confirmar', { id, chave: key(n) })).entrada; }

test('schema novo tem RLS, executor restrito e nenhum DML cliente ou USAGE auth', async () => {
  const rows = (await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and c.relkind='r'")).rows;
  assert.equal(rows.length, 20); assert.ok(rows.every((r) => r.relrowsecurity));
  const role = (await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname='erp_stock_writer'")).rows[0];
  assert.ok(Object.values(role).every((v) => v === false));
  const grants = (await db.query("select has_schema_privilege('erp_stock_writer','auth','USAGE') as auth_usage,pg_has_role('authenticated','erp_stock_writer','MEMBER') as member,has_schema_privilege('erp_stock_writer','erp_private','CREATE') as can_create")).rows[0];
  assert.deepEqual(grants, { auth_usage: false, member: false, can_create: false });
  const privileged = (await db.query("select pg_get_userbyid(p.proowner) as owner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname='estoque_operacao'")).rows[0];
  assert.equal(privileged.owner, 'erp_stock_writer'); assert.ok(privileged.proconfig.includes('search_path=""'));
  const exposed = (await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('erp','erp_private') and p.proname like 'estoque_%' and a.privilege_type='EXECUTE' and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='anon'))")).rows;
  assert.deepEqual(exposed, []);
});

test('estoquista sem CONFIGURACAO_LER seleciona unidade e contexto autorizado', async () => actor(1, async () => {
  assert.deepEqual((await db.query('select id::text from erp.unidade')).rows, [{ id: '1' }]);
  assert.deepEqual((await db.query('select * from erp.parametro_unidade')).rows, []);
  const ctx = await rpc('contexto'); assert.equal(ctx.medidas.length, 2); assert.equal(ctx.locais.length, 2);
  assert.deepEqual(ctx.capacidades, { produto_escrever: true, recebimento_escrever: true, divergencia_aprovar: false });
}));

test('produto persiste, busca normalizada, parâmetros locais e revisão otimista', async () => actor(1, async () => {
  const p = await create(); assert.equal(typeof p.id, 'string'); assert.equal(p.estoque_minimo, '10.000000');
  assert.equal((await rpc('produtos', { q: '  ARROZ ', status: 'ATIVO', offset: 0 })).total, 1);
  const edited = (await rpc('produto_salvar', { ...product(), id: p.id, revisao: p.revisao, estoque_minimo: '0', complemento: 'Tipo 1' })).produto;
  assert.equal(edited.revisao, '2'); assert.equal(edited.estoque_minimo, '0.000000');
  await rejects('produto_salvar', { ...product(), id: p.id, revisao: p.revisao }, 'PT412');
  assert.equal((await rpc('produtos', {})).produtos[0].complemento, 'Tipo 1');
}));

test('unicidade global normaliza NFC/NFD, caixa, acentos e espaços concorrentes', async () => actor(1, async () => {
  await create({ descricao: '  Café   Torrado ', complemento: 'Seleção' });
  await rejects('produto_salvar', product({ descricao: 'CAFE\u0301 TORRADO', complemento: 'selec\u0327a\u0303o' }), 'PT409');
  await rejects('produto_salvar', product({ descricao: '\tCAFÉ TORRADO\t', complemento: 'SELEÇÃO' }), 'PT409');
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(2)]); await db.exec('set local role authenticated');
  assert.deepEqual(await rpc('produtos', {}, 2), { produtos: [], total: 0 });
  await rejects('produto_salvar', product({ descricao: 'cafe torrado', complemento: 'selecao' }), 'PT409', 2);
}));

test('payload de produto é estrito e não arredonda nem coage tipos', async () => actor(1, async () => {
  for (const extra of [{ descricao: '' }, { perecivel: 'false' }, { quantidade_apresentacao: '0' }, { fator_correcao: '0' }, { estoque_minimo: '-1' }, { estoque_minimo: '0.0000001' }, { estoque_minimo: '1000000000000' }, { estoque_minimo: 5 }, { estoque_minimo: 'NaN' }, { unidade_medida_id: 1 }, { saldo: '20' }, { ator_id: uid(1) }, { estoque_maximo: '5' }, { armazenamento: 'LIVRE' }]) await rejects('produto_salvar', product(extra));
  await rejects('produto_salvar', { ...product(), id: '1' });
  await rejects('produtos', { status: 'TODOS' }); await rejects('produtos', { offset: -1 });
  assert.equal((await rpc('produtos')).total, 0);
}));

test('compra 20 kg confirma um lote, livro, saldo exato e documento imutável', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id); assert.equal(e.estado, 'RASCUNHO'); assert.deepEqual((await rpc('saldos')).saldos, []);
  const confirmed = await confirm(e.id); assert.equal(confirmed.estado, 'CONFIRMADA');
  const [saldo] = (await rpc('saldos')).saldos; assert.equal(saldo.quantidade, '20.000000'); assert.equal(saldo.lote, 'LOTE-SINTETICO'); assert.equal(saldo.local, 'Almoxarifado A'); assert.equal(saldo.produto_id, p.id);
  assert.deepEqual(await confirm(e.id), confirmed); assert.deepEqual(await confirm(e.id, 2), confirmed);
  const e2 = await receive(p.id, { numero_nf: 'NF-OUTRA' }); await rejects('entrada_confirmar', { id: e2.id, chave: key() }, 'PT409');
  assert.equal((await rpc('saldos')).saldos.length, 1);
  await rejects('produto_salvar', { ...product(), id: p.id, revisao: p.revisao, unidade_medida_id: '2' }, 'PT409');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n, 1);
  await sqlRejects(`update erp.entrada set numero_nf='OUTRA' where id=${e.id}`);
  await sqlRejects(`delete from erp.entrada_item where entrada_id=${e.id}`);
  await sqlRejects(`insert into erp.entrada_item(unidade_id,entrada_id,produto_id,unidade_medida_id,quantidade,valor_unitario,numero_lote,camara_id,aspecto_embalagem,conformidade,motivo) select unidade_id,entrada_id,produto_id,unidade_medida_id,1,1,'NOVO',camara_id,aspecto_embalagem,conformidade,motivo from erp.entrada_item where entrada_id=${e.id}`);
  await sqlRejects('delete from erp.movimento_estoque'); await sqlRejects('update erp.auditoria_estoque set acao=\'reescrita\'');
}));

test('recusado conserva documento/motivo mas não gera lote nem crédito; lote automático é determinístico', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id, { itens: [line(p.id, { conformidade: 'RECUSADO', motivo: 'Embalagem danificada' }), line(p.id, { quantidade: '1', numero_lote: null })], total_nota: null });
  await confirm(e.id); const [saldo] = (await rpc('saldos')).saldos; assert.equal(saldo.quantidade, '1.000000'); assert.match(saldo.lote, new RegExp(`^E-${e.id}-I-`));
  assert.equal((await rpc('entradas')).entradas[0].itens.length, 2);
}));

test('NF/fornecedor é única entre unidades e erro de item reverte entrada inteira', async () => actor(1, async () => {
  const p = await create(); await receive(p.id);
  await rejects('entrada_criar', receipt(p.id), 'PT409');
  await rejects('entrada_criar', receipt(p.id, { numero_nf: 'ERRO-ITEM', itens: [line(p.id), line(p.id, { camara_id: '2' })] }));
  assert.equal((await rpc('entradas')).entradas.length, 1);
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(2)]); await db.exec('set local role authenticated');
  const b = (await rpc('produto_salvar', product({ descricao: 'Produto B' }), 2)).produto;
  await rejects('entrada_criar', receipt(b.id, { itens: [line(b.id, { camara_id: '2' })] }), 'PT409', 2);
}));

test('data/validade/temperatura/conformidade e vínculo produto/local são validados', async () => actor(1, async () => {
  const p = await create({ perecivel: true, armazenamento: 'CONGELADO' });
  for (const item of [line(p.id), line(p.id, { validade: '2026-01-01', temperatura: '-18' }), line(p.id, { validade: '2030-01-01' }), line(p.id, { validade: '2030-01-01', temperatura: '-18', conformidade: 'RESSALVA' }), line(p.id, { validade: '2030-01-01', temperatura: '-18', quantidade: '0' })]) await rejects('entrada_criar', receipt(p.id, { itens: [item] }));
  await rejects('entrada_criar', receipt(p.id, { data_entrada: '2999-01-01' }));
  await rejects('entrada_criar', receipt(p.id, { data_entrada: '2026-02-30' }));
  await rejects('entrada_criar', receipt(p.id, { numero_nf: '' }));
  const e = await receive(p.id, { itens: [line(p.id, { validade: '2030-01-01', temperatura: '-18', camara_id: '3', numero_lote: null })] });
  await confirm(e.id); assert.equal((await rpc('saldos')).saldos[0].quantidade, '20.000000');
}));

test('total divergente exige aprovação distinta, que não credita estoque', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id, { total_nota: '56' });
  await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'PT409');
  await rejects('entrada_aprovar_divergencia', { id: e.id, motivo: 'Divergência documentada' }, 'PT403');
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(4)]); await db.exec('set local role authenticated');
  const approval = await rpc('entrada_aprovar_divergencia', { id: e.id, motivo: 'Conferência distinta do gestor' }); assert.equal(approval.entrada.divergencia_aprovada, true); assert.equal(approval.entrada.estado, 'RASCUNHO'); assert.deepEqual((await rpc('saldos')).saldos, []);
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]); await db.exec('set local role authenticated');
  await confirm(e.id); assert.equal((await rpc('saldos')).saldos[0].quantidade, '20.000000');
}));

test('autoaprovação é negada mesmo com capacidade explícita e sem burlar trilha', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id, { total_nota: '56' });
  await db.exec('reset role'); await db.exec("insert into erp.perfil_permissao values(1,'RECEBIMENTO_APROVAR_DIVERGENCIA')"); await db.exec('set local role authenticated');
  await rejects('entrada_aprovar_divergencia', { id: e.id, motivo: 'Tentativa da própria autoria' }, 'PT403');
}));

test('falha de auditoria na confirmação reverte lote/livro/saldo/estado/idempotência', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await db.exec('reset role');
  await db.exec("create function erp_private.falha_stock() returns trigger language plpgsql as $$ begin if new.acao='entrada_confirmar' then raise exception 'Falha induzida'; end if; return new; end $$; create trigger falha_stock before insert on erp.auditoria_estoque for each row execute function erp_private.falha_stock()");
  await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'P0001');
  assert.deepEqual((await rpc('saldos')).saldos, []); assert.equal((await rpc('entradas')).entradas[0].estado, 'RASCUNHO');
  await db.exec('reset role');
  for (const table of ['lote', 'movimento_estoque', 'saldo_lote_local', 'comando_estoque']) assert.equal((await db.query(`select count(*)::int as n from erp.${table}`)).rows[0].n, 0);
}));

test('decimais são exatos, preservam seis casas e total calculado sem float', async () => actor(1, async () => {
  const p = await create({ estoque_minimo: '0.000001' });
  const e = await receive(p.id, { total_nota: null, itens: [line(p.id, { quantidade: '0.123456', valor_unitario: '0.123456' })] });
  assert.equal(e.total_itens, '0.015241383936'); await confirm(e.id); assert.equal((await rpc('saldos')).saldos[0].quantidade, '0.123456');
}));

test('leitor, configuração isolada, inativo, revogado e ausência de identidade não gravam', async () => {
  for (const n of [3, 7]) await actor(n, async () => { await rejects('produto_salvar', product(), 'PT403'); await rejects('entrada_criar', receipt('1'), 'PT403'); });
  for (const n of [5, 6, 999]) await actor(n, async () => { await rejects('contexto', {}, 'PT404'); });
  await actor(null, async () => { await rejects('contexto', {}, 'PT403'); });
  await actor(null, async () => { await rejects('contexto', {}, '42501'); }, 'anon');
  await actor(1, async () => {
    await rejects('saldos', {}, 'PT404', 2);
    await db.exec('reset role'); await db.exec(`delete from erp.usuario_unidade where usuario_id='${uid(1)}'`); await db.exec('set local role authenticated'); await rejects('contexto', {}, 'PT404');
  });
});

test('DML direto não altera documento/livro/saldo/catálogo/capacidade', async () => actor(1, async () => {
  for (const sql of ["insert into erp.produto(descricao) values('Invasão')", "update erp.entrada set estado='CONFIRMADA'", 'delete from erp.entrada_item', 'update erp.saldo_lote_local set quantidade=99', 'delete from erp.movimento_estoque', 'delete from erp.auditoria_estoque', "insert into erp.perfil_permissao values(1,'RECEBIMENTO_APROVAR_DIVERGENCIA')"]) await sqlRejects(sql);
}));

test('revogação de capacidade e inativação do produto/local são revalidadas na confirmação', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await db.exec('reset role'); await db.exec(`update erp.produto set status='INATIVO' where id=${p.id}`); await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() });
  await db.exec('reset role'); await db.exec(`update erp.produto set status='ATIVO' where id=${p.id}; update erp.camara set status='INATIVO' where id=1`); await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() });
  await db.exec('reset role'); await db.exec("update erp.camara set status='ATIVO' where id=1; delete from erp.perfil_permissao where permissao='RECEBIMENTO_GERIR'"); await db.exec('set local role authenticated'); await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'PT403');
}));

test('FK composta impede câmara de outra unidade mesmo em DML administrativo', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await db.exec('reset role'); await sqlRejects(`update erp.entrada_item set camara_id=2 where entrada_id=${e.id}`, '23503');
}));

test('rascunho conserva unidade-base da quantidade e rejeita confirmação após mudança do catálogo', async () => actor(1, async () => {
  const p = await create(); const e = await receive(p.id);
  await rpc('produto_salvar', { ...product(), id: p.id, revisao: p.revisao, unidade_medida_id: '2' });
  assert.equal((await rpc('entradas')).entradas[0].itens[0].unidade_medida, 'KG');
  await rejects('entrada_confirmar', { id: e.id, chave: key() }, 'PT409');
}));

test('duas conexões confirmam uma única vez e NF concorrente entre unidades é única', { skip: !process.env.DATABASE_STOCK_TEST_URL, timeout: 20000 }, async () => {
  const a = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
  const b = new pg.Client({ connectionString: process.env.DATABASE_STOCK_TEST_URL });
  let pending;
  async function waitForLock(pid) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await db.query('select cardinality(pg_blocking_pids($1))>0 as blocked', [pid])).rows[0].blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('Segunda conexão não aguardou o lock esperado');
  }
  try {
    await a.connect(); await b.connect();
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(1)]); await db.exec('set role authenticated');
    const p = (await rpc('produto_salvar', product({ descricao: 'Produto concorrente' }))).produto;
    const e = (await rpc('entrada_criar', receipt(p.id, { numero_nf: 'NF-CONCORRENTE' }))).entrada;
    await db.exec('reset role');
    for (const client of [a, b]) { await client.query('begin'); await client.query("set local statement_timeout='5s'"); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]); await client.query('set local role authenticated'); }
    await rpc('entrada_confirmar', { id: e.id, chave: key(10) }, 1, a);
    const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    pending = rpc('entrada_confirmar', { id: e.id, chave: key(11) }, 1, b).then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(pid);
    await a.query('commit'); const result = await pending; assert.ifError(result.error); assert.equal(result.value.entrada.estado, 'CONFIRMADA'); await b.query('commit');
    assert.equal((await db.query('select count(*)::int as n from erp.movimento_estoque')).rows[0].n, 1);
    assert.equal((await db.query('select sum(quantidade)::text as q from erp.saldo_lote_local')).rows[0].q, '20.000000');
    // Native lock orchestration for cross-unit invoice UNIQUE, without table scans or advisory stand-ins.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(2)]); await db.exec('set role authenticated');
    const p2 = (await rpc('produto_salvar', product({ descricao: 'Produto concorrente B' }), 2)).produto; await db.exec('reset role');
    for (const [client, n] of [[a, 1], [b, 2]]) { await client.query('begin'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(n)]); await client.query('set local role authenticated'); }
    await rpc('entrada_criar', receipt(p.id, { numero_nf: 'NF-RACE' }), 1, a);
    pending = rpc('entrada_criar', receipt(p2.id, { numero_nf: 'NF-RACE', itens: [line(p2.id, { camara_id: '2' })] }), 2, b).then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(pid);
    await a.query('commit'); assert.equal((await pending).error?.code, 'PT409'); await b.query('rollback');
    assert.equal((await db.query("select count(*)::int as n from erp.entrada where numero_nf='NF-RACE'")).rows[0].n, 1);
    // Permission revoked while an editor waits for a product lock must be fresh.
    await a.query('begin'); await a.query('select id from erp.produto where id=$1 for no key update', [p.id]);
    await b.query('begin'); await b.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]); await b.query('set local role authenticated');
    pending = rpc('produto_salvar', { ...product({ descricao: p.descricao }), id: p.id, revisao: p.revisao }, 1, b).then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(pid); await db.exec("delete from erp.perfil_permissao where perfil_id=1 and permissao='PRODUTO_GERIR'");
    await a.query('commit'); assert.equal((await pending).error?.code, 'PT403'); await b.query('rollback');
    await db.exec("insert into erp.perfil_permissao values(1,'PRODUTO_GERIR')");
  } finally {
    await a.query('rollback').catch(() => {}); if (pending) await pending; await b.query('rollback').catch(() => {}); await db.exec('reset role'); await Promise.all([a.end(), b.end()]);
  }
});
