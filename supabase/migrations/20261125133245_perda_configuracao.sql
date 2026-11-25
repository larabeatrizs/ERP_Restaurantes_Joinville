begin;

grant erp_user_admin to current_user;
grant create on schema erp_private to erp_user_admin;
grant execute on function erp_private.ator_autenticado(),auth.uid() to erp_user_admin;
grant execute on function erp_private.estoque_objeto(jsonb,text[],text[]),erp_private.estoque_id(jsonb),
  erp_private.estoque_texto(jsonb,integer,integer) to erp_user_admin;

grant select,insert,update on erp_private.perda_motivo to erp_user_admin;
grant usage on sequence erp_private.perda_motivo_id_seq to erp_user_admin;
grant select,insert,update,delete on erp_private.perda_substituto to erp_user_admin;
create policy perda_motivo_configuracao on erp_private.perda_motivo for all to erp_user_admin using (true) with check (true);
create policy perda_substituto_configuracao on erp_private.perda_substituto for all to erp_user_admin using (true) with check (true);

create table erp_private.perda_configuracao_evento (
  id bigint generated always as identity primary key,
  ator_id uuid not null references erp.usuario(id),
  acao text not null check(acao in ('motivo','substituto')),
  antes jsonb,
  depois jsonb,
  ocorrido_em timestamptz not null default now()
);
alter table erp_private.perda_configuracao_evento enable row level security;
revoke all on erp_private.perda_configuracao_evento from public,anon,authenticated,service_role;
revoke all on sequence erp_private.perda_configuracao_evento_id_seq from public,anon,authenticated,service_role;
grant select,insert on erp_private.perda_configuracao_evento to erp_user_admin;
grant usage on sequence erp_private.perda_configuracao_evento_id_seq to erp_user_admin;
create policy perda_configuracao_evento_leitura on erp_private.perda_configuracao_evento for select to erp_user_admin using (true);
create policy perda_configuracao_evento_registro on erp_private.perda_configuracao_evento for insert to erp_user_admin
  with check (ator_id=(select erp_private.ator_autenticado()));

