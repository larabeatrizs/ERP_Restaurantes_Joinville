// Bootstrap local opt-in. Não importar na View/Worker; nunca imprime identidades ou tokens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function adminPreviewSql(id) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid identity');
 return `begin;
 select pg_advisory_xact_lock(hashtext('ADM-001-acompanhamento'));
 do $adm$
 declare ator uuid:='${id}'; perfil bigint; a bigint; b bigint; permissoes text[];
 begin
  if not exists(select 1 from auth.users where id=ator) then raise exception 'Auth identity required'; end if;
  select id into a from erp.unidade where codigo='STG-INT003-A' and status='ATIVO';
  select id into b from erp.unidade where codigo='STG-INT003-B' and status='ATIVO';
  if a is null or b is null then raise exception 'Synthetic units required'; end if;
  select id into perfil from erp.perfil where codigo='ADMIN';
  if perfil is null then
   insert into erp.perfil(codigo) values('ADMIN') returning id into perfil;
   insert into erp.perfil_permissao(perfil_id,permissao) values(perfil,'CONFIGURACAO_LER'),(perfil,'ESTOQUE_LER'),(perfil,'PRODUTO_LER');
  else
   select array_agg(permissao order by permissao) into permissoes from erp.perfil_permissao where perfil_id=perfil;
   if permissoes is distinct from array['CONFIGURACAO_LER','ESTOQUE_LER','PRODUTO_LER']::text[]
     or exists(select 1 from erp.usuario where perfil_id=perfil and id<>ator) then raise exception 'Existing ADMIN requires review'; end if;
  end if;
  if exists(select 1 from erp.usuario where id=ator) then
   if not exists(select 1 from erp.usuario where id=ator and perfil_id=perfil and status='ATIVO')
     or (select array_agg(unidade_id order by unidade_id) from erp.usuario_unidade where usuario_id=ator)
        is distinct from (select array_agg(x order by x) from unnest(array[a,b]) x) then raise exception 'Existing user requires review'; end if;
  else
   insert into erp.usuario(id,perfil_id,nome,status) values(ator,perfil,'ADMIN_INICIAL','ATIVO');
   insert into erp.usuario_unidade(usuario_id,unidade_id) values(ator,a),(ator,b);
  end if;
 end $adm$;
 commit;`;
}

async function main() {
 const root=fs.realpathSync(process.env.ERP_STAGING_PRIVATE_DIR??'');
 const checkout=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
 const relative=path.relative(checkout,root);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Private directory required');
 const plan=JSON.parse(fs.readFileSync(path.join(root,'admin-inicial-planejado.json'),'utf8').replace(/^\uFEFF/,''));
 if(plan.alias!=='ADMIN_INICIAL'||plan.targetProfile!=='ADMIN'||typeof plan.email!=='string'||!plan.email.includes('@'))throw Error('Private request required');
 const bytes=fs.readFileSync(path.join(root,'keys-private.json'));
 const keys=JSON.parse(bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''));
 if(keys.target?.project_ref!=='vpowsedoajpdbeckimuv')throw Error('Project mismatch');
 const secret=keys.keys.find(k=>k.type==='secret')?.api_key;
 const publishable=keys.keys.find(k=>k.type==='publishable')?.api_key;
 if(!secret?.startsWith('sb_secret_')||!publishable?.startsWith('sb_publishable_'))throw Error('Keys unavailable');
 const url='https://vpowsedoajpdbeckimuv.supabase.co';
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 const stateFile=path.join(root,'admin-acompanhamento-privado.json');
 let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
 const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 if(state&&(state.email!==plan.email||state.projectRef!=='vpowsedoajpdbeckimuv'))throw Error('Existing state mismatch');
 if(process.env.ERP_ADMIN_ACTION==='create-auth') {
  if(!state) {
   // O preflight SQL verifica ausência no servidor; conferir também antes de criar.
   let page=1;
   while(true){const list=await admin.auth.admin.listUsers({page,perPage:100});if(list.error)throw Error('Auth preflight failed');if(list.data.users.some(u=>u.email?.toLowerCase()===plan.email.toLowerCase()))throw Error('Existing identity requires review');if(list.data.users.length<100)break;page++;}
   state={projectRef:'vpowsedoajpdbeckimuv',alias:plan.alias,email:plan.email,createdAt:new Date().toISOString(),stage:'CREATING_AUTH',bootstrapPassword:randomBytes(36).toString('base64url')+'aA1!'};save();
   const result=await admin.auth.admin.createUser({email:state.email,password:state.bootstrapPassword,email_confirm:true,app_metadata:{purpose:'ERP_ADM001_PREVIEW'}});
   if(result.error||!result.data.user)throw Error('Auth creation failed; inspect private state before retry');
   state.id=result.data.user.id;state.stage='AUTH_CREATED';save();
  }
  if(!state.id)throw Error('Interrupted creation requires reconciliation');
  fs.writeFileSync(path.join(root,'admin-acompanhamento-domain.sql'),adminPreviewSql(state.id));
  console.log('PASS: identidade preparada; SQL privado disponível; domínio ainda requer aplicação controlada.');
 }else if(process.env.ERP_ADMIN_ACTION==='generate-link'){
  if(!state?.id)throw Error('Auth state required');
  const result=await admin.auth.admin.getUserById(state.id);
  if(result.error||result.data.user?.email!==state.email||result.data.user.app_metadata.purpose!=='ERP_ADM001_PREVIEW')throw Error('Identity mismatch');
  if(!state.activationUrl||process.env.ERP_ADMIN_REISSUE==='true'){
   const generated=await admin.auth.admin.generateLink({type:'recovery',email:state.email});
   if(generated.error||generated.data.user?.id!==state.id||!generated.data.properties?.hashed_token)throw Error('Link generation failed');
   state.activationUrl='https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev/#definir-senha='+encodeURIComponent(generated.data.properties.hashed_token);
   state.linkGeneratedAt=new Date().toISOString();state.stage='PRIMEIRO_ACESSO_DISPONIVEL';delete state.bootstrapPassword;save();
  }
  fs.writeFileSync(path.join(root,'primeiro-acesso-admin.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Primeiro acesso ERP</title><h1>Primeiro acesso ao ERP</h1><p>Abra o link de uso único e escolha sua senha. Depois, use seu email e a nova senha no login normal. Se expirar, solicite outro link. Não compartilhe este arquivo.</p><p><a rel="noreferrer" href="${state.activationUrl}">Definir minha senha e acessar o ERP</a></p></html>`);
  console.log('PASS: link de primeiro acesso salvo somente em arquivo privado; nenhum email enviado.');
 }else throw Error('Choose create-auth or generate-link');
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('FAIL: provisionamento interrompido; inspecione o estado privado sem publicar credenciais.');process.exitCode=1;});
