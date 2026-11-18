// UX-004: navegação readonly com administrador sintético; não grava dados de negócio.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium,expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const privateRoot=process.env.ERP_PRESENTATION_STATE_DIR;
if(!privateRoot)throw Error('Informe diretório privado de fixtures, fora do checkout.');
const stock=JSON.parse(await fs.readFile(path.join(privateRoot,'stock-identidades.json'),'utf8'));
const fixture=JSON.parse(await fs.readFile(path.join(privateRoot,'adm003-identidades.json'),'utf8'));
assert.equal(stock.projectRef,'vpowsedoajpdbeckimuv');assert.match(fixture.admin.email,/^adm003-admin-[^@]+@example\.invalid$/);
const base='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev';
const client=createClient(stock.url,stock.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
const output=path.join(privateRoot,'ux004');await fs.mkdir(output,{recursive:true});
const proof={completed:false,readOnly:true,scenarios:[],screenshots:[],businessWrites:0};let browser,release;
try{
 const {data,error}=await client.auth.signInWithPassword({email:fixture.admin.email,password:fixture.admin.password});assert.ifError(error);
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${stock.projectRef}-auth-token`,session:data.session});
 const page=await context.newPage();page.on('request',request=>{if(new URL(request.url()).origin===base&&!['GET','HEAD'].includes(request.method()))proof.businessWrites++;});
 const gate=new Promise(resolve=>{release=resolve;});let hold=true;
 await page.route('**/api/unidades/*/estoque/saldos',async route=>{if(hold)await gate;await route.continue();});
 await page.goto(base);await page.getByLabel('Unidade de acesso',{exact:true}).selectOption(fixture.units.A);await page.getByRole('button',{name:'Acessar unidade'}).click();
 const skeleton=page.getByRole('status',{name:'Consultando indicadores…',exact:true});await expect(skeleton).toBeVisible();await page.screenshot({path:path.join(output,'skeleton.png'),fullPage:true});proof.screenshots.push('skeleton.png');hold=false;release();await expect(skeleton).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Configurações',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Ver configurações',exact:true})).toHaveCount(0);
 for(const width of [1280,768,360]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const file=`inicio-${width}.png`;await page.screenshot({path:path.join(output,file),fullPage:true});proof.screenshots.push(file);}
 await page.setViewportSize({width:1280,height:900});
 for(const [name,title] of [['Produtos','Produtos e alimentos'],['Recebimentos','Entrada de materiais'],['Saldo','Saldo de estoque']]){await page.getByRole('link',{name,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.locator('.loading-skeleton')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);}
 await page.getByRole('link',{name:'Início',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('main')).toBeFocused();assert.equal(proof.businessWrites,0);
 proof.scenarios.push('Skeleton observado com atraso de rede, sem resposta simulada; dados reais substituem placeholder','Configurações ausentes da navegação e do Início','Início 1280/768/360 sem overflow da página','Produtos, recebimentos e saldos consultados sem erro; teclado preservado','Nenhum POST/PATCH/PUT/DELETE para o Worker');proof.completed=true;
}catch(e){await fs.writeFile(path.join(output,'error-private.txt'),String(e?.stack??e));throw Error('Verificação visual falhou; consulte relatório privado.');}
finally{release?.();if(browser)await browser.close();client.auth.stopAutoRefresh();await fs.writeFile(path.join(output,'jornada-hospedada.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify(proof,null,2));
