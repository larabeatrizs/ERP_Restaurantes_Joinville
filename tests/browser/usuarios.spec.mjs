import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'admin@example.invalid'};
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio',token_type:'bearer',expires_in:3600,user};
const units=[{id:'1',codigo:'RP1',nome:'Unidade A'},{id:'2',codigo:'RP2',nome:'Unidade B'}];
async function setup(page,{allowed=true,write=true,conflict=false,seed=[],failPage=false,editConflict=false,cycle=write,statusConflict=false}={}){
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}));
 const submissions=[],requests=[],reissues=[],edits=[],situations=[];const rows=structuredClone(seed);const revisions=new Map();
 await page.route('https://auth-ficticio.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/token')?session:user}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.pathname);
  if(url.pathname==='/api/auth/login')return route.fulfill({json:{access_token:session.access_token,refresh_token:session.refresh_token}});
  expect(req.headers().authorization).toMatch(/^Bearer /);
  if(url.pathname==='/api/me')return route.fulfill({json:{nome:'Administrador sintético',...(allowed?{administracao:true}:{})}});
  if(url.pathname==='/api/unidades')return route.fulfill({json:{unidades:units}});
  if(url.pathname.endsWith('/primeiro-acesso')){reissues.push(url.pathname);return route.fulfill({json:{criado:false,acesso:'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev/#definir-senha=token-reemitido-12345678901234567890'}});}
  const situation=/^\/api\/admin\/usuarios\/([a-f0-9-]{36})\/situacao$/.exec(url.pathname);
  if(situation){const selected=rows.find(row=>row.id===situation[1]);if(!selected)return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
   if(req.method()==='PATCH'){const value=req.postDataJSON();situations.push(value);if(statusConflict)return route.fulfill({status:412,json:{error:{code:'CONFLICT'}}});Object.assign(selected,{status:value.status});revisions.set(selected.id,String(Number(revisions.get(selected.id)??'1')+1));}
   return route.fulfill({json:{id:selected.id,nome:selected.nome,status:selected.status,primeiro_acesso:selected.primeiro_acesso,revisao:revisions.get(selected.id)??'1',proprio:selected.id===user.id,pode_alterar:cycle&&selected.id!==user.id&&!selected.primeiro_acesso&&selected.status!=='BLOQUEADO'}});
  }
  const edit=/^\/api\/admin\/usuarios\/([a-f0-9-]{36})$/.exec(url.pathname);
  if(edit){const selected=rows.find(row=>row.id===edit[1]);if(!selected)return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
   if(req.method()==='PATCH'){const value=req.postDataJSON();edits.push(value);if(editConflict)return route.fulfill({status:412,json:{error:{code:'CONFLICT'}}});if(!write)return route.fulfill({status:403,json:{error:{code:'DENIED'}}});Object.assign(selected,{nome:value.nome,perfil:value.perfil,unidades:value.unidades});revisions.set(selected.id,String(Number(revisions.get(selected.id)??'1')+1));}
   return route.fulfill({json:{id:selected.id,nome:selected.nome,perfil:selected.perfil,status:selected.status,primeiro_acesso:selected.primeiro_acesso,unidades:selected.unidades,revisao:revisions.get(selected.id)??'1',proprio:selected.id===user.id,pode_editar:write}});
  }
  if(url.pathname==='/api/admin/usuarios'){
   if(req.method()==='POST'){
    const data=req.postDataJSON();submissions.push(data);
    if(conflict)return route.fulfill({status:409,json:{error:{code:'CONFLICT'}}});
    rows.push({id:'00000000-0000-4000-8000-000000000090',nome:data.nome,login:data.login,email:data.email,perfil:data.perfil,status:'BLOQUEADO',primeiro_acesso:true,unidades:data.unidades});
    return route.fulfill({status:201,json:{criado:true,acesso:'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev/#definir-senha=token-fixture-12345678901234567890'}});
   }
   const offset=Number(url.searchParams.get('offset')??'0'),query=url.searchParams.get('q')??'';
   if(failPage&&offset>0)return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}});
   const filtered=rows.filter(row=>(row.nome+' '+row.login+' '+row.email).toLowerCase().includes(query.toLowerCase()));
   return route.fulfill({json:{usuarios:filtered.slice(offset,offset+25),total:filtered.length,pode_criar:write,unidades:units,perfis:['ADMIN','ESTOQUISTA','GESTOR_UNIDADE','NUTRICIONISTA','AUDITOR']}});
  }
  if(url.pathname.endsWith('/produtos'))return route.fulfill({json:{produtos:[],total:0}});
  if(url.pathname.endsWith('/estoque/saldos'))return route.fulfill({json:{saldos:[]}});
  return route.fulfill({status:404,json:{error:{code:'UNEXPECTED'}}});
 });
 await page.goto('http://127.0.0.1:4174/');await page.getByLabel('Nome de usuário',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill('Senha123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 if(allowed){await expect(page.getByRole('heading',{name:'Usuários',exact:true})).toBeVisible();}
 await expect(page.getByLabel('Unidade de acesso',{exact:true})).toHaveCount(0);
 expect(requests.includes('/api/unidades')).toBe(false);
 return {submissions,requests,reissues,edits,situations};
}
async function fill(page){await page.getByRole('button',{name:'Novo usuário',exact:true}).click();await page.getByLabel('Nome de login *',{exact:true}).fill(' NOVO.USUARIO ');await page.getByLabel('Nome de identificação *',{exact:true}).fill(' Pessoa sintética ');await page.getByLabel('Email *',{exact:true}).fill('NOVO@EXAMPLE.INVALID');await page.getByRole('checkbox',{name:'RP2 — Unidade B',exact:true}).check();await page.getByLabel('Motivo do cadastro *',{exact:true}).fill(' Cadastro sintético ');}
test('usuários: administrador inclui com filiais e recebe link protegido; tabela mostra primeiro acesso',async({page})=>{
 const state=await setup(page);await fill(page);
 await page.getByLabel('Perfil *',{exact:true}).selectOption('NUTRICIONISTA');await expect(page.getByLabel('Perfil *',{exact:true})).toHaveValue('NUTRICIONISTA');await page.getByLabel('Perfil *',{exact:true}).selectOption('ESTOQUISTA');
 for(const width of [360,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`formulario-${width}.png`),fullPage:true});}
 await page.getByRole('button',{name:'Incluir usuário',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Primeiro acesso',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Aguardando primeiro acesso',exact:true})).toBeVisible();
 expect(state.submissions).toEqual([{login:'novo.usuario',nome:'Pessoa sintética',email:'novo@example.invalid',perfil:'ESTOQUISTA',unidades:['2'],status:'ATIVO',revisao:null,motivo:'Cadastro sintético'}]);
 await expect(page.getByLabel('Link de primeiro acesso',{exact:true})).toHaveAttribute('type','password');
 await page.getByRole('button',{name:'Copiar link de primeiro acesso',exact:true}).click();await expect(page.getByRole('status')).toContainText('Link copiado.');
 for(const width of [360,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`usuarios-${width}.png`),fullPage:true});}
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Reemitir primeiro acesso para Pessoa sintética',exact:true}).click();await expect(page.getByLabel('Link de primeiro acesso',{exact:true})).toHaveValue(/token-reemitido/);expect(state.reissues).toHaveLength(1);
});
test('usuários: conflito preserva formulário e permissão somente de consulta não oferece inclusão',async({page})=>{
 await setup(page,{conflict:true});await fill(page);await page.getByRole('button',{name:'Incluir usuário',exact:true}).click();await expect(page.getByRole('alert')).toContainText('já cadastrado');await expect(page.getByLabel('Nome de identificação *',{exact:true})).toHaveValue(' Pessoa sintética ');
});
test('usuários: consulta sem escrita e conta comum respeitam a navegação disponível',async({page})=>{
 await setup(page,{write:false});await expect(page.getByRole('button',{name:'Novo usuário',exact:true})).toHaveCount(0);await expect(page.getByText('Nenhum usuário encontrado.',{exact:true})).toBeVisible();
});
test('usuários: conta sem capacidade não recebe menu nem solicita listagem administrativa',async({page})=>{
 const state=await setup(page,{allowed:false});await expect(page.getByRole('heading',{name:'Acesso restrito',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Usuários',exact:true})).toHaveCount(0);expect(state.requests.includes('/api/admin/usuarios')).toBe(false);
});

test('configurador: sair protege campos não salvos e unidades não são marcadas implicitamente',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Novo usuário',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'RP1 — Unidade A',exact:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'RP2 — Unidade B',exact:true})).not.toBeChecked();
 await page.getByLabel('Nome de login *',{exact:true}).fill('rascunho');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByLabel('Nome de login *',{exact:true})).toHaveValue('rascunho');
 await page.getByRole('link',{name:'Ir para o conteúdo',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('#conteudo')).toBeFocused();
});

test('ERP: administrador continua escolhendo unidade e não recebe navegação para o Configurador',async({page})=>{
 const state=await setup(page);state.requests.length=0;
 await page.goto('http://127.0.0.1:4173/');await page.getByLabel('Nome de usuário',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill('Senha123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByLabel('Unidade de acesso',{exact:true})).toBeEnabled();await page.getByLabel('Unidade de acesso',{exact:true}).selectOption('1');await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Usuários',exact:true})).toHaveCount(0);await expect(page.locator('a[href*="configurador"]')).toHaveCount(0);expect(state.requests.includes('/api/admin/usuarios')).toBe(false);
});

const reportRows=()=>Array.from({length:27},(_,n)=>({id:`00000000-0000-4000-8000-${String(n+10).padStart(12,'0')}`,nome:`Pessoa ${n+1}`,login:`pessoa.${n+1}`,email:`pessoa-${n+1}@example.invalid`,perfil:'ESTOQUISTA',status:'ATIVO',primeiro_acesso:false,unidades:['2']}));
test('usuários CSV: consulta exporta todas as páginas da pesquisa aplicada e mantém o rascunho da busca',async({page})=>{
 const seed=[...reportRows(),{...reportRows()[0],id:'00000000-0000-4000-8000-000000000099',nome:'Outro cadastro',login:'outro',email:'outro@example.invalid'}];
 await setup(page,{write:false,seed});await page.getByLabel('Pesquisar usuários',{exact:true}).fill('pessoa');const filtered=page.waitForResponse(response=>response.url().includes('q=pessoa')&&response.status()===200);await page.getByRole('button',{name:'Pesquisar',exact:true}).click();await filtered;await expect(page.getByText('27 usuário(s) · página 1',{exact:true})).toBeVisible();
 await page.getByLabel('Pesquisar usuários',{exact:true}).fill('pesquisa ainda não aplicada');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('usuarios.csv');const csv=await readFile(await file.path(),'utf8');expect(csv).toContain('pessoa.27');expect(csv).not.toContain('Outro cadastro');expect(csv).toContain('RP2 — Unidade B');expect(csv).toContain('"pessoa"');expect(csv).not.toContain('pesquisa ainda não aplicada');await expect(page.getByLabel('Pesquisar usuários',{exact:true})).toHaveValue('pesquisa ainda não aplicada');
 await expect(page.getByRole('status')).toContainText('CSV gerado com 27');await expect(page.getByRole('button',{name:'Novo usuário',exact:true})).toHaveCount(0);
});
test('usuários CSV: falha da página seguinte não baixa arquivo parcial e libera a interface',async({page})=>{
 await setup(page,{seed:reportRows(),failPage:true});const downloads=[];page.on('download',file=>downloads.push(file));await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Nenhum arquivo parcial');expect(downloads).toHaveLength(0);await expect(page.getByRole('button',{name:'Exportar CSV',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeEnabled();
});

test('usuários edição: salva nome/perfil/filiais com revisão e motivo, sem campos de identidade',async({page})=>{
 const state=await setup(page,{seed:[reportRows()[0]]});await page.getByRole('button',{name:'Abrir cadastro de Pessoa 1',exact:true}).click();await expect(page.getByLabel('Nome de identificação *',{exact:true})).toHaveValue('Pessoa 1');await page.getByLabel('Nome de identificação *',{exact:true}).fill('Nome corrigido');await page.getByLabel('Perfil *',{exact:true}).selectOption('NUTRICIONISTA');await page.getByRole('checkbox',{name:'RP2 — Unidade B',exact:true}).uncheck();await page.getByRole('checkbox',{name:'RP1 — Unidade A',exact:true}).check();await page.getByLabel('Motivo da alteração *',{exact:true}).fill('Correção aprovada');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Cadastro atualizado'})).toBeVisible();expect(state.edits).toEqual([{nome:'Nome corrigido',perfil:'NUTRICIONISTA',unidades:['1'],revisao:'1',motivo:'Correção aprovada'}]);await expect(page.getByRole('cell',{name:'Nome corrigido',exact:true})).toBeVisible();
});
test('usuários edição: conflito mantém campos e recarga exige confirmação de descarte',async({page})=>{
 await setup(page,{seed:[reportRows()[0]],editConflict:true});await page.getByRole('button',{name:'Abrir cadastro de Pessoa 1',exact:true}).click();await page.getByLabel('Nome de identificação *',{exact:true}).fill('Rascunho mantido');await page.getByLabel('Motivo da alteração *',{exact:true}).fill('Correção de nome');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(page.getByRole('alert')).toContainText('campos foram preservados');await expect(page.getByLabel('Nome de identificação *',{exact:true})).toHaveValue('Rascunho mantido');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click();await expect(page.getByLabel('Nome de identificação *',{exact:true})).toHaveValue('Rascunho mantido');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Recarregar cadastro',exact:true}).click();await expect(page.getByLabel('Nome de identificação *',{exact:true})).toHaveValue('Pessoa 1');
});
test('usuários edição: consultor visualiza sem salvar',async({page})=>{
 await setup(page,{seed:[reportRows()[0]],write:false});await page.getByRole('button',{name:'Abrir cadastro de Pessoa 1',exact:true}).click();await expect(page.getByLabel('Nome de identificação *',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Salvar alterações',exact:true})).toHaveCount(0);
});
test('usuários edição: próprio ADMIN corrige nome mantendo perfil e vínculos protegidos',async({page})=>{
 const state=await setup(page,{seed:[{...reportRows()[0],id:user.id,perfil:'ADMIN'}]});await page.getByRole('button',{name:'Abrir cadastro de Pessoa 1',exact:true}).click();await expect(page.getByLabel('Perfil *',{exact:true})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'RP2 — Unidade B',exact:true})).toBeDisabled();await page.getByLabel('Nome de identificação *',{exact:true}).fill('Nome próprio');await page.getByLabel('Motivo da alteração *',{exact:true}).fill('Corrigir identificação');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Cadastro atualizado'})).toBeVisible();expect(state.edits[0].perfil).toBe('ADMIN');expect(state.edits[0].unidades).toEqual(['2']);
});

test('usuários situação: confirma inativação/reativação com revisão e motivo sem editar outros campos',async({page})=>{
 const state=await setup(page,{seed:[reportRows()[0]]});await page.getByRole('button',{name:'Situação de Pessoa 1',exact:true}).click();await expect(page.getByLabel('Motivo da alteração de situação *',{exact:true})).toBeFocused();await page.getByLabel('Motivo da alteração de situação *',{exact:true}).fill('Inativação solicitada');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Inativar usuário',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Situação atualizada'})).toBeVisible();await expect(page.getByRole('cell',{name:'Inativo',exact:true})).toBeVisible();await page.getByRole('button',{name:'Situação de Pessoa 1',exact:true}).click();await page.getByLabel('Motivo da alteração de situação *',{exact:true}).fill('Reativação solicitada');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Reativar usuário',exact:true}).click();await expect(page.getByRole('cell',{name:'Ativo',exact:true})).toBeVisible();expect(state.situations).toEqual([{status:'INATIVO',revisao:'1',motivo:'Inativação solicitada'},{status:'ATIVO',revisao:'2',motivo:'Reativação solicitada'}]);
});
test('usuários situação: conflito mantém motivo e fechamento exige descarte confirmado',async({page})=>{
 await setup(page,{seed:[reportRows()[0]],statusConflict:true});await page.getByRole('button',{name:'Situação de Pessoa 1',exact:true}).click();await page.getByLabel('Motivo da alteração de situação *',{exact:true}).fill('Motivo preservado');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Inativar usuário',exact:true}).click();await expect(page.getByRole('alert')).toContainText('motivo foi preservado');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Fechar situação',exact:true}).click();await expect(page.getByLabel('Motivo da alteração de situação *',{exact:true})).toHaveValue('Motivo preservado');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Recarregar situação',exact:true}).click();await expect(page.getByLabel('Motivo da alteração de situação *',{exact:true})).toHaveValue('');
});
test('usuários situação: edição I sem X mantém somente consulta',async({page})=>{
 await setup(page,{seed:[reportRows()[0]],cycle:false});await page.getByRole('button',{name:'Situação de Pessoa 1',exact:true}).click();await expect(page.getByText('Seu acesso permite apenas consultar esta situação.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Inativar usuário',exact:true})).toHaveCount(0);
});
for(const variant of['proprio','pendente','bloqueado'])test(`usuários situação: ${variant} não oferece liberação indevida`,async({page})=>{
 const seed={...reportRows()[0],...(variant==='proprio'?{id:user.id,perfil:'ADMIN'}:{status:'BLOQUEADO',primeiro_acesso:variant==='pendente'})};await setup(page,{seed:[seed]});await page.getByRole('button',{name:'Situação de Pessoa 1',exact:true}).click();await expect(page.getByText(variant==='proprio'?'Outro administrador deve alterar a situação da sua conta.':'Primeiro acesso e desbloqueio exigem um fluxo próprio. Esta ação não libera uma conta pendente ou bloqueada.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^(Inativar|Reativar) usuário$/})).toHaveCount(0);
});
