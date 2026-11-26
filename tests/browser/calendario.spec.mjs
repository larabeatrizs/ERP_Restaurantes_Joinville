import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const a='9007199254740993',b='9007199254740995';
const meal={tipo:'ALMOCO',inicio:'11:00',fim:'14:00',capacidade:null};
const config=(extra={})=>({unidade_id:a,revisao:'1',dias_semana:[1,2,3,4,5],atende_feriados:false,refeicoes:[{...meal}],excecoes:[],...extra});
async function setup(page,options={}){
 const state={calendar:options.calendar??null,writes:[],failure:0,queries:[]};
 const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'calendario@example.invalid'};
 await page.route('https://auth-ficticio.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/token')?{user,access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio',expires_in:3600,token_type:'bearer'}:user}));
 await page.route('**/api/**',async route=>{const r=route.request(),u=new URL(r.url());if(u.pathname==='/api/auth/login')return route.fulfill({json:{access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio'}});expect(r.headers().authorization).toMatch(/^Bearer /);
 if(u.pathname==='/api/me')return route.fulfill({json:{nome:'Pessoa sintética'}});
 if(u.pathname==='/api/unidades')return route.fulfill({json:{unidades:[{id:a,codigo:'TEST-A',nome:'Unidade sintética A'},{id:b,codigo:'TEST-B',nome:'Unidade sintética B'}]}});
 const unit=u.pathname.split('/')[3];if(u.pathname.includes('/calendario')){
  if(options.gate)await options.gate();
  if(u.pathname.endsWith('/funcionamento')){state.queries.push(u.search);return route.fulfill({json:{unidade:{id:unit},funcionamento:{data:u.searchParams.get('data'),revisao:state.calendar?.revisao??null,origem:'ESPECIAL',aberto:true,refeicoes:[{...meal,inicio:'18:00',fim:'20:00',capacidade:50}]}}});}
  if(r.method()==='PUT'){state.writes.push(r.postDataJSON());if(state.failure){const status=state.failure;state.failure=0;return route.fulfill({status,json:{error:{code:'TEST'}}});}const {motivo,revisao,...input}=r.postDataJSON();expect(motivo.length).toBeGreaterThan(2);state.calendar={...input,unidade_id:unit,revisao:String(BigInt(revisao??'0')+1n)};}
  return route.fulfill({json:{unidade:{id:unit,codigo:unit===a?'TEST-A':'TEST-B',nome:unit===a?'Unidade sintética A':'Unidade sintética B'},pode_editar:options.editable!==false,calendario:unit===a?state.calendar:null}});
 }
 if(u.pathname.endsWith('/produtos'))return route.fulfill({json:{produtos:[],total:0}});if(u.pathname.endsWith('/estoque/saldos'))return route.fulfill({json:{saldos:[]}});
 return route.fulfill({status:404,json:{error:{code:'TEST_UNKNOWN'}}});});
 await page.goto('/');await page.getByLabel('Nome de usuário',{exact:true}).fill('teste');await page.getByLabel('Senha',{exact:true}).fill('senha-ficticia');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByLabel('Unidade de acesso',{exact:true}).selectOption(a);await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Calendário e refeições',exact:true}).click();return state;
}
async function reviewSave(page,reason='Funcionamento sintético aprovado'){await page.getByRole('button',{name:'Revisar calendário',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Motivo da alteração *',{exact:true}).fill(reason);await d.getByRole('button',{name:'Salvar calendário',exact:true}).click();}
test('RF-009 mostra a grade da unidade e reusa o envio após resposta incerta', async ({ page }) => {
  await setup(page);
  const writes = [];
  await page.route('**/cardapios/rascunho**', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return writes.length === 1 ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({ status: 201, json: { cardapio_id: '34', versao_id: '56' } });
    }
    expect(url.searchParams.get('inicio')).toBe('2026-11-27');
    expect(url.searchParams.get('fim')).toBe('2026-11-28');
    const friday = { data: '2026-11-27', tipo_refeicao: 'ALMOCO' };
    const meals = url.pathname.includes(`/${a}/`) ? [friday]
      : [friday, { data: '2026-11-28', tipo_refeicao: 'JANTAR' }];
    return route.fulfill({ json: { refeicoes: meals } });
  });
  await page.getByRole('link', { name: 'Cardápios', exact: true }).click();
  const load = async () => {
    await page.getByLabel('Início', { exact: true }).fill('2026-11-27');
    await page.getByLabel('Fim', { exact: true }).fill('2026-11-28');
    await page.getByRole('button', { name: 'Consultar refeições' }).click();
  };
  await load();
  const lunch = page.getByRole('textbox', { name: 'Estimativa de Almoço em 27/11/2026' });
  await expect(lunch).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Jantar/ })).toHaveCount(0);
  await lunch.fill('200');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(lunch).toBeDisabled();
  await page.getByRole('button', { name: 'Reenviar rascunho' }).click();
  await expect(page.getByRole('status')).toContainText('Rascunho #34 criado.');
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0].refeicoes).toEqual([{ data: '2026-11-27', tipo_refeicao: 'ALMOCO', estimadas: 200 }]);
  await page.getByRole('combobox', { name: 'Unidade', exact: true }).selectOption(b);
  await load();
  await expect(page.getByRole('textbox', { name: 'Estimativa de Jantar em 28/11/2026' })).toBeVisible();
});

