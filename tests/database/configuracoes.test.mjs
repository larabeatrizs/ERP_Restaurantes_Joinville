import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { isAdminUsersSnapshot } from '@erp/contracts';

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
  assert.equal(report.relacoes.filter(row => row.schema === 'erp').length, 28);
  assert.ok(report.relacoes.filter(row => row.schema === 'erp').every(row => row.rls));
  assert.equal(report.funcoes.find(row => row.schema === 'erp_private' && row.nome === 'atualizar_configuracao').proprietario, 'erp_config_writer');
  assert.deepEqual((await state()).rows, before);
  assert.deepEqual((await audit()).rows, auditBefore);
});

test('verificador da fundação confere RLS, grants e escritor restrito no laboratório', async () => {
  const sql = await readFile(new URL('../../scripts/staging/verificar-fundacao.sql', import.meta.url), 'utf8');
  const report = (await db.query(sql)).rows[0].foundation;
  assert.equal(report.tables.length, 28);
  assert.ok(report.tables.every(table => table.rls && !table.anon_select && !table.authenticated_write));
  assert.equal(report.anon_erp_usage, false);
  assert.equal(report.anon_private_usage, false);
  assert.equal(report.authenticated_erp_usage, true);
  assert.ok(Object.values(report.writer).every(value => value === false));
  assert.ok(report.functions.every(fn => !fn.anon_execute));
  const privileged = report.functions.filter(fn => fn.definer);
  assert.deepEqual(privileged.map(fn => [fn.schema, fn.name, fn.owner]).sort(), [
    ['erp_private', 'admin_usuario_edicao', 'erp_user_admin'],
    ['erp_private', 'admin_usuario_situacao', 'erp_user_admin'],
    ['erp_private', 'admin_usuarios_servico', 'erp_user_admin'],
    ['erp_private', 'atualizar_configuracao', 'erp_config_writer'],
    ['erp_private', 'calendario_operacao', 'erp_stock_writer'],
    ['erp_private', 'catalogo_unidade', 'erp_stock_writer'],
    ['erp_private', 'categoria_operacao', 'erp_stock_writer'],
    ['erp_private', 'estoque_extrato', 'erp_stock_writer'],
    ['erp_private', 'estoque_operacao', 'erp_stock_writer'],
    ['erp_private', 'estoque_vencimentos', 'erp_stock_writer'],
    ['erp_private', 'fornecedor_operacao', 'erp_stock_writer'],
    ['erp_private', 'medida_operacao', 'erp_stock_writer'],
    ['erp_private', 'produto_ciclo_operacao', 'erp_stock_writer'],
    ['erp_private', 'produto_exclusao_motivo', 'erp_product_reference_reader'],
    ['erp_private', 'produto_importado_operacao', 'erp_stock_writer'],
    ['erp_private', 'requisicao_operacao', 'erp_stock_writer'],
    ['erp_private', 'requisicao_painel', 'erp_stock_writer'],
    ['erp_private', 'usuario_login_salvar', 'erp_identity_writer'],
  ]);
});

const loginSave = async (user, login, revision = null, reason = 'Cadastro sintético', client = db) =>
  (await client.query('select erp_private.usuario_login_salvar($1,$2,$3,$4) as result', [uid(user), login, revision, reason])).rows[0].result;
