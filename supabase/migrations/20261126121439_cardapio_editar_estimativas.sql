begin;

alter table erp.cardapio_versao add column revisao bigint not null default 1 check (revisao>0);
grant update(revisao) on erp.cardapio_versao to erp_stock_writer;
grant update(estimadas) on erp.cardapio_refeicao to erp_stock_writer;
create policy cardapio_versao_editar_rascunho on erp.cardapio_versao for update to erp_stock_writer
  using (estado='RASCUNHO' and erp_private.estoque_vinculado(unidade_id))
  with check (estado='RASCUNHO' and erp_private.estoque_vinculado(unidade_id));
create policy cardapio_refeicao_editar_rascunho on erp.cardapio_refeicao for update to erp_stock_writer
  using (exists (select 1 from erp.cardapio_dia d join erp.cardapio_versao v
    on v.unidade_id=d.unidade_id and v.id=d.cardapio_versao_id
    where d.unidade_id=cardapio_refeicao.unidade_id and d.id=cardapio_refeicao.cardapio_dia_id and v.estado='RASCUNHO'))
  with check (erp_private.estoque_vinculado(unidade_id));

do $patch$
declare
  fonte text := pg_get_functiondef('erp_private.cardapio_consultar_rascunhos(bigint,bigint,bigint)'::regprocedure);
  ponto text := '''cardapio_id'',c.id::text,''versao_id'',v.id::text';
begin
  if strpos(fonte,ponto)=0 then raise exception 'Ponto de integração do detalhe mudou'; end if;
  execute replace(fonte,ponto,ponto||',''revisao'',v.revisao::text');
end;
$patch$;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;
create function erp_private.cardapio_editar_estimativas(p_unidade bigint,p_versao bigint,p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
declare
  ator uuid;
  atual erp.cardapio_versao;
  esperada bigint;
  item jsonb;
  dia date;
  tipo text;
  refeicoes jsonb;
  antes jsonb;
  depois jsonb;
  alteradas integer;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'A gravação exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=ator and p.codigo='NUTRICIONISTA') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;

  perform erp_private.estoque_objeto(p_dados,array['revisao','refeicoes']);
  esperada := erp_private.estoque_id(p_dados->'revisao');
  refeicoes := p_dados->'refeicoes';
  if p_versao is null or p_versao<=0 or jsonb_typeof(refeicoes) is distinct from 'array' then
    raise exception 'Dados inválidos' using errcode='PT422';
  end if;
  if jsonb_array_length(refeicoes) not between 1 and 93
    or (select count(distinct (value->>'data',value->>'tipo_refeicao')) from jsonb_array_elements(refeicoes))<>jsonb_array_length(refeicoes) then
    raise exception 'Refeições inválidas ou repetidas' using errcode='PT422';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('erp.calendario:'||p_unidade::text,0));
  select v.* into atual from erp.cardapio_versao v
    where v.unidade_id=p_unidade and v.id=p_versao and v.estado='RASCUNHO' for update;
  if not found then raise exception 'Rascunho indisponível' using errcode='PT404'; end if;
  if atual.revisao<>esperada then raise exception 'Rascunho desatualizado' using errcode='PT412'; end if;
  antes := erp_private.cardapio_consultar_rascunhos(p_unidade,p_versao,null);

  for item in select value from jsonb_array_elements(refeicoes) loop
    perform erp_private.estoque_objeto(item,array['data','tipo_refeicao','estimadas']);
    dia := erp_private.estoque_data(item->'data');
    tipo := erp_private.estoque_texto(item->'tipo_refeicao',1,20);
    if jsonb_typeof(item->'estimadas') is distinct from 'number' or item->>'estimadas' !~ '^(0|[1-9][0-9]{0,9})$'
      or (item->>'estimadas')::numeric>2147483647
      or not exists (select 1 from erp.cardapio_dia d join erp.cardapio_refeicao r
        on r.unidade_id=d.unidade_id and r.cardapio_dia_id=d.id
        where d.unidade_id=p_unidade and d.cardapio_versao_id=p_versao and d.data=dia and r.tipo_refeicao=tipo)
      or not exists (select 1 from erp_private.cardapio_grade(p_unidade,dia,dia) g where g.tipo_refeicao=tipo) then
      raise exception 'Refeição ou estimativa indisponível para este dia' using errcode='PT422';
    end if;
  end loop;

  update erp.cardapio_refeicao r set estimadas=m.estimadas
    from erp.cardapio_dia d
    join jsonb_to_recordset(refeicoes) as m(data date,tipo_refeicao text,estimadas integer) on m.data=d.data
    where d.unidade_id=p_unidade and d.cardapio_versao_id=p_versao
      and r.unidade_id=d.unidade_id and r.cardapio_dia_id=d.id and r.tipo_refeicao=m.tipo_refeicao
      and r.estimadas is distinct from m.estimadas;
  get diagnostics alteradas = row_count;
  if alteradas=0 then return antes; end if;
  update erp.cardapio_versao v set revisao=v.revisao+1 where v.unidade_id=p_unidade and v.id=p_versao;
  depois := erp_private.cardapio_consultar_rascunhos(p_unidade,p_versao,null);
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois)
    values(p_unidade,ator,'cardapio_editar_estimativas','cardapio',atual.cardapio_id,antes,depois);
  return depois;
end;
$$;
alter function erp_private.cardapio_editar_estimativas(bigint,bigint,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.cardapio_editar_estimativas(bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.cardapio_editar_estimativas(bigint,bigint,jsonb) to authenticated;
create function erp.cardapio_editar_estimativas(p_unidade bigint,p_versao bigint,p_dados jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.cardapio_editar_estimativas(p_unidade,p_versao,p_dados)
$$;
revoke all on function erp.cardapio_editar_estimativas(bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.cardapio_editar_estimativas(bigint,bigint,jsonb) to authenticated;
revoke erp_stock_writer from current_user;

commit;
