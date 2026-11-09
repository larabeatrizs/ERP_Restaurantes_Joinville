import { test, expect } from '@playwright/test';

// Transport doubles exercise UI state/DTOs. They do not prove hosted Auth, RLS or database atomicity.
const unit = '9007199254740993';
const otherUnit = '9007199254740995';
const productId = '9007199254741001';
const product = {
  id: productId, revisao: '9007199254741003', descricao: 'Arroz branco', complemento: '', unidade_medida_id: '11', categoria_id: '12',
  perecivel: true, armazenamento: 'SECO', fator_correcao: '1', apresentacao_compra: 'Pacote de 5 kg', quantidade_apresentacao: '5',
  estoque_minimo: '2.5', estoque_maximo: null, ponto_reposicao: null, status: 'ATIVO', unidade_sigla: 'kg', categoria_descricao: 'Grãos e secos',
};
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
  const state = { products: options.products ?? [{ ...product }], receipts: options.receipts ?? [], balances: [], writes: [], confirmKeys: [], confirmFailures: options.confirmFailures ?? [], productFailure: 0 };
  await page.route('https://auth-ficticio.supabase.co/**', route => {
    if (route.request().url().includes('/token')) return route.fulfill({ json: {
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio', refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600,
      user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'teste@example.invalid' },
    } });
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/**', route => {
    const request = route.request(); const url = new URL(request.url());
    expect(request.headers().authorization).toMatch(/^Bearer /);
    const respond = json => route.fulfill({ json });
    if (url.pathname === '/api/unidades') return respond({ unidades: [{ id: unit, codigo: 'DEMO-A', nome: 'Unidade de demonstração' }, { id: otherUnit, codigo: 'DEMO-B', nome: 'Outra unidade' }] });
    const activeUnit = url.pathname.split('/')[3];
    if (url.pathname.endsWith('/configuracoes')) return route.fulfill({ headers: { ETag: `"cfg-${activeUnit}-1"` }, json: { pode_editar: true, configuracao: { unidade_id: activeUnit, revisao: '1', modo_saida: 'POSTERIOR', margem_percentual: '5', dias_alerta_validade: 7, prazo_amostra_horas: 72, periodicidade_inventario_dias: 7, referencia_preco: 'MENOR_COTACAO', alerta_email_habilitado: false } } });
    if (url.pathname.endsWith('/estoque/contexto')) return respond({ ...context, capacidades: { ...context.capacidades, ...options.capabilities } });
    if (url.pathname.endsWith('/estoque/saldos')) return respond({ saldos: activeUnit === unit ? state.balances : [] });
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
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operação e custos' })).toBeVisible();
  return state;
}
async function navigate(page, name) { await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name, exact: true }).click(); }
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
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await navigate(page, 'Recebimentos');
  await page.getByRole('button', { name: 'Novo recebimento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dados da nota', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await page.screenshot({ path: 'test-results/estoque-360.png', fullPage: true });
});
