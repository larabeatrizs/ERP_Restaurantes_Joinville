import { test, expect } from '@playwright/test';
const token='a'.repeat(64);
const user={id:'00000000-0000-4000-8000-000000000004',aud:'authenticated',role:'authenticated',email:'admin@example.invalid'};
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.ficticio',refresh_token:'ficticio',expires_in:3600,token_type:'bearer',user};
async function setup(page,{invalid=false,updateFails=false}={}){
 const writes=[];let apiCalls=0,verifications=0;
 await page.route('https://auth-ficticio.supabase.co/**',async route=>{
  const request=route.request(),url=request.url();
  if(url.endsWith('/verify')){
   verifications++;
   expect(request.postDataJSON()).toMatchObject({token_hash:token,type:'recovery'});
   return route.fulfill(invalid||verifications>1?{status:403,json:{error_code:'otp_expired',msg:'Expired'}}:{json:session});
  }
  if(url.endsWith('/user')&&request.method()==='PUT'){
   writes.push(request.postDataJSON());
   return route.fulfill(updateFails?{status:422,json:{msg:'Rejected'}}:{json:user});
  }
  if(url.endsWith('/user'))return route.fulfill({json:user});
  return route.fulfill({json:{}});
 });
 await page.route('**/api/**',route=>{apiCalls++;return route.fulfill({json:{unidades:[]}});});
 await page.goto('/#definir-senha='+token);
 return {writes,apiCalls:()=>apiCalls};
}
test('primeiro acesso remove token, valida confirmação e encerra sessão após definir senha',async({page})=>{
 const state=await setup(page);
 await expect(page.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/$/);
 expect(state.apiCalls()).toBe(0);
 await page.getByLabel('Nova senha',{exact:true}).fill('NovaSenhaSegura-123!');
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill('Diferente-123!');
 await page.getByRole('button',{name:'Salvar senha',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('As senhas precisam ser iguais.');
 expect(state.writes).toHaveLength(0);
 await page.getByLabel('Nova senha',{exact:true}).fill('fraca');
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill('fraca');
 await page.getByRole('button',{name:'Salvar senha',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Pelo menos 8 caracteres, com uma letra maiúscula ou minúscula, um número e um símbolo.');
 expect(state.writes).toHaveLength(0);
 await page.getByLabel('Nova senha',{exact:true}).fill('abcdef1!');
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill('abcdef1!');
 await page.getByRole('button',{name:'Salvar senha',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('Senha definida. Entre com seu nome de usuário e a nova senha.');
 expect(state.writes).toHaveLength(1);
 expect(state.writes[0]).toMatchObject({password:'abcdef1!'});
 expect(state.apiCalls()).toBe(0);
});
test('link inválido não abre o workspace nem conserva o token na URL',async({page})=>{
 const state=await setup(page,{invalid:true});
 await expect(page.getByRole('heading',{name:'Link indisponível'})).toBeVisible();
 await expect(page).toHaveURL(/\/$/);expect(state.apiCalls()).toBe(0);
 await page.getByRole('button',{name:'Voltar ao login'}).click();
 await expect(page.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible();
 expect(state.writes).toHaveLength(0);
});
test('falha ao salvar mantém a definição de senha e não abre dados',async({page})=>{
 const state=await setup(page,{updateFails:true});
 await page.getByLabel('Nova senha',{exact:true}).fill('NovaSenhaSegura-123!');
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill('NovaSenhaSegura-123!');
 await page.getByRole('button',{name:'Salvar senha',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Não foi possível concluir');
 await expect(page.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible();expect(state.apiCalls()).toBe(0);
});
test('recarregar durante primeiro acesso mantém a tela de senha',async({page})=>{
 const state=await setup(page);
 await expect(page.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible();expect(state.apiCalls()).toBe(0);
});
test('reabrir link na mesma aba processa o fragmento e recusa token consumido',async({page})=>{
 const state=await setup(page);
 await expect(page.getByRole('heading',{name:'Definir senha',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible();
 await page.goto('/#definir-senha='+token);
 await expect(page.getByRole('heading',{name:'Link indisponível'})).toBeVisible();
 await expect(page).toHaveURL(/\/$/);expect(state.apiCalls()).toBe(0);
});
