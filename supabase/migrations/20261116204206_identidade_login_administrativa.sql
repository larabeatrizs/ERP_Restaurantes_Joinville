-- ADM-002/C2: private canonical login registry; no identity seed, public lookup or grants to profiles.
begin;
create role erp_identity_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant erp_identity_writer to current_user;
grant usage on schema erp,erp_private,auth to erp_identity_writer;
grant execute on function auth.uid() to erp_identity_writer;

alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check(permissao in (
'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO','PRODUTO_LER','PRODUTO_GERIR','PRODUTO_CICLO_VIDA','CALENDARIO_EDITAR','ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA','CATEGORIA_EDITAR','CATEGORIA_CICLO_VIDA','MEDIDA_EDITAR','MEDIDA_CICLO_VIDA','FORNECEDOR_EDITAR','FORNECEDOR_CICLO_VIDA',
'USUARIO_LER','USUARIO_GERIR','USUARIO_CICLO_VIDA'));

create table erp_private.usuario_login (
 usuario_id uuid primary key references erp.usuario(id) on delete restrict,
 login text not null unique check(login ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
 revisao bigint not null default 1 check(revisao>0),
 alterado_em timestamptz not null default now()
);
create table erp_private.auditoria_login (
 id bigint generated always as identity primary key,
 ator_id uuid not null references erp.usuario(id) on delete restrict,
 usuario_id uuid not null references erp.usuario(id) on delete restrict,
 revisao bigint not null check(revisao>0),
 login_anterior text,
 login_novo text not null,
 motivo text not null check(length(motivo) between 3 and 500 and motivo !~ '[[:cntrl:]]'),
 criado_em timestamptz not null default now(),
 unique(usuario_id,revisao)
);
create index auditoria_login_ator_idx on erp_private.auditoria_login(ator_id);
alter table erp_private.usuario_login enable row level security;
alter table erp_private.auditoria_login enable row level security;
create policy identidade_writer on erp_private.usuario_login for all to erp_identity_writer using(true) with check(true);
create policy identidade_auditoria_insert on erp_private.auditoria_login for insert to erp_identity_writer with check(true);
create policy identidade_auditoria_select on erp_private.auditoria_login for select to erp_identity_writer using(true);
revoke all on table erp_private.usuario_login,erp_private.auditoria_login from public,anon,authenticated;
grant select,insert,update on erp_private.usuario_login to erp_identity_writer;
grant select,insert on erp_private.auditoria_login to erp_identity_writer;
grant usage on sequence erp_private.auditoria_login_id_seq to erp_identity_writer;
grant select on erp.usuario,erp.perfil,erp.perfil_permissao to erp_identity_writer;
create policy identidade_usuario_select on erp.usuario for select to erp_identity_writer using(true);
create policy identidade_perfil_select on erp.perfil for select to erp_identity_writer using(true);
create policy identidade_permissao_select on erp.perfil_permissao for select to erp_identity_writer using(true);

-- Internal only: no exposed erp wrapper and no anonymous or authenticated EXECUTE.
-- The future authorized adapter must preserve this actor/capability check.
create function erp_private.usuario_login_salvar(p_usuario uuid,p_login text,p_revisao bigint,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare ator uuid:=auth.uid(); atual erp_private.usuario_login; motivo text;
begin
 if ator is null then raise exception 'Acesso negado' using errcode='PT403';end if;
 if p_usuario is null or p_login is null or p_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$'
  or (p_revisao is not null and p_revisao<=0) or p_motivo is null or length(p_motivo)>500 or p_motivo ~ '[[:cntrl:]]'
 then raise exception 'Cadastro inválido' using errcode='PT422';end if;
 motivo:=regexp_replace(p_motivo,U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$','','g');
 if length(motivo)<3 then raise exception 'Motivo inválido' using errcode='PT422';end if;
 perform pg_advisory_xact_lock(hashtextextended('erp.usuario_login:'||p_usuario::text,0));
 -- Authorization is evaluated after waiting, never inferred from the JWT profile/name.
 if not exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
  join erp.perfil_permissao pp on pp.perfil_id=p.id
  where u.id=ator and u.status='ATIVO' and p.codigo='ADMIN' and pp.permissao='USUARIO_GERIR')
 then raise exception 'Acesso negado' using errcode='PT403';end if;
 if not exists(select 1 from erp.usuario where id=p_usuario) then raise exception 'Cadastro indisponível' using errcode='PT404';end if;
 select * into atual from erp_private.usuario_login where usuario_id=p_usuario for update;
 if found then
  if p_revisao is null or p_revisao<>atual.revisao then raise exception 'Cadastro alterado; atualize a revisão' using errcode='PT412';end if;
  if atual.login=p_login then return jsonb_build_object('login',atual.login,'revisao',atual.revisao::text,'alterado',false);end if;
  update erp_private.usuario_login set login=p_login,revisao=revisao+1,alterado_em=now() where usuario_id=p_usuario;
 else
  if p_revisao is not null then raise exception 'Cadastro alterado; atualize a revisão' using errcode='PT412';end if;
  insert into erp_private.usuario_login(usuario_id,login) values(p_usuario,p_login);
 end if;
 insert into erp_private.auditoria_login(ator_id,usuario_id,revisao,login_anterior,login_novo,motivo)
 select ator,p_usuario,revisao,atual.login,login,motivo from erp_private.usuario_login where usuario_id=p_usuario;
 return (select jsonb_build_object('login',login,'revisao',revisao::text,'alterado',true) from erp_private.usuario_login where usuario_id=p_usuario);
exception when unique_violation then raise exception 'Nome de login indisponível' using errcode='PT409';
end $$;
alter function erp_private.usuario_login_salvar(uuid,text,bigint,text) owner to erp_identity_writer;
revoke all on function erp_private.usuario_login_salvar(uuid,text,bigint,text) from public,anon,authenticated;
revoke erp_identity_writer from current_user;
notify pgrst,'reload schema';
commit;
