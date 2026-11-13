import { expect } from '@playwright/test';
export async function selectWorkspaceUnit(page, expected) {
  const selector=page.getByLabel('Unidade de acesso',{exact:true});
  await expect(page.getByRole('heading',{name:'Selecionar unidade',exact:true})).toBeVisible({timeout:30000});
  await expect.poll(()=>selector.locator('option').count()).toBeGreaterThan(1);
  const values=await selector.locator('option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean));
  if(!expected&&values.length!==1)throw Error('Expected unit must be specified for multiple links');
  const selected=String(expected??values[0]);
  if(!values.includes(selected))throw Error('Requested synthetic unit is not authorized');
  await selector.selectOption(selected);
  await page.getByRole('button',{name:'Acessar unidade',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Início',exact:true})).toBeVisible();
}
