import { test, expect } from '@playwright/test';
const original = {
  unidade_id: '1',
  revisao: '1',
  modo_saida: 'PREVIA',
  margem_percentual: '5',
  dias_alerta_validade: 7,
  prazo_amostra_horas: 72,
  periodicidade_inventario_dias: 7,
  referencia_preco: 'MENOR_COTACAO',
  alerta_email_habilitado: false,
};
async function setup(
  page,
  { editable = true, units = true, initial = {}, captureLogin = false } = {},
) {
  const configurations = {
    1: { ...original, ...initial },
    2: { ...original, unidade_id: '2', margem_percentual: '12' },
  };
  let fail = 0;
  const writes = [];
  const headers = (current) => ({
    ETag: `"cfg-${current.unidade_id}-${current.revisao}"`,
  });
  await page.route('https://auth-ficticio.supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/token')) {
      const user = {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'teste@example.invalid',
      };
      await route.fulfill({
        json: {
          access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',
          refresh_token: 'ficticio',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        },
      });
    } else if (url.endsWith('/user')) await route.fulfill({json:{id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'teste@example.invalid'}});
    else await route.fulfill({ json: {} });
  });
  await page.route('**/api/**', async (route) => {
    if(route.request().url().endsWith('/auth/login')) return route.fulfill({json:{access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio'}});
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    if (route.request().url().endsWith('/me')) return route.fulfill({json:{nome:'Pessoa de teste'}});
    if (route.request().url().includes('/produtos')) return route.fulfill({json:{produtos:[],total:0}});
    if (route.request().url().includes('/estoque/saldos')) return route.fulfill({json:{saldos:[]}});
    if (route.request().url().endsWith('/unidades'))
      return route.fulfill({
        json: {
          unidades: units
            ? [
                { id: '1', codigo: 'RP1', nome: 'Unidade de demonstração' },
                { id: '2', codigo: 'RP2', nome: 'Segunda unidade' },
              ]
            : [],
        },
      });
    const unit = /unidades\/(\d+)/.exec(route.request().url())[1];
    const current = configurations[unit];
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      writes.push({ body, etag: route.request().headers()['if-match'] });
      if (fail) {
        const status = fail;
        fail = 0;
        return route.fulfill({ status, json: { error: { code: 'TEST' } } });
      }
      Object.assign(current, {
        ...body.campos,
        revisao: String(Number(current.revisao) + 1),
      });
      return route.fulfill({
        headers: headers(current),
        json: { configuracao: current },
      });
    }
    return route.fulfill({
      headers: headers(current),
      json: { configuracao: current, pode_editar: editable },
    });
  });
  await page.goto('/');
  if (captureLogin)
    await page.screenshot({
      path: 'test-results/login-1280.png',
      fullPage: true,
    });
  await page
    .getByLabel('Nome de usuário', { exact: true })
    .fill('teste');
  await page.getByLabel('Senha', { exact: true }).fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  if (units) {
    await page.getByLabel('Unidade de acesso',{exact:true}).selectOption('1');
    await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
    await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Configurações',exact:true}).click();
    await expect(
      page.getByRole('heading', { name: 'Operação e custos' }),
    ).toBeVisible();
  }
  return {
    writes,
    fail: (status) => {
      fail = status;
    },
    remote: (fields) => {
      Object.assign(configurations['1'], {
        ...fields,
        revisao: String(Number(configurations['1'].revisao) + 1),
      });
    },
  };
}
async function review(page) {
  await page
    .getByRole('button', { name: 'Revisar alterações', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByLabel('Motivo da alteração')
    .fill('Ajuste aprovado para a unidade');
}
test('login, revisão cancelável e gravação com ETag e somente campos alterados', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const state = await setup(page, { captureLogin: true });
  await page.getByLabel('Margem (%)', { exact: true }).fill('6,25');
  await review(page);
  await page.getByRole('button', { name: 'Voltar à edição' }).click();
  expect(state.writes).toHaveLength(0);
  await expect(page.getByLabel('Margem (%)', { exact: true })).toHaveValue(
    '6,25',
  );
  await review(page);
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Configurações salvas com sucesso.',
  );
  await expect(page.getByLabel('Margem (%)', { exact: true })).toHaveValue('6,25');
  expect(state.writes).toEqual([
    {
      etag: '"cfg-1-1"',
      body: {
        campos: { margem_percentual: '6.25' },
        motivo: 'Ajuste aprovado para a unidade',
      },
    },
  ]);
});
test('conflito preserva rascunho e reaplica somente os campos locais', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByLabel('Margem (%)', { exact: true }).fill('8');
  state.remote({ prazo_amostra_horas: 96 });
  state.fail(412);
  await review(page);
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Configuração atualizada por outra pessoa',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reaplicar minha edição' }).click();
  await expect(page.getByLabel('Margem (%)', { exact: true })).toHaveValue('8');
  await expect(
    page.getByLabel('Prazo de amostra (horas)', { exact: true }),
  ).toHaveValue('96');
  await review(page);
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Configurações salvas com sucesso.',
  );
  expect(state.writes[1].etag).toBe('"cfg-1-2"');
  expect(state.writes[1].body.campos).toEqual({ margem_percentual: '8' });
});
for (const status of [401, 403, 503])
  test(`erro ${status} mantém edição e motivo`, async ({ page }) => {
    const state = await setup(page);
    state.fail(status);
    await page.getByLabel('Margem (%)', { exact: true }).fill('9');
    await review(page);
    await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Motivo da alteração')).toHaveValue(
      'Ajuste aprovado para a unidade',
    );
    await page.getByRole('button', { name: 'Voltar à edição' }).click();
    await expect(page.getByLabel('Margem (%)', { exact: true })).toHaveValue(
      '9',
    );
  });
