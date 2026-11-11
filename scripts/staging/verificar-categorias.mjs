// Opt-in, synthetic identities only. No personal account or admin key is read.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
const stateFile=process.env.ERP_STOCK_TEST_STATE;
if(!stateFile)throw Error('Synthetic private state required');
const state=JSON.parse(await fs.readFile(stateFile,'utf8')),origin=process.env.ERP_STAGING_URL;
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co'||!state.publishableKey?.startsWith('sb_publishable_')||origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev')throw Error('Confirmed project/staging required');
const root=path.dirname(stateFile),nonce=randomUUID().slice(0,8),clients={},tokens={},accounts={},contexts=[];
const proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,scenarios:[],phase:'auth'};
let browser;
const a=String(state.units.A),b=String(state.units.B),base=unit=>`/api/unidades/${unit}/categorias`;
const query=(q='',status='ATIVO')=>'?'+new URLSearchParams({q,status,ordem:'asc',offset:'0'});
const input=label=>({descricao:`CAD-003 ${label} ${nonce}`,tipo_item:'ALIMENTO',armazenamento_padrao:'SECO',dias_alerta_validade:0});
async function response(label,route,method='GET',body,status=200){const r=await fetch(origin+route,{method,headers:{...(label?{Authorization:'Bearer '+tokens[label]}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});assert.equal(r.status,status);return r;}
async function api(...args){return (await response(...args)).json();}
try{
 for(const label of ['editorA','editorB','readerA','stockkeeperA']){
  const account=state.users.find(u=>u.label===label);if(!/^(int003|est001)-[^@]+@example\.invalid$/.test(account?.email))throw Error('Only synthetic identities');accounts[label]=account;
  const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'cad003-'+label},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});clients[label]=client;
  const login=await client.auth.signInWithPassword({email:account.email,password:account.password});if(login.error||login.data.user?.id!==account.id||!login.data.session)throw Error('Synthetic Auth failed');tokens[label]=login.data.session.access_token;
 }
 const balances=await api('editorA',`/api/unidades/${a}/estoque/saldos`);
 proof.phase='api-crud';let c=(await api('editorA',base(a),'POST',input('API'),201)).categoria;
 assert.equal(c.dias_alerta_validade,0);assert.equal(c.status,'ATIVO');
 assert.equal((await api('editorB',base(b)+query(c.descricao))).categorias[0].id,c.id);
 await api('editorA',base(a),'POST',{...input('API'),descricao:c.descricao.toUpperCase()},409);
 const prior=c.revisao;c=(await api('editorA',base(a)+'/'+c.id,'PATCH',{...input('API'),dias_alerta_validade:null,revisao:c.revisao})).categoria;assert.equal(c.dias_alerta_validade,null);
 await api('editorA',base(a)+'/'+c.id,'PATCH',{...input('API'),revisao:prior},412);
 c=(await api('editorA',base(a)+'/'+c.id+'/status','POST',{revisao:c.revisao,status:'INATIVO'})).categoria;
 assert.equal((await api('editorA',base(a)+query(c.descricao))).total,0);assert.equal((await api('editorA',base(a)+query(c.descricao,'INATIVO'))).total,1);
 c=(await api('editorA',base(a)+'/'+c.id+'/status','POST',{revisao:c.revisao,status:'ATIVO'})).categoria;
 const linked=(await api('editorA',base(a)+query())).categorias.find(c=>!c.pode_excluir);assert.ok(linked);await api('editorA',base(a)+'/'+linked.id,'DELETE',{revisao:linked.revisao},409);
 const disposable=(await api('editorA',base(a),'POST',input('exclusao funcional'),201)).categoria;
 await api('editorA',base(a)+'/'+disposable.id,'DELETE',{revisao:disposable.revisao});
 proof.scenarios.push('cadastro global compartilhado, zero/null, unicidade, revisao e ciclo de vida por API','exclusao com vinculo negada; categoria isolada de ensaio excluida com trilha preservada');
 proof.phase='negative-access';await api(null,base(a)+query(),'GET',undefined,401);await api('readerA',base(a),'POST',input('negada'),403);await api('readerA',base(b)+query(),'GET',undefined,404);
 assert.equal((await api('readerA',base(a)+query())).capacidades.editar,false);
 await api('stockkeeperA',base(a)+'/'+c.id+'/status','POST',{revisao:c.revisao,status:'INATIVO'},403);
 await api('stockkeeperA',base(a)+'/'+c.id,'DELETE',{revisao:c.revisao},403);
 const edited=(await api('stockkeeperA',base(a)+'/'+c.id,'PATCH',{...input('API'),dias_alerta_validade:0,revisao:c.revisao})).categoria;c=edited;
 const dml=await clients.editorA.schema('erp').from('categoria').update({descricao:'Indevido'}).eq('id',c.id);assert.equal(dml.error?.code,'42501');
 const malformed=await clients.editorA.schema('erp').rpc('categoria_operacao',{p_unidade:a,p_acao:'editar',p_dados:{...input('API'),id:c.id,revisao:c.revisao,status:'INATIVO'}});assert.equal(malformed.error?.code,'PT422');
 proof.scenarios.push('sem sessao/leitor/outra unidade/DML negados; estoquista edita mas nao executa X; corpo indevido recusado');
 proof.phase='browser';browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 async function enter(width){const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);const page=await context.newPage();await page.goto(origin);await page.getByLabel('E-mail',{exact:true}).fill(accounts.editorA.email);await page.getByLabel('Senha',{exact:true}).fill(accounts.editorA.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Operação e custos'})).toBeVisible({timeout:30000});await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Categorias',exact:true}).click();return page;}
 const page=await enter(360);await page.getByRole('button',{name:'Incluir categoria',exact:true}).click();const ui=input('UI');await page.getByLabel('Descrição *',{exact:true}).fill(ui.descricao);await page.getByLabel('Dias de alerta de validade',{exact:true}).fill('0');await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();await expect(page.getByText('Categoria salva com sucesso.',{exact:true})).toBeVisible({timeout:30000});
 await page.getByLabel('Buscar categoria',{exact:true}).fill(ui.descricao);const loaded=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname===base(a)&&u.searchParams.get('q')===ui.descricao;});await page.getByRole('button',{name:'Buscar',exact:true}).click();assert.ok((await loaded).ok());await expect(page.getByRole('button',{name:'Editar '+ui.descricao,exact:true})).toBeVisible();
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),width);if(width===360)await page.screenshot({path:path.join(root,'cad003-categorias-360.png'),fullPage:true});}
 await page.getByRole('button',{name:'Editar '+ui.descricao,exact:true}).click();await page.getByRole('combobox',{name:'Armazenamento padrão *',exact:true}).selectOption('RESFRIADO');await page.getByLabel('Dias de alerta de validade',{exact:true}).fill('3');await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();await expect(page.getByText('Categoria salva com sucesso.',{exact:true})).toBeVisible({timeout:30000});
 const fresh=await enter(1280);await fresh.getByLabel('Buscar categoria',{exact:true}).fill(ui.descricao);await fresh.getByRole('button',{name:'Buscar',exact:true}).click();await fresh.getByRole('button',{name:'Visualizar '+ui.descricao,exact:true}).click();await expect(fresh.getByLabel('Dias de alerta de validade',{exact:true})).toHaveValue('3');await expect(fresh.getByLabel('Descrição *',{exact:true})).toBeDisabled();await fresh.screenshot({path:path.join(root,'cad003-detalhe-1280.png'),fullPage:true});
 const csv=await (await response('readerA',base(a)+'/exportar'+query(ui.descricao))).text();assert.ok(csv.includes(ui.descricao));assert.ok(csv.includes('Resfriado'));assert.ok(csv.includes('"3"'));
 proof.scenarios.push('UI real cria/edita em 360/768/1280 sem overflow global; nova sessao visualiza dados persistidos','CSV real filtrado e leitura sem escrita; valores preservados em nova sessao');
 assert.deepEqual(await api('editorA',`/api/unidades/${a}/estoque/saldos`),balances);
 proof.scenarios.push('saldos anteriores preservados');proof.completed=true;proof.phase='completed';console.log('PASS: categorias reais API/UI/CSV e nova sessao; saldos preservados.');
}catch{console.error('FAIL: jornada de categorias interrompida; fase preservada na evidencia privada, sem credenciais no log.');process.exitCode=1;}
finally{for(const context of contexts)await context.close();if(browser)await browser.close();for(const client of Object.values(clients))await client.auth.signOut({scope:'local'});await fs.writeFile(path.join(root,'cad003-resultado.json'),JSON.stringify(proof,null,2));}
