import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

// Dublês de transporte: não comprovam entrega de email, Auth nem RLS hospedados.
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'teste@example.invalid' };
const session = { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio', refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, user };
const balance = { produto_id:'11', produto:'Arroz', unidade_medida:'kg', lote_id:'12', lote:'ARROZ-A', validade:'2030-12-31', camara_id:'13', local:'Câmara fria', quantidade:'7.000001', valor_unitario:'2.123456' };
async function setup(page, { failIndicators=false, recoveryFails=false } = {}) {
  const requests=[], recoveries=[];
  await page.route('https://auth-ficticio.supabase.co/**', route => {
    const request=route.request(), url=new URL(request.url());
    if(url.pathname.endsWith('/recover')) {
      recoveries.push({ body:request.postDataJSON(), redirect:url.searchParams.get('redirect_to') });
      return route.fulfill(recoveryFails?{status:429,json:{msg:'Limit'}}:{json:{}});
    }
    if(url.pathname.endsWith('/token')) return route.fulfill({json:session});
    if(url.pathname.endsWith('/user')) return route.fulfill({json:user});
    return route.fulfill({json:{}});
  });
  await page.route('**/api/**', route => {
    const request=route.request(), url=new URL(request.url());
    if(url.pathname==='/api/auth/login') return route.fulfill({json:{access_token:session.access_token,refresh_token:session.refresh_token}});
    requests.push(url.pathname);
    expect(request.headers().authorization).toMatch(/^Bearer /);
    if(url.pathname==='/api/me') return route.fulfill({json:{nome:'Pessoa de teste'}});
    if(url.pathname==='/api/unidades') return route.fulfill({json:{unidades:[{id:'1',codigo:'RP1',nome:'Unidade A'},{id:'2',codigo:'RP2',nome:'Unidade B'}]}});
    if(failIndicators) return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}});
    const unit=url.pathname.split('/')[3];
    if(url.pathname.endsWith('/produtos')) return route.fulfill({json:{produtos:[],total:unit==='1'?3:9}});
    if(url.pathname.endsWith('/estoque/saldos')) return route.fulfill({json:{saldos:unit==='1'?[balance,{...balance,produto_id:'21',produto:'Feijão',lote_id:'22',lote:'FEIJAO-A'}]:[]}});
    if(url.pathname.endsWith('/estoque/contexto')) return route.fulfill({json:{medidas:[],categorias:[],fornecedores:[],locais:[],capacidades:{produto_escrever:false,recebimento_escrever:false,divergencia_aprovar:false}}});
    return route.fulfill({status:404,json:{error:{code:'UNEXPECTED'}}});
  });
  await page.goto('/');
  return { requests, recoveries };
}
async function login(page) {
  await page.getByLabel('Nome de usuário',{exact:true}).fill('teste');
  await page.getByLabel('Senha',{exact:true}).fill('abcdef1!');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Selecionar unidade',exact:true})).toBeVisible();
}
async function enter(page) {
  await page.getByLabel('Unidade de acesso',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();
}
test('exige escolha da unidade antes de dados operacionais e mostra nome e indicadores reais',async({page})=>{
  const state=await setup(page); await login(page);
  await expect(page.getByRole('button',{name:'Acessar unidade',exact:true})).toBeDisabled();
  await expect(page.getByText('Olá, Pessoa de teste.',{exact:true})).toBeVisible();
  expect(state.requests.every(path=>['/api/me','/api/unidades'].includes(path))).toBe(true);
  await enter(page);
  await expect(page.locator('.unit-caption')).toContainText('Pessoa de teste');
  await expect(page.locator('.unit-caption')).toContainText('Unidade A');
  await expect(page.locator('.home-metrics article').filter({has:page.getByRole('heading',{name:'Produtos ativos',exact:true})}).locator('strong')).toHaveText('3');
  for (const width of [360,768,1280]) {
    await page.setViewportSize({width,height:900});
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth',width);
    await page.screenshot({path:`test-results/inicio-${width}.png`,fullPage:true});
  }
  await page.getByRole('combobox',{name:'Unidade',exact:true}).selectOption('2');
  await expect(page.locator('.unit-caption')).toContainText('Unidade B');
  await expect(page.locator('.home-metrics article').filter({has:page.getByRole('heading',{name:'Produtos ativos',exact:true})}).locator('strong')).toHaveText('9');
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await login(page);
  await expect(page.getByLabel('Unidade de acesso',{exact:true})).toHaveValue('');
});
test('indicador indisponível não vira zero fictício',async({page})=>{
  await setup(page,{failIndicators:true}); await login(page); await enter(page);
  await expect(page.getByRole('alert')).toContainText('Alguns indicadores não estão disponíveis');
  await expect(page.locator('.home-metrics strong')).toHaveText(['—','—','—']);
});
test('pesquisa saldos e exporta somente o resultado da unidade selecionada',async({page})=>{
  await setup(page); await login(page); await enter(page);
  await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Saldo',exact:true}).click();
  await page.getByLabel('Pesquisar saldos',{exact:true}).fill('arroz');
  await expect(page.getByRole('row')).toHaveCount(2);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar saldos em CSV',exact:true}).click();
  const download=await downloadPromise; const csv=await fs.readFile(await download.path(),'utf8');
  expect(csv).toContain('Unidade A'); expect(csv).toContain('7,000001'); expect(csv).toContain('2,123456'); expect(csv).not.toContain('Feijão');
  await page.getByRole('combobox',{name:'Unidade',exact:true}).selectOption('2');
  await expect(page.getByText('Nenhum saldo registrado nesta unidade.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Pesquisar saldos',{exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:'Exportar saldos em CSV',exact:true})).toBeDisabled();
});
test('mostrar senha conserva valor e recuperação tem resposta neutra e retorno correto',async({page})=>{
  const state=await setup(page);
  const password=page.getByLabel('Senha',{exact:true}); await password.fill('abcdef1!');
  await page.getByRole('button',{name:'Mostrar senha',exact:true}).click(); await expect(password).toHaveAttribute('type','text'); await expect(password).toHaveValue('abcdef1!');
  await page.getByRole('button',{name:'Ocultar senha',exact:true}).click(); await expect(password).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'Esqueci minha senha',exact:true}).click();
  await page.getByLabel('E-mail de recuperação',{exact:true}).fill('desconhecido@example.invalid');
  await page.getByRole('button',{name:'Enviar link de recuperação',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Se houver uma conta apta');
  expect(state.recoveries).toHaveLength(1);
  expect(state.recoveries[0]).toMatchObject({body:{email:'desconhecido@example.invalid'},redirect:'http://127.0.0.1:4173'});
});
test('meu acesso solicita reset apenas para o email da sessão atual',async({page})=>{
  const state=await setup(page); await login(page); await enter(page);
  await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Meu acesso',exact:true}).click();
  await page.getByRole('button',{name:'Enviar link para trocar senha',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Solicitação recebida');
  expect(state.recoveries).toHaveLength(1); expect(state.recoveries[0].body.email).toBe(user.email);
});
test('limite do provedor mantém a recuperação aberta e não informa existência da conta',async({page})=>{
  await setup(page,{recoveryFails:true});
  await page.getByRole('button',{name:'Esqueci minha senha',exact:true}).click();
  await page.getByLabel('E-mail de recuperação',{exact:true}).fill(user.email);
  await page.getByRole('button',{name:'Enviar link de recuperação',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Não foi possível solicitar o link agora. Aguarde e tente novamente.');
  await expect(page.getByRole('button',{name:'Enviar link de recuperação',exact:true})).toBeEnabled();
});
