import { test,expect } from '@playwright/test';
const actor='10000000-0000-4000-8000-000000000001';
const row=(unit='1')=>({id:'1',unidade_id:unit,produto_id:'2',quantidade:'5.000000',solicitante_id:'10000000-0000-4000-8000-000000000002',retirado_por:'Pessoa sintética',data_movimento:'2026-11-17',modo_snapshot:'POSTERIOR',configuracao_revisao:'1',estado:'REGISTRADA',revisao:'1',conferido_por:null,motivo:'',itens:[{id:'1',lote_id:'3',camara_id:'4',quantidade:'5.000000'}]});
async function setup(page,options={}){
 const state={writes:[],rows:options.rows??[],fail:options.fail??false};
 await page.route('https://auth-ficticio.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/token')?{access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio',token_type:'bearer',expires_in:3600,user:{id:actor,aud:'authenticated',role:'authenticated'}}:{id:actor,aud:'authenticated',role:'authenticated'}}));
 await page.route('**/api/**',route=>{
  const req=route.request(),u=new URL(req.url()),unit=u.pathname.split('/')[3];
  const ok=json=>route.fulfill({json});
  if(u.pathname==='/api/auth/login')return ok({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio'});
  if(u.pathname==='/api/me')return ok({nome:'Pessoa de teste'});
  if(u.pathname==='/api/unidades')return ok({unidades:[{id:'1',codigo:options.unitCode??'RP1',nome:'Unidade A'},{id:'2',codigo:'RP2',nome:'Unidade B'}]});
  if(u.pathname.endsWith('/requisicoes')){
   if(req.method()==='GET')return ok({unidade_id:unit,usuario_id:actor,pode_registrar:options.write!==false,pode_conferir:options.review===true,modo_saida:unit==='2'?'PREVIA':'POSTERIOR',produtos:[{id:'2',descricao:'Arroz',unidade:'KG'}],requisicoes:unit==='1'?state.rows:[]});
   const body=req.postDataJSON();state.writes.push(body);if(state.fail){state.fail=false;return route.fulfill({status:503,json:{error:{code:'TEMP'}}});}const r={...row(unit),solicitante_id:actor};state.rows=[r];return ok({requisicao:r});
  }
  if(u.pathname.endsWith('/conferencia')){state.writes.push(req.postDataJSON());state.rows=[{...row(),estado:'CONTESTADA',revisao:'2',conferido_por:actor,motivo:req.postDataJSON().motivo}];return ok({requisicao:state.rows[0]});}
  if(u.pathname.endsWith('/produtos'))return ok({produtos:[],total:0});if(u.pathname.endsWith('/estoque/saldos'))return ok({saldos:[]});
  return route.fulfill({status:403,json:{error:{code:'DENIED'}}});
 });
 await page.goto('/');await page.getByLabel('Nome de usuário',{exact:true}).fill('teste');await page.getByLabel('Senha',{exact:true}).fill('Abcdef1!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByLabel('Unidade de acesso',{exact:true}).selectOption('1');await page.getByRole('button',{name:'Acessar unidade'}).click();await page.getByRole('link',{name:'Requisições rápidas',exact:true}).click();await expect(page.getByRole('heading',{name:'Requisições rápidas',exact:true})).toBeVisible();
 page.on('dialog',dialog=>dialog.accept());return state;
}
test('retirada confirma baixa e repete a mesma chave após resposta incerta, sem depender de contexto do estoque',async({page})=>{
 const state=await setup(page,{fail:true});await page.getByRole('combobox',{name:'Produto',exact:true}).selectOption('2');await page.getByLabel('Quantidade',{exact:true}).fill('5');await page.getByLabel('Quem retirou',{exact:true}).fill('Pessoa sintética');await page.getByRole('button',{name:'Registrar retirada',exact:true}).click();
 await expect(page.getByRole('button',{name:'Repetir envio com segurança'})).toBeVisible();await expect(page.getByLabel('Quem retirou',{exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Unidade',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Repetir envio com segurança'}).click();await expect(page.getByText('Retirada registrada. O estoque foi atualizado uma única vez.')).toBeVisible();expect(state.writes).toHaveLength(2);expect(state.writes[0]).toEqual(state.writes[1]);await expect(page.getByRole('cell',{name:'A conferir',exact:true})).toBeVisible();
});
test('conferente contesta com motivo e leitor não recebe ações; unidade mantém registros separados',async({page})=>{
 const state=await setup(page,{write:false,review:true,rows:[row()]});await expect(page.getByRole('heading',{name:'Registrar retirada'})).toHaveCount(0);await page.getByRole('button',{name:'Conferir #1'}).click();await page.getByRole('button',{name:'Contestar retirada',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Informe o motivo');await page.getByLabel('Motivo / observação').fill('Quantidade a revisar');await page.getByRole('button',{name:'Contestar retirada',exact:true}).click();await expect(page.getByRole('cell').filter({hasText:'Contestada'})).toBeVisible();expect(state.writes[0].estado).toBe('CONTESTADA');await page.getByRole('combobox',{name:'Unidade',exact:true}).selectOption('2');await expect(page.getByText('Nenhuma retirada registrada.')).toBeVisible();
});
test('leitura e layout de celular preservam navegação e não oferecem auto conferência',async({page})=>{
 await page.setViewportSize({width:360,height:800});await setup(page,{write:false,review:true,rows:[{...row(),solicitante_id:actor}]});await expect(page.getByRole('button',{name:'Conferir #1'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Retiradas recentes'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.git/est002-mobile.png',fullPage:true});
});

test('RF-015 aprova e rejeita perdas de Bucarein, com atualização da fila', async ({ page }) => {
  await setup(page, { unitCode: 'RP-BUCAREIN' });
  const loss = {
    id: '11', produto: 'Arroz', lote: 'L1', local: 'Almoxarifado', unidade_medida: 'KG',
    data_registro: '2026-11-24', motivo: 'Validade vencida', justificativa: '',
    quantidade: '5.000000', valor_prejuizo: '40.000000000000',
  };
  let rows = [loss, { ...loss, id: '12', lote: 'L2' }];
  const decisions = [];
  await page.route('**/api/unidades/*/estoque/perdas**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      expect(path).toBe('/api/unidades/1/estoque/perdas');
      return route.fulfill({ json: { unidade_id: '1', perdas: rows } });
    }
    const id = path.split('/').at(-2);
    const { estado } = request.postDataJSON();
    decisions.push({ id, estado });
    rows = rows.filter(row => row.id !== id);
    return route.fulfill({ json: { id, estado } });
  });
  await page.getByRole('link', { name: 'Perdas', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'R$ 40,00' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Aprovar perda 11' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'baixa foi registrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Rejeitar perda 12' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'saldo foi preservado' })).toBeVisible();
  await expect(page.getByText('Nenhuma perda disponível para sua revisão.')).toBeVisible();
  expect(decisions).toEqual([{ id: '11', estado: 'APROVADA' }, { id: '12', estado: 'REJEITADA' }]);
  await page.getByRole('combobox', { name: 'Unidade', exact: true }).selectOption('2');
  await expect(page.getByText('A revisão de perdas está disponível para Bucarein.')).toBeVisible();
});
