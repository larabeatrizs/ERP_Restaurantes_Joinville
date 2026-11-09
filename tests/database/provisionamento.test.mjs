import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { provisionSql } from '../../scripts/staging/identidades-sinteticas.mjs';
const ids={editorA:'00000000-0000-4000-8000-000000000001',readerA:'00000000-0000-4000-8000-000000000002',editorB:'00000000-0000-4000-8000-000000000003'};
test('bootstrap sintético provisiona escopos/capacidades e trilha, sem permitir sobrescrita', async () => {
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
    const root=new URL('../../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(root)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,root),'utf8'));
    for(const id of Object.values(ids))await db.query('insert into auth.users(id) values($1)',[id]);
    await db.exec(provisionSql(ids));
    assert.deepEqual((await db.query('select modo_saida,revisao::text from erp.parametro_unidade order by unidade_id')).rows,[{modo_saida:'POSTERIOR',revisao:'1'},{modo_saida:'POSTERIOR',revisao:'1'}]);
    assert.equal((await db.query('select count(*)::int as n from erp.auditoria_configuracao')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int as n from erp.usuario_unidade')).rows[0].n,3);
    const read=async id=>{await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.exec('set local role authenticated');return(await db.query('select unidade_id::text from erp.parametro_unidade')).rows;}finally{await db.exec('rollback');}};
    assert.deepEqual(await read(ids.editorA),[{unidade_id:'1'}]);
    assert.deepEqual(await read(ids.readerA),[{unidade_id:'1'}]);
    assert.deepEqual(await read(ids.editorB),[{unidade_id:'2'}]);
    await assert.rejects(()=>db.exec(provisionSql(ids)));
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from erp.usuario')).rows[0].n,3);
    assert.equal((await db.query('select count(*)::int as n from erp.auditoria_configuracao')).rows[0].n,2);
  } finally {await db.close();}
});
test('bootstrap não aceita identidade inválida ou duplicada',()=>{
  assert.throws(()=>provisionSql({...ids,editorA:"'; select 1; --"}));
  assert.throws(()=>provisionSql({...ids,editorA:ids.readerA}));
});
