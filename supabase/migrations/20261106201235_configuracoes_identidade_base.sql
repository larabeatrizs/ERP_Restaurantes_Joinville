-- DB-001, recorte 1. Requer auth.users/auth.uid() e roles do Supabase.
-- Nenhum dado de produção, perfil-permissão ou usuário é provisionado aqui.
begin;

create schema erp;
create schema erp_private;
revoke all on schema erp, erp_private from public, anon, authenticated;
grant usage on schema erp, erp_private to authenticated;

create table erp.perfil (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo in (
    'ADMIN','GESTOR_CENTRAL','GESTOR_UNIDADE','NUTRICIONISTA',
    'ESTOQUISTA','COZINHA','ATENDIMENTO_SOCIAL','AUDITOR'
  ))
);
create table erp.usuario (
  id uuid primary key references auth.users(id) on delete restrict,
  perfil_id bigint not null references erp.perfil(id) on delete restrict,
  nome text not null check (length(btrim(nome)) > 0),
  status text not null default 'ATIVO' check (status in ('ATIVO','INATIVO','BLOQUEADO'))
);
create index usuario_perfil_idx on erp.usuario(perfil_id);
create table erp.unidade (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  nome text not null check (length(btrim(nome)) > 0),
  status text not null default 'ATIVO' check (status in ('ATIVO','INATIVO'))
);
create table erp.usuario_unidade (
  usuario_id uuid not null references erp.usuario(id) on delete restrict,
  unidade_id bigint not null references erp.unidade(id) on delete restrict,
  primary key (usuario_id, unidade_id)
);
create index usuario_unidade_unidade_idx on erp.usuario_unidade(unidade_id,usuario_id);
create table erp.perfil_permissao (
  perfil_id bigint not null references erp.perfil(id) on delete restrict,
  permissao text not null check (permissao in (
    'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO'
  )),
  primary key (perfil_id, permissao)
);
create table erp.parametro_unidade (
  unidade_id bigint primary key references erp.unidade(id) on delete restrict,
  modo_saida text not null check (modo_saida in ('PREVIA','POSTERIOR')),
  margem_percentual numeric(5,2) not null default 5 check (margem_percentual between 0 and 100),
  dias_alerta_validade integer not null default 7 check (dias_alerta_validade >= 0),
  prazo_amostra_horas integer not null default 72 check (prazo_amostra_horas > 0),
  periodicidade_inventario_dias integer not null default 7 check (periodicidade_inventario_dias > 0),
  referencia_preco text not null default 'MENOR_COTACAO' check (
    referencia_preco in ('MENOR_COTACAO','ULTIMO_PAGO','MEDIA_LOTES')
  ),
  alerta_email_habilitado boolean not null default false,
  revisao bigint not null default 1 check (revisao > 0),
  motivo_alteracao text not null check (length(btrim(motivo_alteracao)) >= 3),
  criado_por uuid not null references erp.usuario(id) on delete restrict,
  alterado_por uuid not null references erp.usuario(id) on delete restrict,
  criado_em timestamptz not null default now(),
  alterado_em timestamptz not null default now()
);
create index parametro_criado_por_idx on erp.parametro_unidade(criado_por);
create index parametro_alterado_por_idx on erp.parametro_unidade(alterado_por);
create table erp.auditoria_configuracao (
  id bigint generated always as identity primary key,
  unidade_id bigint not null references erp.unidade(id) on delete restrict,
  ator_id uuid not null references erp.usuario(id) on delete restrict,
  revisao bigint not null,
  acao text not null check (acao in ('INSERT','UPDATE')),
  motivo text not null check (length(btrim(motivo)) >= 3),
  antes jsonb,
  depois jsonb not null,
  ocorrido_em timestamptz not null default now(),
  unique (unidade_id,revisao)
);
create index auditoria_configuracao_ator_idx on erp.auditoria_configuracao(ator_id);

alter table erp.perfil enable row level security;
alter table erp.usuario enable row level security;
alter table erp.unidade enable row level security;
alter table erp.usuario_unidade enable row level security;
alter table erp.perfil_permissao enable row level security;
alter table erp.parametro_unidade enable row level security;
alter table erp.auditoria_configuracao enable row level security;

