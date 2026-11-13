import {test,expect} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'teste@example.invalid'};
const tokens={access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio'};
const row={id:'9007199254740993',revisao:'9007199254740995',razao_social:'Fornecedor teste',cnpj_cpf:'12ABC34501DE35',nome_fantasia:null,contato:null,telefone:null,email:null,endereco:null,observacoes:null,tipo_fornecedor:null,condicao_pagamento:null,prazo_entrega_dias:0,pedido_minimo:'0.000001',agricultura_familiar:false,canal_preferido:null,status:'ATIVO',pode_excluir:true};
async function setup(page,{editable=true,lifecycle=true,rows=[row]}={}) {
 const state={rows:rows.map(r=>({...r})),writes:[],failure:0,csv:[]};
 await page.route('https://auth-ficticio.supabase.co/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/token'))return route.fulfill({json:{...tokens,user,expires_in:3600,token_type:'bearer'}});
  return route.fulfill({json:url.pathname.endsWith('/user')?user:{}});
 });
 await page.route('**/api/**',route=>{
  const request=route.request(),url=new URL(request.url());const reply=json=>route.fulfill({json});
  if(url.pathname==='/api/auth/login')return reply(tokens);
  expect(request.headers().authorization).toMatch(/^Bearer /);
  if(url.pathname==='/api/me')return reply({nome:'Pessoa de teste'});
  if(url.pathname==='/api/unidades')return reply({unidades:[{id:'1',codigo:'RP1',nome:'Unidade A'}]});
  if(url.pathname.endsWith('/produtos'))return reply({produtos:[],total:0});
  if(url.pathname.endsWith('/estoque/saldos'))return reply({saldos:[]});
  if(url.pathname.endsWith('/estoque/contexto'))return reply({medidas:[],categorias:[],fornecedores:[],locais:[],capacidades:{produto_escrever:false,recebimento_escrever:false,divergencia_aprovar:false}});
  if(!url.pathname.includes('/fornecedores'))return route.fulfill({status:404,json:{error:{code:'UNEXPECTED'}}});
  if(url.pathname.endsWith('/exportar')){state.csv.push(url.search);return route.fulfill({contentType:'text/csv;charset=utf-8',body:'"Razão social";"CPF/CNPJ"\r\n"Fornecedor teste";"documento ilustrativo"\r\n'});}
  if(request.method()==='GET') {
   const filtered=state.rows.filter(r=>r.status===(url.searchParams.get('status')??'ATIVO')&&r.razao_social.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase())).sort((a,b)=>a.razao_social.localeCompare(b.razao_social));if(url.searchParams.get('ordem')==='desc')filtered.reverse();const offset=Number(url.searchParams.get('offset')??0);
   return reply({fornecedores:filtered.slice(offset,offset+50),total:filtered.length,capacidades:{editar:editable,ciclo_vida:lifecycle}});
  }
  const body=request.postDataJSON();state.writes.push({path:url.pathname,method:request.method(),body});
  if(state.failure){const status=state.failure;state.failure=0;return route.fulfill({status,json:{error:{code:'TEST',message:'Outra pessoa alterou este fornecedor. Sua edição foi preservada; reabra o registro.'}}});}
  const id=url.pathname.split('/')[5];
  if(request.method()==='DELETE'){state.rows=state.rows.filter(r=>r.id!==id);return reply({excluida:true});}
  if(url.pathname.endsWith('/status')){const current=state.rows.find(r=>r.id===id);Object.assign(current,{status:body.status,revisao:String(BigInt(current.revisao)+1n)});return reply({fornecedor:current});}
  const saved={...(state.rows.find(r=>r.id===id)??row),...body,cnpj_cpf:body.cnpj_cpf.toUpperCase().replace(/[\s./-]/g,''),id:id??'9007199254740999',revisao:id?String(BigInt(body.revisao)+1n):'1'};
  state.rows=state.rows.filter(r=>r.id!==saved.id);state.rows.push(saved);return reply({fornecedor:saved});
 });
 await page.goto('/');await page.getByLabel('Nome de usuário',{exact:true}).fill('teste');await page.getByLabel('Senha',{exact:true}).fill('abcdef1!');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByLabel('Unidade de acesso',{exact:true}).selectOption('1');await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
 await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Fornecedores',exact:true}).click();
 await expect(page.getByRole('button',{name:'Incluir fornecedor',exact:true})).toBeVisible();return state;
}
test('fornecedor cria alfanumérico, zero/precisão, edita null e visualiza dados sem gravar novamente',async({page})=>{
 const state=await setup(page,{rows:[]});await page.getByRole('button',{name:'Incluir fornecedor',exact:true}).click();
 await page.getByLabel('Razão social *',{exact:true}).fill('Fornecedor UI');await page.getByLabel('CPF/CNPJ *',{exact:true}).fill('12.abc.345/01de-35');await page.getByLabel('Agricultura familiar *',{exact:true}).selectOption('SIM');await page.getByLabel('Prazo de entrega (dias)',{exact:true}).fill('0');await page.getByLabel('Pedido mínimo',{exact:true}).fill('0,000001');
 await page.getByLabel('Canal preferido',{exact:true}).selectOption('WHATSAPP');await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click();
 await expect(page.getByText('Fornecedor salvo com sucesso.',{exact:true})).toBeVisible();expect(state.writes[0].body).toMatchObject({agricultura_familiar:true,prazo_entrega_dias:0,pedido_minimo:'0.000001',canal_preferido:'WHATSAPP'});expect(state.writes[0].body).not.toHaveProperty('status');
 await page.getByRole('button',{name:'Editar Fornecedor UI',exact:true}).click();await page.getByLabel('Pedido mínimo',{exact:true}).fill('');await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click();await expect(page.getByText('Fornecedor salvo com sucesso.',{exact:true})).toBeVisible();expect(state.writes.at(-1).body.pedido_minimo).toBeNull();
 await page.getByRole('button',{name:'Visualizar Fornecedor UI',exact:true}).click();await expect(page.getByLabel('Pedido mínimo',{exact:true})).toHaveValue('');await expect(page.getByLabel('Razão social *',{exact:true})).toBeDisabled();expect(state.writes).toHaveLength(2);
});
test('fornecedor inválido e revisão vencida preservam o rascunho e protegem navegação',async({page})=>{
 const state=await setup(page);await page.getByRole('button',{name:'Editar Fornecedor teste',exact:true}).click();await page.getByLabel('CPF/CNPJ *',{exact:true}).fill('12ABC34501DE36');await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click();await expect(page.getByText('Informe CPF ou CNPJ válido, numérico ou alfanumérico.',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
 await page.getByLabel('CPF/CNPJ *',{exact:true}).fill(row.cnpj_cpf);await page.getByLabel('Contato',{exact:true}).fill('Contato preservado');state.failure=412;await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Sua edição foi preservada');await expect(page.getByLabel('Contato',{exact:true})).toHaveValue('Contato preservado');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Início',exact:true}).click();await expect(page.getByRole('heading',{name:'Editar fornecedor',exact:true})).toBeVisible();
});
test('ciclo de vida confirma e exclusão vinculada é explicada; consulta não recebe I ou X',async({page})=>{
 const state=await setup(page);page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Inativar Fornecedor teste',exact:true}).click();expect(state.writes).toHaveLength(0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Inativar Fornecedor teste',exact:true}).click();await expect(page.getByText('Nenhum fornecedor encontrado.',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('INATIVO');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir Fornecedor teste',exact:true}).click();await expect(page.getByText('Nenhum fornecedor encontrado.',{exact:true})).toBeVisible();expect(state.writes.at(-1).method).toBe('DELETE');
});
test('consulta mostra agricultura não informada, respeita vínculos e cabe em 360/768/1280',async({page})=>{
 await setup(page,{editable:false,lifecycle:false,rows:[{...row,agricultura_familiar:null,pode_excluir:false}]});await expect(page.getByRole('button',{name:'Incluir fornecedor',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Editar Fornecedor teste',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Excluir Fornecedor teste',exact:true})).toBeDisabled();await expect(page.getByText('Possui vínculos; exclusão bloqueada.',{exact:true})).toBeVisible();
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await expect(page.locator('html')).toHaveJSProperty('scrollWidth',width);}
 await page.getByRole('button',{name:'Visualizar Fornecedor teste',exact:true}).click();await expect(page.getByLabel('Agricultura familiar *',{exact:true})).toHaveValue('');await expect(page.getByText('Agricultura familiar ainda não informada neste cadastro anterior.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Salvar fornecedor',exact:true})).toHaveCount(0);
});
test('exportação respeita busca/ordem e permite consulta sem escrita',async({page})=>{
 const state=await setup(page,{editable:false,lifecycle:false});await page.getByLabel('Buscar fornecedor',{exact:true}).fill('Fornecedor');await page.getByRole('combobox',{name:'Ordenação',exact:true}).selectOption('desc');await page.getByRole('button',{name:'Buscar',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();expect((await download).suggestedFilename()).toBe('fornecedores.csv');const params=new URLSearchParams(state.csv[0]);expect(params.get('q')).toBe('Fornecedor');expect(params.get('ordem')).toBe('desc');expect(params.get('offset')).toBe('0');expect(state.writes).toHaveLength(0);
});
