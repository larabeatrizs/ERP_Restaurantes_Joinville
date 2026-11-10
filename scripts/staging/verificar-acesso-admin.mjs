// Opt-in: somente consulta do ADMIN_INICIAL e recuperação de conta sintética, sem traces.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
const root=process.env.ERP_STAGING_PRIVATE_DIR;
if(!root)throw Error('Private directory required');
const owner=JSON.parse(fs.readFileSync(path.join(root,'admin-acompanhamento-privado.json'),'utf8'));
const synthetic=JSON.parse(fs.readFileSync(path.join(root,'identidades.json'),'utf8'));
const reader=synthetic.users.find(u=>u.label==='readerA');
if(owner.projectRef!=='vpowsedoajpdbeckimuv'||owner.alias!=='ADMIN_INICIAL'||!owner.bootstrapPassword||!/^int003-.*@example\.invalid$/.test(reader?.email))throw Error('Expected private states required');
const origin=process.env.ERP_STAGING_URL??'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev';
if(origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev')throw Error('Confirmed staging only');
const bytes=fs.readFileSync(path.join(root,'keys-private.json'));
const keys=JSON.parse(bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''));
if(keys.target?.project_ref!==owner.projectRef)throw Error('Project mismatch');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(synthetic.url,keys.keys.find(k=>k.type==='secret').api_key,options);
const client=createClient(synthetic.url,synthetic.publishableKey,options);
const proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,scenarios:[],credentialsPublished:false};
let browser,readerChanged=false;
try{
 const login=await client.auth.signInWithPassword({email:owner.email,password:owner.bootstrapPassword});
 if(login.error||login.data.user?.id!==owner.id||!login.data.session)throw Error('Owner login failed');
 const headers={Authorization:'Bearer '+login.data.session.access_token};
 const call=(url,init={})=>fetch(origin+url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(20000)});
 const units=await(await call('/api/unidades')).json();
 if(units.unidades?.length!==2||!units.unidades.every(u=>['STG-INT003-A','STG-INT003-B'].includes(u.codigo)))throw Error('Unexpected units');
 for(const u of units.unidades){
  const config=await call(`/api/unidades/${u.id}/configuracoes`);const body=await config.json();
  if(config.status!==200||body.pode_editar!==false)throw Error('Configuration access');
  const ctx=await call(`/api/unidades/${u.id}/estoque/contexto`);const context=await ctx.json();
  if(ctx.status!==200||!context.capacidades||Object.keys(context.capacidades).length!==3||Object.values(context.capacidades).some(v=>v!==false))throw Error('Capabilities not readonly');
  for(const route of ['produtos','entradas','estoque/saldos'])if((await call(`/api/unidades/${u.id}/${route}`)).status!==200)throw Error('Read failed');
  const denied=await call(`/api/unidades/${u.id}/configuracoes`,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':config.headers.get('etag')},body:JSON.stringify({campos:{margem_percentual:'6'},motivo:'ADM-001 escrita deve ser negada'})});
  if(denied.status!==403)throw Error('Write not denied');
  for(const action of ['produto_salvar','entrada_criar','entrada_aprovar_divergencia']){
   const deniedRpc=await client.schema('erp').rpc('estoque_operacao',{p_unidade:u.id,p_acao:action,p_dados:{}});
   if(deniedRpc.error?.code!=='PT403')throw Error('RPC write not denied');
  }
 }
 proof.scenarios.push('login real do ADMIN_INICIAL','duas unidades sintéticas e quatro telas por API','consulta sem capacidades de escrita; PATCH negado em ambas unidades');
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 const ownerContext=await browser.newContext({viewport:{width:1280,height:900}});const ownerPage=await ownerContext.newPage();
 await ownerPage.goto(origin);
 await ownerPage.getByLabel('E-mail',{exact:true}).fill(owner.email);await ownerPage.getByLabel('Senha',{exact:true}).fill(owner.bootstrapPassword);await ownerPage.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(ownerPage.getByRole('heading',{name:'Operação e custos'})).toBeVisible({timeout:30000});
 await expect(ownerPage.getByRole('combobox',{name:'Unidade',exact:true}).locator('option')).toHaveCount(2);
 await expect(ownerPage.getByLabel('Margem (%)',{exact:true})).toBeDisabled();
 await ownerPage.getByRole('button',{name:'Sair',exact:true}).click();
 proof.scenarios.push('ADMIN_INICIAL entra pela tela real e consulta configurações readonly');
 const link=await admin.auth.admin.generateLink({type:'recovery',email:reader.email});
 if(link.error||link.data.user?.id!==reader.id)throw Error('Synthetic link failed');
 const activation=origin+'/#definir-senha='+encodeURIComponent(link.data.properties.hashed_token);
 const context=await browser.newContext({viewport:{width:360,height:900}});const page=await context.newPage();
 await page.goto(activation);
 await expect(page.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible({timeout:30000});
 if(new URL(page.url()).hash)throw Error('Fragment retained');
 await expect(page.locator('html')).toHaveJSProperty('scrollWidth',360);
 await page.screenshot({path:path.join(root,'definir-senha-360.png'),fullPage:true});
 const temporary=randomBytes(24).toString('base64url')+'aA1!';
 await page.getByLabel('Nova senha',{exact:true}).fill(temporary);await page.getByLabel('Confirmar nova senha').fill(temporary);
 // Marcar antes do clique: uma falha de rede pode acontecer após a atualização do Auth.
 readerChanged=true;
 await page.getByRole('button',{name:'Salvar senha',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible({timeout:30000});
 await page.getByLabel('E-mail',{exact:true}).fill(reader.email);await page.getByLabel('Senha',{exact:true}).fill(temporary);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Operação e custos'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 await page.goto(activation);await expect(page.getByRole('heading',{name:'Link indisponível'})).toBeVisible({timeout:30000});
 proof.scenarios.push('recovery real sintético define senha, encerra sessão e permite novo login','link consumido recusado; token retirado da URL; viewport 360px');
 proof.completed=true;
}catch{console.error('FAIL: verificação interrompida; inspecione somente artefatos privados.');process.exitCode=1;}
finally{
 if(readerChanged){const restore=await admin.auth.admin.updateUserById(reader.id,{password:reader.password});if(restore.error){proof.completed=false;proof.syntheticPasswordRestored=false;process.exitCode=1;}else proof.syntheticPasswordRestored=true;}
 if(browser)await browser.close();await client.auth.signOut({scope:'local'});
 fs.writeFileSync(path.join(root,'admin-acesso-result.json'),JSON.stringify(proof,null,2));
 if(proof.completed)console.log('PASS: acesso real do administrador, leitura/negações e definição de senha no hospedado; credencial sintética restaurada.');
}