create function erp_private.perda_configuracao(p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
declare
  ator uuid;
  unidade bigint;
  revisao text;
  acao text;
  motivo_id bigint;
  nome_motivo text;
  exige boolean;
  novo_ativo boolean;
  gestor uuid;
  anterior jsonb;
  posterior jsonb;
begin
  if p_dados is not null then
    if current_setting('transaction_isolation')<>'read committed' then
      raise exception 'A configuração exige READ COMMITTED' using errcode='25000';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('erp.admin_edicao',0));
  else
    perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  end if;
  ator := erp_private.ator_autenticado();
  if not exists (
    select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=ator and u.status='ATIVO' and p.codigo='ADMIN'
      and exists (select 1 from erp.perfil_permissao pp where pp.perfil_id=p.id and pp.permissao='USUARIO_GERIR')
  ) then
    raise exception 'Acesso negado' using errcode='PT403';
  end if;
  select id into unidade from erp.unidade where codigo='RP-BUCAREIN' and status='ATIVO';
  select coalesce(max(id),0)::text into revisao from erp_private.perda_configuracao_evento;

  if p_dados is not null then
    acao := p_dados->>'acao';
    if acao='motivo' then
      perform erp_private.estoque_objeto(p_dados,array['acao','revisao','id','descricao','exige_anexo','ativo']);
    elsif acao='substituto' then
      perform erp_private.estoque_objeto(p_dados,array['acao','revisao','usuario_id']);
    else
      raise exception 'Ação inválida' using errcode='PT422';
    end if;
    if jsonb_typeof(p_dados->'revisao') is distinct from 'string' or p_dados->>'revisao' is distinct from revisao then
      raise exception 'Configuração desatualizada' using errcode='PT409';
    end if;

    if acao='motivo' then
      nome_motivo := erp_private.estoque_texto(p_dados->'descricao',1,200);
      if jsonb_typeof(p_dados->'exige_anexo') is distinct from 'boolean'
        or jsonb_typeof(p_dados->'ativo') is distinct from 'boolean' then
        raise exception 'Campos do motivo inválidos' using errcode='PT422';
      end if;
      exige := (p_dados->>'exige_anexo')::boolean;
      novo_ativo := (p_dados->>'ativo')::boolean;
      if p_dados->'id'<>'null'::jsonb then
        motivo_id := erp_private.estoque_id(p_dados->'id');
        select to_jsonb(m) into anterior from erp_private.perda_motivo m where m.id=motivo_id;
        if not found then raise exception 'Motivo indisponível' using errcode='PT404'; end if;
      end if;
      if exists (select 1 from erp_private.perda_motivo m where lower(m.descricao)=lower(nome_motivo) and m.id is distinct from motivo_id) then
        raise exception 'Motivo duplicado' using errcode='PT409';
      end if;
      if motivo_id is null then
        insert into erp_private.perda_motivo as m(descricao,exige_anexo,ativo) values(nome_motivo,exige,novo_ativo) returning to_jsonb(m) into posterior;
      else
        update erp_private.perda_motivo as m set descricao=nome_motivo,exige_anexo=exige,ativo=novo_ativo
        where m.id=motivo_id returning to_jsonb(m) into posterior;
      end if;
    else
      if unidade is null then raise exception 'Bucarein indisponível' using errcode='PT404'; end if;
      select to_jsonb(s) into anterior from erp_private.perda_substituto s where s.unidade_id=unidade;
      if p_dados->'usuario_id'='null'::jsonb then
        delete from erp_private.perda_substituto where unidade_id=unidade;
      else
        if jsonb_typeof(p_dados->'usuario_id') is distinct from 'string'
          or p_dados->>'usuario_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'Identificador inválido' using errcode='PT422';
        end if;
        gestor := (p_dados->>'usuario_id')::uuid;
        if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
          join erp.usuario_unidade v on v.usuario_id=u.id
          where u.id=gestor and u.status='ATIVO' and p.codigo='GESTOR_UNIDADE' and v.unidade_id=unidade) then
          raise exception 'Gestor indisponível em Bucarein' using errcode='PT422';
        end if;
        insert into erp_private.perda_substituto as s(unidade_id,usuario_id) values(unidade,gestor)
          on conflict (unidade_id) do update set usuario_id=excluded.usuario_id returning to_jsonb(s) into posterior;
      end if;
    end if;
    if anterior is distinct from posterior then
      insert into erp_private.perda_configuracao_evento as e(ator_id,acao,antes,depois) values(ator,acao,anterior,posterior)
        returning e.id::text into revisao;
    end if;
  end if;

  return jsonb_build_object(
    'revisao',revisao,'bucarein',unidade is not null,
    'substituto',(select s.usuario_id::text from erp_private.perda_substituto s where s.unidade_id=unidade),
    'motivos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id::text,'descricao',m.descricao,'exige_anexo',m.exige_anexo,'ativo',m.ativo)
      order by m.descricao,m.id) from erp_private.perda_motivo m),'[]'::jsonb),
    'gestores',coalesce((select jsonb_agg(jsonb_build_object('id',u.id::text,'nome',u.nome) order by u.nome,u.id)
      from erp.usuario u join erp.perfil p on p.id=u.perfil_id join erp.usuario_unidade v on v.usuario_id=u.id
      where u.status='ATIVO' and p.codigo='GESTOR_UNIDADE' and v.unidade_id=unidade),'[]'::jsonb));
end;
$$;

alter function erp_private.perda_configuracao(jsonb) owner to erp_user_admin;
revoke create on schema erp_private from erp_user_admin;
revoke all on function erp_private.perda_configuracao(jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_configuracao(jsonb) to authenticated;
create function erp.perda_configuracao(p_dados jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select erp_private.perda_configuracao(p_dados)
$$;
revoke all on function erp.perda_configuracao(jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.perda_configuracao(jsonb) to authenticated;
revoke erp_user_admin from current_user;

commit;
