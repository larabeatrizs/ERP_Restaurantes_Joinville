// Opt-in: somente identidades sintéticas; cria demonstrações e mantém auditoria.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
const stateFile=process.env.ERP_STOCK_TEST_STATE;
if(!stateFile)throw Error('Synthetic private state required');
const state=JSON.parse(await fs.readFile(stateFile,'utf8'));
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co'||!state.publishableKey?.startsWith('sb_publishable_'))throw Error('Unexpected project');
const origin=process.env.ERP_STAGING_URL;
if(origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev')throw Error('Confirmed hosted staging required');
const root=path.dirname(stateFile),nonce=randomUUID().slice(0,8),clients={},tokens={},contexts=[];
const accounts={};const proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,scenarios:[],phase:'login'};
let browser;
async function api(label,route,method='GET',body,status=200){
 const response=await fetch(origin+route,{method,headers:{...(label?{Authorization:'Bearer '+tokens[label]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,status);return response.json();
}
const base=unit=>`/api/unidades/${unit}`;
const balanceKey=row=>row.lote_id+'-'+row.camara_id;
const ordered=rows=>[...rows].sort((a,b)=>balanceKey(a).localeCompare(balanceKey(b)));
try{
 for(const label of ['editorA','editorB','readerA']){
  const account=state.users.find(u=>u.label===label);if(!/^int003-.*@example\.invalid$/.test(account?.email))throw Error('Only synthetic identities');accounts[label]=account;
  const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'cad002-'+label},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});clients[label]=client;
  const login=await client.auth.signInWithPassword({email:account.email,password:account.password});if(login.error||login.data.user?.id!==account.id||!login.data.session)throw Error('Auth failed');tokens[label]=login.data.session.access_token;
 }
 const a=String(state.units.A),b=String(state.units.B),units=await api('editorB','/api/unidades');
 assert.ok(units.unidades.some(u=>u.id===b&&u.codigo==='STG-INT003-B'));
 const beforeA=await api('editorA',base(a)+'/estoque/saldos'),beforeB=await api('editorB',base(b)+'/estoque/saldos');
 const ctx=await api('editorA',base(a)+'/estoque/contexto');const measure=ctx.medidas.find(m=>m.sigla.toUpperCase()==='KG'),category=ctx.categorias.find(c=>c.armazenamento_padrao==='SECO');
 if(!measure||!category)throw Error('Synthetic catalog required');
 const input=kind=>({descricao:`CAD-002 ${kind} ${nonce}`,complemento:'Demonstracao',unidade_medida_id:measure.id,categoria_id:category.id,perecivel:false,armazenamento:'SECO',fator_correcao:'1',apresentacao_compra:'Pacote de 1 kg',quantidade_apresentacao:'1',estoque_minimo:'10',estoque_maximo:'40',ponto_reposicao:'12',status:'ATIVO'});
 proof.phase='http-link';
 const p1=(await api('editorA',base(a)+'/produtos','POST',input('API'),201)).produto;
 const candidates=await api('editorB',base(b)+'/produtos/disponiveis?'+new URLSearchParams({q:p1.descricao,offset:'0'}));assert.equal(candidates.total,1);
 assert.deepEqual(Object.keys(candidates.produtos[0]).sort(),['id','revisao','descricao','complemento','unidade_sigla','categoria_descricao','apresentacao_compra','armazenamento'].sort());
 const link={revisao:p1.revisao,estoque_minimo:'5.000001',estoque_maximo:'20',ponto_reposicao:null};
 const saved=(await api('editorB',base(b)+`/produtos/${p1.id}/vinculo`,'POST',link)).produto;assert.equal(saved.id,p1.id);assert.equal(saved.revisao,p1.revisao);assert.equal(saved.estoque_minimo,'5.000001');
 await api('editorB',base(b)+`/produtos/${p1.id}/vinculo`,'POST',link);
 await api('editorB',base(b)+`/produtos/${p1.id}/vinculo`,'POST',{...link,estoque_minimo:'9'},409);
 await api('editorB',base(b)+`/produtos/${p1.id}/vinculo`,'POST',{...link,revisao:'999999'},412);
 assert.equal((await api('editorB',base(b)+'/produtos/disponiveis?'+new URLSearchParams({q:p1.descricao,offset:'0'}))).total,0);
 proof.scenarios.push('cadastro global único e vínculo por API com parâmetros independentes','reenvio sem duplicação; conflito de parâmetros e revisão antiga recusados');
 proof.phase='negative-access';
 await api(null,base(b)+'/produtos/disponiveis','GET',undefined,401);
 await api('readerA',base(a)+`/produtos/${p1.id}/vinculo`,'POST',link,403);
 await api('readerA',base(b)+'/produtos/disponiveis','GET',undefined,404);
 const direct=await clients.editorB.schema('erp').from('produto_unidade').insert({unidade_id:b,produto_id:p1.id,estoque_minimo:'999'});assert.equal(direct.error?.code,'42501');
 const malformed=await clients.editorB.schema('erp').rpc('catalogo_unidade',{p_unidade:b,p_acao:'vincular',p_dados:{...link,id:p1.id,descricao:'Nao alterar'}});assert.equal(malformed.error?.code,'PT422');
 proof.scenarios.push('sem sessão, readonly, outra unidade, DML direto e campos globais indevidos negados');
 const p2=(await api('editorA',base(a)+'/produtos','POST',input('UI'),201)).produto;
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 async function enter(width){const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);const page=await context.newPage();await page.goto(origin);await page.getByLabel('E-mail',{exact:true}).fill(accounts.editorB.email);await page.getByLabel('Senha',{exact:true}).fill(accounts.editorB.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Operação e custos'})).toBeVisible({timeout:30000});await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Produtos',exact:true}).click();return page;}
 proof.phase='browser-link';const page=await enter(360);
 await page.getByRole('button',{name:'Vincular produto existente',exact:true}).click();
 await page.getByLabel('Buscar no catálogo',{exact:true}).fill(p2.descricao);
 const searched=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname===base(b)+'/produtos/disponiveis'&&u.searchParams.get('q')===p2.descricao;});
 await page.getByRole('button',{name:'Buscar',exact:true}).click();assert.ok((await searched).ok());
 await expect(page.getByRole('button',{name:'Selecionar '+p2.descricao,exact:true})).toBeVisible();await expect(page.getByText('Consultando catálogo…',{exact:true})).toBeHidden();
 await expect(page.locator('html')).toHaveJSProperty('scrollWidth',360);
 await page.screenshot({path:path.join(root,'cad002-catalogo-360.png'),fullPage:true});
 await page.getByRole('button',{name:'Selecionar '+p2.descricao,exact:true}).click();await page.getByLabel('Estoque mínimo *',{exact:true}).fill('3,25');await page.getByLabel('Estoque máximo',{exact:true}).fill('9,5');await page.getByLabel('Ponto de reposição',{exact:true}).fill('4,5');
 await page.getByRole('button',{name:'Vincular à unidade',exact:true}).click();await expect(page.getByText('Produto vinculado à unidade com sucesso.',{exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('button',{name:'Editar '+p2.descricao,exact:true})).toBeVisible({timeout:30000});
 proof.phase='fresh-session';const fresh=await enter(1280);await fresh.getByLabel('Buscar produto',{exact:true}).fill(p2.descricao);await fresh.getByRole('button',{name:'Buscar',exact:true}).click();await fresh.getByRole('button',{name:'Editar '+p2.descricao,exact:true}).click();
 await expect(fresh.getByLabel('Estoque mínimo *',{exact:true})).toHaveValue('3,250000');await expect(fresh.getByLabel('Estoque máximo',{exact:true})).toHaveValue('9,500000');
 await fresh.screenshot({path:path.join(root,'cad002-parametros-1280.png'),fullPage:true});
 proof.scenarios.push('busca/seleção/vínculo pela UI em 360px','nova sessão reabre parâmetros persistidos na unidade B');
 const source=await api('editorA',base(a)+'/produtos?'+new URLSearchParams({q:p2.descricao,status:'ATIVO',offset:'0'}));assert.equal(source.produtos[0].id,p2.id);assert.equal(source.produtos[0].estoque_minimo,'10.000000');assert.equal(source.produtos[0].revisao,p2.revisao);
 assert.deepEqual(ordered((await api('editorA',base(a)+'/estoque/saldos')).saldos),ordered(beforeA.saldos));assert.deepEqual(ordered((await api('editorB',base(b)+'/estoque/saldos')).saldos),ordered(beforeB.saldos));
 proof.scenarios.push('parâmetros da origem/revisão global e saldos das duas unidades preservados');
 proof.products=[p1.id,p2.id];proof.completed=true;proof.phase='completed';console.log('PASS: catálogo/vínculo reais por API e UI, nova sessão e saldos preservados.');
}catch{console.error('FAIL: jornada de vínculo interrompida; evidência privada mantém a fase, dados/auditoria preservados.');process.exitCode=1;}
finally{for(const context of contexts)await context.close();if(browser)await browser.close();for(const client of Object.values(clients))await client.auth.signOut({scope:'local'});await fs.writeFile(path.join(root,'cad002-resultado.json'),JSON.stringify(proof,null,2));}
