// Read-only hosted journey. Credentials stay outside checkout; only reserved synthetic accounts are accepted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {selectWorkspaceUnit} from './acessar-unidade.mjs';

const repo=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const file=await fs.realpath(process.env.ERP_STOCK_TEST_STATE??'');
const rel=path.relative(repo,file);
if(!rel||(!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)))throw Error('Private state must be outside checkout');
const state=JSON.parse(await fs.readFile(file,'utf8'));
const origin=process.env.ERP_STAGING_URL;
if(state.projectRef!=='vpowsedoajpdbeckimuv'||origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev')throw Error('Confirmed staging required');
const root=path.dirname(file);
const runtime=JSON.parse(await fs.readFile(path.join(root,'../auth-ux003/runtime-private.json'),'utf8'));
const directory=JSON.parse(runtime.AUTH_LOGIN_DIRECTORY);
const proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,scenarios:[],operationalMutations:0};
let browser;
try{
  const account=state.users.find(u=>u.label==='readerA');
  if(!/^(int003|est001)-[^@]+@example\.invalid$/.test(account?.email))throw Error('Synthetic reader required');
  const login=Object.keys(directory).find(key=>directory[key]===account.email);
  assert.ok(login);
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(30000);
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/login'&&request.method()!=='GET')proof.operationalMutations++;});
  await page.goto(origin);await page.getByLabel('Nome de usuário',{exact:true}).fill(login);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await selectWorkspaceUnit(page,String(state.units.A));
  const navigate=name=>page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name,exact:true}).click();
  for(const [nav,button,title] of [['Produtos','Relatório de produtos','produtos'],['Recebimentos','Relatório de recebimentos','recebimentos'],['Saldo','Relatório de saldos','saldos']]){
    await navigate(nav);
    if(nav==='Produtos')await expect(page.getByRole('button',{name:'Novo produto',exact:true})).toBeDisabled();
    if(nav==='Recebimentos')await expect(page.getByRole('button',{name:'Novo recebimento',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog');
    await expect(dialog.getByRole('heading',{name:'Relatório de '+title,exact:true})).toBeVisible();await expect(dialog).toContainText('America/Sao_Paulo');
    if(nav==='Recebimentos')await expect(dialog).toContainText('Até 50 registros mais recentes');
    const count=await dialog.locator('tbody tr').count();assert.ok(count>0);
    const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Exportar relatório em CSV',exact:true}).click();
    const download=await pending,csv=await fs.readFile(await download.path(),'utf8');assert.equal(download.suggestedFilename(),title+'.csv');assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('America/Sao_Paulo'));assert.equal(csv.split('\r\n').filter(Boolean).length,count+1);
    for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),width);}
    if(nav==='Produtos')await page.screenshot({path:path.join(root,'rel001-produtos-1280.png'),fullPage:true});
    await page.emulateMedia({media:'print'});await expect(page.locator('#root')).toBeHidden();await expect(dialog.getByRole('button',{name:'Fechar relatório'})).toBeHidden();await expect(dialog.getByRole('heading')).toBeVisible();
    const pdf=await page.pdf({format:'A4',landscape:true});assert.ok(pdf.length>1000);
    await page.emulateMedia({media:'screen'});
    if(nav==='Saldo'){await page.setViewportSize({width:360,height:900});await page.screenshot({path:path.join(root,'rel001-saldos-360.png'),fullPage:true});}
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    proof.scenarios.push({name:nav,passed:true,rows:count,csv:true,printMedia:true,pdfGenerated:true,responsive:[360,768,1280]});
  }
  assert.equal(proof.operationalMutations,0);await page.getByRole('button',{name:'Sair',exact:true}).click();proof.completed=true;
}catch{throw Error('Hosted report journey failed; inspect private results and browser locally.');}
finally{if(browser)await browser.close();await fs.writeFile(path.join(root,'rel001-resultado.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify(proof,null,2));
