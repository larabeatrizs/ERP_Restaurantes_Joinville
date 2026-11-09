// Opt-in: contas privadas sintéticas, serviços reais, sem mocks ou chaves administrativas.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const stateFile=process.env.ERP_STOCK_TEST_STATE;
if(!stateFile)throw Error('Defina ERP_STOCK_TEST_STATE para o arquivo privado fora do checkout.');
const state=JSON.parse(await fs.readFile(stateFile,'utf8'));
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co'||!state.publishableKey?.startsWith('sb_publishable_'))throw Error('Projeto inesperado');
const base=new URL(process.env.ERP_STAGING_URL??'http://127.0.0.1:8787');
const local=base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname);
const hosted=base.protocol==='https:'&&/^erp-joinville-staging\.[a-z0-9-]+\.workers\.dev$/.test(base.hostname);
if((!local&&!hosted)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('Destino deve ser o Worker confirmado do staging');
const results=[],clients=[],tokens={};let completed=false;
const record=scenario=>{results.push({scenario,passed:true});console.log('PASS:',scenario);};
const url=route=>new URL(route,base);
async function api(label,route,method='GET',body){
 const headers={};if(label)headers.Authorization=`Bearer ${tokens[label]}`;
 if(body!==undefined)headers['Content-Type']='application/json';
 return fetch(url(route),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
}
async function ok(label,route,method='GET',body){const response=await api(label,route,method,body);assert.equal(response.status,200,`${method} ${route}`);return response.json();}
const root=`/api/unidades/${state.units.A}`;
const nonce=randomUUID().slice(0,8);
try{
 const health=await fetch(url('/api/health'));assert.equal(health.status,200);assert.equal((await health.json()).service,'erp-api');
 const missing=await fetch(url('/api/inexistente'));assert.equal(missing.status,404);assert.match(missing.headers.get('Content-Type'),/application\/json/);
 assert.equal((await api(null,root+'/estoque/contexto')).status,401);
 record('Worker real responde health, mantém 404 JSON e nega acesso sem sessão');
 for(const label of ['stockkeeperA','editorA','readerA','editorB']){
  const account=state.users.find(user=>user.label===label);
  if(!account||!/@example\.invalid$/.test(account.email))throw Error('Conta sintética ausente');
  const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'est001-'+label}});clients.push(client);
  const login=await client.auth.signInWithPassword({email:account.email,password:account.password});
  if(login.error||!login.data.session)throw Error('Login real falhou');
  const user=await client.auth.getUser(login.data.session.access_token);
  assert.equal(user.data.user?.id,account.id);assert.ok(['ERP_INT003_SYNTHETIC','ERP_EST001_SYNTHETIC'].includes(user.data.user?.app_metadata.purpose));
  tokens[label]=login.data.session.access_token;
 }
 record('Quatro identidades sintéticas autenticadas e verificadas no Auth real');
 const context=await ok('stockkeeperA',root+'/estoque/contexto');
 assert.equal(context.capacidades.produto_escrever,true);assert.equal(context.capacidades.recebimento_escrever,true);
 const reader=await ok('readerA',root+'/estoque/contexto');assert.equal(reader.capacidades.produto_escrever,false);assert.equal(reader.capacidades.recebimento_escrever,false);
 const manager=await ok('editorA',root+'/estoque/contexto');assert.equal(manager.capacidades.divergencia_aprovar,true);assert.equal(manager.capacidades.recebimento_escrever,false);
 record('Capacidades distinguem cadastro, recebimento, aprovação e consulta');
 const measure=context.medidas.find(item=>item.sigla==='KG');const category=context.categorias.find(item=>item.armazenamento_padrao==='SECO');const location=context.locais.find(item=>item.tipo==='SECO');const supplier=context.fornecedores[0];
 assert.ok(measure&&category&&location&&supplier,'catálogos sintéticos preparados');
 const input={descricao:`Demonstração EST001 Arroz ${nonce}`,complemento:'',unidade_medida_id:measure.id,categoria_id:category.id,perecivel:false,armazenamento:'SECO',fator_correcao:'1',apresentacao_compra:'Saco de 5 kg',quantidade_apresentacao:'5',estoque_minimo:'2',estoque_maximo:null,ponto_reposicao:null,status:'ATIVO'};
 const created=await api('stockkeeperA',root+'/produtos','POST',input);assert.ok([200,201].includes(created.status));let product=(await created.json()).produto;assert.ok(product.id);
 const search=await ok('stockkeeperA',root+'/produtos?q='+encodeURIComponent(nonce)+'&status=ATIVO&offset=0');assert.ok(search.produtos.some(item=>item.id===product.id));
 const duplicate=await api('stockkeeperA',root+'/produtos','POST',{...input,descricao:input.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replaceAll(' ','  ')});assert.equal(duplicate.status,409);
 assert.equal((await api('readerA',root+'/produtos','POST',{...input,descricao:input.descricao+' leitor'})).status,403);
 assert.ok([403,404].includes((await api('stockkeeperA',`/api/unidades/${state.units.B}/produtos`)).status));
 product=(await ok('stockkeeperA',root+'/produtos/'+product.id,'PATCH',{...input,estoque_minimo:'3',revisao:product.revisao})).produto;
 record('Produto persiste, busca/edição funcionam e duplicidade/leitor/outra unidade são negados');
 const entry={data_entrada:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),fornecedor_id:supplier.id,numero_nf:'EST001-'+nonce,total_nota:'70',observacoes:'EST-001 demonstração sintética',itens:[{produto_id:product.id,quantidade:'20',valor_unitario:'3.50',numero_lote:'EST001-'+nonce,validade:null,camara_id:location.id,temperatura:null,aspecto_embalagem:'Íntegra',conformidade:'CONFORME',motivo:''}]};
 const draftResponse=await api('stockkeeperA',root+'/entradas','POST',entry);assert.ok([200,201].includes(draftResponse.status));const draft=(await draftResponse.json()).entrada;
 const key=randomUUID();
 const confirmed=await Promise.all([api('stockkeeperA',root+`/entradas/${draft.id}/confirmar`,'POST',{chave:key}),api('stockkeeperA',root+`/entradas/${draft.id}/confirmar`,'POST',{chave:key})]);
 assert.deepEqual(confirmed.map(item=>item.status),[200,200]);
 const balance=await ok('stockkeeperA',root+'/estoque/saldos');const row=balance.saldos.find(item=>item.produto_id===product.id&&item.lote==='EST001-'+nonce);
 assert.ok(row);assert.equal(Number(row.quantidade),20);assert.equal(row.camara_id,location.id);
 const repeated=await api('stockkeeperA',root+`/entradas/${draft.id}/confirmar`,'POST',{chave:randomUUID()});assert.ok([200,409].includes(repeated.status));
 const after=await ok('stockkeeperA',root+'/estoque/saldos');assert.equal(Number(after.saldos.find(item=>item.lote_id===row.lote_id).quantidade),20);
 assert.equal((await api('stockkeeperA',root+'/entradas','POST',entry)).status,409);
 record('Compra de 20 kg confirma atomicamente: lote/local corretos, corrida e reenvio sem duplicar saldo/NF');
 assert.equal((await api('readerA',root+`/entradas/${draft.id}/confirmar`,'POST',{chave:randomUUID()})).status,403);
 assert.ok([403,404].includes((await api('editorB',root+'/estoque/saldos')).status));
 const direct=await fetch(state.url+'/rest/v1/saldo_lote_local?lote_id=eq.'+row.lote_id,{method:'PATCH',headers:{apikey:state.publishableKey,Authorization:'Bearer '+tokens.stockkeeperA,'Content-Profile':'erp','Content-Type':'application/json'},body:JSON.stringify({quantidade:999})});assert.equal(direct.status,403);
 record('Leitor, outra unidade e escrita direta não alteram o estoque');
 const reopened=await ok('stockkeeperA',root+'/entradas');assert.equal(reopened.entradas.find(item=>item.id===draft.id).estado,'CONFIRMADA');
 state.lastStockDemo={productId:product.id,entryId:draft.id,lot:row.lote,nonce};await fs.writeFile(stateFile,JSON.stringify(state,null,2));
 completed=true;
}catch{
 console.error('FAIL: fluxo real interrompido; revisar estado privado antes de repetir.');process.exitCode=1;
}finally{
 for(const client of clients)await client.auth.signOut();
 await fs.writeFile(path.join(path.dirname(stateFile),'stock-http-result.json'),JSON.stringify({executedAt:new Date().toISOString(),origin:base.origin,mocked:false,completed,results},null,2));
}
