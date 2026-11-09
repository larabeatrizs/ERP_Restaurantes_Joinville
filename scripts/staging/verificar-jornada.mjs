// Opt-in. Usa identidades sintéticas privadas e o Worker LOCAL com serviços reais.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syntheticAccessSql } from './identidades-sinteticas.mjs';
const stateFile=process.env.ERP_STAGING_TEST_STATE;
if(!stateFile)throw Error('Defina ERP_STAGING_TEST_STATE fora do checkout; não use credenciais no comando.');
const state=JSON.parse(await fs.readFile(stateFile,'utf8'));
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co'||!state.publishableKey?.startsWith('sb_publishable_'))throw Error('Projeto/chave de teste inválidos');
const base=new URL(process.env.ERP_LOCAL_API_URL??'http://127.0.0.1:8787');
if(!['127.0.0.1','localhost'].includes(base.hostname)||base.protocol!=='http:')throw Error('Somente API local neste verificador');
const health=await(await fetch(new URL('/api/health',base))).json();
assert.equal(health.service,'erp-api');
const clients={},tokens={},results=[];
const record=(scenario,details={})=>{results.push({scenario,passed:true,...details});console.log('PASS:',scenario);};
async function api(label,route,init={}) {
 const headers=new Headers(init.headers);if(label)headers.set('Authorization',`Bearer ${tokens[label]}`);
 return fetch(new URL(route,base),{...init,headers,signal:AbortSignal.timeout(20000)});
}
const route=unit=>`/api/unidades/${unit}/configuracoes`;
async function read(label,unit){const r=await api(label,route(unit));assert.equal(r.status,200,'configuration read');return {body:await r.json(),etag:r.headers.get('etag')};}
const patch=(label,unit,etag,campos,motivo='INT-003 verificação real controlada')=>api(label,route(unit),{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({campos,motivo})});
let initial,completed=false,failure;
async function mutateSynthetic(action) {
 const editor=state.users.find(account=>account.label==='editorA');
 const file=path.join(path.dirname(stateFile),`access-${action}.sql`);
 await fs.writeFile(file,syntheticAccessSql(editor.id,state.units.A,action));
 const cli=fileURLToPath(new URL('../../node_modules/supabase/dist/supabase.js',import.meta.url));
 const args=[cli,'db','query','--remote=vpowsedoajpdbeckimuv','--file',file,'--yes'];
 const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:60000});
 await fs.writeFile(path.join(path.dirname(stateFile),`access-${action}-result.txt`),(result.stdout??'')+'\n'+(result.stderr??''));
 if(result.status!==0)throw Error('SYNTHETIC_ACCESS_OPERATION_FAILED');
}
try {
 for(const account of state.users){
  if(!/^int003-(editora|readera|editorb)-[a-f0-9]{8}@example\.invalid$/.test(account.email))throw Error('Somente contas sintéticas INT-003');
  const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'int003-live-'+account.label}});
  clients[account.label]=client;
  const login=await client.auth.signInWithPassword({email:account.email,password:account.password});
  if(login.error||!login.data.session)throw Error('AUTH_LOGIN_FAILED');
  tokens[account.label]=login.data.session.access_token;
  const user=await client.auth.getUser(tokens[account.label]);
  assert.equal(user.data.user?.id,account.id);assert.equal(user.data.user?.app_metadata.purpose,'ERP_INT003_SYNTHETIC');
 }
 record('login e getUser reais para três identidades sintéticas');
 assert.equal((await api(null,'/api/unidades')).status,401);
 record('API sem Bearer nega acesso');
 for(const [label,unit,code]of [['editorA',state.units.A,'STG-INT003-A'],['readerA',state.units.A,'STG-INT003-A'],['editorB',state.units.B,'STG-INT003-B']]){
  const response=await api(label,'/api/unidades');assert.equal(response.status,200,'listagem real');const data=await response.json();assert.equal(data.unidades.length,1);assert.equal(data.unidades[0].id,unit);assert.equal(data.unidades[0].codigo,code);
 }
 record('RLS lista somente a unidade vinculada');
 initial=await read('editorA',state.units.A);assert.equal(initial.body.pode_editar,true);
 const reader=await read('readerA',state.units.A);assert.equal(reader.body.pode_editar,false);
 assert.equal((await patch('readerA',state.units.A,reader.etag,{margem_percentual:'12'})).status,403);
 record('consulta sem capacidade de escrita não altera configuração');
 assert.equal((await api('editorA',route(state.units.B))).status,404);
 const b=await read('editorB',state.units.B);
 assert.equal((await patch('editorA',state.units.B,b.etag,{margem_percentual:'12'})).status,403);
 record('leitura e edição cruzadas entre unidades são negadas');
 const saved=await patch('editorA',state.units.A,initial.etag,{margem_percentual:'6.25'});assert.equal(saved.status,200,'PATCH real');
 const savedBody=await saved.json();assert.equal(Number(savedBody.configuracao.margem_percentual),6.25);
 assert.equal(BigInt(savedBody.configuracao.revisao),BigInt(initial.body.configuracao.revisao)+1n);
 record('PATCH real persiste e incrementa revisão');
 const current=await read('editorA',state.units.A);
 const race=await Promise.all([patch('editorA',state.units.A,current.etag,{margem_percentual:'7'}),patch('editorA',state.units.A,current.etag,{margem_percentual:'8'})]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,412]);record('concorrência hospedada produz um sucesso e um conflito');
 for(const [action,undo,description]of [['inactive','active','ator inativo'],['unlink','relink','vínculo revogado']]){
  await mutateSynthetic(action);
  try{assert.equal((await api('editorA',route(state.units.A))).status,404);assert.equal((await patch('editorA',state.units.A,current.etag,{margem_percentual:'9'})).status,403);}
  finally{await mutateSynthetic(undo);}
  await read('editorA',state.units.A);
  record(description+' nega operações com o mesmo JWT; retorno controlado funciona');
 }
 for(const profile of ['public','erp_private']){
  const response=await fetch(`${state.url}/rest/v1/unidade?select=id&limit=1`,{headers:{apikey:state.publishableKey,Authorization:`Bearer ${tokens.editorA}`,'Accept-Profile':profile}});
  assert.equal(response.status,406);const problem=await response.json();assert.equal(problem.code,'PGRST106');
 }
 record('Data API não expõe public nem erp_private');
 const direct=await fetch(`${state.url}/rest/v1/parametro_unidade?unidade_id=eq.${state.units.A}`,{method:'PATCH',headers:{apikey:state.publishableKey,Authorization:`Bearer ${tokens.editorA}`,'Accept-Profile':'erp','Content-Profile':'erp','Content-Type':'application/json'},body:JSON.stringify({margem_percentual:50})});
 assert.equal(direct.status,403);record('DML direto pela Data API é negado');
 const anon=await fetch(`${state.url}/rest/v1/parametro_unidade?select=unidade_id`,{headers:{apikey:state.publishableKey,'Accept-Profile':'erp'}});
 assert.equal(anon.status,401);record('anon não consulta parâmetros no schema exposto');
 completed=true;
} catch(error) {
 failure={name:error.name,message:String(error.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'[id]')};
 console.error('FAIL: jornada interrompida; detalhes preservados no arquivo privado.');process.exitCode=1;
} finally {
 if(initial){try{const current=await read('editorA',state.units.A);if(Number(current.body.configuracao.margem_percentual)!==Number(initial.body.configuracao.margem_percentual)){const restored=await patch('editorA',state.units.A,current.etag,{margem_percentual:initial.body.configuracao.margem_percentual},'INT-003 retorno do parâmetro de demonstração');assert.equal(restored.status,200);}}catch{completed=false;failure??={message:'Retorno do parâmetro requer revisão'};process.exitCode=1;}}
 for(const client of Object.values(clients))await client.auth.signOut();
 await fs.writeFile(path.join(path.dirname(stateFile),'http-result.json'),JSON.stringify({executedAt:new Date().toISOString(),environment:'Worker local + Supabase staging real',mocked:false,completed,failure,results},null,2));
}
