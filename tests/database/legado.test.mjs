import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { legacyTables, renderRestore, renderContainment, renderRollback, validateSnapshot } from '../../scripts/staging/public-vazio.mjs';

const snapshot = {
  required_extensions: [], sequences: [],
  unsupported: { column_acls:0, cross_schema_fk:0, functions:0, inheritance:0, non_builtin_columns:0, other_relations:0, policies:0, triggers:0, user_types:0 },
  tables: legacyTables.map(name => ({
    name, owner:'postgres', rls:false, force_rls:false, count:0,
    columns:[{name:'id',type:'integer',not_null:true,identity:'',generated:'',default:null}],
    constraints:[{name:`${name}_pkey`,definition:'PRIMARY KEY (id)'}], indexes:[],
    acl:['postgres','anon','authenticated','service_role'].flatMap(role => ['SELECT','INSERT','UPDATE','DELETE'].map(privilege => ({role,privilege,grant_option:role==='postgres'}))),
  })),
};
let db, close;
before(async () => {
  if (process.env.DATABASE_TEST_URL) {
    const target = new URL(process.env.DATABASE_TEST_URL);
    if (!['localhost','127.0.0.1'].includes(target.hostname) || target.pathname !== '/erp_config_test') throw Error('Somente laboratório descartável local erp_config_test');
    const client = new pg.Client({connectionString:target.toString()});
    await client.connect(); db={exec:sql=>client.query(sql),query:sql=>client.query(sql)}; close=()=>client.end();
  } else { db=new PGlite(); close=()=>db.close(); }
  await db.exec("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;");
  await db.exec(renderRestore(snapshot));
});
after(async () => { if(close)await close(); });
const access = () => db.query("SELECT relname,relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY relname");
test('exportador rejeita dados, objetos adicionais, coluna identity e extensão desconhecida', () => {
  for (const change of [s=>s.tables[0].count=1,s=>s.tables.push({...s.tables[0],name:'nova'}),s=>s.tables[0].columns[0].identity='a',s=>s.required_extensions.push({name:'desconhecida'}),s=>s.unsupported.functions=1]) {
    const candidate=structuredClone(snapshot);change(candidate);assert.throws(()=>validateSnapshot(candidate));
  }
});
test('contenção bloqueia anon/authenticated, preserva administração e retorno restaura ACL/RLS', async () => {
  const before=(await access()).rows;
  await db.exec(renderContainment(snapshot));
  const verification=(await db.query(await readFile(new URL('../../scripts/staging/verificar-contencao.sql',import.meta.url),'utf8'))).rows[0].verification;
  assert.equal(verification.tables_with_rls,14);
  assert.equal(verification.anon_sequences_with_access,0);
  assert.equal(verification.authenticated_sequences_with_access,0);
  assert.equal((await db.query("SELECT count(*)::int AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')")).rows[0].total,14);
  for(const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(()=>db.query('SELECT * FROM public.usuario'),{code:'42501'});
    await assert.rejects(()=>db.query('INSERT INTO public.usuario VALUES(1)'),{code:'42501'});
    await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query('SELECT * FROM public.usuario')).rows.length,0);
  await db.exec('RESET ROLE');
  await db.exec(renderRollback(snapshot));
  assert.deepEqual((await access()).rows,before);
});
test('tabela com dados ou objeto inesperado aborta sem alteração parcial', async () => {
  const before=(await access()).rows;
  await db.exec('INSERT INTO public.usuario VALUES(1)');
  await assert.rejects(()=>db.exec(renderContainment(snapshot)));
  await db.exec('ROLLBACK');
  assert.deepEqual((await access()).rows,before);
  await db.exec('DELETE FROM public.usuario');
  await db.exec('CREATE TABLE public.inesperada(id integer)');
  await assert.rejects(()=>db.exec(renderContainment(snapshot)));
  await db.exec('ROLLBACK');
  await db.exec('DROP TABLE public.inesperada');
  assert.deepEqual((await access()).rows,before);
});
