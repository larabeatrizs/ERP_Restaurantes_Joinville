// Opt-in somente leitura; usa contas sintéticas existentes. Não envia emails nem troca senhas.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

const origin=process.env.ERP_STAGING_URL;
if(origin!=='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev')throw Error('Confirmed hosted staging required');
const repository=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const file=await fs.realpath(process.env.ERP_STOCK_TEST_STATE ?? '');
const relative=path.relative(repository,file);
if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw Error('Private state must be outside checkout');
const state=JSON.parse(await fs.readFile(file,'utf8'));
if(state.projectRef!=='vpowsedoajpdbeckimuv'||state.url!=='https://vpowsedoajpdbeckimuv.supabase.co'||!state.publishableKey?.startsWith('sb_publishable_'))throw Error('Unexpected project');
const root=path.dirname(file), contexts=[],clients=[],proof={executedAt:new Date().toISOString(),origin,mocked:false,completed:false,phase:'auth',scenarios:[]};
let browser;
try {
  const sessions={};
  for(const label of ['readerA','editorB']) {
    const account=state.users.find(user=>user.label===label);
    if(!account||!/^int003-.*@example\.invalid$/.test(account.email))throw Error('Synthetic account required');
    const client=createClient(state.url,state.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}}); clients.push(client);
    const {data,error}=await client.auth.signInWithPassword({email:account.email,password:account.password});
    if(error||!data.session)throw Error('Synthetic authentication failed');
    sessions[label]={account,token:data.session.access_token};
  }
  async function api(label,route,status=200) {
    const response=await fetch(origin+route,{headers:label?{Authorization:'Bearer '+sessions[label].token}:{},signal:AbortSignal.timeout(30000)});
    if(response.status!==status) { proof.failure={kind:'http_status',route:route.replace(/\d+/g,':id'),expected:status,actual:response.status}; }
    assert.equal(response.status,status);
    return response.json();
  }
  proof.phase='api';
  await api(null,'/api/me',401);
  const identities={};
  for(const label of ['readerA','editorB']) {
    identities[label]=await api(label,'/api/me');
    assert.deepEqual(Object.keys(identities[label]),['nome']); assert.ok(identities[label].nome);
    const expected=String(state.units[label==='readerA'?'A':'B']);
    const units=await api(label,'/api/unidades'); assert.equal(units.unidades.length,1); assert.equal(units.unidades[0].id,expected);
  }
  const baseline=await api('readerA',`/api/unidades/${state.units.A}/estoque/saldos`);
  await api('readerA',`/api/unidades/${state.units.B}/estoque/saldos`,404);
  proof.scenarios.push('identificação autenticada retorna somente nome; ausência de sessão negada','duas contas sintéticas veem apenas sua unidade; saldo de outra unidade negado');
  proof.phase='browser'; browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
  for(const [label,width] of [['readerA',360],['editorB',1280]]) {
    const context=await browser.newContext({viewport:{width,height:900}}); contexts.push(context);
    const page=await context.newPage(); page.setDefaultTimeout(30000);
    const operational=[];
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/unidades/'))operational.push(request.url());});
    await page.goto(origin);
    await page.getByLabel('Nome de usuário',{exact:true}).fill(label.toLowerCase());
    await page.getByLabel('Senha',{exact:true}).fill(sessions[label].account.password);
    await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();
    await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','text');
    await page.getByRole('button',{name:'Ocultar senha',exact:true}).click();
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Selecionar unidade',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Acessar unidade',exact:true})).toBeDisabled();
    const selector=page.getByLabel('Unidade de acesso',{exact:true});
    await expect(selector.locator('option')).toHaveCount(2); // Placeholder + único vínculo.
    assert.equal(operational.length,0);
    const selected=String(state.units[label==='readerA'?'A':'B']); await selector.selectOption(selected);
    await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();
    await expect(page.getByRole('combobox',{name:'Unidade',exact:true})).toHaveValue(selected);
    await expect(page.locator('.unit-caption')).toContainText(identities[label].nome);
    await expect(page.locator('.unit-caption')).not.toContainText('Consultando unidade');
    await expect(page.locator('.home-metrics')).toBeVisible();
    await expect(page.getByText('Consultando indicadores…',{exact:true})).toHaveCount(0);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth',width);
    await page.screenshot({path:path.join(root,`ux003-inicio-${width}.png`),fullPage:true});
    if(label==='readerA') {
      await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Saldo',exact:true}).click();
      await expect(page.getByLabel('Pesquisar saldos',{exact:true})).toBeVisible();
      await expect(page.getByText('Consultando saldos…',{exact:true})).toHaveCount(0);
      if(!baseline.saldos.length)throw Error('Balance fixture missing');
      const term=baseline.saldos[0].produto;
      await page.getByLabel('Pesquisar saldos',{exact:true}).fill(term);
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:'Exportar saldos em CSV',exact:true}).click();
      const download=await downloadPromise, csv=await fs.readFile(await download.path(),'utf8');
      assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes(term)); assert.ok(csv.includes(baseline.saldos[0].quantidade.replace('.',',')));
      await page.screenshot({path:path.join(root,'ux003-saldos-360.png'),fullPage:true});
      await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Meu acesso',exact:true}).click();
      await expect(page.getByRole('button',{name:'Enviar link para trocar senha',exact:true})).toBeVisible();
    }
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible();
  }
  proof.scenarios.push('UI real exige escolha antes de dados operacionais; mostra nome e Início em 360/1280','mostrar/ocultar senha; saldos pesquisáveis e CSV real; Meu acesso disponível sem envio de email');
  // Sair na UI encerra globalmente as sessões da conta; obter nova sessão para conferir persistência.
  const fresh=await clients[0].auth.signInWithPassword({email:sessions.readerA.account.email,password:sessions.readerA.account.password});
  if(fresh.error||!fresh.data.session)throw Error('Fresh synthetic session failed');
  sessions.readerA.token=fresh.data.session.access_token;
  assert.deepEqual(await api('readerA',`/api/unidades/${state.units.A}/estoque/saldos`),baseline);
  proof.scenarios.push('saldos anteriores preservados; nenhuma senha, permissão ou link pessoal alterado');
  proof.completed=true;proof.phase='completed';console.log('PASS: acesso por unidade e consultas reais, sem escrita no estoque.');
} catch(error) {if(!proof.failure)proof.failure={kind:error.code==='ERR_ASSERTION'?'assertion':error.name};console.error('FAIL: jornada UX-003 interrompida; fase registrada privadamente, sem credenciais no log.');process.exitCode=1;}
finally {
  for(const context of contexts)await context.close(); if(browser)await browser.close();
  for(const client of clients)await client.auth.signOut({scope:'local'});
  await fs.writeFile(path.join(root,'ux003-resultado.json'),JSON.stringify(proof,null,2));
}
