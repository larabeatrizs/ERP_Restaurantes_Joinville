// Opt-in: apenas contas e dados sintéticos no staging conhecido; sem chave administrativa.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium,expect } from '@playwright/test';
const file=process.env.ERP_STOCK_TEST_STATE;if(!file)throw Error('Defina ERP_STOCK_TEST_STATE fora do checkout.');
const state=JSON.parse(await fs.readFile(file,'utf8'));
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co')throw Error('Projeto inesperado');
const base='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev',root=`/api/unidades/${state.units.A}`;
const output=path.join(path.dirname(file),'est002');await fs.mkdir(output,{recursive:true});
const checkpoint=path.join(output,'checkpoint-private.json');
let proof;
try{proof=JSON.parse(await fs.readFile(checkpoint,'utf8'));if(process.env.ERP_RESUME_STOCK_JOURNEY!=='1'||proof.completed||! /^[a-f0-9]{8}$/.test(proof.nonce))throw Error('Jornada já iniciada; examine checkpoint privado e use retomada explícita somente se incompleta.');proof.resumed=true;}catch(e){if(e.code!=='ENOENT')throw e;proof={completed:false,scenarios:[],screenshots:[],nonce:randomUUID().slice(0,8)};}
const save=()=>fs.writeFile(checkpoint,JSON.stringify(proof,null,2));await save();
const publicProof=()=>Object.fromEntries(Object.entries(proof).filter(([key])=>!['entryKey','firstInput','firstResult','secondInput'].includes(key)));
const sessions={},clients=[];let browser;
const passed=s=>{if(!proof.scenarios.some(x=>x.scenario===s))proof.scenarios.push({scenario:s,passed:true});};
async function api(label,route,method='GET',body){return fetch(base+route,{method,headers:{...(label?{Authorization:`Bearer ${sessions[label].access_token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});}
async function ok(label,route,method='GET',body){const r=await api(label,route,method,body);assert.ok(r.status===200||(method==='POST'&&r.status===201),`${method} ${route}: ${r.status}`);return r.json();}
async function view(label){const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${state.projectRef}-auth-token`,session:sessions[label]});const page=await context.newPage();page.on('dialog',d=>d.accept());await page.goto(base);await page.getByLabel('Unidade de acesso',{exact:true}).selectOption(state.units.A);await page.getByRole('button',{name:'Acessar unidade'}).click();await page.getByRole('link',{name:'Requisições rápidas',exact:true}).click();return{page,context};}
try{
 for(const label of ['stockkeeperA','editorA','readerA','editorB']){const u=state.users.find(x=>x.label===label);if(!u||!/^(int003|est001)-[^@]+@example\.invalid$/.test(u.email))throw Error('Conta fora do escopo sintético');const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);const{data,error}=await client.auth.signInWithPassword({email:u.email,password:u.password});assert.ifError(error);sessions[label]=data.session;}
 assert.equal((await api(null,root+'/requisicoes')).status,401);
 assert.equal((await api('readerA',`/api/unidades/${state.units.B}/requisicoes`)).status,404);
 const kitchen=await ok('stockkeeperA',root+'/requisicoes');assert.equal(kitchen.pode_registrar,true);assert.equal(kitchen.pode_conferir,false);
 const manager=await ok('editorA',root+'/requisicoes');assert.equal(manager.pode_conferir,true);
 const reader=await ok('readerA',root+'/requisicoes');assert.equal(reader.pode_registrar,false);assert.equal(reader.pode_conferir,false);
 const ctx=await ok('stockkeeperA',root+'/estoque/contexto');const m=ctx.medidas[0],c=ctx.categorias[0],s=ctx.fornecedores[0],l=ctx.locais.find(x=>x.tipo==='SECO');assert.ok(m&&c&&s&&l);
 const description=`Sintético EST002 ${proof.nonce}`;
 const candidates=(await ok('stockkeeperA',root+'/produtos?'+new URLSearchParams({q:description,status:'ATIVO',offset:'0'}))).produtos.filter(p=>p.descricao===description);assert.ok(candidates.length<=1);
 const product=candidates[0]??(await ok('stockkeeperA',root+'/produtos','POST',{descricao:description,complemento:'',unidade_medida_id:m.id,categoria_id:c.id,perecivel:false,armazenamento:'SECO',fator_correcao:'1',apresentacao_compra:'Saco',quantidade_apresentacao:'1',estoque_minimo:'0',estoque_maximo:null,ponto_reposicao:null,status:'ATIVO'})).produto;
 if(proof.productId)assert.equal(proof.productId,product.id);proof.productId=product.id;await save();
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const today=['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');
 const entries=(await ok('stockkeeperA',root+'/entradas')).entradas.filter(e=>e.numero_nf===`EST002-${proof.nonce}`);assert.ok(entries.length<=1);
 const entry=entries[0]??(await ok('stockkeeperA',root+'/entradas','POST',{data_entrada:today,fornecedor_id:s.id,numero_nf:`EST002-${proof.nonce}`,total_nota:null,observacoes:'Jornada sintética EST-002',itens:[{produto_id:product.id,quantidade:'20',valor_unitario:'1',numero_lote:`EST002-${proof.nonce}`,validade:null,camara_id:l.id,temperatura:null,aspecto_embalagem:'Íntegra',conformidade:'CONFORME',motivo:''}]})).entrada;
 if(proof.entryId)assert.equal(proof.entryId,entry.id);assert.ok(entry.itens.every(i=>i.produto_id===product.id));proof.entryId=entry.id;proof.entryKey??=randomUUID();await save();await ok('stockkeeperA',root+`/entradas/${entry.id}/confirmar`,'POST',{chave:proof.entryKey});
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
 const stock=await view('stockkeeperA');
 if(!proof.firstInput){assert.ok(!(await ok('stockkeeperA',root+'/requisicoes')).requisicoes.some(r=>r.produto_id===product.id),'Retirada existente sem chave local: inspecione antes de continuar');
 await stock.page.getByRole('combobox',{name:'Produto',exact:true}).selectOption(product.id);await stock.page.getByLabel('Quantidade',{exact:true}).fill('2');await stock.page.getByLabel('Quem retirou',{exact:true}).fill('Pessoa sintética EST-002');
 const registration=stock.page.waitForResponse(r=>new URL(r.url()).pathname===root+'/requisicoes'&&r.request().method()==='POST'),outbound=stock.page.waitForRequest(r=>new URL(r.url()).pathname===root+'/requisicoes'&&r.method()==='POST');await stock.page.getByRole('button',{name:'Registrar retirada',exact:true}).click();proof.firstInput=(await outbound).postDataJSON();await save();const response=await registration;assert.equal(response.status(),200);proof.firstResult=(await response.json()).requisicao;proof.registrationViaView=true;await save();await expect(stock.page.getByText('Retirada registrada. O estoque foi atualizado uma única vez.')).toBeVisible();}
 const body=proof.firstInput;assert.equal(body.produto_id,product.id);assert.equal(body.quantidade,'2');const r=proof.firstResult??(await ok('stockkeeperA',root+'/requisicoes','POST',body)).requisicao;proof.firstResult=r;proof.withdrawalId=r.id;await save();
 assert.deepEqual(await ok('stockkeeperA',root+'/requisicoes','POST',body),{requisicao:r});
 assert.equal((await api('readerA',root+'/requisicoes','POST',{...body,chave:randomUUID()})).status,403);
 assert.equal((await api('stockkeeperA',root+'/requisicoes','POST',{...body,quantidade:'99',chave:randomUUID()})).status,409);
 assert.equal((await api('stockkeeperA',root+`/requisicoes/${r.id}/conferencia`,'POST',{revisao:r.revisao,estado:'CONFERIDA',motivo:''})).status,403);
 const balance=async()=>{const data=await ok('stockkeeperA',root+'/estoque/saldos');return data.saldos.find(x=>x.produto_id===product.id).quantidade;};if(!proof.secondInput)assert.equal(await balance(),'18.000000');
 passed('View registra 2 de 20; replay não repete baixa; leitura/outra unidade/sem sessão/saldo insuficiente e conferência pelo solicitante negados');
 const reviewer=await view('editorA');const current=(await ok('editorA',root+'/requisicoes')).requisicoes.find(x=>x.id===r.id);assert.ok(current);
 if(current.estado==='REGISTRADA'){await reviewer.page.getByRole('button',{name:`Conferir #${r.id}`,exact:true}).click();const review=reviewer.page.waitForResponse(x=>new URL(x.url()).pathname===root+`/requisicoes/${r.id}/conferencia`);await reviewer.page.getByRole('button',{name:'Marcar como conferida',exact:true}).click();assert.equal((await review).status(),200);proof.reviewViaView=true;await save();}else assert.equal(current.estado,'CONFERIDA');if(!proof.secondInput)assert.equal(await balance(),'18.000000');
 proof.secondInput??={...body,chave:randomUUID(),quantidade:'3'};assert.equal(proof.secondInput.produto_id,product.id);assert.equal(proof.secondInput.quantidade,'3');assert.equal(proof.secondInput.retirado_por,body.retirado_por);await save();const second=(await ok('stockkeeperA',root+'/requisicoes','POST',proof.secondInput)).requisicao;const secondCurrent=(await ok('editorA',root+'/requisicoes')).requisicoes.find(x=>x.id===second.id);assert.ok(secondCurrent);if(secondCurrent.estado==='REGISTRADA')await ok('editorA',root+`/requisicoes/${second.id}/conferencia`,'POST',{revisao:secondCurrent.revisao,estado:'CONTESTADA',motivo:'Revisão sintética sem estorno automático'});else assert.equal(secondCurrent.estado,'CONTESTADA');assert.equal(await balance(),'15.000000');proof.secondWithdrawalId=second.id;await save();
 assert.equal((await api('editorA',root+`/requisicoes/${r.id}/conferencia`,'POST',{revisao:r.revisao,estado:'CONFERIDA',motivo:''})).status,412);
 await reviewer.page.getByRole('button',{name:'Atualizar requisições'}).click();await expect(reviewer.page.getByRole('cell').filter({hasText:'Contestada'})).toBeVisible();
 for(const width of [1280,768,360]){await reviewer.page.setViewportSize({width,height:900});assert.ok(await reviewer.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const name=`requisicoes-${width}.png`;await reviewer.page.screenshot({path:path.join(output,name),fullPage:true});if(!proof.screenshots.includes(name))proof.screenshots.push(name);}
 passed('View de gestor confere sem segunda baixa; segunda retirada contestada não estorna; revisão antiga é negada; layout 1280/768/360 sem overflow da página');
 const ro=await view('readerA');await expect(ro.page.getByRole('heading',{name:'Registrar retirada'})).toHaveCount(0);await expect(ro.page.getByRole('button',{name:`Conferir #${r.id}`,exact:true})).toHaveCount(0);passed('Leitor consulta sem controles de escrita/conferência');
 for(const ctx of [stock.context,reviewer.context,ro.context])await ctx.close();proof.balance='15.000000';proof.completed=true;
}catch(error){await fs.writeFile(path.join(output,'error-private.txt'),String(error?.stack??error));throw Error('Jornada EST-002 falhou; consulte o relatório privado antes de repetir.');}
finally{if(browser)await browser.close();for(const c of clients)await c.auth.stopAutoRefresh();await save();await fs.writeFile(path.join(output,'jornada-hospedada.json'),JSON.stringify(publicProof(),null,2));}
console.log(JSON.stringify(publicProof(),null,2));
