// Opt-in synthetic-only user journey; no personal credential, email send or stock mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect=baseExpect.configure({timeout:20000});
const repo=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const file=await fs.realpath(process.env.ERP_STOCK_TEST_STATE??'');const relative=path.relative(repo,file);
if(!relative||(!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)))throw Error('Private state outside checkout required.');
const stock=JSON.parse(await fs.readFile(file,'utf8')),root=path.dirname(file),stateFile=path.join(root,'adm003-identidades.json');
const state=JSON.parse(await fs.readFile(stateFile,'utf8')),origin=process.env.ERP_STAGING_URL;
if(stock.projectRef!=='vpowsedoajpdbeckimuv'||state.projectRef!==stock.projectRef||origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev'||state.admin.email!=='adm003-admin-a@example.invalid'||state.admin.login!=='stg.adm003.admin')throw Error('Confirmed staging fixture required.');
const expectedAsset=(await fs.readFile(path.join(repo,'apps/web/dist/index.html'),'utf8')).match(/src="(\/assets\/index-[^"]+)"/)?.[1];
const freshUrl=`${origin}/?verificacao=adm003-${Date.now()}`;
if(!expectedAsset||!(await(await fetch(freshUrl,{cache:'no-store'})).text()).includes(expectedAsset))throw Error('Expected built assets are not yet served.');
state.operator??={login:'adm003.operador',nome:'Operador sintético ADM-003',email:'adm003-operador-a@example.invalid',password:`${randomBytes(24).toString('base64url')}aA1!`};
if(state.operator.login!=='adm003.operador'||state.operator.email!=='adm003-operador-a@example.invalid')throw Error('Reserved recipient required.');
await fs.writeFile(stateFile,JSON.stringify(state,null,2),{mode:0o600});
const proof={executedAt:new Date().toISOString(),origin,asset:expectedAsset,mocked:false,completed:false,phase:'initial',scenarios:[]};
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}),contexts=[],clients=[];
async function api(token,route,method='GET',body){return fetch(origin+route,{method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});}
async function login(page,account){await page.goto(freshUrl);await page.getByLabel('Nome de usuário',{exact:true}).fill(account.login);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByLabel('Unidade de acesso',{exact:true})).toBeEnabled();}
async function select(page,id){await page.getByLabel('Unidade de acesso',{exact:true}).selectOption(String(id));await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();}
function client(){const c=createClient(stock.url,stock.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;}
try{
 const adminContext=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(adminContext);const page=await adminContext.newPage();
 proof.phase='admin_login';await login(page,state.admin);await select(page,stock.units.A);await page.getByRole('link',{name:'Usuários',exact:true}).click();await expect(page.getByRole('button',{name:'Novo usuário',exact:true})).toBeEnabled();
 const adminClient=client(),adminSession=await adminClient.auth.signInWithPassword({email:state.admin.email,password:state.admin.password});assert.equal(adminSession.error,null);const adminToken=adminSession.data.session.access_token;
 const adminContextData=await(await api(adminToken,`/api/unidades/${stock.units.A}/estoque/contexto`)).json();assert.equal(adminContextData.capacidades.produto_escrever,true);assert.equal(adminContextData.capacidades.produto_ciclo_vida,false);assert.equal(adminContextData.capacidades.recebimento_escrever,false);assert.equal(adminContextData.capacidades.divergencia_aprovar,false);
 for(const resource of ['categorias','medidas','fornecedores']){const result=await(await api(adminToken,`/api/unidades/${stock.units.A}/${resource}`)).json();assert.equal(result.capacidades.editar,true);assert.equal(result.capacidades.ciclo_vida,false);}
 assert.equal((await(await api(adminToken,`/api/unidades/${stock.units.A}/configuracoes`)).json()).pode_editar,false);
 proof.scenarios.push({name:'ADMIN temporary catalog I enabled for four registries, without X, receipt write/approval or parameter edit',passed:true});
 const initial=await(await api(adminToken,'/api/admin/usuarios?'+new URLSearchParams({q:state.operator.login}))).json();
 let firstLink;
 if(initial.usuarios.length===0){
  proof.phase='create';await page.getByRole('button',{name:'Novo usuário',exact:true}).click();await page.getByLabel('Nome de login *',{exact:true}).fill(state.operator.login);await page.getByLabel('Nome de identificação *',{exact:true}).fill(state.operator.nome);await page.getByLabel('Email *',{exact:true}).fill(state.operator.email);
  await page.getByLabel('Perfil *',{exact:true}).selectOption('ESTOQUISTA');const checks=page.locator('input[name="unidades"]');
  for(const box of await checks.all())await box.setChecked((await box.getAttribute('value'))===String(stock.units.B));
  await page.getByLabel('Motivo do cadastro *',{exact:true}).fill('Ensaio sintético ADM-003');await page.getByRole('button',{name:'Incluir usuário',exact:true}).click();await expect(page.getByRole('heading',{name:'Primeiro acesso',exact:true})).toBeVisible();firstLink=await page.getByLabel('Link de primeiro acesso',{exact:true}).inputValue();
 }else{
  assert.equal(initial.usuarios.length,1);assert.equal(initial.usuarios[0].primeiro_acesso,true,'Already activated fixture requires separate review, not automatic reset.');
 }
 await page.getByLabel('Pesquisar usuários',{exact:true}).fill('ADM-003');await page.getByRole('button',{name:'Pesquisar',exact:true}).click();const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:state.operator.nome,exact:true})});await expect(row).toHaveCount(1);await expect(row).toContainText('Aguardando primeiro acesso');
 proof.phase='reissue';page.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:`Reemitir primeiro acesso para ${state.operator.nome}`,exact:true}).click();await expect(page.getByRole('status')).toContainText('Novo link de primeiro acesso gerado.');const link=await page.getByLabel('Link de primeiro acesso',{exact:true}).inputValue();assert.match(link,/#definir-senha=/);if(firstLink)assert.notEqual(link,firstLink);
 const activeDenied=await api(adminToken,`/api/admin/usuarios/${state.admin.id}/primeiro-acesso`,'POST',{});assert.equal(activeDenied.status,409);
 if(firstLink){const old=await client().auth.verifyOtp({token_hash:new URL(firstLink).hash.slice('#definir-senha='.length),type:'recovery'});assert.ok(old.error,'Reissued link must replace the prior one.');}
 proof.scenarios.push({name:'Synthetic admin creates stockkeeper for unit B, explicit pending-only reissue; active account refused and prior link rejected',passed:true});
 proof.phase='first_access';const recipientContext=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(recipientContext);const recipient=await recipientContext.newPage();
 const verification=recipient.waitForResponse(response=>new URL(response.url()).pathname==='/auth/v1/verify'&&response.request().method()==='POST').then(response=>response.json()).then(value=>({value}),error=>({error}));await recipient.goto(link);await expect(recipient.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible();const verified=await verification;assert.ok(!verified.error);const verificationData=verified.value;assert.equal(typeof verificationData.access_token,'string');assert.equal((await api(verificationData.access_token,'/api/me')).status,403,'Recovery alone must not unlock the domain.');
 await recipient.getByLabel('Nova senha',{exact:true}).fill(state.operator.password);await recipient.getByLabel('Confirmar nova senha',{exact:true}).fill(state.operator.password);await recipient.getByRole('button',{name:'Salvar senha',exact:true}).click();await expect(recipient.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible();
 proof.phase='operator_login';await recipient.getByLabel('Nome de usuário',{exact:true}).fill(state.operator.login);await recipient.getByLabel('Senha',{exact:true}).fill(state.operator.password);await recipient.getByRole('button',{name:'Entrar',exact:true}).click();await expect(recipient.getByLabel('Unidade de acesso',{exact:true})).toBeEnabled();await expect(recipient.locator(`select[aria-label="Unidade de acesso"] option[value="${stock.units.A}"]`)).toHaveCount(0);await select(recipient,stock.units.B);await expect(recipient.getByRole('link',{name:'Usuários',exact:true})).toHaveCount(0);
 const operator=client(),operatorSession=await operator.auth.signInWithPassword({email:state.operator.email,password:state.operator.password});assert.equal(operatorSession.error,null);const token=operatorSession.data.session.access_token;
 const context=await(await api(token,`/api/unidades/${stock.units.B}/estoque/contexto`)).json();assert.equal(context.capacidades.produto_escrever,true);
 assert.ok([403,404].includes((await api(token,`/api/unidades/${stock.units.A}/estoque/saldos`)).status));
 assert.equal((await api(token,'/api/admin/usuarios','POST',{login:'adm003.negado',nome:'Negado sintético',email:'adm003-negado@example.invalid',perfil:'ADMIN',unidades:[String(stock.units.B)],status:'ATIVO',revisao:null,motivo:'Teste negativo'})).status,403);
 const spoof=await fetch(`${stock.url}/rest/v1/rpc/admin_usuarios_servico`,{method:'POST',headers:{apikey:stock.publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Profile':'erp'},body:JSON.stringify({p_ator:state.admin.id,p_acao:'autorizar',p_dados:{}})});assert.ok([401,403,404].includes(spoof.status));
 proof.scenarios.push({name:'Recipient defines own password, recovery session remains blocked until password login; only unit B, catalog write enabled, other-unit/admin/spoofed RPC denied',passed:true});
 proof.phase='legacy_compatibility';const reader=stock.users.find(u=>u.label==='readerA');assert.ok(reader&&/^(int003|est001)-[^@]+@example\.invalid$/.test(reader.email));const directory=JSON.parse(JSON.parse(await fs.readFile(path.join(root,'../auth-ux003/runtime-private.json'),'utf8')).AUTH_LOGIN_DIRECTORY);const readerLogin=Object.entries(directory).find(([,email])=>email===reader.email)?.[0];assert.ok(readerLogin);
 const legacy=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:readerLogin,password:reader.password})});assert.equal(legacy.status,200);const legacyTokens=await legacy.json();assert.deepEqual(Object.keys(legacyTokens).sort(),['access_token','refresh_token']);const oldContext=await(await api(legacyTokens.access_token,`/api/unidades/${stock.units.A}/estoque/contexto`)).json();assert.equal(oldContext.capacidades.produto_escrever,false);assert.equal((await api(legacyTokens.access_token,'/api/admin/usuarios')).status,200);
 proof.scenarios.push({name:'Existing reserved reader keeps original username/password, readonly catalog and administrative consultation without promotion',passed:true});
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 proof.scenarios.push({name:'Administrative page without horizontal overflow at 360/768/1280',passed:true});proof.phase='complete';proof.completed=true;
}catch(error){await fs.writeFile(path.join(root,'adm003-journey-error-private.txt'),String(error?.stack??error));throw Error('Synthetic user journey failed; inspect private report.');}
finally{for(const c of contexts)await c.close();await browser.close();for(const c of clients)await c.auth.signOut({scope:'local'});await fs.writeFile(path.join(root,'adm003-journey-result.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify(proof,null,2));
