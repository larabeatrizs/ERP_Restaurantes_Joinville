-- ADM-003: private provisioning boundary. No account, capability or operational permission seed.
begin;
create role erp_user_admin nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant erp_user_admin to current_user;
grant usage on schema erp,erp_private to erp_user_admin,service_role;
create table erp_private.usuario_contato(
 usuario_id uuid primary key references erp.usuario(id) on delete restrict,
 email text not null unique check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 primeiro_acesso boolean not null default true
);
create table erp_private.usuario_provisionamento(
 id uuid primary key default gen_random_uuid(),
 ator_id uuid not null references erp.usuario(id) on delete restrict,
 login text not null unique check(login ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
 email text not null unique check(email=lower(btrim(email)) and length(email)<=254),
 dados jsonb not null,
 auth_id uuid unique,
 estado text not null default 'PREPARADO' check(estado in ('PREPARADO','AUTH_CRIADA','CONCLUIDO')),
 criado_em timestamptz not null default now(),
 check((estado='PREPARADO' and auth_id is null) or (estado in ('AUTH_CRIADA','CONCLUIDO') and auth_id is not null))
);
create index usuario_provisionamento_ator_idx on erp_private.usuario_provisionamento(ator_id);
create table erp_private.auditoria_usuario(
 id bigint generated always as identity primary key,
 ator_id uuid not null references erp.usuario(id) on delete restrict,
 usuario_id uuid not null references erp.usuario(id) on delete restrict,
 acao text not null check(acao in ('CRIAR','ATIVAR_PRIMEIRO_ACESSO','PRIMEIRO_ACESSO_REEMITIDO')),
 dados jsonb not null,
 criado_em timestamptz not null default now()
);
create index auditoria_usuario_ator_idx on erp_private.auditoria_usuario(ator_id);
create index auditoria_usuario_alvo_idx on erp_private.auditoria_usuario(usuario_id);
do $$ declare t text;begin
 foreach t in array array['usuario_contato','usuario_provisionamento','auditoria_usuario'] loop
  execute format('alter table erp_private.%I enable row level security',t);
  execute format('create policy admin_interno on erp_private.%I for all to erp_user_admin using(true) with check(true)',t);
  execute format('revoke all on erp_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
grant select,insert,update on erp_private.usuario_contato,erp_private.usuario_provisionamento to erp_user_admin;
grant insert on erp_private.auditoria_usuario,erp_private.auditoria_login to erp_user_admin;
grant usage on sequence erp_private.auditoria_usuario_id_seq,erp_private.auditoria_login_id_seq to erp_user_admin;
grant select,insert on erp_private.usuario_login to erp_user_admin;
create policy admin_login on erp_private.usuario_login for all to erp_user_admin using(true) with check(true);
create policy admin_audit_login on erp_private.auditoria_login for insert to erp_user_admin with check(true);
grant select,insert,update on erp.usuario to erp_user_admin;
grant select,insert on erp.usuario_unidade to erp_user_admin;
grant select on erp.perfil,erp.perfil_permissao,erp.unidade to erp_user_admin;
create policy admin_usuarios on erp.usuario for all to erp_user_admin using(true) with check(true);
create policy admin_vinculos on erp.usuario_unidade for all to erp_user_admin using(true) with check(true);
create policy admin_perfil on erp.perfil for select to erp_user_admin using(true);
create policy admin_capacidade on erp.perfil_permissao for select to erp_user_admin using(true);
create policy admin_unidade on erp.unidade for select to erp_user_admin using(true);

create function erp_private.admin_usuarios_servico(p_ator uuid,p_acao text,p_dados jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
#variable_conflict use_variable
declare perfil text;cap text;op erp_private.usuario_provisionamento;v record;dados jsonb;
 login text;email text;nome text;motivo text;pid bigint;alvo uuid;unidades bigint[];q text;off integer;
begin
 if jsonb_typeof(p_dados) is distinct from 'object' or p_acao is null or p_acao not in ('resolver','validar_login','auth_criada','listar','autorizar','preparar','concluir','reemitir_dados','reemitir_registrar') then raise exception 'Dados inválidos' using errcode='PT422';end if;
 if p_acao='resolver' then
  return (select jsonb_build_object('email',c.email,'primeiro_acesso',c.primeiro_acesso) from erp_private.usuario_login l
   join erp_private.usuario_contato c on c.usuario_id=l.usuario_id join erp.usuario u on u.id=l.usuario_id
   where l.login=p_dados->>'login' and (u.status='ATIVO' or (u.status='BLOQUEADO' and c.primeiro_acesso)));
 end if;
 if p_acao='validar_login' then
  alvo:=(p_dados->>'usuario_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('erp.primeiro_acesso:'||alvo::text,0));
  select u.status,c.primeiro_acesso,c.email,l.login into v from erp.usuario u
   left join erp_private.usuario_contato c on c.usuario_id=u.id left join erp_private.usuario_login l on l.usuario_id=u.id
   where u.id=alvo for update of u;
  if not found or v.status='INATIVO' or (v.status='BLOQUEADO' and coalesce(v.primeiro_acesso,false)=false)
   or (v.email is not null and (v.email<>p_dados->>'email' or v.login<>p_dados->>'login'))
  then raise exception 'Acesso negado' using errcode='PT403';end if;
  if v.status='BLOQUEADO' and v.primeiro_acesso then
   update erp.usuario set status='ATIVO' where id=alvo;
   update erp_private.usuario_contato set primeiro_acesso=false where usuario_id=alvo;
   insert into erp_private.auditoria_usuario(ator_id,usuario_id,acao,dados) values(alvo,alvo,'ATIVAR_PRIMEIRO_ACESSO','{"autenticacao":"PASSWORD"}');
  end if;
  return jsonb_build_object('permitido',true);
 end if;
 if p_acao='auth_criada' then
  select * into op from erp_private.usuario_provisionamento where id=(p_dados->>'operacao')::uuid for update;
  if not found or op.ator_id is distinct from p_ator or (op.auth_id is not null and op.auth_id<>(p_dados->>'auth_id')::uuid)
   then raise exception 'Operação indisponível' using errcode='PT409';end if;
  if op.estado='PREPARADO' then update erp_private.usuario_provisionamento set auth_id=(p_dados->>'auth_id')::uuid,estado='AUTH_CRIADA' where id=op.id;end if;
  return jsonb_build_object('registrado',true);
 end if;
 if p_acao='concluir' then
  select * into op from erp_private.usuario_provisionamento where id=(p_dados->>'operacao')::uuid for update;
 end if;
 if p_acao in ('reemitir_dados','reemitir_registrar') then perform id from erp.usuario where id=(p_dados->>'usuario_id')::uuid for update;end if;
 select p.codigo into perfil from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id=p_ator and u.status='ATIVO';
 cap:=case when p_acao='listar' then 'USUARIO_LER' else 'USUARIO_GERIR' end;
 if perfil is null or (p_acao='listar' and perfil not in ('ADMIN','GESTOR_CENTRAL','AUDITOR')) or (p_acao<>'listar' and perfil<>'ADMIN')
  or not exists(select 1 from erp.usuario u join erp.perfil_permissao pp on pp.perfil_id=u.perfil_id where u.id=p_ator and pp.permissao=cap)
 then raise exception 'Acesso negado' using errcode='PT403';end if;
 if p_acao='autorizar' then return jsonb_build_object('permitido',true);end if;
 if p_acao in ('reemitir_dados','reemitir_registrar') then
  alvo:=(p_dados->>'usuario_id')::uuid;
  select c.email into email from erp_private.usuario_contato c join erp.usuario u on u.id=c.usuario_id
   where u.id=alvo and u.status='BLOQUEADO' and c.primeiro_acesso and exists(select 1 from erp_private.usuario_provisionamento o where o.auth_id=alvo and o.estado='CONCLUIDO');
  if not found then raise exception 'Primeiro acesso indisponível para esta conta' using errcode='PT409';end if;
  if p_acao='reemitir_registrar' then insert into erp_private.auditoria_usuario(ator_id,usuario_id,acao,dados) values(p_ator,alvo,'PRIMEIRO_ACESSO_REEMITIDO','{}');end if;
  return jsonb_build_object('usuario_id',alvo,'email',email);
 end if;
 if p_acao='listar' then
  q:=coalesce(p_dados->>'q','');off:=coalesce((p_dados->>'offset')::integer,0);
  if length(q)>200 or off<0 then raise exception 'Filtro inválido' using errcode='PT422';end if;
  return jsonb_build_object('pode_criar',perfil='ADMIN' and exists(select 1 from erp.usuario u join erp.perfil_permissao pp on pp.perfil_id=u.perfil_id where u.id=p_ator and pp.permissao='USUARIO_GERIR'),
   'unidades',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'codigo',codigo,'nome',nome) order by codigo),'[]') from erp.unidade where status='ATIVO'),
   'perfis',(select coalesce(jsonb_agg(codigo order by codigo),'[]') from erp.perfil),
   'usuarios',(select coalesce(jsonb_agg(x.obj order by x.nome,x.id),'[]') from
    (select u.nome,u.id,jsonb_build_object('id',u.id,'nome',u.nome,'login',l.login,'email',c.email,'perfil',p.codigo,'status',u.status,'primeiro_acesso',coalesce(c.primeiro_acesso,false),
     'unidades',(select coalesce(jsonb_agg(unidade_id::text order by unidade_id),'[]') from erp.usuario_unidade where usuario_id=u.id)) obj
     from erp.usuario u join erp.perfil p on p.id=u.perfil_id left join erp_private.usuario_login l on l.usuario_id=u.id left join erp_private.usuario_contato c on c.usuario_id=u.id
     where strpos(lower(u.nome||' '||coalesce(l.login,'')||' '||coalesce(c.email,'')),lower(q))>0 order by u.nome,u.id limit 25 offset off) x),
   'total',(select count(*) from erp.usuario u left join erp_private.usuario_login l on l.usuario_id=u.id left join erp_private.usuario_contato c on c.usuario_id=u.id
    where strpos(lower(u.nome||' '||coalesce(l.login,'')||' '||coalesce(c.email,'')),lower(q))>0));
 end if;
 if p_acao='preparar' then
  login:=p_dados->>'login';email:=p_dados->>'email';nome:=p_dados->>'nome';motivo:=p_dados->>'motivo';
  if login is null or login !~ '^[a-z0-9][a-z0-9._-]{2,39}$' or nome is null or length(btrim(nome)) not between 1 and 200
   or email is null or email<>lower(btrim(email)) or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or motivo is null or length(btrim(motivo)) not between 3 and 500 or p_dados->>'status' is distinct from 'ATIVO' or p_dados->'revisao' is distinct from 'null'::jsonb
   or jsonb_typeof(p_dados->'unidades') is distinct from 'array' or jsonb_array_length(p_dados->'unidades')=0
  then raise exception 'Revise o cadastro' using errcode='PT422';end if;
  select array_agg(value::bigint) into unidades from jsonb_array_elements_text(p_dados->'unidades');
  if cardinality(unidades)<>(select count(distinct x) from unnest(unidades) x)
   or cardinality(unidades)<>(select count(*) from erp.unidade where id=any(unidades) and status='ATIVO')
   or not exists(select 1 from erp.perfil where codigo=p_dados->>'perfil') then raise exception 'Perfil/unidade indisponível' using errcode='PT422';end if;
  perform pg_advisory_xact_lock(hashtextextended('erp.admin_cadastro:'||login,0));
  if not exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id join erp.perfil_permissao pp on pp.perfil_id=p.id
   where u.id=p_ator and u.status='ATIVO' and p.codigo='ADMIN' and pp.permissao='USUARIO_GERIR') then raise exception 'Acesso negado' using errcode='PT403';end if;
  select * into op from erp_private.usuario_provisionamento where usuario_provisionamento.login=login;
  if found then
   if op.ator_id<>p_ator or op.dados<>p_dados then raise exception 'Cadastro já existente ou em andamento' using errcode='PT409';end if;
  else
   if exists(select 1 from erp_private.usuario_login l where l.login=login) then raise exception 'Login indisponível' using errcode='PT409';end if;
   insert into erp_private.usuario_provisionamento(ator_id,login,email,dados) values(p_ator,login,email,p_dados) returning * into op;
  end if;
  return jsonb_build_object('operacao',op.id,'auth_id',op.auth_id,'estado',op.estado);
 end if;
 if p_acao='concluir' then
  if not found or op.ator_id<>p_ator or op.auth_id is null then raise exception 'Operação indisponível' using errcode='PT409';end if;
  if op.estado='CONCLUIDO' then return jsonb_build_object('usuario_id',op.auth_id,'criado',false);end if;
  dados:=op.dados;select id into pid from erp.perfil where codigo=dados->>'perfil';
  select array_agg(value::bigint) into unidades from jsonb_array_elements_text(dados->'unidades');
  if cardinality(unidades)<>(select count(*) from erp.unidade where id=any(unidades) and status='ATIVO') then raise exception 'Unidade indisponível' using errcode='PT409';end if;
  insert into erp.usuario(id,perfil_id,nome,status) values(op.auth_id,pid,dados->>'nome','BLOQUEADO');
  insert into erp.usuario_unidade select op.auth_id,unnest(unidades);
  insert into erp_private.usuario_contato(usuario_id,email) values(op.auth_id,op.email);
  insert into erp_private.usuario_login(usuario_id,login) values(op.auth_id,op.login);
  insert into erp_private.auditoria_login(ator_id,usuario_id,revisao,login_novo,motivo) values(p_ator,op.auth_id,1,op.login,dados->>'motivo');
  insert into erp_private.auditoria_usuario(ator_id,usuario_id,acao,dados) values(p_ator,op.auth_id,'CRIAR',jsonb_build_object('perfil',dados->>'perfil','unidades',dados->'unidades','primeiro_acesso',true));
  update erp_private.usuario_provisionamento set estado='CONCLUIDO' where id=op.id;
  return jsonb_build_object('usuario_id',op.auth_id,'criado',true);
 end if;
 raise exception 'Operação inválida' using errcode='PT422';
exception when unique_violation then raise exception 'Cadastro já existente ou em andamento' using errcode='PT409';
 when invalid_text_representation or numeric_value_out_of_range then raise exception 'Dados inválidos' using errcode='PT422';
end $$;
grant create on schema erp_private to erp_user_admin;
alter function erp_private.admin_usuarios_servico(uuid,text,jsonb) owner to erp_user_admin;
revoke create on schema erp_private from erp_user_admin;
revoke all on function erp_private.admin_usuarios_servico(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function erp_private.admin_usuarios_servico(uuid,text,jsonb) to service_role;
create function erp.admin_usuarios_servico(p_ator uuid,p_acao text,p_dados jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select erp_private.admin_usuarios_servico(p_ator,p_acao,p_dados)$$;
revoke all on function erp.admin_usuarios_servico(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function erp.admin_usuarios_servico(uuid,text,jsonb) to service_role;
revoke erp_user_admin from current_user;
notify pgrst,'reload schema';commit;
