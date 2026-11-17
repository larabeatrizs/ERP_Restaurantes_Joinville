// Jornada readonly do domínio. Somente contas sintéticas existentes; sem reset/criação.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const repo = await fs.realpath(fileURLToPath(new URL('../../', import.meta.url)));
const file = await fs.realpath(process.env.ERP_ADMIN_TEST_STATE ?? '');
const relative = path.relative(repo, file);
if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw Error('Private state outside checkout required.');
const state = JSON.parse(await fs.readFile(file, 'utf8'));
const erp = 'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev';
const configurator = 'https://erp-joinville-configurador.erp-restaurantes-joinville.workers.dev';
if (process.env.ERP_CONFIGURATOR_VERIFY !== '1' || state.projectRef !== 'vpowsedoajpdbeckimuv' || state.url !== 'https://vpowsedoajpdbeckimuv.supabase.co') throw Error('Confirmed staging opt-in required.');
for (const [account,login] of [[state.admin,'stg.adm003.admin'],[state.operator,'adm003.operador']]) if (!/^adm003-[^@]+@example\.invalid$/.test(account.email) || account.login !== login) throw Error('Reserved existing synthetic account required.');
const proof = { executedAt: new Date().toISOString(), erp, configurator, mocked: false, completed: false, domainWrites: 0, scenarios: [] };
const passed = name => proof.scenarios.push({ name, passed: true });
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge'});
async function headers(url) { const response = await fetch(url); assert.equal(response.status,200); assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow'); const html=await response.text(); assert.match(html,/<meta name="robots" content="noindex, nofollow"/); const asset=html.match(/src="([^\"]+\.js)"/)?.[1]; assert.ok(asset);const js=await fetch(new URL(asset,url));assert.equal(js.status,200);assert.equal(js.headers.get('X-Robots-Tag'),'noindex, nofollow');return asset; }
async function accountJourney(account, allowed) {
 const context = await browser.newContext(); const page = await context.newPage();
 await page.route('**/api/**', async route => { const request=route.request(); if(!['GET','HEAD'].includes(request.method()) && new URL(request.url()).pathname !== '/api/auth/login') {proof.domainWrites++;await route.abort();return;}await route.continue(); });
 try {
  await page.goto(configurator);await expect(page.getByRole('heading',{name:'Configurador',exact:true})).toBeVisible();await page.getByLabel('Nome de usuário',{exact:true}).fill(account.login);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:allowed?'Usuários':'Acesso restrito',exact:true})).toBeVisible();await expect(page.getByLabel('Unidade de acesso',{exact:true})).toHaveCount(0);
  const adminResponse=await page.evaluate(async()=>{const key=Object.keys(localStorage).find(key=>key.endsWith('-auth-token'));if(!key)throw Error('Missing synthetic session');const session=JSON.parse(localStorage.getItem(key));const response=await fetch('/api/admin/usuarios?q=stg.adm003.',{headers:{Authorization:`Bearer ${session.access_token}`}});return {status:response.status,cache:response.headers.get('Cache-Control')};});
  assert.equal(adminResponse.status,allowed?200:403);assert.equal(adminResponse.cache,'no-store');
  const token=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.endsWith('-auth-token'));return JSON.parse(localStorage.getItem(key)).access_token;});
  assert.equal((await fetch(`${erp}/api/admin/usuarios`,{headers:{Authorization:`Bearer ${token}`}})).status,404);
  const erpStatus=await page.evaluate(async(erp)=>{const key=Object.keys(localStorage).find(key=>key.endsWith('-auth-token'));const session=JSON.parse(localStorage.getItem(key));try{await fetch(`${erp}/api/admin/usuarios`,{headers:{Authorization:`Bearer ${session.access_token}`}});return 'cors-enabled';}catch{return 'cors-denied';}},erp);assert.equal(erpStatus,'cors-denied');
  if(allowed){
   await page.getByLabel('Pesquisar usuários',{exact:true}).fill('stg.adm003.');const loaded=page.waitForResponse(response=>response.url().includes('/api/admin/usuarios?')&&response.url().includes('q=stg.adm003.')&&response.status()===200);await page.getByRole('button',{name:'Pesquisar',exact:true}).click();await loaded;
   await page.getByRole('button',{name:'Novo usuário',exact:true}).click();await expect(page.getByLabel('Nome de login *',{exact:true})).toBeFocused();const checkboxes=page.getByRole('group',{name:'Unidades permitidas *',exact:true}).getByRole('checkbox');assert.ok(await checkboxes.count()>0);for(const box of await checkboxes.all())await expect(box).not.toBeChecked();
   await page.getByRole('link',{name:'Ir para o conteúdo',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('#conteudo')).toBeFocused();
   for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   passed('ADMIN existente acessa gestão/cadastro global sem unidade preselecionada; foco e 360/768/1280 preservados');
   await page.goto(erp);await page.getByLabel('Nome de usuário',{exact:true}).fill(account.login);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await expect(page.getByLabel('Unidade de acesso',{exact:true})).toBeEnabled();await page.getByLabel('Unidade de acesso',{exact:true}).selectOption(state.units.A);await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Usuários',exact:true})).toHaveCount(0);await expect(page.locator('a[href*="configurador"]')).toHaveCount(0);
   passed('Mesmo login continua acessando ERP após escolher unidade; navegação sem entrada administrativa');
  }else{await expect(page.getByRole('button',{name:'Novo usuário',exact:true})).toHaveCount(0);passed('Estoquista existente recebe acesso restrito e HTTP administrativo 403');}
 } finally {await context.close();}
}
try {
 proof.erpAsset=await headers(erp);proof.configuratorAsset=await headers(configurator);assert.notEqual(proof.erpAsset,proof.configuratorAsset);passed('Origens/builds distintos; HTML e assets reais recebem noindex');
 for(const method of ['GET','POST','HEAD','OPTIONS']){const response=await fetch(`${erp}/api/admin/usuarios`,{method,headers:{Authorization:'Bearer invalido',Origin:configurator}});assert.equal(response.status,404);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);}
 for(const path of ['/api/unidades','/api/unidades/1/produtos','/api/unidades/1/estoque/saldos','/api/admin/desconhecida'])assert.equal((await fetch(configurator+path)).status,404);
 assert.equal((await fetch(configurator+'/api/admin/usuarios')).status,401);passed('ERP recusa namespace administrativo; Configurador recusa operações; sem sessão retorna 401');
 await accountJourney(state.admin,true);await accountJourney(state.operator,false);
 assert.equal(proof.domainWrites,0);passed('Nenhuma criação, reemissão, alteração de senha ou escrita de domínio');proof.completed=true;
}catch(error){await fs.writeFile(path.join(path.dirname(file),'adm004-error-private.txt'),String(error?.stack??error));throw Error('Hosted configurator journey failed; inspect private report.');}
finally{await browser.close();await fs.writeFile(path.join(path.dirname(file),'adm004-result.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify(proof,null,2));
