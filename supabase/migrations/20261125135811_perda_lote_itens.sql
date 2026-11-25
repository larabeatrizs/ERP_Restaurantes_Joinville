begin;

create table erp_private.perda_lote_comando (
  unidade_id bigint not null references erp.unidade(id),
  autor_id uuid not null references erp.usuario(id),
  chave uuid not null,
  hash bytea not null check (octet_length(hash)=32),
  resultado jsonb not null check (jsonb_typeof(resultado)='array'),
  primary key (unidade_id,autor_id,chave)
);
alter table erp_private.perda_lote_comando enable row level security;
revoke all on erp_private.perda_lote_comando from public,anon,authenticated,service_role;
grant select,insert on erp_private.perda_lote_comando to erp_stock_writer;
create policy perda_lote_consultar on erp_private.perda_lote_comando for select to erp_stock_writer
  using (erp_private.estoque_vinculado(unidade_id) and autor_id=(select erp_private.ator_autenticado()));
create policy perda_lote_gravar on erp_private.perda_lote_comando for insert to erp_stock_writer
  with check (erp_private.estoque_vinculado(unidade_id) and autor_id=(select erp_private.ator_autenticado()));

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.perda_registrar_lote(p_unidade bigint,p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  ator uuid;
  chave_lote uuid;
  item jsonb;
  itens jsonb;
  dados_comuns jsonb;
  hash_comando bytea;
  anterior erp_private.perda_lote_comando;
  ids jsonb := '[]';
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'A trava de estoque exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=ator and p.codigo='ESTOQUISTA')
    or not exists (select 1 from erp.unidade where id=p_unidade and codigo='RP-BUCAREIN') then
    raise exception 'Registro indisponível para este perfil ou unidade' using errcode='PT403';
  end if;

  perform erp_private.estoque_objeto(p_dados,array['camara_id','data_registro','motivo_id','justificativa','chave','itens'],array['anexo']);
  if jsonb_typeof(p_dados->'itens') is distinct from 'array'
    or jsonb_typeof(p_dados->'chave') is distinct from 'string'
    or p_dados->>'chave' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Lançamento em lote inválido' using errcode='PT422';
  end if;
  if jsonb_array_length(p_dados->'itens') not between 2 and 20 then
    raise exception 'Selecione de 2 a 20 lotes' using errcode='PT422';
  end if;
  for item in select value from jsonb_array_elements(p_dados->'itens') loop
    perform erp_private.estoque_objeto(item,array['lote_id','quantidade']);
    perform erp_private.estoque_id(item->'lote_id');
    perform erp_private.estoque_decimal(item->'quantidade');
  end loop;
  if (select count(distinct value->>'lote_id') from jsonb_array_elements(p_dados->'itens'))
    <> jsonb_array_length(p_dados->'itens') then
    raise exception 'Cada lote deve ser selecionado uma vez' using errcode='PT422';
  end if;
  select jsonb_agg(value order by (value->>'lote_id')::bigint) into itens from jsonb_array_elements(p_dados->'itens');
  dados_comuns := p_dados-array['itens','chave'];
  chave_lote := (p_dados->>'chave')::uuid;
  hash_comando := sha256(convert_to((dados_comuns||jsonb_build_object('itens',itens))::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('erp.perda.lote:'||p_unidade::text||':'||ator::text||':'||chave_lote::text,0));
  select c.* into anterior from erp_private.perda_lote_comando c
    where c.unidade_id=p_unidade and c.autor_id=ator and c.chave=chave_lote;
  if found then
    if anterior.hash<>hash_comando then
      raise exception 'Chave reutilizada com outros dados' using errcode='PT409';
    end if;
    return jsonb_build_object('ids',anterior.resultado);
  end if;

  for item in select value from jsonb_array_elements(itens) loop
    ids := ids || jsonb_build_array(erp_private.perda_registrar_pendente(p_unidade,
      dados_comuns||item||jsonb_build_object('chave',gen_random_uuid()::text))::text);
  end loop;
  insert into erp_private.perda_lote_comando(unidade_id,autor_id,chave,hash,resultado)
    values(p_unidade,ator,chave_lote,hash_comando,ids);
  return jsonb_build_object('ids',ids);
end;
$$;

alter function erp_private.perda_registrar_lote(bigint,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.perda_registrar_lote(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_registrar_lote(bigint,jsonb) to authenticated;
create function erp.perda_registrar_lote(p_unidade bigint,p_dados jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.perda_registrar_lote(p_unidade,p_dados)
$$;
revoke all on function erp.perda_registrar_lote(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.perda_registrar_lote(bigint,jsonb) to authenticated;
revoke erp_stock_writer from current_user;

commit;
