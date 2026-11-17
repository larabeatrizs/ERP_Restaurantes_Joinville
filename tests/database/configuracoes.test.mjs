import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

let db;
let close;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

before(async () => {
  if (process.env.DATABASE_TEST_URL) {
    const target = new URL(process.env.DATABASE_TEST_URL);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/erp_config_test') {
      throw new Error('Testes permitidos apenas no banco descartável local erp_config_test.');
    }
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect();
    db = { exec: (sql) => client.query(sql), query: (sql, args) => client.query(sql, args) };
    close = () => client.end();
  } else {
    db = new PGlite();
    close = () => db.close();
  }
  await db.exec(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  const migrationRoot = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrationRoot)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, migrationRoot), 'utf8'));
  }
  await db.exec(await readFile(new URL('./fixtures.sql', import.meta.url), 'utf8'));
});

after(async () => { if (close) await close(); });

async function transaction(actor, callback, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor === null ? '' : uid(actor)]);
    if (role === 'authenticated') await db.exec('set local role authenticated');
    if (role === 'anon') await db.exec('set local role anon');
    await callback();
  } finally {
    await db.exec('rollback');
  }
}

async function expectSqlError(sql, code) {
  await db.exec('savepoint error_case');
  await assert.rejects(() => db.exec(sql), { code });
  await db.exec('rollback to savepoint error_case');
}