const newUser = (extra = {}) => ({login:'usuario.novo',nome:'Usuário novo sintético',email:'novo@example.invalid',perfil:'ESTOQUISTA',unidades:['1','2'],status:'ATIVO',revisao:null,motivo:'Cadastro sintético',...extra});
const adminRpc = async (action, data={}, actor=uid(1), client=db) => (await client.query('select erp.admin_usuarios_servico($1,$2,$3::jsonb) result',[actor,action,JSON.stringify(data)])).rows[0].result;
const editRpc=async(target,data=null,actor=uid(1),client=db)=>(await client.query('select erp.admin_usuario_edicao($1,$2,$3::jsonb) result',[actor,uid(target),data===null?null:JSON.stringify(data)])).rows[0].result;
const editDraft=(extra={})=>({nome:'Nome corrigido sintético',perfil:'ESTOQUISTA',unidades:['2'],revisao:'1',motivo:'Correção sintética',...extra});
async function editError(target,data,code,actor=uid(1)){await db.exec('savepoint edit_error');await assert.rejects(()=>editRpc(target,data,actor),{code});await db.exec('rollback to savepoint edit_error');}
const statusRpc=async(target,data=null,actor=uid(1),client=db)=>(await client.query('select erp.admin_usuario_situacao($1,$2,$3::jsonb) result',[actor,uid(target),data===null?null:JSON.stringify(data)])).rows[0].result;
const statusDraft=(extra={})=>({status:'INATIVO',revisao:'1',motivo:'Inativação sintética',...extra});
async function statusError(target,data,code,actor=uid(1)){await db.exec('savepoint status_error');await assert.rejects(()=>statusRpc(target,data,actor),{code});await db.exec('rollback to savepoint status_error');}
async function statusTransaction(callback){await adminTransaction(async()=>{await db.exec("insert into erp.perfil_permissao select id,'USUARIO_CICLO_VIDA' from erp.perfil where codigo='ADMIN' on conflict do nothing");await callback();});}
test('situação: seed real concede X somente ao ADMIN e é idempotente',async()=>adminTransaction(async()=>{
 const files=await readdir(new URL('../../supabase/migrations/',import.meta.url));const file=files.find(file=>file.endsWith('_situacao_administrativa_usuarios.sql'));assert.ok(file);const source=await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8');const seed=source.split('-- BEGIN CAPABILITY SEED')[1]?.split('-- END CAPABILITY SEED')[0];assert.ok(seed);await db.exec(seed);await db.exec(seed);assert.deepEqual((await db.query("select p.codigo from erp.perfil_permissao pp join erp.perfil p on p.id=pp.perfil_id where pp.permissao='USUARIO_CICLO_VIDA'")).rows,[{codigo:'ADMIN'}]);
}));
test('situação: I não concede X e clientes comuns não executam RPC',async()=>{
 for(const role of['anon','authenticated'])await transaction(1,async()=>{await expectSqlError(`select erp.admin_usuario_situacao('${uid(1)}','${uid(3)}',null)`,'42501');},role);
 await adminTransaction(async()=>{assert.equal((await statusRpc(3)).pode_alterar,false);await statusError(3,statusDraft(),'PT403');});
 await statusTransaction(async()=>{await db.exec("delete from erp.perfil_permissao where permissao='USUARIO_GERIR'");assert.equal((await statusRpc(3,statusDraft())).status,'INATIVO');});
});
test('situação: inativa/reativa sem mudar perfil/vínculos; revisão e auditoria são coerentes',async()=>statusTransaction(async()=>{
 const before=(await db.query('select (to_jsonb(u)-array[\'status\',\'revisao\']) data from erp.usuario u where id=$1',[uid(3)])).rows[0].data;
 const inactive=await statusRpc(3,statusDraft());assert.equal(inactive.status,'INATIVO');assert.equal(inactive.revisao,'2');await statusError(3,statusDraft(),'PT412');
 await adminError('validar_login',{usuario_id:uid(3),login:'legado.teste',email:'legacy@example.invalid'},'PT403',null);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(3)]);await db.exec('set local role authenticated');assert.equal((await db.query('select count(*)::int n from erp.unidade')).rows[0].n,0);await db.exec('reset role');
 await statusRpc(3,statusDraft({revisao:'2'}));assert.equal((await db.query("select count(*)::int n from erp_private.auditoria_usuario where acao='ALTERAR_SITUACAO'")).rows[0].n,1);
 const active=await statusRpc(3,statusDraft({status:'ATIVO',revisao:'2'}));assert.equal(active.status,'ATIVO');assert.equal(active.revisao,'3');assert.deepEqual((await db.query('select (to_jsonb(u)-array[\'status\',\'revisao\']) data from erp.usuario u where id=$1',[uid(3)])).rows[0].data,before);
 assert.deepEqual((await db.query('select unidade_id::text id from erp.usuario_unidade where usuario_id=$1',[uid(3)])).rows,[{id:'1'}]);
}));
test('situação: autogestão, pendências, bloqueio e mass assignment não mudam a conta',async()=>statusTransaction(async()=>{
 assert.equal((await statusRpc(1)).pode_alterar,false);await statusError(1,statusDraft(),'PT403');await statusError(7,statusDraft({status:'ATIVO'}),'PT409');
 await db.query("insert into erp_private.usuario_contato values($1,'pending@example.invalid',true)",[uid(3)]);assert.equal((await statusRpc(3)).pode_alterar,false);await statusError(3,statusDraft(),'PT409');
 for(const extra of[{nome:'Alterado'},{perfil:'ADMIN'},{password:'segredo'},{status:'BLOQUEADO'},{status:null},{revisao:null},{revisao:1},{motivo:'a'}])await statusError(2,statusDraft(extra),'PT422');
 assert.equal((await statusRpc(3)).status,'ATIVO');
}));
test('situação: falha da auditoria reverte status/revisão',async()=>statusTransaction(async()=>{
 await db.exec("create function pg_temp.fail_status_audit() returns trigger language plpgsql as $$begin raise exception 'audit failure';end$$;create trigger fail_status_audit before insert on erp_private.auditoria_usuario for each row execute function pg_temp.fail_status_audit()");const before=await statusRpc(3);await statusError(3,statusDraft(),'P0001');assert.deepEqual(await statusRpc(3),before);
}));
test('situação: concorrência com inativação/edição preserva ADMIN e revogação durante espera nega', {skip:!process.env.DATABASE_TEST_URL},async()=>{
 for(const mode of['ciclo','misto','revogacao']){
  const first=new pg.Client({connectionString:process.env.DATABASE_TEST_URL}),second=new pg.Client({connectionString:process.env.DATABASE_TEST_URL});let pending;const original=(await db.query('select * from erp.usuario where id=$1',[uid(2)])).rows[0];await Promise.all([first.connect(),second.connect()]);
  try{
   await db.exec("insert into erp.perfil_permissao select id,p from erp.perfil cross join(values('USUARIO_LER'),('USUARIO_GERIR'),('USUARIO_CICLO_VIDA'))x(p) where codigo='ADMIN' on conflict do nothing");
   await first.query('begin');await second.query('begin');await second.query('set local role service_role');const pid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
   if(mode==='revogacao'){await first.query('select id from erp.usuario where id=$1 for update',[uid(3)]);pending=statusRpc(3,statusDraft(),uid(1),second).then(value=>({value}),error=>({error}));}
   else{await first.query('set local role service_role');if(mode==='misto')await editRpc(2,editDraft(),uid(1),first);else await statusRpc(2,statusDraft(),uid(1),first);pending=statusRpc(1,statusDraft(),uid(2),second).then(value=>({value}),error=>({error}));}
   let blocked=false;for(let i=0;i<150;i++){blocked=(await db.query('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true);
   if(mode==='revogacao')await first.query("delete from erp.perfil_permissao where permissao='USUARIO_CICLO_VIDA'");await first.query('commit');assert.equal((await pending).error?.code,'PT403');pending=undefined;await second.query('rollback');
   assert.equal((await db.query("select count(*)::int n from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.status='ATIVO' and p.codigo='ADMIN'")).rows[0].n,mode==='revogacao'?2:1);
  }finally{await first.query('rollback').catch(()=>{});if(pending)await pending;await second.query('rollback').catch(()=>{});await db.query('update erp.usuario set nome=$2,perfil_id=$3,status=$4,revisao=$5 where id=$1',[uid(2),original.nome,original.perfil_id,original.status,original.revisao]);await db.exec("delete from erp_private.auditoria_usuario where acao in('EDITAR','ALTERAR_SITUACAO');delete from erp.perfil_permissao where permissao in('USUARIO_LER','USUARIO_GERIR','USUARIO_CICLO_VIDA')");await Promise.all([first.end(),second.end()]);}
 }
});
test('edição: detalhe e alteração restritos; authenticated não chama RPC nem remove vínculos',async()=>{
 for(const role of ['anon','authenticated'])await transaction(1,async()=>{await expectSqlError(`select erp.admin_usuario_edicao('${uid(1)}','${uid(3)}',null)`,'42501');await expectSqlError(`delete from erp.usuario_unidade where usuario_id='${uid(3)}'`,'42501');},role);
 await adminTransaction(async()=>{assert.equal((await editRpc(3)).pode_editar,true);await editError(3,editDraft(),'PT403',uid(3));await editError(99,null,'PT404');});
});
test('edição: nome/perfil/unidades, revisão e auditoria são atômicos, sem mudar status/login/Auth',async()=>adminTransaction(async()=>{
 const original=(await db.query('select status from erp.usuario where id=$1',[uid(3)])).rows[0].status;
 const result=await editRpc(3,editDraft({perfil:'GESTOR_UNIDADE'}));assert.equal(result.revisao,'2');assert.equal(result.perfil,'GESTOR_UNIDADE');assert.deepEqual(result.unidades,['2']);assert.equal(result.status,original);
 const audit=(await db.query("select dados from erp_private.auditoria_usuario where acao='EDITAR' and usuario_id=$1",[uid(3)])).rows[0].dados;assert.equal(audit.antes.perfil,'ESTOQUISTA');assert.deepEqual(audit.antes.unidades,['1']);assert.deepEqual(audit.depois.unidades,['2']);assert.equal(audit.motivo,'Correção sintética');assert.equal((await db.query('select count(*)::int n from erp_private.usuario_login')).rows[0].n,0);
 await editError(3,editDraft(),'PT412');await editRpc(3,editDraft({perfil:'GESTOR_UNIDADE',revisao:'2'}));assert.equal((await db.query("select count(*)::int n from erp_private.auditoria_usuario where acao='EDITAR'")).rows[0].n,1);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(3)]);await db.exec('set local role authenticated');assert.deepEqual((await db.query('select unidade_id::text id from erp.usuario_unidade order by unidade_id')).rows.map(row=>row.id),['2']);
}));
test('edição: autogestão só muda nome, último ADMIN permanece e payload inválido não altera nada',async()=>adminTransaction(async()=>{
 await editError(1,editDraft({perfil:'ADMIN',unidades:['2']}),'PT403');await editError(1,editDraft({unidades:['1']}),'PT403');
 const self=await editRpc(1,editDraft({perfil:'ADMIN',unidades:['1']}));assert.equal(self.proprio,true);assert.equal(self.revisao,'2');
 await editRpc(2,editDraft());assert.equal((await db.query("select count(*)::int n from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.status='ATIVO' and p.codigo='ADMIN'")).rows[0].n,1);await editError(1,editDraft({revisao:'2',unidades:['1']}),'PT403');
 for(const extra of [{senha:'nao'},{email:'novo@example.invalid'},{status:'INATIVO'},{perfil:'SUPERADMIN'},{unidades:['1','1']},{unidades:['999']},{unidades:[1]},{revisao:null},{nome:'abc\n'},{motivo:'a'}])await editError(3,editDraft(extra),'PT422');
 assert.equal((await editRpc(3)).revisao,'1');
}));
test('edição: falha na auditoria reverte nome, perfil, vínculos e revisão',async()=>adminTransaction(async()=>{
 await db.exec("create function pg_temp.fail_user_audit() returns trigger language plpgsql as $$begin raise exception 'audit failure';end$$;create trigger fail_user_audit before insert on erp_private.auditoria_usuario for each row execute function pg_temp.fail_user_audit()");
 const before=await editRpc(3);await editError(3,editDraft(),'P0001');assert.deepEqual(await editRpc(3),before);
}));
test('edição: alterações cruzadas preservam ADMIN e revogação durante espera impede escrita', {skip:!process.env.DATABASE_TEST_URL},async()=>{
 for(const mode of ['cruzada','revogacao']){
  const first=new pg.Client({connectionString:process.env.DATABASE_TEST_URL}),second=new pg.Client({connectionString:process.env.DATABASE_TEST_URL});let pending;
  await Promise.all([first.connect(),second.connect()]);
  try{
   await db.exec("insert into erp.perfil_permissao select id,p from erp.perfil cross join(values('USUARIO_LER'),('USUARIO_GERIR'))x(p) where codigo='ADMIN' on conflict do nothing");
   await first.query('begin');await second.query('begin');await second.query('set local role service_role');const pid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
   if(mode==='cruzada'){await first.query('set local role service_role');await editRpc(2,editDraft(),uid(1),first);pending=editRpc(1,editDraft({unidades:['1']}),uid(2),second).then(value=>({value}),error=>({error}));}
   else{await first.query('select id from erp.usuario where id=$1 for update',[uid(3)]);pending=editRpc(3,editDraft(),uid(1),second).then(value=>({value}),error=>({error}));}
   let blocked=false;for(let i=0;i<150;i++){blocked=(await db.query('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true);
   if(mode==='revogacao')await first.query("delete from erp.perfil_permissao where permissao='USUARIO_GERIR'");
   await first.query('commit');assert.equal((await pending).error?.code,'PT403');pending=undefined;await second.query('rollback');
   assert.equal((await db.query("select count(*)::int n from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.status='ATIVO' and p.codigo='ADMIN'")).rows[0].n,mode==='cruzada'?1:2);
   assert.equal((await db.query('select revisao::text r from erp.usuario where id=$1',[uid(3)])).rows[0].r,'1');
  }finally{await first.query('rollback').catch(()=>{});if(pending)await pending;await second.query('rollback').catch(()=>{});await db.query("update erp.usuario set nome='Administrador fictício B',perfil_id=(select id from erp.perfil where codigo='ADMIN'),revisao=1 where id=$1",[uid(2)]);await db.exec("delete from erp_private.auditoria_usuario where acao='EDITAR';delete from erp.perfil_permissao where permissao in('USUARIO_LER','USUARIO_GERIR')");await Promise.all([first.end(),second.end()]);}
 }
});
async function adminError(action,data,code,actor=uid(1)) {await db.exec('savepoint admin_error');await assert.rejects(()=>adminRpc(action,data,actor),{code});await db.exec('rollback to savepoint admin_error');}
async function adminTransaction(callback) {await identityTransaction(async()=>{await db.exec("insert into erp.perfil_permissao select id,'USUARIO_LER' from erp.perfil where codigo='ADMIN'");await callback();});}
test('admin: somente service_role executa a fronteira de provisionamento',async()=>{
 for(const role of ['anon','authenticated']) await transaction(1,async()=>{await expectSqlError(`select erp.admin_usuarios_servico('${uid(1)}','listar','{}')`,'42501');},role);
 const r=(await db.query("select rolcanlogin,rolsuper,rolbypassrls,pg_has_role('authenticated',oid,'MEMBER') member,has_schema_privilege(oid,'erp_private','CREATE') create_schema from pg_roles where rolname='erp_user_admin'")).rows[0];assert.ok(Object.values(r).every(x=>x===false));
 await adminTransaction(async()=>{await db.exec('set local role service_role');assert.equal((await adminRpc('listar')).pode_criar,true);await expectSqlError('select * from erp_private.usuario_contato','42501');});
});
test('admin: preparar é idempotente, rejeita conflito/perfil/unidades e não cria acesso',async()=>adminTransaction(async()=>{
 assert.deepEqual(await adminRpc('autorizar'),{permitido:true});await adminError('autorizar',{},'PT403',uid(3));
 const input=newUser(),first=await adminRpc('preparar',input);assert.equal(first.estado,'PREPARADO');assert.equal(first.auth_id,null);assert.deepEqual(await adminRpc('preparar',input),first);
 await adminError('preparar',newUser({nome:'Outro nome'}),'PT409');
 for(const extra of [{perfil:'SUPERADMIN'},{unidades:[]},{unidades:['1','1']},{unidades:['999']},{unidades:['x']},{login:'AB'},{email:'invalido'},{status:'INATIVO'},{revisao:'1'}])await adminError('preparar',newUser(extra),'PT422');
 assert.equal((await db.query('select count(*)::int n from erp.usuario')).rows[0].n,8);
 assert.equal((await db.query('select count(*)::int n from erp_private.usuario_login')).rows[0].n,0);
}));
test('admin: conclusão atômica cria usuário pendente com vínculos e auditoria; repetição não duplica',async()=>adminTransaction(async()=>{
 await db.query('insert into auth.users(id) values($1)',[uid(90)]);
 const op=await adminRpc('preparar',newUser());await adminRpc('auth_criada',{operacao:op.operacao,auth_id:uid(90)});
 assert.deepEqual(await adminRpc('concluir',{operacao:op.operacao}),{usuario_id:uid(90),criado:true});
 assert.deepEqual(await adminRpc('concluir',{operacao:op.operacao}),{usuario_id:uid(90),criado:false});
 assert.equal((await db.query('select status from erp.usuario where id=$1',[uid(90)])).rows[0].status,'BLOQUEADO');
 assert.equal((await db.query('select count(*)::int n from erp.usuario_unidade where usuario_id=$1',[uid(90)])).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from erp_private.auditoria_usuario')).rows[0].n,1);
 assert.deepEqual(await adminRpc('resolver',{login:'usuario.novo'},null),{email:'novo@example.invalid',primeiro_acesso:true});
 const listed=await adminRpc('listar',{q:'usuario.novo'});assert.equal(listed.total,1);assert.equal(listed.usuarios[0].primeiro_acesso,true);
 assert.deepEqual(await adminRpc('reemitir_dados',{usuario_id:uid(90)}),{usuario_id:uid(90),email:'novo@example.invalid'});
 await adminRpc('reemitir_registrar',{usuario_id:uid(90)});
 await adminError('reemitir_dados',{usuario_id:uid(1)},'PT409');
}));
test('admin: ativação só por identidade validada pelo serviço, inativo/bloqueado não são reativados',async()=>adminTransaction(async()=>{
 await db.query('insert into auth.users(id) values($1)',[uid(90)]);const op=await adminRpc('preparar',newUser());await adminRpc('auth_criada',{operacao:op.operacao,auth_id:uid(90)});await adminRpc('concluir',{operacao:op.operacao});
 await adminError('validar_login',{usuario_id:uid(90),login:'usuario.novo',email:'outro@example.invalid'},'PT403',null);
 assert.deepEqual(await adminRpc('validar_login',{usuario_id:uid(90),login:'usuario.novo',email:'novo@example.invalid'},null),{permitido:true});
 await adminRpc('validar_login',{usuario_id:uid(90),login:'usuario.novo',email:'novo@example.invalid'},null);
 await adminError('reemitir_dados',{usuario_id:uid(90)},'PT409');
 assert.equal((await db.query('select count(*)::int n from erp_private.auditoria_usuario')).rows[0].n,2);
 for(const status of ['INATIVO','BLOQUEADO']){await db.query('update erp.usuario set status=$1 where id=$2',[status,uid(90)]);await adminError('validar_login',{usuario_id:uid(90),login:'usuario.novo',email:'novo@example.invalid'},'PT403',null);assert.equal(await adminRpc('resolver',{login:'usuario.novo'},null),null);}
}));
test('admin: revogação entre Auth e domínio impede acesso e mantém operação retomável',async()=>adminTransaction(async()=>{
 await db.query('insert into auth.users(id) values($1)',[uid(90)]);const op=await adminRpc('preparar',newUser());await adminRpc('auth_criada',{operacao:op.operacao,auth_id:uid(90)});
 await db.exec("delete from erp.perfil_permissao where permissao='USUARIO_GERIR'");await adminError('concluir',{operacao:op.operacao},'PT403');
 assert.equal((await db.query('select count(*)::int n from erp.usuario where id=$1',[uid(90)])).rows[0].n,0);
 await db.exec("insert into erp.perfil_permissao select id,'USUARIO_GERIR' from erp.perfil where codigo='ADMIN'");assert.equal((await adminRpc('concluir',{operacao:op.operacao})).criado,true);
}));
test('admin: falha de auditoria desfaz identidade/vínculos/contato; retomada não repete Auth',async()=>adminTransaction(async()=>{
 await db.query('insert into auth.users(id) values($1)',[uid(90)]);const op=await adminRpc('preparar',newUser());await adminRpc('auth_criada',{operacao:op.operacao,auth_id:uid(90)});
 await db.exec('revoke insert on erp_private.auditoria_usuario from erp_user_admin');await adminError('concluir',{operacao:op.operacao},'42501');
 assert.equal((await db.query('select count(*)::int n from erp.usuario where id=$1',[uid(90)])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from erp_private.usuario_contato')).rows[0].n,0);
 await db.exec('grant insert on erp_private.auditoria_usuario to erp_user_admin');assert.equal((await adminRpc('concluir',{operacao:op.operacao})).criado,true);
}));
test('admin: perfil/capacidade/status atuais limitam consulta e criação globais',async()=>adminTransaction(async()=>{
 await adminError('listar',{},'PT403',null);await adminError('listar',{},'PT403',uid(3));await adminError('listar',{},'PT403',uid(4));
 await db.exec("insert into erp.perfil(codigo) values('AUDITOR');insert into erp.perfil_permissao select id,'USUARIO_LER' from erp.perfil where codigo='AUDITOR';update erp.usuario set perfil_id=(select id from erp.perfil where codigo='AUDITOR') where id='"+uid(3)+"'");
 assert.equal((await adminRpc('listar',{},uid(3))).pode_criar,false);await adminError('preparar',newUser(),'PT403',uid(3));
 const rows=await adminRpc('listar',{q:'Administrador'});assert.equal(rows.total,2);assert.equal(rows.unidades.length,2);assert.equal((await adminRpc('listar',{q:'inexistente'})).total,0);
 assert.equal(isAdminUsersSnapshot(rows),true,'Database projection must match the shared browser contract.');
 assert.deepEqual(rows.unidades.map(u=>u.nome),['Unidade fictícia A','Unidade fictícia B']);
}));
test('admin: revogação concorrente durante lock de conclusão impede criação do domínio', {skip:!process.env.DATABASE_TEST_URL},async()=>{
 const first=new pg.Client({connectionString:process.env.DATABASE_TEST_URL}),second=new pg.Client({connectionString:process.env.DATABASE_TEST_URL});let pending,operation;
 await Promise.all([first.connect(),second.connect()]);
 try{
  await db.exec("insert into erp.perfil_permissao select id,p from erp.perfil cross join (values('USUARIO_LER'),('USUARIO_GERIR'))x(p) where codigo='ADMIN'");
  await db.query('insert into auth.users(id) values($1)',[uid(96)]);operation=await adminRpc('preparar',newUser({login:'concorrente.cadastro',email:'concurrent@example.invalid'}));await adminRpc('auth_criada',{operacao:operation.operacao,auth_id:uid(96)});
  await first.query('begin');await first.query('select id from erp_private.usuario_provisionamento where id=$1 for update',[operation.operacao]);await second.query('begin');const pid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
  pending=adminRpc('concluir',{operacao:operation.operacao},uid(1),second).then(value=>({value}),error=>({error}));let blocked=false;
  for(let i=0;i<150;i++){blocked=(await db.query('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(blocked,true);await first.query("delete from erp.perfil_permissao where permissao='USUARIO_GERIR'");await first.query('commit');assert.equal((await pending).error?.code,'PT403');await second.query('rollback');pending=undefined;
  assert.equal((await db.query('select count(*)::int n from erp.usuario where id=$1',[uid(96)])).rows[0].n,0);
 }finally{await first.query('rollback').catch(()=>{});if(pending)await pending;await second.query('rollback').catch(()=>{});if(operation)await db.query('delete from erp_private.usuario_provisionamento where id=$1',[operation.operacao]);await db.query('delete from auth.users where id=$1',[uid(96)]);await db.exec("delete from erp.perfil_permissao where permissao in ('USUARIO_LER','USUARIO_GERIR')");await Promise.all([first.end(),second.end()]);}
});
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
  assert.equal(tables.rows.length, 28);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  const functions = await db.query("select proname,pg_get_userbyid(proowner) as owner,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('erp','erp_private') and prosecdef");
  assert.deepEqual(functions.rows.map(row => [row.proname, row.owner]).sort(), [
    ['admin_usuario_edicao','erp_user_admin'],
    ['admin_usuario_situacao','erp_user_admin'],
    ['admin_usuarios_servico','erp_user_admin'],
    ['requisicao_operacao','erp_stock_writer'],
    ['requisicao_painel','erp_stock_writer'],
    ['produto_importado_operacao','erp_stock_writer'],
    ['atualizar_configuracao', 'erp_config_writer'], ['calendario_operacao','erp_stock_writer'], ['catalogo_unidade', 'erp_stock_writer'], ['categoria_operacao', 'erp_stock_writer'], ['estoque_extrato', 'erp_stock_writer'], ['estoque_operacao', 'erp_stock_writer'], ['estoque_vencimentos', 'erp_stock_writer'], ['fornecedor_operacao', 'erp_stock_writer'], ['medida_operacao', 'erp_stock_writer'], ['produto_ciclo_operacao','erp_stock_writer'], ['produto_exclusao_motivo','erp_product_reference_reader'], ['usuario_login_salvar','erp_identity_writer'],
  ].sort());
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