test('RF-009 pagina rascunhos salvos e mostra as estimativas da versão selecionada', async ({ page }) => {
  await setup(page);
  const period = { inicio: '2026-11-27', fim: '2026-11-28', tipo_periodo: 'SEMANAL' };
  const saved = { ...period, cardapio_id: '34', versao_id: '9007199254740999' };
  let revision = '1';
  let count = 200;
  const changes = [];
  const rows = Array.from({ length: 25 }, (_, i) => ({
    ...period, cardapio_id: String(100 - i), versao_id: String(9007199254741030n - BigInt(i)),
  }));
  const cursor = rows.at(-1).versao_id;
  await page.route('**/cardapios/rascunhos**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes(`/${b}/`)) return route.fulfill({ json: { rascunhos: [], proximo: null } });
    if (url.pathname.endsWith('/' + saved.versao_id)) {
      if (route.request().method() === 'PATCH') {
        const edit = route.request().postDataJSON();
        changes.push(edit);
        if (revision === '1') {
          revision = '2';
          count = 205;
          return route.fulfill({ status: 412, json: {} });
        }
        expect(edit.revisao).toBe(revision);
        revision = '3';
        count = edit.refeicoes[0].estimadas;
      }
      return route.fulfill({ json: { ...saved, revisao: revision,
        refeicoes: [{ data: period.inicio, tipo_refeicao: 'ALMOCO', estimadas: count }],
      } });
    }
    return route.fulfill({ json: url.searchParams.get('antes') === cursor
      ? { rascunhos: [saved], proximo: null } : { rascunhos: rows, proximo: cursor } });
  });
  await page.getByRole('link', { name: 'Cardápios', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar rascunhos salvos' }).click();
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await page.getByRole('button', { name: 'Abrir rascunho #34', exact: true }).click();
  const detail = page.getByRole('region', { name: 'Refeições do rascunho' });
  await expect(detail).toContainText('Almoço');
  await expect(detail).toContainText('200');
  await page.getByRole('button', { name: 'Editar estimativas' }).click();
  const estimate = page.getByRole('textbox', { name: 'Estimativa de Almoço em 27/11/2026' });
  await estimate.fill('210');
  await page.getByRole('button', { name: 'Salvar estimativas' }).click();
  await expect(page.getByRole('alert')).toContainText('Outra sessão alterou');
  await expect(estimate).toHaveValue('210');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Recarregar versão' }).click();
  await expect(detail).toContainText('205');
  await page.getByRole('button', { name: 'Editar estimativas' }).click();
  await estimate.fill('215');
  await page.getByRole('button', { name: 'Salvar estimativas' }).click();
  await expect(page.getByRole('status')).toContainText('Estimativas atualizadas.');
  await expect(detail).toContainText('215');
  expect(changes.map(change => [change.revisao, change.refeicoes[0].estimadas])).toEqual([['1', 210], ['2', 215]]);
  await page.getByRole('button', { name: 'Voltar aos rascunhos' }).click();
  await expect(page.getByRole('button', { name: 'Página anterior' })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Unidade', exact: true }).selectOption(b);
  await page.getByRole('button', { name: 'Consultar rascunhos salvos' }).click();
  await expect(page.getByText('Nenhum rascunho nesta página.')).toBeVisible();
});

test('calendário não configurado usa modelo explícito e salva revisão/motivo após prévia',async({page})=>{
 const state=await setup(page);await expect(page.getByText('Calendário ainda não configurado.',{exact:false})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Almoço',exact:true})).not.toBeChecked();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Usar modelo Adhemar Garcia',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Segunda-feira',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Domingo',exact:true})).not.toBeChecked();await expect(page.getByLabel('Capacidade — Almoço',{exact:true})).toHaveValue('');
 await reviewSave(page);await expect(page.getByText('Calendário salvo com sucesso.',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);expect(state.writes[0].revisao).toBeNull();expect(state.calendar.refeicoes[0].capacidade).toBeNull();await page.getByRole('button',{name:'Recarregar calendário',exact:true}).click();await expect(page.getByLabel('Início — Almoço',{exact:true})).toHaveValue('11:00');
});
test('calendário data especial substitui rotina e consulta passa pela API salva',async({page})=>{
 const state=await setup(page,{calendar:config()});await page.getByRole('button',{name:'Adicionar data especial',exact:true}).click();const e=page.getByRole('group',{name:'Edição da data especial',exact:true});await e.getByLabel('Data *',{exact:true}).fill('2026-11-15');await e.getByLabel('Descrição da data *',{exact:true}).fill('Domingo especial');await e.getByLabel('Funcionamento na data *',{exact:true}).selectOption('ESPECIAL');await e.getByRole('checkbox',{name:'Jantar',exact:true}).check();await e.getByLabel('Início — Jantar',{exact:true}).fill('18:00');await e.getByLabel('Fim — Jantar',{exact:true}).fill('20:00');await e.getByLabel('Capacidade — Jantar',{exact:true}).fill('50');await reviewSave(page);await expect(page.getByText('Calendário salvo com sucesso.',{exact:true})).toBeVisible();expect(state.writes[0].excecoes[0].refeicoes[0].capacidade).toBe(50);
 await page.getByLabel('Data da consulta',{exact:true}).fill('2026-11-15');await page.getByRole('button',{name:'Consultar funcionamento',exact:true}).click();await expect(page.getByText('Unidade com refeições nesta data.',{exact:true})).toBeVisible();expect(state.queries.at(-1)).toContain('data=2026-11-15');
});
test('calendário conflito preserva rascunho/motivo e permite cancelar navegação',async({page})=>{
 const state=await setup(page,{calendar:config()});await page.getByLabel('Capacidade — Almoço',{exact:true}).fill('75');state.failure=412;await reviewSave(page,'Motivo preservado');await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Outra pessoa alterou');await expect(page.getByLabel('Motivo da alteração *',{exact:true})).toHaveValue('Motivo preservado');await page.getByRole('button',{name:'Voltar à edição',exact:true}).click();await expect(page.getByLabel('Capacidade — Almoço',{exact:true})).toHaveValue('75');page.once('dialog',d=>d.dismiss());await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Produtos',exact:true}).click();await expect(page.getByRole('heading',{name:'Calendário e refeições',exact:true})).toBeVisible();expect(state.calendar.refeicoes[0].capacidade).toBeNull();
});
test('calendário leitor consulta/pagina/filtra/exporta datas salvas e muda de unidade sem mistura',async({page})=>{
 const dates=Array.from({length:13},(_,i)=>({data:`2027-01-${String(i+1).padStart(2,'0')}`,tipo:'FERIADO',descricao:i===0?'=Feriado especial':'Data '+i,refeicoes:[]}));await setup(page,{calendar:config({excecoes:dates}),editable:false});await expect(page.getByRole('button',{name:'Revisar calendário',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Adicionar data especial',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.getByText('13 datas · página 2',{exact:true})).toBeVisible();await page.getByLabel('Pesquisar datas',{exact:true}).fill('Feriado especial');await expect(page.getByText('1 datas · página 1',{exact:true})).toBeVisible();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar datas salvas em CSV',exact:true}).click();const csv=await readFile(await(await pending).path(),'utf8');expect(csv).toContain('"\'=Feriado especial"');expect(csv).toContain('Unidade sintética A');expect(csv).not.toContain('Data 12');await page.getByRole('combobox',{name:'Unidade',exact:true}).selectOption(b);await expect(page.getByText('Calendário ainda não configurado.',{exact:false})).toBeVisible();await expect(page.getByText('=Feriado especial',{exact:true})).toHaveCount(0);
});
test('calendário rejeita datas incompletas sem enviar PUT e respeita 360/768/1280',async({page})=>{
 const state=await setup(page,{calendar:config()});await page.getByRole('button',{name:'Adicionar data especial',exact:true}).click();await page.getByRole('button',{name:'Revisar calendário',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Revise dias únicos');expect(state.writes).toHaveLength(0);for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});expect(await page.locator('html').evaluate(el=>el.scrollWidth)).toBe(width);}
});