test('inventário de staging lê metadados em transação readonly sem alterar configuração ou auditoria', async () => {
  const state = () => db.query('select revisao::text from erp.parametro_unidade order by unidade_id');
  const before = (await state()).rows;
  const audit = () => db.query('select count(*)::text as total from erp.auditoria_configuracao');
  const auditBefore = (await audit()).rows;
  const sql = await readFile(new URL('../../scripts/staging/inventario.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/^--.*$/gm, '').trim();
  assert.match(statements, /^select\b/i);
  assert.doesNotMatch(statements, /^\s*(begin|commit|rollback|set)\b/im, 'CLI --read-only aceita consulta, não controle de transação no arquivo');
  const results = await db.exec(`begin transaction read only; ${sql} rollback;`);
  const report = results.find(result => result.rows?.[0]?.inventario)?.rows[0].inventario;
  assert.ok(report);
  assert.equal(report.somente_leitura, 'on');
  assert.equal(report.relacoes.filter(row => row.schema === 'erp').length, 25);
  assert.ok(report.relacoes.filter(row => row.schema === 'erp').every(row => row.rls));
  assert.equal(report.funcoes.find(row => row.schema === 'erp_private' && row.security_definer).proprietario, 'erp_config_writer');
  assert.deepEqual((await state()).rows, before);
  assert.deepEqual((await audit()).rows, auditBefore);
});

test('verificador da fundação confere RLS, grants e escritor restrito no laboratório', async () => {
  const sql = await readFile(new URL('../../scripts/staging/verificar-fundacao.sql', import.meta.url), 'utf8');
  const report = (await db.query(sql)).rows[0].foundation;
  assert.equal(report.tables.length, 25);
  assert.ok(report.tables.every(table => table.rls && !table.anon_select && !table.authenticated_write));
  assert.equal(report.anon_erp_usage, false);
  assert.equal(report.anon_private_usage, false);
  assert.equal(report.authenticated_erp_usage, true);
  assert.ok(Object.values(report.writer).every(value => value === false));
  assert.ok(report.functions.every(fn => !fn.anon_execute));
  const privileged = report.functions.filter(fn => fn.definer);
  assert.deepEqual(privileged.map(fn => [fn.schema, fn.name, fn.owner]).sort(), [
    ['erp_private', 'atualizar_configuracao', 'erp_config_writer'],
    ['erp_private', 'calendario_operacao', 'erp_stock_writer'],
    ['erp_private', 'catalogo_unidade', 'erp_stock_writer'],
    ['erp_private', 'categoria_operacao', 'erp_stock_writer'],
    ['erp_private', 'estoque_operacao', 'erp_stock_writer'],
    ['erp_private', 'fornecedor_operacao', 'erp_stock_writer'],
    ['erp_private', 'medida_operacao', 'erp_stock_writer'],
    ['erp_private', 'produto_ciclo_operacao', 'erp_stock_writer'],
    ['erp_private', 'produto_exclusao_motivo', 'erp_product_reference_reader'],
    ['erp_private', 'usuario_login_salvar', 'erp_identity_writer'],
  ]);
});

const loginSave = async (user, login, revision = null, reason = 'Cadastro sintético', client = db) =>
  (await client.query('select erp_private.usuario_login_salvar($1,$2,$3,$4) as result', [uid(user), login, revision, reason])).rows[0].result;
async function identityTransaction(callback) {
  await db.exec('begin');
  try {
    await db.exec("insert into erp.perfil_permissao select id,'USUARIO_GERIR' from erp.perfil where codigo='ADMIN'");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
    await callback();
  } finally { await db.exec('rollback'); }
}
async function loginError(user, login, revision, code, reason = 'Cadastro sintético') {
  await db.exec('savepoint identity_error');
  await assert.rejects(() => loginSave(user, login, revision, reason), { code });
  await db.exec('rollback to savepoint identity_error');
}
test('identidade: migration não cadastra login nem concede administração aos perfis existentes', async () => {
  assert.equal((await db.query('select count(*)::int n from erp_private.usuario_login')).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from erp.perfil_permissao where permissao like 'USUARIO_%'")).rows[0].n, 0);
  const role = (await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,pg_has_role('authenticated',oid,'MEMBER') member from pg_roles where rolname='erp_identity_writer'")).rows[0];
  assert.ok(Object.values(role).every(v => v === false));
  assert.equal((await db.query("select has_schema_privilege('erp_identity_writer','erp_private','CREATE') value")).rows[0].value, false);
  assert.equal((await db.query("select has_table_privilege('erp_identity_writer','auth.users','SELECT') value")).rows[0].value, false);
});
test('identidade: criação/alteração auditadas, reexecução sem mudança e revisão obsoleta sem escrita', async () => identityTransaction(async () => {
  assert.deepEqual(await loginSave(3, 'operador.a'), { login: 'operador.a', revisao: '1', alterado: true });
  await loginError(3, 'outro.nome', null, 'PT412');
  assert.deepEqual(await loginSave(3, 'operador.a', '1'), { login: 'operador.a', revisao: '1', alterado: false });
  assert.deepEqual(await loginSave(3, 'operador.b', '1', '  Revisão sintética  '), { login: 'operador.b', revisao: '2', alterado: true });
  await loginError(3, 'operador.c', '1', 'PT412');
  const events = (await db.query('select login_anterior,login_novo,revisao::text,motivo from erp_private.auditoria_login order by id')).rows;
  assert.deepEqual(events, [
    { login_anterior: null, login_novo: 'operador.a', revisao: '1', motivo: 'Cadastro sintético' },
    { login_anterior: 'operador.a', login_novo: 'operador.b', revisao: '2', motivo: 'Revisão sintética' },
  ]);
}));
test('identidade: login único entre unidades, inválidos e alvo inexistente não deixam estado parcial', async () => identityTransaction(async () => {
  await loginSave(1, 'operador.a');
  await loginError(2, 'operador.a', null, 'PT409');
  for (const login of ['ab', 'a'.repeat(41), 'ADMIN', ' nome ', 'nome@example.invalid', 'usuário', 'a\nb', null]) await loginError(3, login, null, 'PT422');
  for (const reason of [' ', '\u00a0\u00a0\u00a0', 'a', 'a'.repeat(501), 'abc\t', null]) await loginError(3, 'operador.c', null, 'PT422', reason);
  await loginError(3, 'operador.c', '0', 'PT422');
  await loginError(3, 'operador.c', '1', 'PT412');
  await loginError(99, 'operador.c', null, 'PT404');
  assert.equal((await db.query('select count(*)::int n from erp_private.usuario_login')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int n from erp_private.auditoria_login')).rows[0].n, 1);
}));
test('identidade: sem ator, sem capacidade, não ADMIN, inativo e bloqueado são negados', async () => identityTransaction(async () => {
  for (const actor of ['', uid(3), uid(4)]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await loginError(2, 'operador.b', null, 'PT403');
  }
  await db.exec("insert into erp.perfil_permissao select id,'USUARIO_GERIR' from erp.perfil where codigo='ESTOQUISTA'");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(3)]);
  await loginError(2, 'operador.b', null, 'PT403');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
  await db.exec(`update erp.usuario set status='BLOQUEADO' where id='${uid(1)}'`);
  await loginError(2, 'operador.b', null, 'PT403');
  await db.exec(`update erp.usuario set status='ATIVO' where id='${uid(1)}';delete from erp.perfil_permissao where permissao='USUARIO_GERIR'`);
  await loginError(2, 'operador.b', null, 'PT403');
}));
test('identidade: tabelas/rotina privadas negam leitura e DML direto a anon/autenticado', async () => {
  for (const role of ['anon', 'authenticated']) await transaction(1, async () => {
    await expectSqlError('select * from erp_private.usuario_login', '42501');
    await expectSqlError('select * from erp_private.auditoria_login', '42501');
    await expectSqlError("select erp_private.usuario_login_salvar(null,'teste',null,'Motivo sintético')", '42501');
    await expectSqlError(`insert into erp_private.usuario_login(usuario_id,login) values('${uid(1)}','indevido')`, '42501');
    await expectSqlError("update erp_private.usuario_login set login='indevido'", '42501');
    await expectSqlError('delete from erp_private.auditoria_login', '42501');
  }, role);
});
test('identidade: escritor não altera identidades Auth/domínio nem remove ou reescreve auditoria', async () => transaction(1, async () => {
  await db.exec('set local role erp_identity_writer');
  await expectSqlError('select * from auth.users', '42501');
  await expectSqlError("update erp.usuario set nome='Indevido'", '42501');
  await expectSqlError('delete from erp_private.usuario_login', '42501');
  await expectSqlError("update erp_private.auditoria_login set motivo='Indevido'", '42501');
  await expectSqlError('delete from erp_private.auditoria_login', '42501');
}, 'root'));
test('identidade: falha de auditoria desfaz cadastro e alteração de login', async () => identityTransaction(async () => {
  await loginSave(1, 'operador.a');
  await db.exec('revoke insert on erp_private.auditoria_login from erp_identity_writer');
  await loginError(2, 'operador.b', null, '42501');
  await loginError(1, 'operador.c', '1', '42501');
  assert.deepEqual((await db.query('select login,revisao::text from erp_private.usuario_login')).rows, [{ login: 'operador.a', revisao: '1' }]);
}));

test('identidade: concorrência revalida revisão e capacidade depois de aguardar lock', { skip: !process.env.DATABASE_TEST_URL }, async () => {
  const first = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
  const second = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
  let pending;
  await Promise.all([first.connect(), second.connect()]);
  try {
    await db.exec("insert into erp.perfil_permissao select id,'USUARIO_GERIR' from erp.perfil where codigo='ADMIN'");
    await db.exec('begin');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
    await loginSave(3, 'concorrente.a'); await db.exec('commit');
    const pid = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
    for (const revoke of [false, true]) {
      await first.query('begin'); await second.query('begin');
      await first.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
      await second.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
      if (revoke) await first.query("select pg_advisory_xact_lock(hashtextextended('erp.usuario_login:'||$1,0))", [uid(3)]);
      else await loginSave(3, 'concorrente.b', '1', 'Primeira revisão', first);
      pending = loginSave(3, 'concorrente.c', revoke ? '2' : '1', 'Revisão concorrente', second).then(value => ({ value }), error => ({ error }));
      let blocked = false;
      for (let i = 0; i < 150; i++) {
        blocked = (await db.query('select cardinality(pg_blocking_pids($1))>0 blocked', [pid])).rows[0].blocked;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, 'A segunda chamada deve aguardar o lock.');
      if (revoke) await first.query("delete from erp.perfil_permissao where permissao='USUARIO_GERIR'");
      await first.query('commit');
      assert.equal((await pending).error?.code, revoke ? 'PT403' : 'PT412');
      await second.query('rollback'); pending = undefined;
    }
    assert.deepEqual((await db.query('select login,revisao::text from erp_private.usuario_login where usuario_id=$1', [uid(3)])).rows, [{ login: 'concorrente.b', revisao: '2' }]);
    assert.equal((await db.query('select count(*)::int n from erp_private.auditoria_login where usuario_id=$1', [uid(3)])).rows[0].n, 2);
  } finally {
    await first.query('rollback').catch(() => {});
    if (pending) await pending;
    await second.query('rollback').catch(() => {});
    await db.exec('rollback');
    await db.query('delete from erp_private.auditoria_login where usuario_id=$1', [uid(3)]);
    await db.query('delete from erp_private.usuario_login where usuario_id=$1', [uid(3)]);
    await db.exec("delete from erp.perfil_permissao where permissao='USUARIO_GERIR'");
    await Promise.all([first.end(), second.end()]);
  }
});

test('retorno por desativação nega leitura/RPC sem excluir dados', async () => {
  const before = (await db.query('select unidade_id::text,revisao::text from erp.parametro_unidade order by unidade_id')).rows;
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(1)]);
    await db.exec('set local role authenticated');
    assert.equal((await db.query('select * from erp.parametro_unidade')).rows.length,1);
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../../scripts/staging/desativar-fundacao.sql', import.meta.url), 'utf8'));
    await db.exec('set local role authenticated');
    await expectSqlError('select * from erp.parametro_unidade', '42501');
    await expectSqlError("select * from erp.atualizar_configuracao(1,1,'{}'::jsonb,'teste')", '42501');
    await db.exec('reset role');
    assert.deepEqual((await db.query('select unidade_id::text,revisao::text from erp.parametro_unidade order by unidade_id')).rows,before);
  } finally { await db.exec('rollback'); }
});

test('RLS nas tabelas e somente funções privilegiadas conhecidas com executores restritos', async () => {
  const tables = await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and c.relkind='r'");
  assert.equal(tables.rows.length, 25);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  const functions = await db.query("select proname,pg_get_userbyid(proowner) as owner,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('erp','erp_private') and prosecdef");
  assert.deepEqual(functions.rows.map(row => [row.proname, row.owner]).sort(), [
    ['atualizar_configuracao', 'erp_config_writer'], ['calendario_operacao','erp_stock_writer'], ['catalogo_unidade', 'erp_stock_writer'], ['categoria_operacao', 'erp_stock_writer'], ['estoque_operacao', 'erp_stock_writer'], ['fornecedor_operacao', 'erp_stock_writer'], ['medida_operacao', 'erp_stock_writer'], ['produto_ciclo_operacao','erp_stock_writer'], ['produto_exclusao_motivo','erp_product_reference_reader'], ['usuario_login_salvar','erp_identity_writer'],
  ]);
  assert.ok(functions.rows.every(row => row.proconfig.includes('search_path=""')));
  const referenceRole=(await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname='erp_product_reference_reader'")).rows[0];
  assert.ok(Object.values(referenceRole).every(value=>value===false));
  assert.equal((await db.query("select has_schema_privilege('erp_product_reference_reader','erp_private','CREATE') allowed")).rows[0].allowed,false);
  assert.deepEqual((await db.query("select table_name from information_schema.role_table_grants where grantee='erp_product_reference_reader' and privilege_type='SELECT' order by table_name")).rows.map(r=>r.table_name),['entrada_item','lote','produto_unidade']);
  const role = (await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname='erp_config_writer'")).rows[0];
  assert.ok(Object.values(role).every((value) => value === false));
  const grants = (await db.query("select pg_has_role('authenticated','erp_config_writer','MEMBER') as member,has_schema_privilege('erp_config_writer','erp_private','CREATE') as can_create,has_column_privilege('erp_config_writer','erp.parametro_unidade','alterado_por','UPDATE') as actor_write")).rows[0];
  assert.deepEqual(grants, { member: false, can_create: false, actor_write: false });
});

test('RPC e auditoria funcionam sem USAGE auth para o executor, com UID do Auth preservado', async () => {
  await db.exec('begin');
  try {
    await db.exec('revoke usage on schema auth from erp_config_writer');
    assert.equal((await db.query("select has_schema_privilege('erp_config_writer','auth','USAGE') as allowed")).rows[0].allowed,false);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(5)]);
    await db.exec('set local role authenticated');
    const saved=(await db.query("select revisao::text from erp.atualizar_configuracao(1,1,'{\"margem_percentual\":\"6.25\"}'::jsonb,'regressão schema Auth')")).rows[0];
    assert.equal(saved.revisao,'2');
    await db.exec('reset role');
    const audit=(await db.query('select ator_id from erp.auditoria_configuracao where unidade_id=1 and revisao=2')).rows[0];
    assert.equal(audit.ator_id,uid(5));
    const helper=(await db.query("select prosecdef,prosqlbody is not null as parsed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname='ator_autenticado'")).rows[0];
    assert.deepEqual(helper,{prosecdef:false,parsed:true});
  } finally {await db.exec('rollback');}
});

test('leitura acontece como authenticated e retorna apenas a unidade vinculada', async () => {
  await transaction(1, async () => {
    assert.equal((await db.query('select current_user as role')).rows[0].role, 'authenticated');
    const result = await db.query('select unidade_id,modo_saida from erp.parametro_unidade');
    assert.deepEqual(result.rows.map((r) => [String(r.unidade_id), r.modo_saida]), [['1', 'POSTERIOR']]);
    assert.equal((await db.query('select * from erp.parametro_unidade where unidade_id=2')).rows.length, 0);
  });
});

test('segundo usuário consulta apenas a outra unidade', async () => {
  await transaction(2, async () => {
    const rows = (await db.query('select unidade_id from erp.parametro_unidade')).rows;
    assert.deepEqual(rows.map((r) => String(r.unidade_id)), ['2']);
  });
});

test('vínculo não substitui permissão explícita', async () => {
  await transaction(3, async () => {
    assert.equal((await db.query('select * from erp.parametro_unidade')).rows.length, 0);
    assert.equal((await db.query('select * from erp.perfil_permissao')).rows.length, 0);
  });
});

test('usuário inativo, claim ausente e claim desconhecida não consultam configuração', async () => {
  for (const actor of [4, null, 999]) {
    await transaction(actor, async () => {
      assert.equal((await db.query('select * from erp.parametro_unidade')).rows.length, 0);
    });
  }
});

test('role anon não tem acesso ao schema', async () => {
  await transaction(null, async () => {
    await expectSqlError('select * from erp.parametro_unidade', '42501');
  }, 'anon');
});

test('revogação de vínculo e inativação da unidade passam a negar leitura', async () => {
  for (const change of [
    `delete from erp.usuario_unidade where usuario_id='${uid(1)}'`,
    "update erp.unidade set status='INATIVO' where id=1",
  ]) {
    await transaction(1, async () => {
      await db.exec(change);
      await db.exec('set local role authenticated');
      assert.equal((await db.query('select * from erp.parametro_unidade')).rows.length, 0);
    }, 'owner');
  }
});

test('cliente não altera configuração, permissões, usuário ou auditoria por DML direto', async () => {
  await transaction(1, async () => {
    for (const sql of [
      "update erp.parametro_unidade set margem_percentual=50 where unidade_id=1",
      "update erp.usuario set status='ATIVO'",
      "insert into erp.perfil_permissao select id,'CONFIGURACAO_EDITAR' from erp.perfil",
      'delete from erp.auditoria_configuracao',
      'truncate erp.parametro_unidade',
    ]) await expectSqlError(sql, '42501');
  });
});

test('zero e falso são preservados e a alteração produz revisão e trilha', async () => {
  await transaction(1, async () => {
    await db.exec("update erp.parametro_unidade set margem_percentual=0,alerta_email_habilitado=false,motivo_alteracao='Teste zero e falso' where unidade_id=1");
    const row = (await db.query('select * from erp.parametro_unidade where unidade_id=1')).rows[0];
    assert.equal(Number(row.margem_percentual), 0);
    assert.equal(row.alerta_email_habilitado, false);
    assert.equal(Number(row.revisao), 2);
    const audit = (await db.query('select * from erp.auditoria_configuracao where unidade_id=1 and revisao=2')).rows[0];
    assert.equal(audit.ator_id, uid(1));
    assert.equal(Number(audit.antes.margem_percentual), 5);
    assert.equal(Number(audit.depois.margem_percentual), 0);
  }, 'owner');
});

test('combinações inválidas não alteram parâmetros nem deixam auditoria parcial', async () => {
  await transaction(1, async () => {
    for (const change of ["modo_saida='LIVRE'", 'margem_percentual=-1', 'margem_percentual=101', 'prazo_amostra_horas=0', 'dias_alerta_validade=-1', "motivo_alteracao=' '"]) {
      await expectSqlError(`update erp.parametro_unidade set ${change} where unidade_id=1`, '23514');
    }
    assert.equal(Number((await db.query('select revisao from erp.parametro_unidade where unidade_id=1')).rows[0].revisao), 1);
    assert.equal((await db.query('select * from erp.auditoria_configuracao where unidade_id=1')).rows.length, 1);
  }, 'owner');
});

test('identidade de autoria não vem de campos enviados pelo cliente', async () => {
  await transaction(1, async () => {
    await db.exec(`update erp.parametro_unidade set alterado_por='${uid(2)}',motivo_alteracao='Ator real da sessão' where unidade_id=1`);
    assert.equal((await db.query('select alterado_por from erp.parametro_unidade where unidade_id=1')).rows[0].alterado_por, uid(1));
  }, 'owner');
});

test('falha ao inserir auditoria reverte também o update da configuração', async () => {
  await transaction(1, async () => {
    await db.exec("create function erp_private.falha_teste() returns trigger language plpgsql as $$ begin raise exception 'Falha induzida'; end $$; create trigger falha_teste before insert on erp.auditoria_configuracao for each row execute function erp_private.falha_teste()");
    await expectSqlError("update erp.parametro_unidade set margem_percentual=8,motivo_alteracao='Teste de rollback' where unidade_id=1", 'P0001');
    assert.equal(Number((await db.query('select margem_percentual from erp.parametro_unidade where unidade_id=1')).rows[0].margem_percentual), 5);
    assert.equal((await db.query('select * from erp.auditoria_configuracao where unidade_id=1')).rows.length, 1);
  }, 'owner');
});

test('trilha é imutável inclusive para DML comum do proprietário', async () => {
  await transaction(1, async () => {
    await expectSqlError("update erp.auditoria_configuracao set motivo='Reescrita'", '42501');
    await expectSqlError('delete from erp.auditoria_configuracao', '42501');
  }, 'owner');
});

test('histórico respeita a unidade mesmo com permissão de consultar trilha', async () => {
  await transaction(1, async () => {
    const audit = await db.query('select unidade_id from erp.auditoria_configuracao');
    assert.deepEqual(audit.rows.map((r) => String(r.unidade_id)), ['1']);
  });
});

test('ler configuração não concede consulta ao histórico', async () => {
  await transaction(1, async () => {
    await db.exec("delete from erp.perfil_permissao where permissao='CONFIGURACAO_HISTORICO'");
    await db.exec('set local role authenticated');
    assert.equal((await db.query('select * from erp.parametro_unidade')).rows.length, 1);
    assert.equal((await db.query('select * from erp.auditoria_configuracao')).rows.length, 0);
  }, 'owner');
});

test('configuração não muda de unidade e gravação sem ator ativo falha', async () => {
  await transaction(1, async () => {
    await expectSqlError('update erp.parametro_unidade set unidade_id=2 where unidade_id=1', '23514');
  }, 'owner');
  await transaction(null, async () => {
    await expectSqlError('update erp.parametro_unidade set margem_percentual=9 where unidade_id=1', '42501');
  }, 'owner');
});

async function saveConfig(unit = 1, revision = 1, fields = { margem_percentual: '8.25' }, reason = 'Alteração de teste') {
  return db.query('select * from erp.atualizar_configuracao($1,$2,$3::jsonb,$4)', [unit, revision, JSON.stringify(fields), reason]);
}

async function expectSaveError(code, ...args) {
  await db.exec('savepoint save_case');
  await assert.rejects(() => saveConfig(...args), { code });
  await db.exec('rollback to savepoint save_case');
}

test('salvamento mediado como authenticated altera somente os campos permitidos e audita', async () => {
  await transaction(5, async () => {
    const row = (await saveConfig(1, 1, { margem_percentual: '0', alerta_email_habilitado: false })).rows[0];
    assert.equal(Number(row.revisao), 2);
    assert.equal(Number(row.margem_percentual), 0);
    assert.equal(row.alerta_email_habilitado, false);
    assert.equal(row.modo_saida, 'POSTERIOR');
    assert.equal(row.alterado_por, uid(5));
    assert.equal(row.criado_por, uid(1));
    const audit = (await db.query('select * from erp.auditoria_configuracao where unidade_id=1 order by revisao')).rows;
    assert.equal(audit.length, 2);
    assert.equal(audit[1].ator_id, uid(5));
    assert.equal(Number(audit[1].antes.margem_percentual), 5);
    assert.equal(Number(audit[1].depois.margem_percentual), 0);
    await expectSqlError('update erp.parametro_unidade set margem_percentual=50 where unidade_id=1', '42501');
  });
});

test('revisão antiga não sobrescreve mudança nem acrescenta auditoria', async () => {
  await transaction(5, async () => {
    await saveConfig();
    await expectSaveError('PT412');
    assert.equal(Number((await db.query('select revisao from erp.parametro_unidade where unidade_id=1')).rows[0].revisao), 2);
    assert.equal((await db.query('select * from erp.auditoria_configuracao where unidade_id=1')).rows.length, 2);
  });
});

test('revisão obrigatória e positiva', async () => {
  await transaction(5, async () => {
    await expectSaveError('PT428', 1, null);
    await expectSaveError('PT422', 1, 0);
    await expectSaveError('PT422', 1, -1);
  });
});

test('payload estrito rejeita null, chaves extras, coerções e valores inválidos atomicamente', async () => {
  const invalid = [
    null, [], {}, { desconhecido: true }, { revisao: 99 }, { unidade_id: 2 },
    { alterado_por: uid(2) }, { criado_por: uid(2) }, { exige_aprovacao_perda: false },
    { margem_percentual: 5 }, { margem_percentual: null }, { margem_percentual: '5.001' },
    { margem_percentual: '101' }, { margem_percentual: '-1' }, { margem_percentual: 'NaN' },
    { modo_saida: 'LIVRE' }, { modo_saida: true }, { referencia_preco: 'DESCONHECIDO' },
    { dias_alerta_validade: -1 }, { dias_alerta_validade: 1.5 }, { dias_alerta_validade: '7' },
    { dias_alerta_validade: 2147483648 }, { prazo_amostra_horas: 0 },
    { periodicidade_inventario_dias: 0 }, { alerta_email_habilitado: 'false' },
    { margem_percentual: '7', prazo_amostra_horas: 0 },
  ];
  await transaction(5, async () => {
    for (const fields of invalid) await expectSaveError('PT422', 1, 1, fields);
    for (const reason of [null, '', '  ', 'ab']) await expectSaveError('PT422', 1, 1, { margem_percentual: '7' }, reason);
    assert.equal(Number((await db.query('select revisao from erp.parametro_unidade where unidade_id=1')).rows[0].revisao), 1);
    assert.equal((await db.query('select * from erp.auditoria_configuracao where unidade_id=1')).rows.length, 1);
  });
});

test('leitura sem edição, outra unidade, ausência de claim e atores inativos são negados', async () => {
  for (const actor of [1, 2, 3, 4, 6, 7, 8, null, 999]) {
    await transaction(actor, async () => { await expectSaveError('42501'); });
  }
  await transaction(5, async () => { await expectSaveError('42501', 2); });
});

test('revogar vínculo/capacidade ou inativar unidade bloqueia o salvamento', async () => {
  for (const change of [
    `delete from erp.usuario_unidade where usuario_id='${uid(5)}'`,
    "delete from erp.perfil_permissao where permissao='CONFIGURACAO_EDITAR'",
    "update erp.unidade set status='INATIVO' where id=1",
  ]) {
    await transaction(5, async () => {
      await db.exec(change);
      await db.exec('set local role authenticated');
      await expectSaveError('42501');
    }, 'owner');
  }
});

test('anon não executa wrapper e função interna mantém a mesma fronteira de autorização', async () => {
  await transaction(null, async () => { await expectSaveError('42501'); }, 'anon');
  await transaction(8, async () => {
    await expectSqlError("select erp_private.atualizar_configuracao(1,1,'{\"margem_percentual\":\"9\"}','Teste interno')", '42501');
  });
});

test('nenhuma função de salvamento tem EXECUTE para PUBLIC ou anon', async () => {
  const grants = await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('erp','erp_private') and p.proname='atualizar_configuracao' and a.privilege_type='EXECUTE' and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='anon'))");
  assert.equal(grants.rows.length, 0);
});

