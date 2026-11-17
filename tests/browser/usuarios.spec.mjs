import { test, expect } from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'admin@example.invalid'};
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio',token_type:'bearer',expires_in:3600,user};
const units=[{id:'1',codigo:'RP1',nome:'Unidade A'},{id:'2',codigo:'RP2',nome:'Unidade B'}];
async function setup(page,{allowed=true,write=true,conflict=false}={}){
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}));
 const submissions=[],requests=[],reissues=[];const rows=[];
 await page.route('https://auth-ficticio.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/token')?session:user}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.pathname);
  if(url.pathname==='/api/auth/login')return route.fulfill({json:{access_token:session.access_token,refresh_token:session.refresh_token}});
  expect(req.headers().authorization).toMatch(/^Bearer /);
  if(url.pathname==='/api/me')return route.fulfill({json:{nome:'Administrador sintético',...(allowed?{administracao:true}:{})}});
  if(url.pathname==='/api/unidades')return route.fulfill({json:{unidades:units}});
  if(url.pathname.endsWith('/primeiro-acesso')){reissues.push(url.pathname);return route.fulfill({json:{criado:false,acesso:'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev/#definir-senha=token-reemitido-12345678901234567890'}});}
  if(url.pathname==='/api/admin/usuarios'){
   if(req.method()==='POST'){
    const data=req.postDataJSON();submissions.push(data);
    if(conflict)return route.fulfill({status:409,json:{error:{code:'CONFLICT'}}});
    rows.push({id:'00000000-0000-4000-8000-000000000090',nome:data.nome,login:data.login,email:data.email,perfil:data.perfil,status:'BLOQUEADO',primeiro_acesso:true,unidades:data.unidades});
    return route.fulfill({status:201,json:{criado:true,acesso:'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev/#definir-senha=token-fixture-12345678901234567890'}});
   }
   return route.fulfill({json:{usuarios:rows,total:rows.length,pode_criar:write,unidades:units,perfis:['ADMIN','ESTOQUISTA','GESTOR_UNIDADE','NUTRICIONISTA','AUDITOR']}});
  }
  if(url.pathname.endsWith('/produtos'))return route.fulfill({json:{produtos:[],total:0}});
  if(url.pathname.endsWith('/estoque/saldos'))return route.fulfill({json:{saldos:[]}});
  return route.fulfill({status:404,json:{error:{code:'UNEXPECTED'}}});
 });
 await page.goto('/');await page.getByLabel('Nome de usuário',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill('Senha123!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByLabel('Unidade de acesso',{exact:true})).toBeEnabled();await page.getByLabel('Unidade de acesso',{exact:true}).selectOption('1');await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
 if(allowed){await page.getByRole('link',{name:'Usuários',exact:true}).click();await expect(page.getByRole('heading',{name:'Usuários',exact:true})).toBeVisible();}
 return {submissions,requests,reissues};
}
async function fill(page){await page.getByRole('button',{name:'Novo usuário',exact:true}).click();await page.getByLabel('Nome de login *',{exact:true}).fill(' NOVO.USUARIO ');await page.getByLabel('Nome de identificação *',{exact:true}).fill(' Pessoa sintética ');await page.getByLabel('Email *',{exact:true}).fill('NOVO@EXAMPLE.INVALID');await page.getByRole('checkbox',{name:'RP2 — Unidade B',exact:true}).check();await page.getByLabel('Motivo do cadastro *',{exact:true}).fill(' Cadastro sintético ');}
test('usuários: administrador inclui com filiais e recebe link protegido; tabela mostra primeiro acesso',async({page})=>{
 const state=await setup(page);await fill(page);
 for(const width of [360,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`formulario-${width}.png`),fullPage:true});}
 await page.getByRole('button',{name:'Incluir usuário',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Primeiro acesso',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Aguardando primeiro acesso',exact:true})).toBeVisible();
 expect(state.submissions).toEqual([{login:'novo.usuario',nome:'Pessoa sintética',email:'novo@example.invalid',perfil:'ESTOQUISTA',unidades:['1','2'],status:'ATIVO',revisao:null,motivo:'Cadastro sintético'}]);
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
 const state=await setup(page,{allowed:false});await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Usuários',exact:true})).toHaveCount(0);expect(state.requests.includes('/api/admin/usuarios')).toBe(false);
});
