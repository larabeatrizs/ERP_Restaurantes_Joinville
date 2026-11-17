// Opt-in readonly journey. Uses existing synthetic ADMIN and consultation account only.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const repo=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const file=await fs.realpath(process.env.ERP_ADMIN_TEST_STATE??'');const relative=path.relative(repo,file);
if(!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative))throw Error('Private state outside checkout required.');
const state=JSON.parse(await fs.readFile(file,'utf8'));
const previous=JSON.parse(await fs.readFile(path.join(path.dirname(file),'stock-identidades.json'),'utf8'));
const runtime=JSON.parse(await fs.readFile(path.join(path.dirname(file),'../auth-ux003/runtime-private.json'),'utf8'));
const origin='https://erp-joinville-configurador.erp-restaurantes-joinville.workers.dev';
if(process.env.ERP_USER_CSV_VERIFY!=='1'||state.projectRef!=='vpowsedoajpdbeckimuv'||previous.projectRef!==state.projectRef||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co')throw Error('Confirmed shared staging required.');
assert.match(state.admin.email,/^adm003-[^@]+@example\.invalid$/);assert.equal(state.admin.login,'stg.adm003.admin');
assert.match(state.operator.email,/^adm003-[^@]+@example\.invalid$/);assert.equal(state.operator.login,'adm003.operador');
const reader=previous.users.find(user=>user.label==='readerA');if(!reader||!/^(int003|est001)-[^@]+@example\.invalid$/.test(reader.email))throw Error('Reserved consultation identity required.');
const directory=JSON.parse(runtime.AUTH_LOGIN_DIRECTORY);const login=Object.entries(directory).find(([,email])=>email===reader.email)?.[0];if(!login)throw Error('Existing consultation alias required.');
const proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,domainWrites:0,scenarios:[]};
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
try{
 const html=await(await fetch(origin)).text();proof.asset=html.match(/src="([^\"]+\.js)"/)?.[1];assert.ok(proof.asset);
 for(const [label,account,write]of[['ADMIN',state.admin,true],['CONSULTA',{...reader,login},false]]){
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  await page.route('**/api/**',async route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())&&new URL(request.url()).pathname!=='/api/auth/login'){proof.domainWrites++;await route.abort();return;}await route.continue();});
  try{
   await page.goto(origin);await page.getByLabel('Nome de usuário',{exact:true}).fill(account.login);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Usuários',exact:true})).toBeVisible({timeout:30000});
   if(!write)await expect(page.getByRole('button',{name:'Novo usuário',exact:true})).toHaveCount(0);
   const response=page.waitForResponse(response=>response.url().includes('/api/admin/usuarios?')&&response.url().includes('q=adm003.operador')&&response.status()===200);
   await page.getByLabel('Pesquisar usuários',{exact:true}).fill('adm003.operador');await page.getByRole('button',{name:'Pesquisar',exact:true}).click();await response;
   await expect(page.getByText('1 usuário(s) · página 1',{exact:true})).toBeVisible();
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();const exported=await download;assert.equal(exported.suggestedFilename(),'usuarios.csv');const csv=await fs.readFile(await exported.path(),'utf8');
   assert.equal(csv.split('\r\n').filter(Boolean).length,2);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/adm003\.operador/);assert.ok(csv.includes(state.operator.email));assert.match(csv,/Estoquista/);assert.match(csv,/America\/Sao_Paulo/);assert.doesNotMatch(csv,/definir-senha|access_token|refresh_token|00000000-0000/);
   await expect(page.getByRole('status')).toContainText('CSV gerado com 1');
   for(const width of[360,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   proof.scenarios.push({name:`${label}: CSV da pesquisa sintética, contato/perfil/unidade e feedback; sem overflow 360/768/1280`,passed:true});
  }finally{await context.close();}
 }
 assert.equal(proof.domainWrites,0);proof.completed=true;
}catch(error){await fs.writeFile(path.join(path.dirname(file),'adm005-error-private.txt'),String(error?.stack??error));throw Error('Hosted user CSV journey failed; inspect private report.');}
finally{await browser.close();await fs.writeFile(path.join(path.dirname(file),'adm005-result.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify(proof,null,2));