test('falha de auditoria durante chamada autenticada reverte valores e revisão', async () => {
  await transaction(5, async () => {
    await db.exec("create function erp_private.falha_rpc_teste() returns trigger language plpgsql as $$ begin raise exception 'Auditoria indisponível'; end $$; create trigger falha_rpc_teste before insert on erp.auditoria_configuracao for each row execute function erp_private.falha_rpc_teste()");
    await db.exec('set local role authenticated');
    await expectSaveError('P0001');
    assert.equal(Number((await db.query('select margem_percentual,revisao from erp.parametro_unidade where unidade_id=1')).rows[0].margem_percentual), 5);
    assert.equal(Number((await db.query('select revisao from erp.parametro_unidade where unidade_id=1')).rows[0].revisao), 1);
    assert.equal((await db.query('select * from erp.auditoria_configuracao where unidade_id=1')).rows.length, 1);
  }, 'owner');
});

test('configuração ausente só retorna PT404 após autorizar acesso à unidade', async () => {
  await transaction(5, async () => {
    await db.exec("insert into erp.unidade(codigo,nome) values ('SEM_CONFIG','Unidade fictícia sem parâmetros')");
    const id = (await db.query("select id from erp.unidade where codigo='SEM_CONFIG'")).rows[0].id;
    await db.query('insert into erp.usuario_unidade values ($1,$2)', [uid(5), id]);
    await db.exec('set local role authenticated');
    await expectSaveError('PT404', id);
  }, 'owner');
});