test('consulta não oferece escrita; lista vazia não inventa unidades', async ({
  page,
}) => {
  const state = await setup(page, { editable: false });
  await expect(page.getByLabel('Margem (%)', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Revisar alterações', exact: true }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});
test('sem unidade exibe estado vazio', async ({ page }) => {
  await setup(page, { units: false });
  await expect(
    page.getByText('Nenhuma unidade ativa vinculada', { exact: false }),
  ).toBeVisible();
});
test('validação, troca de unidade e saída protegem alterações não salvas', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByLabel('Margem (%)', { exact: true }).fill('101');
  await expect(
    page.getByRole('button', { name: 'Revisar alterações', exact: true }),
  ).toBeDisabled();
  page.on('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('combobox', { name: 'Unidade', exact: true })
    .selectOption('2');
  await expect(
    page.getByRole('combobox', { name: 'Unidade', exact: true }),
  ).toHaveValue('1');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Configurações', exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
});
test('restaurar referências preserva modo e preferência de email e exige revisão', async ({
  page,
}) => {
  const state = await setup(page, {
    initial: {
      modo_saida: 'POSTERIOR',
      alerta_email_habilitado: true,
      margem_percentual: '20',
      prazo_amostra_horas: 96,
    },
  });
  await page
    .getByRole('button', { name: 'Restaurar valores de referência' })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Modo de saída', exact: true }),
  ).toHaveValue('POSTERIOR');
  expect(state.writes).toHaveLength(0);
  await review(page);
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Configurações salvas com sucesso.',
  );
  expect(state.writes[0].body.campos).toEqual({
    margem_percentual: '5',
    prazo_amostra_horas: 72,
  });
});
test('troca confirmada descarta rascunho e carrega os valores da outra unidade', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByLabel('Margem (%)', { exact: true }).fill('9');
  page.on('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('combobox', { name: 'Unidade', exact: true })
    .selectOption('2');
  await expect(page.getByLabel('Margem (%)', { exact: true })).toHaveValue(
    '12',
  );
  await expect(
    page.getByRole('button', { name: 'Revisar alterações', exact: true }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});
for (const width of [360, 768, 1280])
  test(`painel responsivo e revisão por teclado em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', width);
    await page.getByLabel('Margem (%)', { exact: true }).fill('6');
    await page
      .getByRole('button', { name: 'Revisar alterações', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Revisar alterações', exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: `test-results/painel-${width}.png`,
      fullPage: true,
    });
  });
