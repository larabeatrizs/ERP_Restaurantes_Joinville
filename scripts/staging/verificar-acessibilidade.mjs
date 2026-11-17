// Opt-in, readonly domain journey using only a reserved synthetic account. Never resets passwords.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const repo = await fs.realpath(fileURLToPath(new URL('../../', import.meta.url)));
const file = await fs.realpath(process.env.ERP_STOCK_TEST_STATE ?? '');
const relative = path.relative(repo, file);
if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) throw Error('Private state outside checkout required.');
const state = JSON.parse(await fs.readFile(file, 'utf8'));
const origin = process.env.ERP_STAGING_URL;
if (state.projectRef !== 'vpowsedoajpdbeckimuv' || state.url !== 'https://vpowsedoajpdbeckimuv.supabase.co'
  || origin !== 'https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev') throw Error('Confirmed staging required.');
const account = state.users.find(user => user.label === 'readerA');
if (!account || !/^(int003|est001)-[^@]+@example\.invalid$/.test(account.email)) throw Error('Reserved synthetic reader required.');
const runtime = JSON.parse(await fs.readFile(path.join(path.dirname(file), '../auth-ux003/runtime-private.json'), 'utf8'));
const directory = JSON.parse(runtime.AUTH_LOGIN_DIRECTORY);
const login = Object.entries(directory).find(([, email]) => email === account.email)?.[0];
if (!login) throw Error('Synthetic username not mapped.');
const builtIndex = await fs.readFile(path.join(repo, 'apps/web/dist/index.html'), 'utf8');
const expectedAsset = builtIndex.match(/src="(\/assets\/index-[^"]+)"/)?.[1];
const freshUrl = `${origin}/?verificacao=adm002-${Date.now()}`;
const hostedIndex = await (await fetch(freshUrl, { cache: 'no-store', signal: AbortSignal.timeout(30000) })).text();
if (!expectedAsset || !hostedIndex.includes(expectedAsset)) throw Error('Expected built assets are not yet served by staging.');
const proof = { executedAt: new Date().toISOString(), origin, asset: expectedAsset, mocked: false, completed: false, scenarios: [] };
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let writes = 0;
try {
  const page = await context.newPage();
  page.on('request', request => {
    if (request.url().startsWith(`${origin}/api/`) && !['GET', 'HEAD'].includes(request.method())
      && new URL(request.url()).pathname !== '/api/auth/login') writes++;
  });
  await page.goto(freshUrl);
  await page.getByLabel('Nome de usuário', { exact: true }).fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Selecionar unidade', exact: true })).toBeVisible();
  await expect(page.getByLabel('Unidade de acesso', { exact: true })).toBeEnabled();
  await page.getByLabel('Unidade de acesso', { exact: true }).selectOption(String(state.units.A));
  await page.getByRole('button', { name: 'Acessar unidade', exact: true }).click();
  await expect(page.locator('.home-metrics')).toBeVisible();
  await expect(page.getByRole('main')).toHaveAttribute('tabindex', '-1');
  await page.getByRole('link', { name: 'Ir para o conteúdo', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  for (const name of ['Meu acesso', 'Configurações', 'Início']) {
    await page.getByRole('link', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  proof.scenarios.push({ name: 'Synthetic username login, unit choice, skip link and keyboard navigation across workspace branches', passed: true });
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  assert.equal(writes, 0);
  proof.scenarios.push({ name: 'No horizontal overflow at 360/768/1280 and no domain API writes', passed: true });
  proof.completed = true;
} catch (error) {
  await fs.writeFile(path.join(path.dirname(file), 'adm002-accessibility-error-private.txt'), String(error?.stack ?? error));
  throw Error('Hosted accessibility journey failed; inspect private report.');
} finally {
  await context.close(); await browser.close();
  await fs.writeFile(path.join(path.dirname(file), 'adm002-accessibility-result.json'), JSON.stringify(proof, null, 2));
}
console.log(JSON.stringify(proof, null, 2));
