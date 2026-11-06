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

test('migration cria tabelas com RLS e sem funções SECURITY DEFINER', async () => {
  const tables = await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and c.relkind='r'");
  assert.equal(tables.rows.length, 7);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  const functions = await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and prosecdef");
  assert.equal(functions.rows.length, 0);
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
