import { selectWorkspaceUnit } from './acessar-unidade.mjs';
// Opt-in: Playwright sem mocks/traces, com identidades sintéticas privadas.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const file=process.env.ERP_STAGING_TEST_STATE;
if(!file)throw Error('Defina ERP_STAGING_TEST_STATE fora do checkout.');
const state=JSON.parse(await fs.readFile(file,'utf8'));
if(state.projectRef!=='vpowsedoajpdbeckimuv')throw Error('Projeto inesperado');
const origin=new URL(process.env.ERP_STAGING_URL??process.env.ERP_LOCAL_WEB_URL??'http://127.0.0.1:5173');
const local=origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname);
const hosted=origin.protocol==='https:'&&/^erp-joinville-staging\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname);
if((!local&&!hosted)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('Somente View local ou Worker confirmado do staging');
const root=path.dirname(file);
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
const contexts=[];let completed=false;
async function enter(label,width){
 const account=state.users.find(user=>user.label===label);
 if(!account||!/^int003-.*@example\.invalid$/.test(account.email))throw Error('Conta não sintética');
 const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);
 const page=await context.newPage();await page.goto(origin.href);
 await page.getByLabel('Nome de usuário',{exact:true}).fill(label.toLowerCase());await page.getByLabel('Senha',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await selectWorkspaceUnit(page);
 await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Configurações',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Operação e custos'})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Unidade',exact:true}).locator('option')).toHaveCount(1);
 return page;
}
async function save(page,value,reason){
 await page.getByLabel('Margem (%)',{exact:true}).fill(value);
 await page.getByRole('button',{name:'Revisar alterações',exact:true}).click();
 await page.getByLabel('Motivo da alteração').fill(reason);
 await page.getByRole('button',{name:'Confirmar e salvar'}).click();
 await expect(page.getByRole('status')).toHaveText('Configurações salvas com sucesso.',{timeout:30000});
}
try {
 const editor=await enter('editorA',1280);const field=editor.getByLabel('Margem (%)',{exact:true});const baseline=await field.inputValue();
 try{
  await save(editor,'6,50','INT-003 validação visual real');
  await expect.poll(async()=>Number((await field.inputValue()).replace(',','.'))).toBe(6.5);
  await editor.evaluate(()=>document.fonts.ready);
  await editor.screenshot({path:path.join(root,'painel-real-1280.png'),fullPage:true});
 }finally{if(Number((await field.inputValue()).replace(',','.'))!==Number(baseline.replace(',','.')))await save(editor,baseline,'INT-003 retorno do parâmetro visual');}
 const reader=await enter('readerA',360);
 await expect(reader.getByLabel('Margem (%)',{exact:true})).toBeDisabled();
 await expect(reader.getByRole('button',{name:'Revisar alterações',exact:true})).toBeDisabled();
 await expect(reader.locator('html')).toHaveJSProperty('scrollWidth',360);
 await reader.evaluate(()=>document.fonts.ready);
 await reader.screenshot({path:path.join(root,'consulta-real-360.png'),fullPage:true});
 await editor.getByRole('button',{name:'Sair',exact:true}).click();await reader.getByRole('button',{name:'Sair',exact:true}).click();
 completed=true;console.log('PASS: View real autentica, consulta, revisa/salva e preserva consulta sem escrita; desktop/mobile verificados.');
}catch{
 console.error('FAIL: verificação visual live interrompida; nenhuma captura será publicada como aceite.');process.exitCode=1;
}finally{
 for(const context of contexts)await context.close();await browser.close();
 await fs.writeFile(path.join(root,'browser-result.json'),JSON.stringify({executedAt:new Date().toISOString(),origin:origin.origin,mocked:false,completed,scenarios:['login real','editor salva com revisão/motivo','retorno do valor via UI','leitor readonly','uma unidade por vínculo','layout desktop/mobile']},null,2));
}
