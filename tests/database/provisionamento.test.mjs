import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { provisionSql, syntheticAccessSql } from '../../scripts/staging/identidades-sinteticas.mjs';
import { adminPreviewSql } from '../../scripts/staging/admin-acompanhamento.mjs';
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
    await db.exec(syntheticAccessSql(ids.editorA,'1','inactive'));
    assert.deepEqual(await read(ids.editorA),[]);
    await db.exec(syntheticAccessSql(ids.editorA,'1','active'));
    assert.deepEqual(await read(ids.editorA),[{unidade_id:'1'}]);
    await db.exec(syntheticAccessSql(ids.editorA,'1','unlink'));
    assert.deepEqual(await read(ids.editorA),[]);
    await db.exec(syntheticAccessSql(ids.editorA,'1','relink'));
    assert.deepEqual(await read(ids.editorA),[{unidade_id:'1'}]);
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

test('ADMIN de acompanhamento é idempotente, limitado às demonstrações e não promove perfil existente',async()=>{
 const db=new PGlite();const adminId='00000000-0000-4000-8000-000000000004';
 try{
  await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  const root=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of(await readdir(root)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,root),'utf8'));
  for(const id of [...Object.values(ids),adminId])await db.query('insert into auth.users(id) values($1)',[id]);
  await db.exec(provisionSql(ids));
  await db.exec(adminPreviewSql(adminId));await db.exec(adminPreviewSql(adminId));
  assert.equal((await db.query("select count(*)::int as n from erp.usuario u join erp.perfil p on p.id=u.perfil_id where p.codigo='ADMIN'")).rows[0].n,1);
  assert.deepEqual((await db.query("select permissao from erp.perfil_permissao pp join erp.perfil p on p.id=pp.perfil_id where p.codigo='ADMIN' order by permissao")).rows.map(r=>r.permissao),['CONFIGURACAO_LER','ESTOQUE_LER','PRODUTO_LER']);
  await db.exec('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[adminId]);await db.exec('set local role authenticated');
  assert.equal((await db.query('select * from erp.parametro_unidade')).rows.length,2);
  await assert.rejects(()=>db.query("select erp.atualizar_configuracao(1,1,'{\"margem_percentual\":\"6\"}'::jsonb,'Nao permitido')"),{code:'42501'});await db.exec('rollback');
  await db.exec('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[adminId]);await db.exec('set local role authenticated');
  await assert.rejects(()=>db.query('update erp.usuario set perfil_id=1 where id=$1',[adminId]),{code:'42501'});await db.exec('rollback');
  await db.exec("insert into erp.perfil_permissao select id,'CONFIGURACAO_EDITAR' from erp.perfil where codigo='ADMIN'");
  await assert.rejects(()=>db.exec(adminPreviewSql(adminId)));await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int as n from erp.usuario')).rows[0].n,4);
  assert.throws(()=>adminPreviewSql("'; select 1; --"));
 }finally{await db.close();}
});
