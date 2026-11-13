// Opt-in: synthetic suppliers/accounts only, no email, admin key, stock writes or personal credential.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from '@playwright/test';
import {selectWorkspaceUnit} from './acessar-unidade.mjs';
const repo=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url))),file=await fs.realpath(process.env.ERP_STOCK_TEST_STATE??'');
const rel=path.relative(repo,file);if(!rel||(!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)))throw Error('Private state must be outside checkout');
const state=JSON.parse(await fs.readFile(file,'utf8')),origin=process.env.ERP_STAGING_URL;
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co'||!state.publishableKey?.startsWith('sb_publishable_')||origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev')throw Error('Confirmed staging required');
const root=path.dirname(file),nonce=randomUUID().slice(0,8).toUpperCase(),clients={},tokens={},accounts={},contexts=[];
const proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,phase:'auth',scenarios:[]};let browser;
const a=String(state.units.A),b=String(state.units.B),base=unit=>`/api/unidades/${unit}/fornecedores`,query=q=>'?'+new URLSearchParams({q,status:'ATIVO',ordem:'asc',offset:'0'});
function document(base){let p=base;for(let step=0;step<2;step++){let sum=0;for(let i=0;i<p.length;i++)sum+=(p.charCodeAt(i)-48)*(2+(p.length-1-i)%8);const mod=sum%11;p+=mod<2?'0':String(11-mod);}return p;}
const input=(label,prefix)=>({razao_social:`CAD-005 ${label} ${nonce}`,cnpj_cpf:document(prefix+nonce),nome_fantasia:null,contato:null,telefone:null,email:null,endereco:null,observacoes:null,tipo_fornecedor:'Demonstração sintética',condicao_pagamento:null,prazo_entrega_dias:0,pedido_minimo:'0.000001',agricultura_familiar:false,canal_preferido:null});
async function response(label,route,method='GET',body,status=200){const r=await fetch(origin+route,{method,headers:{...(label?{Authorization:'Bearer '+tokens[label]}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});assert.equal(r.status,status);return r;}
async function api(...args){return(await response(...args)).json();}
try {
 for(const label of ['editorA','editorB','readerA','stockkeeperA']) {
  const account=state.users.find(u=>u.label===label);if(!/^(int003|est001)-[^@]+@example\.invalid$/.test(account?.email))throw Error('Synthetic identity required');accounts[label]=account;
  const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(target,init)=>fetch(target,{...init,signal:AbortSignal.timeout(15000)})}});clients[label]=client;
  const login=await client.auth.signInWithPassword({email:account.email,password:account.password});if(login.error||login.data.user?.id!==account.id||!login.data.session)throw Error('Synthetic Auth failed');tokens[label]=login.data.session.access_token;
 }
 const balance=await api('editorA',`/api/unidades/${a}/estoque/saldos`);
 proof.phase='crud';const original=input('API','API5');let s=(await api('editorA',base(a),'POST',original,201)).fornecedor;
 assert.equal(s.pedido_minimo,'0.000001');assert.equal(s.agricultura_familiar,false);assert.equal((await api('editorB',base(b)+query(s.razao_social))).fornecedores[0].id,s.id);
 await api('editorA',base(a),'POST',{...original,razao_social:s.razao_social.toLowerCase()},409);
 await api('editorA',base(a),'POST',{...original,razao_social:'Outra razão '+nonce},409);
 const prior=s.revisao;s=(await api('editorA',base(a)+'/'+s.id,'PATCH',{...original,pedido_minimo:null,revisao:s.revisao})).fornecedor;assert.equal(s.pedido_minimo,null);
 await api('editorA',base(a)+'/'+s.id,'PATCH',{...original,revisao:prior},412);
 s=(await api('editorA',base(a)+'/'+s.id+'/status','POST',{revisao:s.revisao,status:'INATIVO'})).fornecedor;
 assert.ok(!(await api('editorA',`/api/unidades/${a}/estoque/contexto`)).fornecedores.some(x=>x.id===s.id));
 s=(await api('editorA',base(a)+'/'+s.id+'/status','POST',{revisao:s.revisao,status:'ATIVO'})).fornecedor;
 const linked=(await api('editorA',base(a)+query(''))).fornecedores.find(x=>!x.pode_excluir);assert.ok(linked);await api('editorA',base(a)+'/'+linked.id,'DELETE',{revisao:linked.revisao},409);
 const disposable=(await api('editorA',base(a),'POST',input('Exclusão funcional','DEL5'),201)).fornecedor;await api('editorA',base(a)+'/'+disposable.id,'DELETE',{revisao:disposable.revisao});
 proof.scenarios.push('cadastro compartilhado, documento alfanumérico/duplicidade, zero/null, revisão e ciclo de vida reais','inativo ausente da seleção; fornecedor anterior vinculado não exclui; exclusão funcional nova preserva auditoria');
 proof.phase='negative-access';await api(null,base(a)+query(''),'GET',undefined,401);await api('readerA',base(a),'POST',original,403);await api('readerA',base(b)+query(''),'GET',undefined,404);
 await api('stockkeeperA',base(a)+'/'+s.id+'/status','POST',{revisao:s.revisao,status:'INATIVO'},403);await api('stockkeeperA',base(a)+'/'+s.id,'DELETE',{revisao:s.revisao},403);
 s=(await api('stockkeeperA',base(a)+'/'+s.id,'PATCH',{...original,pedido_minimo:'0',revisao:s.revisao})).fornecedor;
 const dml=await clients.editorA.schema('erp').from('fornecedor').update({razao_social:'Indevido'}).eq('id',s.id);assert.equal(dml.error?.code,'42501');
 const malformed=await clients.editorA.schema('erp').rpc('fornecedor_operacao',{p_unidade:a,p_acao:'editar',p_dados:{...original,id:s.id,revisao:s.revisao,agricultura_familiar:'false'}});assert.equal(malformed.error?.code,'PT422');
 proof.scenarios.push('sem sessão/leitor/unidade alheia/DML/payload indevido negados; estoquista edita sem X');
 proof.phase='browser';browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 async function enter(width){const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(origin);await page.getByLabel('Nome de usuário',{exact:true}).fill('editora');await page.getByLabel('Senha',{exact:true}).fill(accounts.editorA.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await selectWorkspaceUnit(page,a);await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Fornecedores',exact:true}).click();return page;}
 async function search(page,name){await page.getByLabel('Buscar fornecedor',{exact:true}).fill(name);const loaded=page.waitForResponse(r=>{const url=new URL(r.url());return url.pathname===base(a)&&url.searchParams.get('q')===name;});await page.getByRole('button',{name:'Buscar',exact:true}).click();assert.ok((await loaded).ok());}
 const page=await enter(360),ui=input('UI','UI05');await page.getByRole('button',{name:'Incluir fornecedor',exact:true}).click();await page.getByLabel('Razão social *',{exact:true}).fill(ui.razao_social);await page.getByLabel('CPF/CNPJ *',{exact:true}).fill(ui.cnpj_cpf);await page.getByLabel('Agricultura familiar *',{exact:true}).selectOption('SIM');await page.getByLabel('Pedido mínimo',{exact:true}).fill('0,000001');await page.getByLabel('Prazo de entrega (dias)',{exact:true}).fill('0');await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click();await expect(page.getByText('Fornecedor salvo com sucesso.',{exact:true})).toBeVisible();await search(page,ui.razao_social);await expect(page.getByRole('button',{name:'Editar '+ui.razao_social,exact:true})).toBeVisible();
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),width);if(width===360)await page.screenshot({path:path.join(root,'cad005-fornecedores-360.png'),fullPage:true});}
 await page.getByRole('button',{name:'Editar '+ui.razao_social,exact:true}).click();await page.getByLabel('Pedido mínimo',{exact:true}).fill('0,123456');await page.getByLabel('Nome fantasia',{exact:true}).fill('Nome de demonstração');await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click();await expect(page.getByText('Fornecedor salvo com sucesso.',{exact:true})).toBeVisible();
 const fresh=await enter(1280);await search(fresh,ui.razao_social);await fresh.getByRole('button',{name:'Visualizar '+ui.razao_social,exact:true}).click();await expect(fresh.getByLabel('Pedido mínimo',{exact:true})).toHaveValue('0,123456');await expect(fresh.getByLabel('Razão social *',{exact:true})).toBeDisabled();await fresh.screenshot({path:path.join(root,'cad005-detalhe-1280.png'),fullPage:true});
 const csv=await(await response('readerA',base(a)+'/exportar'+query(ui.razao_social))).text();assert.ok(csv.includes(ui.razao_social));assert.ok(csv.includes('0,123456'));assert.ok(!csv.includes(original.razao_social));
 proof.scenarios.push('UI real cria/edita em 360/768/1280 e nova sessão consulta dados persistidos','CSV real filtrado preserva precisão e leitura não concede escrita');
 assert.deepEqual(await api('editorA',`/api/unidades/${a}/estoque/saldos`),balance);proof.scenarios.push('saldos preservados; sem compra, mensagem, troca de senha ou uso da conta pessoal');
 proof.completed=true;proof.phase='completed';console.log('PASS: fornecedores reais API/UI/CSV e nova sessão; saldos preservados.');
}catch(error){await fs.writeFile(path.join(root,'cad005-error-private.txt'),String(error.stack));console.error('FAIL: jornada de fornecedores interrompida; diagnóstico privado, sem credenciais no log.');process.exitCode=1;}
finally{for(const context of contexts)await context.close();if(browser)await browser.close();for(const client of Object.values(clients))await client.auth.signOut({scope:'local'});await fs.writeFile(path.join(root,'cad005-resultado.json'),JSON.stringify(proof,null,2));}
