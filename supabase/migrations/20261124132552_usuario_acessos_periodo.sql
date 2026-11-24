begin;

create table erp_private.usuario_acesso_periodo (
  usuario_id uuid not null,
  unidade_id bigint not null,
  fechar boolean not null,
  reabrir boolean not null,
  primary key (usuario_id, unidade_id),
  foreign key (usuario_id, unidade_id) references erp.usuario_unidade(usuario_id, unidade_id) on delete cascade
);

alter table erp_private.usuario_acesso_periodo enable row level security;
revoke all on erp_private.usuario_acesso_periodo from public, anon, authenticated, service_role;
grant select, insert, update(reabrir) on erp_private.usuario_acesso_periodo to erp_user_admin;
create policy admin_acesso_periodo on erp_private.usuario_acesso_periodo
  for all to erp_user_admin using (true) with check (true);

create function erp_private.usuario_acesso_periodo_auditar()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  acessos jsonb;
begin
  if new.acao = 'EDITAR' and new.dados->'depois'->>'perfil' <> 'GESTOR_CENTRAL' then
    update erp_private.usuario_acesso_periodo set reabrir=false
      where usuario_id=new.usuario_id and reabrir;
    return new;
  end if;
  if new.acao <> 'CRIAR' then return new; end if;

  select p.dados->'acessos_periodo' into acessos
    from erp_private.usuario_provisionamento p
    where p.auth_id=new.usuario_id and p.ator_id=new.ator_id and p.estado='AUTH_CRIADA';
  if acessos is null then return new; end if;
  if jsonb_typeof(acessos) is distinct from 'array' then
    raise exception 'Acessos de período inválidos' using errcode='PT422';
  end if;
  if exists (
    select 1 from jsonb_array_elements(acessos) a
    where jsonb_typeof(a) is distinct from 'object' or a-array['unidade_id','fechar','reabrir']<>'{}'::jsonb
      or jsonb_typeof(a->'unidade_id') is distinct from 'string'
      or not (new.dados->'unidades' @> jsonb_build_array(a->'unidade_id'))
      or jsonb_typeof(a->'fechar') is distinct from 'boolean'
      or jsonb_typeof(a->'reabrir') is distinct from 'boolean'
      or (a->'reabrir'='true'::jsonb and new.dados->>'perfil' is distinct from 'GESTOR_CENTRAL')
  ) or jsonb_array_length(acessos)<>(select count(distinct a->>'unidade_id') from jsonb_array_elements(acessos) a) then
    raise exception 'Acessos de período inválidos' using errcode='PT422';
  end if;

  insert into erp_private.usuario_acesso_periodo(usuario_id,unidade_id,fechar,reabrir)
  select new.usuario_id,(a->>'unidade_id')::bigint,(a->>'fechar')::boolean,(a->>'reabrir')::boolean
  from jsonb_array_elements(acessos) a
  where a->'fechar'='true'::jsonb or a->'reabrir'='true'::jsonb;
  new.dados := new.dados || jsonb_build_object('acessos_periodo',acessos);
  return new;
end;
$$;

revoke all on function erp_private.usuario_acesso_periodo_auditar() from public, anon, authenticated, service_role;
create trigger usuario_acesso_periodo_auditoria before insert on erp_private.auditoria_usuario
  for each row execute function erp_private.usuario_acesso_periodo_auditar();
commit;