test('metadados de perfil enviados em claims não concedem edição', async () => {
  await transaction(1, async () => {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ user_metadata: { role: 'GESTOR_UNIDADE' } })]);
    await expectSaveError('42501');
  });
});

test('duas conexões com mesma revisão produzem um salvamento e um conflito', {
  skip: !process.env.DATABASE_TEST_URL,
  timeout: 15000,
}, async () => {
  const first = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
  const second = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
  let pending;
  try {
    await first.connect();
    await second.connect();
    for (const client of [first, second]) {
      await client.query('begin');
      await client.query("set local statement_timeout='5s'");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [uid(5)]);
      await client.query('set local role authenticated');
    }
    const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    const sql = 'select * from erp.atualizar_configuracao($1,$2,$3::jsonb,$4)';
    await first.query(sql, [1, 1, '{"margem_percentual":"9"}', 'Primeira edição concorrente']);
    pending = second.query(sql, [1, 1, '{"margem_percentual":"10"}', 'Segunda edição concorrente'])
      .then((value) => ({ value }), (error) => ({ error }));
    let blocked = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      blocked = (await db.query('select cardinality(pg_blocking_pids($1)) > 0 as blocked', [pid])).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true, 'A segunda conexão deve aguardar o lock da primeira.');
    await first.query('commit');
    assert.equal((await pending).error?.code, 'PT412');
    await second.query('rollback');
    const row = (await db.query('select margem_percentual,revisao from erp.parametro_unidade where unidade_id=1')).rows[0];
    assert.equal(Number(row.margem_percentual), 9);
    assert.equal(Number(row.revisao), 2);
    assert.equal((await db.query('select * from erp.auditoria_configuracao where unidade_id=1')).rows.length, 2);
  } finally {
    await first.query('rollback').catch(() => {});
    if (pending) await pending;
    await second.query('rollback').catch(() => {});
    await Promise.all([first.end(), second.end()]);
  }
});
