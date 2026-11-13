import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Transport doubles exercise UI state/DTOs. They do not prove hosted Auth, RLS or database atomicity.
const unit = '9007199254740993';
const otherUnit = '9007199254740995';
const productId = '9007199254741001';
const product = {
  id: productId, revisao: '9007199254741003', descricao: 'Arroz branco', complemento: '', unidade_medida_id: '11', categoria_id: '12',
  perecivel: true, armazenamento: 'SECO', fator_correcao: '1', apresentacao_compra: 'Pacote de 5 kg', quantidade_apresentacao: '5',
  estoque_minimo: '2.5', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO', unidade_sigla: 'kg', categoria_descricao: 'Grãos e secos',
};
const measureRow = {id:'51',revisao:'1',sigla:'G',descricao:'Grama teste',grandeza:'MASSA',fator_base:'0.001',status:'ATIVO',pode_excluir:true};
const categoryRow = {id:'12',revisao:'1',descricao:'Categoria teste',tipo_item:'ALIMENTO',armazenamento_padrao:'SECO',dias_alerta_validade:null,status:'ATIVO',pode_excluir:true};
const context = {
  medidas: [{ id: '11', sigla: 'kg', descricao: 'Quilograma' }],
  categorias: [{ id: '12', descricao: 'Grãos e secos', armazenamento_padrao: 'SECO' }],
  fornecedores: [{ id: '13', razao_social: 'Fornecedor de demonstração' }],
  locais: [{ id: '14', nome: 'Almoxarifado seco', tipo: 'SECO' }],
  capacidades: { produto_escrever: true, recebimento_escrever: true, divergencia_aprovar: false },
};
function receipt(extra = {}) {
  return {
    id: '9007199254741021', unidade_id: unit, fornecedor_id: '13', fornecedor: 'Fornecedor de demonstração', numero_nf: 'NF-DEMO-20',
    data_entrada: '2026-11-09', total_nota: '80', total_itens: '80', observacoes: '', estado: 'RASCUNHO', divergencia_aprovada: false,
    itens: [{ id: '9007199254741023', produto_id: productId, produto: 'Arroz branco', unidade_medida: 'kg', quantidade: '20', valor_unitario: '4', numero_lote: 'ARROZ-20', validade: '2030-12-31', camara_id: '14', local: 'Almoxarifado seco', temperatura: null, aspecto_embalagem: 'Íntegra', conformidade: 'CONFORME', motivo: '' }], ...extra,
  };
}
async function setup(page, options = {}) {
  const state = { measures: options.measures ?? [{...measureRow}], measureFailure: 0, measureCsv: [], categories: options.categories ?? [{...categoryRow}], categoryFailure: 0, categoryCsv: [], products: options.products ?? [{ ...product }], available: [{ ...product }], receipts: options.receipts ?? [], balances: options.balances ?? [], writes: [], confirmKeys: [], confirmFailures: options.confirmFailures ?? [], productFailure: 0 };
  await page.route('https://auth-ficticio.supabase.co/**', route => {
    if (route.request().url().includes('/token')) return route.fulfill({ json: {
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio', refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600,
      user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'teste@example.invalid' },
    } });
    if(route.request().url().endsWith('/user')) return route.fulfill({json:{id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'teste@example.invalid'}});
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/**', route => {
    const request = route.request(); const url = new URL(request.url());
    if(url.pathname==='/api/auth/login') return route.fulfill({json:{access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio'}});
    expect(request.headers().authorization).toMatch(/^Bearer /);
    const respond = json => route.fulfill({ json });
    if (url.pathname === '/api/me') return respond({nome:'Pessoa de teste'});
    if (url.pathname === '/api/unidades') return respond({ unidades: [{ id: unit, codigo: 'DEMO-A', nome: 'Unidade de demonstração' }, { id: otherUnit, codigo: 'DEMO-B', nome: 'Outra unidade' }] });
    const activeUnit = url.pathname.split('/')[3];
    if (url.pathname.endsWith('/configuracoes')) return route.fulfill({ headers: { ETag: `"cfg-${activeUnit}-1"` }, json: { pode_editar: true, configuracao: { unidade_id: activeUnit, revisao: '1', modo_saida: 'POSTERIOR', margem_percentual: '5', dias_alerta_validade: 7, prazo_amostra_horas: 72, periodicidade_inventario_dias: 7, referencia_preco: 'MENOR_COTACAO', alerta_email_habilitado: false } } });
    if (url.pathname.endsWith('/estoque/contexto')) return respond({ ...context, capacidades: { ...context.capacidades, ...options.capabilities } });
    if (url.pathname.includes('/medidas')) {
      const caps=options.measureCaps??{editar:true,ciclo_vida:true};
      const filtered=state.measures.filter(c=>c.status===(url.searchParams.get('status')??'ATIVO')&&c.descricao.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase())).sort((a,b)=>a.descricao.localeCompare(b.descricao));
      if(url.searchParams.get('ordem')==='desc')filtered.reverse();
      if(url.pathname.endsWith('/exportar')){state.measureCsv.push(url.search);return route.fulfill({contentType:'text/csv; charset=utf-8',body:'"Descricao";"Fator-base"\r\n"Grama teste";"0,001"\r\n'});}
      if(request.method()==='GET'){const offset=Number(url.searchParams.get('offset')??0);return respond({medidas:filtered.slice(offset,offset+50),total:filtered.length,capacidades:caps});}
      const body=request.postDataJSON();state.writes.push({path:url.pathname,method:request.method(),body});
      if(state.measureFailure){const status=state.measureFailure;state.measureFailure=0;return route.fulfill({status,json:{error:{code:'TEST',message:'Outra pessoa alterou esta medida. Sua edicao foi preservada.'}}});}
      const id=url.pathname.split('/')[5];
      if(request.method()==='DELETE'){state.measures=state.measures.filter(c=>c.id!==id);return respond({excluida:true});}
      if(url.pathname.endsWith('/status')){const c=state.measures.find(c=>c.id===id);Object.assign(c,{status:body.status,revisao:String(BigInt(c.revisao)+1n)});return respond({medida:c});}
      const saved={...(state.measures.find(c=>c.id===id)??measureRow),...body,id:id??'33',revisao:id?String(BigInt(body.revisao)+1n):'1'};
      state.measures=state.measures.filter(c=>c.id!==saved.id);state.measures.push(saved);return respond({medida:saved});
    }
    if (url.pathname.includes('/categorias')) {
      const caps=options.categoryCaps??{editar:true,ciclo_vida:true};
      const filtered=state.categories.filter(c=>c.status===(url.searchParams.get('status')??'ATIVO')&&c.descricao.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase())).sort((a,b)=>a.descricao.localeCompare(b.descricao));
      if(url.searchParams.get('ordem')==='desc')filtered.reverse();
      if(url.pathname.endsWith('/exportar')){state.categoryCsv.push(url.search);return route.fulfill({contentType:'text/csv; charset=utf-8',body:'"Descricao";"Dias"\r\n"Categoria teste";"0"\r\n'});}
      if(request.method()==='GET'){const offset=Number(url.searchParams.get('offset')??0);return respond({categorias:filtered.slice(offset,offset+50),total:filtered.length,capacidades:caps});}
      const body=request.postDataJSON();state.writes.push({path:url.pathname,method:request.method(),body});
      if(state.categoryFailure){const status=state.categoryFailure;state.categoryFailure=0;return route.fulfill({status,json:{error:{code:'TEST',message:'Outra pessoa alterou esta categoria. Sua edicao foi preservada.'}}});}
      const id=url.pathname.split('/')[5];
      if(request.method()==='DELETE'){state.categories=state.categories.filter(c=>c.id!==id);return respond({excluida:true});}
      if(url.pathname.endsWith('/status')){const c=state.categories.find(c=>c.id===id);Object.assign(c,{status:body.status,revisao:String(BigInt(c.revisao)+1n)});return respond({categoria:c});}
      const saved={...(state.categories.find(c=>c.id===id)??categoryRow),...body,id:id??'33',revisao:id?String(BigInt(body.revisao)+1n):'1'};
      state.categories=state.categories.filter(c=>c.id!==saved.id);state.categories.push(saved);return respond({categoria:saved});
    }
    if (url.pathname.endsWith('/estoque/saldos')) return respond({ saldos: activeUnit === unit ? state.balances : [] });
    if (url.pathname.endsWith('/produtos/disponiveis')) {
      const filtered=state.available.filter(p=>p.descricao.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase()));
      const offset=Number(url.searchParams.get('offset')??0);return respond({produtos:filtered.slice(offset,offset+50),total:filtered.length});
    }
    if (url.pathname.endsWith('/vinculo')) {
      const body=request.postDataJSON();state.writes.push({path:url.pathname,method:request.method(),body});
      if(state.productFailure){const status=state.productFailure;state.productFailure=0;return route.fulfill({status,json:{error:{code:'TEST'}}});}
      const saved={...product,...body};state.products=[saved];state.available=[];return respond({produto:saved});
    }
    if (url.pathname.endsWith('/produtos') && request.method() === 'GET') {
      const filtered = state.products.filter(item => item.status === url.searchParams.get('status') && item.descricao.toLowerCase().includes((url.searchParams.get('q') ?? '').toLowerCase()));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return respond({ produtos: filtered.slice(offset, offset + 50), total: filtered.length });
    }
    if (url.pathname.includes('/produtos') && request.method() !== 'GET') {
      const body = request.postDataJSON(); state.writes.push({ path: url.pathname, method: request.method(), body });
      if (state.productFailure) { const status = state.productFailure; state.productFailure = 0; return route.fulfill({ status, json: { error: { code: 'TEST' } } }); }
      const saved = { ...body, id: productId, revisao: request.method() === 'PATCH' ? String(BigInt(body.revisao) + 1n) : '1', unidade_sigla: 'kg', categoria_descricao: 'Grãos e secos' };
      state.products = [saved]; return respond({ produto: saved });
    }
    if (url.pathname.endsWith('/entradas') && request.method() === 'GET') return respond({ entradas: activeUnit === unit ? state.receipts : [] });
    if (url.pathname.endsWith('/entradas') && request.method() === 'POST') {
      const body = request.postDataJSON(); state.writes.push({ path: url.pathname, method: request.method(), body });
      const saved = receipt({ ...body, itens: body.itens.map((item, index) => ({ ...item, id: String(40 + index), produto: 'Arroz branco', unidade_medida: 'kg', local: 'Almoxarifado seco' })) });
      state.receipts = [saved]; return respond({ entrada: saved });
    }
    if (url.pathname.endsWith('/confirmar')) {
      state.confirmKeys.push(request.postDataJSON().chave);
      if (state.confirmFailures.length) return route.fulfill({ status: state.confirmFailures.shift(), json: { error: { code: 'TEST' } } });
      const saved = { ...state.receipts[0], estado: 'CONFIRMADA' }; state.receipts = [saved];
      state.balances = [{ produto_id: productId, produto: 'Arroz branco', unidade_medida: 'kg', lote_id: '50', lote: 'ARROZ-20', validade: '2030-12-31', camara_id: '14', local: 'Almoxarifado seco', quantidade: '20', valor_unitario: '4' }];
      return respond({ entrada: saved });
    }
    if (url.pathname.endsWith('/aprovar-divergencia')) {
      state.writes.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
      const saved = { ...state.receipts[0], divergencia_aprovada: true }; state.receipts = [saved]; return respond({ entrada: saved });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'UNEXPECTED_TEST_ROUTE' } } });
  });
  await page.goto('/');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('teste');
  await page.getByLabel('Senha', { exact: true }).fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Unidade de acesso',{exact:true}).selectOption(unit);
  await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();
  return state;
}
async function navigate(page, name) { await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name, exact: true }).click(); }
test('relatório de produtos exporta todas as páginas do filtro e mantém precisão para leitor', async ({page}) => {
  const products=Array.from({length:51},(_,i)=>({...product,id:String(200+i),descricao:i===50?'=Arroz especial':'Arroz '+String(i).padStart(2,'0'),estoque_minimo:'900000000001.123456'}));
  const state=await setup(page,{products,capabilities:{produto_escrever:false}}); await navigate(page,'Produtos');
  await page.getByLabel('Buscar produto',{exact:true}).fill('Arroz'); await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.getByText('1 a 50 de 51 produtos',{exact:true})).toBeVisible();
  // An unsubmitted search must not silently change the applied filter.
  await page.getByLabel('Buscar produto',{exact:true}).fill('Não aplicado');
  await page.getByRole('button',{name:'Relatório de produtos',exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog.getByText('51 linhas.',{exact:false})).toBeVisible();
  await expect(dialog.getByText('=Arroz especial',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Unidade: Unidade de demonstração',{exact:true})).toBeVisible();
  const pending=page.waitForEvent('download'); await dialog.getByRole('button',{name:'Exportar relatório em CSV',exact:true}).click();
  const download=await pending; expect(download.suggestedFilename()).toBe('produtos.csv'); const csv=await readFile(await download.path(),'utf8');
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(52); expect(csv).toContain('900000000001,123456'); expect(csv).toContain('"\'=Arroz especial"'); expect(csv).toContain('Busca: Arroz'); expect(csv).not.toContain('Não aplicado');
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900}); expect(await page.locator('html').evaluate(el=>el.scrollWidth)).toBe(width); if(width===360){const table=dialog.getByLabel('Dados do relatório',{exact:true});expect(await table.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);}}
  await page.emulateMedia({media:'print'}); await expect(page.locator('#root')).toBeHidden(); await expect(dialog.getByRole('button',{name:'Fechar relatório'})).toBeHidden(); await expect(dialog.getByRole('heading')).toBeVisible();
  await page.emulateMedia({media:'screen'}); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
test('relatório não oferece CSV parcial quando falha a segunda página ou ultrapassa o limite', async ({page}) => {
  await setup(page,{products:Array.from({length:51},(_,i)=>({...product,id:String(200+i),descricao:'Arroz '+i}))}); await navigate(page,'Produtos');
  await expect(page.getByText('1 a 50 de 51 produtos',{exact:true})).toBeVisible();
  let mode='failure'; await page.route('**/produtos?**',route=>{const offset=Number(new URL(route.request().url()).searchParams.get('offset')); if(mode==='limit')return route.fulfill({json:{produtos:[product],total:10001}}); if(offset===50)return route.fulfill({status:503,json:{error:{code:'TEST'}}}); return route.fallback();});
  await page.getByRole('button',{name:'Relatório de produtos',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('Não foi possível'); await expect(page.getByRole('dialog')).toHaveCount(0);
  mode='limit'; await page.getByRole('button',{name:'Relatório de produtos',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('10.000'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('relatório recusa paginação que mudou durante a geração e libera navegação após erro', async ({page}) => {
  await setup(page,{products:Array.from({length:51},(_,i)=>({...product,id:String(200+i),descricao:'Arroz '+i}))}); await navigate(page,'Produtos'); await expect(page.getByText('1 a 50 de 51 produtos',{exact:true})).toBeVisible();
  await page.route('**/produtos?**',route=>Number(new URL(route.request().url()).searchParams.get('offset'))===50?route.fulfill({json:{produtos:[{...product,id:'200'}],total:51}}):route.fallback());
  await page.getByRole('button',{name:'Relatório de produtos',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('consulta mudou'); await expect(page.getByRole('dialog')).toHaveCount(0); await navigate(page,'Início'); await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();
});
test('relatório de recebimentos identifica teto, rascunho e conformidade sem efetuar escrita', async ({page}) => {
  const state=await setup(page,{receipts:[receipt()],capabilities:{produto_escrever:false,recebimento_escrever:false}}); await navigate(page,'Recebimentos');
  await page.getByRole('button',{name:'Relatório de recebimentos',exact:true}).click(); const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('Até 50 registros mais recentes'); await expect(dialog).toContainText('não representa o histórico completo'); await expect(dialog.getByRole('cell',{name:'RASCUNHO',exact:true})).toBeVisible();
  const pending=page.waitForEvent('download'); await dialog.getByRole('button',{name:'Exportar relatório em CSV'}).click(); const csv=await readFile(await(await pending).path(),'utf8'); expect(csv).toContain('NF-DEMO-20');expect(csv).toContain('CONFORME');expect(csv).toContain('Unidade de demonstração');expect(state.writes).toHaveLength(0);
});
test('relatório de saldos respeita pesquisa e troca de unidade sem misturar posições', async ({page}) => {
  const balance={produto_id:productId,produto:'Arroz branco',unidade_medida:'kg',lote_id:'20',lote:'L-TESTE',validade:null,camara_id:'14',local:'Seco',quantidade:'7.000001',valor_unitario:'4.123456'};
  const state=await setup(page,{balances:[balance,{...balance,lote_id:'21',produto:'Feijão',lote:'OUTRO'}]}); await navigate(page,'Saldo');
  await page.getByLabel('Pesquisar saldos',{exact:true}).fill('arroz'); await page.getByRole('button',{name:'Relatório de saldos',exact:true}).click(); const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('1 posições'); await expect(dialog).not.toContainText('Feijão'); const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Exportar relatório em CSV'}).click();const csv=await readFile(await(await pending).path(),'utf8');expect(csv).toContain('7,000001');expect(csv).not.toContain('Feijão');
  await page.keyboard.press('Escape');await page.getByRole('combobox',{name:'Unidade',exact:true}).selectOption(otherUnit);await expect(page.getByText('Nenhum saldo registrado nesta unidade.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Relatório de saldos',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Unidade: Outra unidade');await expect(page.getByRole('dialog')).not.toContainText('Arroz branco');expect(state.writes).toHaveLength(0);
});
test('medidas cadastra fator exato em português e reabre null sem alterar precisão',async({page})=>{
 const state=await setup(page);await navigate(page,'Unidades de medida');await page.getByRole('button',{name:'Incluir medida',exact:true}).click();await page.getByLabel('Descrição *',{exact:true}).fill('Miligrama teste');await page.getByLabel('Sigla *',{exact:true}).fill('MG');await page.getByLabel('Fator-base',{exact:true}).fill('0,000001');await page.getByRole('button',{name:'Salvar medida',exact:true}).click();await expect(page.getByText('Medida salva com sucesso.',{exact:true})).toBeVisible();expect(state.writes.at(-1).body.fator_base).toBe('0.000001');expect(state.writes.at(-1).body).not.toHaveProperty('status');
 await page.getByRole('button',{name:'Editar Miligrama teste',exact:true}).click();await page.getByLabel('Fator-base',{exact:true}).fill('');await page.getByRole('button',{name:'Salvar medida',exact:true}).click();await page.getByRole('button',{name:'Visualizar Miligrama teste',exact:true}).click();await expect(page.getByLabel('Fator-base',{exact:true})).toHaveValue('');await expect(page.getByLabel('Sigla *',{exact:true})).toBeDisabled();expect(state.writes.at(-1).body.fator_base).toBeNull();
});
test('medidas valida zero/precisão e preserva rascunho após 412 e navegação cancelada',async({page})=>{
 const state=await setup(page);await navigate(page,'Unidades de medida');await page.getByRole('button',{name:'Editar Grama teste',exact:true}).click();await page.getByLabel('Fator-base',{exact:true}).fill('0');await page.getByRole('button',{name:'Salvar medida',exact:true}).click();await expect(page.getByLabel('Fator-base',{exact:true})).toHaveAttribute('aria-invalid','true');expect(state.writes).toHaveLength(0);
 await page.getByLabel('Fator-base',{exact:true}).fill('0,123456');state.measureFailure=412;await page.getByRole('button',{name:'Salvar medida',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Outra pessoa');await expect(page.getByLabel('Fator-base',{exact:true})).toHaveValue('0,123456');page.once('dialog',d=>d.dismiss());await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Produtos',exact:true}).click();await expect(page.getByLabel('Fator-base',{exact:true})).toHaveValue('0,123456');
});
test('medidas ciclo de vida confirma e consulta não recebe poderes de edição/X',async({page})=>{
 const state=await setup(page);await navigate(page,'Unidades de medida');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Inativar Grama teste',exact:true}).click();expect(state.writes).toHaveLength(0);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Inativar Grama teste',exact:true}).click();await expect(page.getByText('Nenhuma medida encontrada.',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('INATIVO');await expect(page.getByRole('button',{name:'Ativar Grama teste',exact:true})).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir Grama teste',exact:true}).click();await expect(page.getByText('Nenhuma medida encontrada.',{exact:true})).toBeVisible();
});
test('medidas pagina/exporta filtros e cabe em 360/768/1280 com vínculos protegidos',async({page})=>{
 const measures=Array.from({length:51},(_,i)=>({...measureRow,id:String(100+i),descricao:'Medida '+String(i).padStart(2,'0'),pode_excluir:false}));const state=await setup(page,{measures,measureCaps:{editar:false,ciclo_vida:false}});await navigate(page,'Unidades de medida');await expect(page.getByRole('button',{name:'Incluir medida',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Excluir Medida 00',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Editar Medida 00',exact:true})).toBeDisabled();
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});expect(await page.locator('html').evaluate(el=>el.scrollWidth)).toBe(width);}
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.getByRole('button',{name:'Visualizar Medida 50',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Ordenação',exact:true}).selectOption('desc');await page.getByLabel('Buscar medida',{exact:true}).fill('Medida 50');await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect(page.getByText('1 medidas · página 1',{exact:true})).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();expect((await download).suggestedFilename()).toBe('medidas.csv');expect(state.measureCsv.at(-1)).toContain('offset=0');expect(state.measureCsv.at(-1)).toContain('q=Medida+50');expect(state.writes).toHaveLength(0);
});
test('categorias cadastra zero, edita null e reabre consulta sem escrita implícita', async ({page}) => {
 const state=await setup(page);await navigate(page,'Categorias');await page.getByRole('button',{name:'Incluir categoria',exact:true}).click();
 await page.getByLabel('Descrição *',{exact:true}).fill('Categoria nova');await page.getByLabel('Dias de alerta de validade',{exact:true}).fill('0');await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();
 await expect(page.getByText('Categoria salva com sucesso.',{exact:true})).toBeVisible();expect(state.writes.at(-1).body.dias_alerta_validade).toBe(0);expect(state.writes.at(-1).body).not.toHaveProperty('status');
 await page.getByRole('button',{name:'Editar Categoria nova',exact:true}).click();await page.getByLabel('Dias de alerta de validade',{exact:true}).fill('');await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();
 await page.getByRole('button',{name:'Visualizar Categoria nova',exact:true}).click();await expect(page.getByLabel('Descrição *',{exact:true})).toBeDisabled();await expect(page.getByLabel('Dias de alerta de validade',{exact:true})).toHaveValue('');expect(state.writes.at(-1).body.dias_alerta_validade).toBeNull();
});
test('categorias ciclo de vida confirma e exclusão com vínculos é explicada', async ({page}) => {
 const state=await setup(page);await navigate(page,'Categorias');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Inativar Categoria teste',exact:true}).click();expect(state.writes).toHaveLength(0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Inativar Categoria teste',exact:true}).click();await expect(page.getByText('Nenhuma categoria encontrada.',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('INATIVO');await expect(page.getByRole('button',{name:'Ativar Categoria teste',exact:true})).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Ativar Categoria teste',exact:true}).click();await expect(page.getByText('Nenhuma categoria encontrada.',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('ATIVO');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir Categoria teste',exact:true}).click();await expect(page.getByText('Nenhuma categoria encontrada.',{exact:true})).toBeVisible();expect(state.writes.at(-1).method).toBe('DELETE');
});
test('categorias erro preserva entrada e descarte pode ser cancelado', async ({page}) => {
 const state=await setup(page);await navigate(page,'Categorias');await page.getByRole('button',{name:'Editar Categoria teste',exact:true}).click();
 await page.getByLabel('Dias de alerta de validade',{exact:true}).fill('-1');await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();await expect(page.getByLabel('Dias de alerta de validade',{exact:true})).toHaveAttribute('aria-invalid','true');expect(state.writes).toHaveLength(0);
 await page.getByLabel('Dias de alerta de validade',{exact:true}).fill('3');await page.getByLabel('Descrição *',{exact:true}).fill('Edição preservada');state.categoryFailure=412;await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Outra pessoa');await expect(page.getByLabel('Descrição *',{exact:true})).toHaveValue('Edição preservada');
 page.once('dialog',d=>d.dismiss());await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Produtos',exact:true}).click();await expect(page.getByLabel('Descrição *',{exact:true})).toHaveValue('Edição preservada');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Voltar à lista',exact:true}).click();await expect(page.getByRole('heading',{name:'Categorias de produtos',exact:true}).last()).toBeVisible();
});
test('categorias pagina/ordena/exporta filtros e respeita somente consulta em 360/768/1280', async ({page}) => {
 const categories=Array.from({length:51},(_,i)=>({...categoryRow,id:String(i+100),descricao:'Categoria '+String(i).padStart(2,'0'),pode_excluir:false}));
 const state=await setup(page,{categories,categoryCaps:{editar:false,ciclo_vida:false}});await navigate(page,'Categorias');
 await expect(page.getByRole('button',{name:'Incluir categoria',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Excluir Categoria 00',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Excluir Categoria 00',exact:true})).toHaveAttribute('title',/vínculos/);
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});expect(await page.locator('html').evaluate(el=>el.scrollWidth)).toBe(width);await expect(page.getByRole('region',{name:'Categorias de produtos',exact:true})).toBeVisible();}
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.getByRole('button',{name:'Visualizar Categoria 50',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Ordenação',exact:true}).selectOption('desc');await expect(page.getByRole('button',{name:'Visualizar Categoria 50',exact:true})).toBeVisible();
 await page.getByLabel('Buscar categoria',{exact:true}).fill('Categoria 50');await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect(page.getByText('1 categorias · página 1',{exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();expect((await download).suggestedFilename()).toBe('categorias.csv');expect(state.categoryCsv.at(-1)).toContain('q=Categoria+50');expect(state.categoryCsv.at(-1)).toContain('offset=0');expect(state.writes).toHaveLength(0);
});
async function expectReadableScroller(page, label, minimumWidth = 840) {
  const wrapper = page.locator(`.table-wrap[aria-label="${label}"]`);
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toHaveAttribute('tabindex', '0');
  const size = await wrapper.evaluate(element => {
    const table = element.querySelector('table');
    return {
      viewport: element.clientWidth, content: element.scrollWidth, table: table.getBoundingClientRect().width,
      product: table.querySelector('tbody th').getBoundingClientRect().width,
      rowHeight: table.querySelector('tbody tr').getBoundingClientRect().height,
      headers: [...table.querySelectorAll('thead th')].map(cell => cell.getBoundingClientRect().height),
    };
  });
  expect(size.content).toBeGreaterThan(size.viewport);
  expect(size.table).toBeGreaterThanOrEqual(minimumWidth);
  expect(size.product).toBeGreaterThanOrEqual(220);
  expect(size.rowHeight).toBeLessThan(180);
  expect(size.headers.every(height => height < 60)).toBe(true);
  await wrapper.focus();
  await wrapper.press('ArrowRight');
  await expect.poll(() => wrapper.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await wrapper.evaluate(element => { element.scrollLeft = 0; });
}
async function fillReceipt(page) {
  await page.getByRole('button', { name: 'Novo recebimento', exact: true }).click();
  await page.getByLabel('Fornecedor *', { exact: true }).selectOption('13');
  await page.getByLabel('Número da nota *', { exact: true }).fill('NF-DEMO-20');
  await page.getByLabel('Valor total da nota (R$)', { exact: true }).fill('80,00');
  const item = page.getByRole('group', { name: 'Item 1', exact: true });
  await item.getByLabel('Produto *', { exact: true }).selectOption(productId);
  await item.getByLabel('Quantidade (kg) *', { exact: true }).fill('20');
  await item.getByLabel('Valor unitário (R$) *', { exact: true }).fill('4,00');
  await item.getByLabel('Lote', { exact: true }).fill('ARROZ-20');
  await item.getByLabel('Validade *', { exact: true }).fill('2030-12-31');
  await item.getByLabel('Local de destino *', { exact: true }).selectOption('14');
  await item.getByLabel('Aspecto da embalagem *', { exact: true }).fill('Íntegra');
}

test('produto usa IDs opacos, revisão exata e decimais em português sem perder a edição', async ({ page }) => {
  const state = await setup(page);
  await navigate(page, 'Produtos');
  await expect(page.getByRole('heading', { name: 'Produtos e alimentos' })).toBeVisible();
  await page.screenshot({ path: 'test-results/produtos-1280.png', fullPage: true });
  await page.getByRole('button', { name: 'Editar Arroz branco', exact: true }).click();
  await expect(page.getByLabel('Estoque mínimo *', { exact: true })).toHaveValue('2,5');
  await page.getByLabel('Nome do produto *', { exact: true }).fill('Arroz agulhinha');
  await page.getByLabel('Estoque mínimo *', { exact: true }).fill('6,25');
  state.productFailure = 412;
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Outra pessoa alterou');
  await expect(page.getByLabel('Nome do produto *', { exact: true })).toHaveValue('Arroz agulhinha');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Produto salvo com sucesso.');
  expect(state.writes[1].path).toBe(`/api/unidades/${unit}/produtos/${productId}`);
  expect(state.writes[1].body.revisao).toBe('9007199254741003');
  expect(state.writes[1].body.estoque_minimo).toBe('6.25');
  expect(Object.keys(state.writes[1].body)).not.toContain('id');
  await page.getByRole('button', { name: 'Voltar aos produtos', exact: true }).click();
  await page.getByLabel('Buscar produto', { exact: true }).fill('agulhinha');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Arroz agulhinha');
  expect(await page.locator('main').innerText()).not.toContain(productId);
});

test('cadastrar produto envia somente o contrato de cadastro e reabre dados persistidos pelo transporte', async ({ page }) => {
  const state = await setup(page, { products: [] });
  await navigate(page, 'Produtos');
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await page.getByLabel('Nome do produto *', { exact: true }).fill('Arroz branco');
  await page.getByLabel('Apresentação de compra *', { exact: true }).fill('Pacote de 5 kg');
  await page.getByLabel('Quantidade da apresentação *', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Produto salvo com sucesso.');
  expect(state.writes[0].method).toBe('POST');
  expect(state.writes[0].body.estoque_minimo).toBe('0');
  expect(state.writes[0].body).not.toHaveProperty('revisao');
  await page.getByRole('button', { name: 'Voltar aos produtos', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Arroz branco', exact: true }).click();
  await expect(page.getByLabel('Quantidade da apresentação *', { exact: true })).toHaveValue('5');
});

test('inativação exige confirmação, preservando a edição ao cancelar', async ({ page }) => {
  const state = await setup(page);
  await navigate(page, 'Produtos');
  await page.getByRole('button', { name: 'Editar Arroz branco', exact: true }).click();
  await page.getByRole('combobox', { name: 'Situação', exact: true }).selectOption('INATIVO');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  expect(state.writes).toEqual([]);
  await expect(page.getByRole('combobox', { name: 'Situação', exact: true })).toHaveValue('INATIVO');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Produto salvo com sucesso.');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.status).toBe('INATIVO');
});

test('compra preserva UUID no retry de confirmação e consulta o saldo retornado pela API', async ({ page }) => {
  const state = await setup(page, { confirmFailures: [503] });
  await navigate(page, 'Recebimentos');
  await fillReceipt(page);
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nota NF-DEMO-20', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/recebimento-1280.png', fullPage: true });
  expect(state.writes[0].body.itens[0].produto_id).toBe(productId);
  expect(state.writes[0].body.itens[0].valor_unitario).toBe('4.00');
  expect(state.writes[0].body.itens[0].temperatura).toBeNull();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Tente novamente');
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recebimento confirmado');
  expect(state.confirmKeys).toHaveLength(2);
  expect(state.confirmKeys[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(state.confirmKeys[0]).toBe(state.confirmKeys[1]);
  await expect(page.getByRole('button', { name: 'Confirmar recebimento', exact: true })).toHaveCount(0);
  await navigate(page, 'Saldo');
  await expect(page.getByRole('table')).toContainText('20 kg');
  await expect(page.getByRole('table')).toContainText('ARROZ-20');
  await page.getByRole('combobox', { name: 'Unidade', exact: true }).selectOption(otherUnit);
  await expect(page.getByText('Nenhum saldo registrado nesta unidade.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('nota divergente requer aprovação com motivo e não confirma ao aprovar', async ({ page }) => {
  const state = await setup(page, { receipts: [receipt({ total_nota: '90' })], capabilities: { recebimento_escrever: false, divergencia_aprovar: true } });
  await navigate(page, 'Recebimentos');
  await page.getByRole('button', { name: 'Visualizar nota NF-DEMO-20', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar recebimento', exact: true })).toBeDisabled();
  await page.getByLabel('Motivo da aprovação', { exact: true }).fill('Diferença conferida com o fornecedor');
  await page.getByRole('button', { name: 'Aprovar divergência', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('ainda precisa ser confirmada');
  expect(state.writes[0].body).toEqual({ motivo: 'Diferença conferida com o fornecedor' });
  expect(state.confirmKeys).toEqual([]);
});

test('leitor consulta sem receber controles de escrita habilitados', async ({ page }) => {
  const state = await setup(page, { receipts: [receipt()], capabilities: { produto_escrever: false, recebimento_escrever: false, divergencia_aprovar: false } });
  await navigate(page, 'Produtos');
  await expect(page.getByRole('button', { name: 'Novo produto', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Visualizar Arroz branco', exact: true }).click();
  await expect(page.getByLabel('Nome do produto *', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeDisabled();
  await navigate(page, 'Recebimentos');
  await expect(page.getByRole('button', { name: 'Novo recebimento', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Visualizar nota NF-DEMO-20', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar recebimento', exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test('troca de seção e unidade preserva rascunho quando descarte é recusado', async ({ page }) => {
  await setup(page);
  await navigate(page, 'Produtos');
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await page.getByLabel('Nome do produto *', { exact: true }).fill('Produto ainda não salvo');
  page.on('dialog', dialog => dialog.dismiss());
  await navigate(page, 'Recebimentos');
  await expect(page.getByLabel('Nome do produto *', { exact: true })).toHaveValue('Produto ainda não salvo');
  await page.getByRole('combobox', { name: 'Unidade', exact: true }).selectOption(otherUnit);
  await expect(page.getByRole('combobox', { name: 'Unidade', exact: true })).toHaveValue(unit);
});

test('recusa pede motivo e avisa que o item não será creditado', async ({ page }) => {
  await setup(page);
  await navigate(page, 'Recebimentos');
  await fillReceipt(page);
  const item = page.getByRole('group', { name: 'Item 1', exact: true });
  await item.getByRole('combobox', { name: 'Conformidade *', exact: true }).selectOption('RECUSADO');
  await expect(item.getByText('Item recusado: ficará registrado sem crédito no estoque.', { exact: true })).toBeVisible();
  await expect(item.getByLabel('Motivo *', { exact: true })).toHaveAttribute('required', '');
  await item.getByLabel('Motivo *', { exact: true }).fill('Embalagem danificada');
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Detalhes do recebimento' })).toContainText('Recusado');
  await expect(page.getByRole('region', { name: 'Detalhes do recebimento' })).toContainText('Embalagem danificada');
});

test('produto e recebimento cabem em 360px com tabelas roláveis', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await setup(page);
  await navigate(page, 'Produtos');
  await expect(page.getByRole('table')).toBeVisible();
  await expectReadableScroller(page, 'Lista de produtos');
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await navigate(page, 'Recebimentos');
  await page.getByRole('button', { name: 'Novo recebimento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dados da nota', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await page.screenshot({ path: 'test-results/estoque-360.png', fullPage: true });
});

test('saldo em 360px mantém produto e lote legíveis com rolagem real e 20 kg', async ({ page }) => {
  const name = 'Arroz branco parboilizado integral para refeições de demonstração do Restaurante Popular';
  const lot = 'DEMONSTRACAO-EST001-RECEBIMENTO-20KG-2026';
  await page.setViewportSize({ width: 360, height: 900 });
  await setup(page, {
    products: [{ ...product, descricao: name }],
    balances: [{ produto_id: productId, produto: name, unidade_medida: 'kg', lote_id: '50', lote: lot, validade: '2030-12-31', camara_id: '14', local: 'Almoxarifado seco de alimentos da unidade de demonstração', quantidade: '20', valor_unitario: '4' }],
  });
  await navigate(page, 'Produtos');
  await expectReadableScroller(page, 'Lista de produtos');
  await page.screenshot({ path: 'test-results/produtos-longos-360.png', fullPage: true });
  await navigate(page, 'Saldo');
  await expect(page.getByRole('table')).toContainText(name);
  await expect(page.getByRole('table')).toContainText('20 kg');
  await expectReadableScroller(page, 'Saldos por lote e local', 960);
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  const wrapper = page.locator('.table-wrap[aria-label="Saldos por lote e local"]');
  await page.screenshot({ path: 'test-results/saldo-longo-360.png', fullPage: true });
  await wrapper.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await page.screenshot({ path: 'test-results/saldo-quantidade-360.png', fullPage: true });
});

test('vínculo busca cadastro global e salva apenas parâmetros locais, com precisão e reabertura em 360px',async({page})=>{
 await page.setViewportSize({width:360,height:900});const state=await setup(page,{products:[]});await navigate(page,'Produtos');
 await page.getByRole('button',{name:'Vincular produto existente',exact:true}).click();
 await page.getByLabel('Buscar no catálogo',{exact:true}).fill('Arroz');await page.getByRole('button',{name:'Buscar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Selecionar Arroz branco',exact:true})).toBeVisible();
 await expectReadableScroller(page,'Produtos disponíveis para vínculo');
 await page.getByRole('button',{name:'Selecionar Arroz branco',exact:true}).click();
 await page.getByLabel('Estoque mínimo *',{exact:true}).fill('7,000001');await page.getByLabel('Estoque máximo',{exact:true}).fill('1');
 await page.getByRole('button',{name:'Vincular à unidade',exact:true}).click();await expect(page.getByRole('alert')).toContainText('máximo');expect(state.writes).toHaveLength(0);
 await page.getByLabel('Estoque máximo',{exact:true}).fill('20,5');await page.getByRole('button',{name:'Vincular à unidade',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Produto vinculado à unidade com sucesso.'})).toHaveText('Produto vinculado à unidade com sucesso.');
 expect(state.writes).toEqual([{path:`/api/unidades/${unit}/produtos/${productId}/vinculo`,method:'POST',body:{revisao:product.revisao,estoque_minimo:'7.000001',estoque_maximo:'20.5',ponto_reposicao:null}}]);
 await page.getByRole('button',{name:'Editar Arroz branco',exact:true}).click();await expect(page.getByLabel('Estoque mínimo *',{exact:true})).toHaveValue('7,000001');
 await expect(page.locator('html')).toHaveJSProperty('scrollWidth',360);
});

test('vínculo preserva parâmetros após revisão antiga e permite cancelar descarte',async({page})=>{
 const state=await setup(page,{products:[]});await navigate(page,'Produtos');await page.getByRole('button',{name:'Vincular produto existente',exact:true}).click();
 await page.getByRole('button',{name:'Selecionar Arroz branco',exact:true}).click();await page.getByLabel('Estoque mínimo *',{exact:true}).fill('9,5');state.productFailure=412;
 await page.getByRole('button',{name:'Vincular à unidade',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cadastro do produto mudou');
 await expect(page.getByLabel('Estoque mínimo *',{exact:true})).toHaveValue('9,5');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Voltar ao catálogo',exact:true}).click();await expect(page.getByLabel('Estoque mínimo *',{exact:true})).toHaveValue('9,5');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Voltar ao catálogo',exact:true}).click();await expect(page.getByLabel('Buscar no catálogo',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);
});

test('consulta desabilita vínculo ao catálogo compartilhado',async({page})=>{
 await setup(page,{capabilities:{produto_escrever:false}});await navigate(page,'Produtos');await expect(page.getByRole('button',{name:'Vincular produto existente',exact:true})).toBeDisabled();
});
