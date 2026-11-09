// Opt-in: cria demonstração sintética pela UI real; sem mocks, traces ou chave administrativa.
// Os registros confirmados e a trilha permanecem para a limpeza final planejada.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const stateFile = process.env.ERP_STOCK_TEST_STATE;
if (!stateFile) throw Error('Defina ERP_STOCK_TEST_STATE para o arquivo privado fora do checkout.');
const repository = await fs.realpath(fileURLToPath(new URL('../../', import.meta.url)));
const privateFile = await fs.realpath(stateFile);
const relative = path.relative(repository, privateFile);
if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('O estado privado deve ficar fora do checkout.');
const state = JSON.parse(await fs.readFile(privateFile, 'utf8'));
if (state.projectRef !== 'vpowsedoajpdbeckimuv' || state.url !== 'https://vpowsedoajpdbeckimuv.supabase.co' || !state.publishableKey?.startsWith('sb_publishable_')) throw Error('Projeto de demonstração inesperado.');
if (!/^[1-9]\d*$/.test(state.units?.A ?? '') || !/^[1-9]\d*$/.test(state.units?.B ?? '')) throw Error('Unidades sintéticas ausentes.');
for (const label of ['stockkeeperA', 'readerA']) {
  const account = state.users?.find(user => user.label === label);
  if (!account || !/^[^@\s]+@example\.invalid$/.test(account.email) || typeof account.password !== 'string' || !account.password) throw Error('Conta sintética esperada ausente.');
}
const origin = new URL(process.env.ERP_STAGING_URL ?? 'http://127.0.0.1:8787');
const local = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.port === '8787';
const hosted = origin.protocol === 'https:' && /^erp-joinville-staging\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname);
if ((!local && !hosted) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw Error('Destino deve ser o Worker confirmado do staging.');

const privateRoot = path.dirname(privateFile);
const contexts = [];
const scenarios = [];
let browser;
let completed = false;
const nonce = randomUUID().slice(0, 8);
const name = `Demonstração EST001 Web ${nonce}`;
const note = `WEB-EST001-${nonce}`;
const lot = `WEB-EST001-${nonce}`;
const record = scenario => { scenarios.push(scenario); console.log('PASS:', scenario); };
async function navigate(page, label) {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: label, exact: true }).click();
}
async function enter(label, width) {
  const account = state.users.find(user => user.label === label);
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(origin.href);
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Unidade', exact: true })).toHaveValue(String(state.units.A));
  await expect(page.getByRole('combobox', { name: 'Unidade', exact: true }).locator('option')).toHaveCount(1);
  return page;
}
async function search(page) {
  await page.getByLabel('Buscar produto', { exact: true }).fill(nonce);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('table')).toContainText(name);
}
async function capture(page, filename) {
  // Capture only authenticated content; login fields, Auth identifiers and tokens are excluded.
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(privateRoot, filename), fullPage: true });
}
function dateInSaoPaulo(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
try {
  const health = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(20000) });
  if (!health.ok || (await health.json()).service !== 'erp-api') throw Error('Worker esperado indisponível.');
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const stockkeeper = await enter('stockkeeperA', 1280);
  const contextResponse = stockkeeper.waitForResponse(response => new URL(response.url()).pathname === `/api/unidades/${state.units.A}/estoque/contexto` && response.request().method() === 'GET');
  await navigate(stockkeeper, 'Produtos');
  const response = await contextResponse;
  if (!response.ok()) throw Error('Contexto indisponível.');
  const context = await response.json();
  const measure = context.medidas.find(item => item.sigla.toUpperCase() === 'KG');
  const category = context.categorias.find(item => item.armazenamento_padrao === 'SECO');
  const supplier = context.fornecedores[0];
  const location = context.locais.find(item => item.tipo === 'SECO');
  if (!measure || !category || !supplier || !location || !context.capacidades.produto_escrever || !context.capacidades.recebimento_escrever) throw Error('Catálogos ou capacidades sintéticas ausentes.');
  record('Login real do estoquista e contexto da unidade autorizada');

  await stockkeeper.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await stockkeeper.getByLabel('Nome do produto *', { exact: true }).fill(name);
  await stockkeeper.getByRole('combobox', { name: 'Categoria *', exact: true }).selectOption(category.id);
  await stockkeeper.getByRole('combobox', { name: 'Unidade de medida *', exact: true }).selectOption(measure.id);
  await stockkeeper.getByRole('combobox', { name: 'Armazenamento *', exact: true }).selectOption('SECO');
  await stockkeeper.getByRole('combobox', { name: 'Perecível *', exact: true }).selectOption('SIM');
  await stockkeeper.getByLabel('Apresentação de compra *', { exact: true }).fill('Saco de 5 kg');
  await stockkeeper.getByLabel('Quantidade da apresentação *', { exact: true }).fill('5');
  await stockkeeper.getByLabel('Estoque mínimo *', { exact: true }).fill('2,50');
  await stockkeeper.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(stockkeeper.getByRole('status')).toHaveText('Produto salvo com sucesso.');
  await stockkeeper.getByRole('button', { name: 'Voltar aos produtos', exact: true }).click();
  await search(stockkeeper);
  await capture(stockkeeper, 'estoque-produtos-1280.png');
  await stockkeeper.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
  await expect(stockkeeper.getByLabel('Nome do produto *', { exact: true })).toHaveValue(name);
  await expect(stockkeeper.getByLabel('Estoque mínimo *', { exact: true })).toHaveValue(/^(2,5|2,50|2,500000)$/);
  await stockkeeper.getByRole('button', { name: 'Voltar aos produtos', exact: true }).click();
  record('Produto criado, pesquisado e reaberto com decimal em português');

  await navigate(stockkeeper, 'Recebimentos');
  await stockkeeper.getByRole('button', { name: 'Novo recebimento', exact: true }).click();
  await stockkeeper.getByRole('combobox', { name: 'Fornecedor *', exact: true }).selectOption(supplier.id);
  await stockkeeper.getByLabel('Número da nota *', { exact: true }).fill(note);
  await stockkeeper.getByLabel('Valor total da nota (R$)', { exact: true }).fill('80,00');
  const item = stockkeeper.getByRole('group', { name: 'Item 1', exact: true });
  const productOption = item.getByRole('combobox', { name: 'Produto *', exact: true }).getByRole('option').filter({ hasText: name });
  const productId = await productOption.getAttribute('value');
  if (!productId) throw Error('Produto persistido indisponível no recebimento.');
  await item.getByRole('combobox', { name: 'Produto *', exact: true }).selectOption(productId);
  await item.getByLabel(`Quantidade (${measure.sigla}) *`, { exact: true }).fill('20');
  await item.getByLabel('Valor unitário (R$) *', { exact: true }).fill('4,00');
  await item.getByLabel('Lote', { exact: true }).fill(lot);
  await item.getByLabel('Validade *', { exact: true }).fill(dateInSaoPaulo(new Date(Date.now() + 30 * 86400000)));
  await item.getByRole('combobox', { name: 'Local de destino *', exact: true }).selectOption(location.id);
  await item.getByLabel('Aspecto da embalagem *', { exact: true }).fill('Íntegra e limpa — demonstração');
  await stockkeeper.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(stockkeeper.getByRole('heading', { name: `Nota ${note}`, exact: true })).toBeVisible();
  stockkeeper.once('dialog', dialog => dialog.accept());
  await stockkeeper.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await expect(stockkeeper.getByRole('status')).toHaveText('Recebimento confirmado. O saldo dos itens aceitos foi atualizado.');
  await expect(stockkeeper.getByRole('button', { name: 'Confirmar recebimento', exact: true })).toHaveCount(0);
  await capture(stockkeeper, 'estoque-recebimento-1280.png');
  await navigate(stockkeeper, 'Saldo');
  const balance = stockkeeper.getByRole('row').filter({ hasText: lot });
  await expect(balance).toHaveCount(1);
  await expect(balance).toContainText(/20\s+KG/i);
  await expect(balance).toContainText(location.nome);
  record('Compra de 20 kg confirmada pela UI e saldo real por lote/local consultado');
  await stockkeeper.getByRole('button', { name: 'Sair', exact: true }).click();

  const reopened = await enter('stockkeeperA', 1280);
  await navigate(reopened, 'Produtos');
  await search(reopened);
  await reopened.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
  await expect(reopened.getByLabel('Nome do produto *', { exact: true })).toHaveValue(name);
  await navigate(reopened, 'Recebimentos');
  await reopened.getByRole('button', { name: `Visualizar nota ${note}`, exact: true }).click();
  await expect(reopened.getByText('Entrada confirmada e preservada no histórico. Os itens aceitos já compõem o saldo.', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Sair', exact: true }).click();
  record('Nova sessão recupera o produto e a entrada confirmada');

  const reader = await enter('readerA', 360);
  await navigate(reader, 'Produtos');
  await expect(reader.getByRole('button', { name: 'Novo produto', exact: true })).toBeDisabled();
  await search(reader);
  await reader.getByRole('button', { name: `Visualizar ${name}`, exact: true }).click();
  await expect(reader.getByLabel('Nome do produto *', { exact: true })).toBeDisabled();
  await expect(reader.getByRole('button', { name: 'Salvar produto', exact: true })).toBeDisabled();
  await navigate(reader, 'Recebimentos');
  await expect(reader.getByRole('button', { name: 'Novo recebimento', exact: true })).toBeDisabled();
  await reader.getByRole('button', { name: `Visualizar nota ${note}`, exact: true }).click();
  await expect(reader.getByRole('button', { name: 'Confirmar recebimento', exact: true })).toHaveCount(0);
  await navigate(reader, 'Saldo');
  await expect(reader.getByRole('row').filter({ hasText: lot })).toContainText(/20\s+KG/i);
  await expect(reader.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await capture(reader, 'estoque-saldo-360.png');
  await reader.getByRole('button', { name: 'Sair', exact: true }).click();
  record('Leitor consulta sem escrita e saldo em 360 px sem overflow da página');
  completed = true;
} catch {
  console.error('FAIL: verificação real da interface interrompida; revisar o estado privado antes de repetir.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  if (browser) await browser.close();
  await fs.writeFile(path.join(privateRoot, 'stock-browser-result.json'), JSON.stringify({ executedAt: new Date().toISOString(), origin: origin.origin, mocked: false, completed, scenarios }, null, 2));
}
