// Opt-in fixture only. No email delivery, account reset, personal lookup or default execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
if (process.env.ERP_ADM003_ENABLE_SYNTHETIC_BOOTSTRAP !== 'true') throw Error('Explicit synthetic bootstrap flag required.');
const repo = await fs.realpath(fileURLToPath(new URL('../../', import.meta.url)));
const file = await fs.realpath(process.env.ERP_STOCK_TEST_STATE ?? '');
const relative = path.relative(repo, file);
if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) throw Error('State must be outside checkout.');
const stock = JSON.parse(await fs.readFile(file, 'utf8'));
if (stock.projectRef !== 'vpowsedoajpdbeckimuv' || stock.url !== 'https://vpowsedoajpdbeckimuv.supabase.co' || !/^[1-9]\d*$/.test(String(stock.units.A))) throw Error('Confirmed staging required.');
const root = path.dirname(file), stateFile = path.join(root, 'adm003-identidades.json');
const runtimeFile = path.join(root, '../identity-service/runtime-private.json');
const runtime = JSON.parse(await fs.readFile(runtimeFile, 'utf8'));
if (runtime.SUPABASE_URL !== stock.url || !runtime.SUPABASE_ADMIN_KEY) throw Error('Isolated identity credentials required.');
const client = createClient(stock.url, runtime.SUPABASE_ADMIN_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let state;
try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (state) {
  if (state.projectRef !== stock.projectRef || state.admin.email !== 'adm003-admin-a@example.invalid' || state.admin.login !== 'stg.adm003.admin') throw Error('Fixture identity mismatch.');
  const current = await client.auth.admin.getUserById(state.admin.id);
  if (current.error || current.data.user?.email !== state.admin.email) throw Error('Existing fixture requires reconciliation; no reset performed.');
} else {
  const password = `${randomBytes(24).toString('base64url')}aA1!`;
  const created = await client.auth.admin.createUser({ email: 'adm003-admin-a@example.invalid', password, email_confirm: true });
  if (created.error || !created.data.user || created.data.user.email !== 'adm003-admin-a@example.invalid') throw Error('Synthetic fixture creation failed; no existing account reset.');
  state = { projectRef: stock.projectRef, url: stock.url, units: stock.units, admin: { id: created.data.user.id, login: 'stg.adm003.admin', email: 'adm003-admin-a@example.invalid', password } };
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}
if (!/^[a-f0-9-]{36}$/.test(state.admin.id)) throw Error('Invalid fixture id.');
runtime.SYNTHETIC_ADMIN_ID = state.admin.id;
await fs.writeFile(runtimeFile, JSON.stringify(runtime, null, 2), { mode: 0o600 });
const id = state.admin.id, unit = String(stock.units.A);
const sql = `begin;
do $$ begin
 if not exists(select 1 from auth.users where id='${id}'::uuid and email='adm003-admin-a@example.invalid') then raise exception 'Reserved Auth fixture required';end if;
 if not exists(select 1 from erp.unidade where id=${unit} and codigo='STG-INT003-A') then raise exception 'Reserved staging unit required';end if;
 if exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id='${id}'::uuid and (p.codigo<>'ADMIN' or u.nome<>'Administrador sintético ADM-003' or u.status<>'ATIVO')) then raise exception 'Existing identity conflict; no promotion';end if;
 if exists(select 1 from erp_private.usuario_login where (login='stg.adm003.admin' and usuario_id<>'${id}'::uuid) or (usuario_id='${id}'::uuid and login<>'stg.adm003.admin')) then raise exception 'Login conflict';end if;
 if exists(select 1 from erp_private.usuario_contato where (email='adm003-admin-a@example.invalid' and usuario_id<>'${id}'::uuid) or (usuario_id='${id}'::uuid and (email<>'adm003-admin-a@example.invalid' or primeiro_acesso))) then raise exception 'Contact conflict';end if;
end $$;
insert into erp.usuario(id,perfil_id,nome,status) select '${id}'::uuid,id,'Administrador sintético ADM-003','ATIVO' from erp.perfil where codigo='ADMIN' on conflict(id) do nothing;
insert into erp.usuario_unidade values('${id}'::uuid,${unit}) on conflict do nothing;
insert into erp_private.usuario_login(usuario_id,login) values('${id}'::uuid,'stg.adm003.admin') on conflict do nothing;
insert into erp_private.usuario_contato(usuario_id,email,primeiro_acesso) values('${id}'::uuid,'adm003-admin-a@example.invalid',false) on conflict do nothing;
insert into erp.perfil_permissao select id,p from erp.perfil cross join(values('USUARIO_LER'),('USUARIO_GERIR'))x(p) where codigo='ADMIN' on conflict do nothing;
insert into erp.perfil_permissao select id,'USUARIO_LER' from erp.perfil where codigo in('AUDITOR','GESTOR_CENTRAL') on conflict do nothing;
-- Nutritionist catalog I/X follows DRS 4.2 and the approved shared catalog contract; no receipt write/approval.
insert into erp.perfil_permissao select id,p from erp.perfil cross join(values('PRODUTO_LER'),('PRODUTO_GERIR'),('PRODUTO_CICLO_VIDA'),('ESTOQUE_LER'),('CATEGORIA_EDITAR'),('CATEGORIA_CICLO_VIDA'),('MEDIDA_EDITAR'),('MEDIDA_CICLO_VIDA'),('FORNECEDOR_EDITAR'),('FORNECEDOR_CICLO_VIDA'))x(p) where codigo='NUTRICIONISTA' on conflict do nothing;
commit;
select 'fixture_prepared'::text result;`;
await fs.writeFile(path.join(root, 'adm003-bootstrap.sql'), sql, { mode: 0o600 });
console.log(JSON.stringify({ prepared: true, syntheticOnly: true, domainBootstrapPending: true, existingAccountReset: false }));