create policy perfil_consulta on erp.perfil for select to authenticated using (true);
create policy usuario_proprio on erp.usuario for select to authenticated using (id = (select auth.uid()));
create policy vinculo_proprio on erp.usuario_unidade for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy permissao_propria on erp.perfil_permissao for select to authenticated using (
  exists (select 1 from erp.usuario u where u.id = (select auth.uid()) and u.perfil_id = perfil_permissao.perfil_id)
);

create function erp_private.pode_ler_configuracao(p_unidade bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from erp.usuario u
    join erp.usuario_unidade v on v.usuario_id = u.id
    join erp.perfil_permissao p on p.perfil_id = u.perfil_id
    where u.id = (select auth.uid()) and u.status = 'ATIVO'
      and v.unidade_id = p_unidade and p.permissao = 'CONFIGURACAO_LER'
  )
$$;
revoke all on function erp_private.pode_ler_configuracao(bigint) from public, anon;
grant execute on function erp_private.pode_ler_configuracao(bigint) to authenticated;

create policy unidade_vinculada on erp.unidade for select to authenticated using (
  exists (select 1 from erp.usuario_unidade v join erp.usuario u on u.id = v.usuario_id
    where v.unidade_id = unidade.id and u.id = (select auth.uid()) and u.status = 'ATIVO')
);
create policy parametro_consulta on erp.parametro_unidade for select to authenticated using (
  erp_private.pode_ler_configuracao(unidade_id)
  and exists (select 1 from erp.unidade un where un.id = unidade_id and un.status = 'ATIVO')
);
create policy auditoria_consulta on erp.auditoria_configuracao for select to authenticated using (
  erp_private.pode_ler_configuracao(unidade_id)
  and exists (select 1 from erp.usuario u join erp.perfil_permissao p on p.perfil_id = u.perfil_id
    where u.id = (select auth.uid()) and p.permissao = 'CONFIGURACAO_HISTORICO')
  and exists (select 1 from erp.unidade un where un.id = unidade_id and un.status = 'ATIVO')
);

create function erp_private.preparar_parametro()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare ator uuid := auth.uid();
begin
  if not exists (select 1 from erp.usuario where id = ator and status = 'ATIVO') then
    raise exception 'Ator ativo obrigatório' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.unidade_id <> old.unidade_id then
      raise exception 'Unidade da configuração é imutável' using errcode = '23514';
    end if;
    new.revisao := old.revisao + 1;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  else
    new.revisao := 1;
    new.criado_por := ator;
  end if;
  new.alterado_por := ator;
  new.alterado_em := now();
  return new;
end
$$;
create function erp_private.auditar_parametro()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into erp.auditoria_configuracao(unidade_id,ator_id,revisao,acao,motivo,antes,depois)
  values (new.unidade_id,auth.uid(),new.revisao,tg_op,new.motivo_alteracao,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end
$$;
create function erp_private.negar_mutacao_auditoria()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Auditoria não pode ser alterada ou excluída' using errcode = '42501';
end
$$;
revoke all on function erp_private.preparar_parametro(),
  erp_private.auditar_parametro(), erp_private.negar_mutacao_auditoria() from public, anon, authenticated;
create trigger parametro_preparar before insert or update on erp.parametro_unidade
  for each row execute function erp_private.preparar_parametro();
create trigger parametro_auditar after insert or update on erp.parametro_unidade
  for each row execute function erp_private.auditar_parametro();
create trigger auditoria_imutavel before update or delete on erp.auditoria_configuracao
  for each row execute function erp_private.negar_mutacao_auditoria();

revoke all on all tables in schema erp from public, anon, authenticated;
revoke all on all sequences in schema erp from public, anon, authenticated;
grant select on all tables in schema erp to authenticated;
-- Sem grants ou policies de escrita ao cliente. CONFIGURACAO_EDITAR é reservada
-- para a futura operação mediada, não habilita DML direto neste recorte.
commit;
