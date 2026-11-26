begin;

create index cardapio_versao_rascunho_lista_idx
  on erp.cardapio_versao(unidade_id,id desc) where estado='RASCUNHO';

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;
create function erp_private.cardapio_consultar_rascunhos(p_unidade bigint,p_versao bigint,p_antes bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  resposta jsonb;
begin
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=(select erp_private.ator_autenticado()) and p.codigo='NUTRICIONISTA') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;
  if p_versao<=0 or p_antes<=0 or (p_versao is not null and p_antes is not null) then
    raise exception 'Identificador inválido' using errcode='PT422';
  end if;

  if p_versao is null then
    with pagina as (
      select v.id,v.cardapio_id,c.inicio,c.fim,c.tipo_periodo,row_number() over (order by v.id desc) as ordem
      from erp.cardapio_versao v join erp.cardapio c on c.unidade_id=v.unidade_id and c.id=v.cardapio_id
      where v.unidade_id=p_unidade and v.estado='RASCUNHO' and (p_antes is null or v.id<p_antes)
      order by v.id desc limit 26
    )
    select jsonb_build_object(
      'rascunhos',coalesce(jsonb_agg(jsonb_build_object(
        'cardapio_id',cardapio_id::text,'versao_id',id::text,'inicio',to_char(inicio,'YYYY-MM-DD'),
        'fim',to_char(fim,'YYYY-MM-DD'),'tipo_periodo',tipo_periodo
      ) order by id desc) filter (where ordem<=25),'[]'::jsonb),
      'proximo',case when count(*)>25 then (min(id) filter (where ordem<=25))::text end
    ) into resposta from pagina;
    return resposta;
  end if;

  select jsonb_build_object(
    'cardapio_id',c.id::text,'versao_id',v.id::text,'inicio',to_char(c.inicio,'YYYY-MM-DD'),
    'fim',to_char(c.fim,'YYYY-MM-DD'),'tipo_periodo',c.tipo_periodo,
    'refeicoes',coalesce((
      select jsonb_agg(jsonb_build_object('data',to_char(d.data,'YYYY-MM-DD'),
        'tipo_refeicao',r.tipo_refeicao,'estimadas',r.estimadas) order by d.data,r.tipo_refeicao)
      from erp.cardapio_dia d join erp.cardapio_refeicao r on r.unidade_id=d.unidade_id and r.cardapio_dia_id=d.id
      where d.unidade_id=v.unidade_id and d.cardapio_versao_id=v.id
    ),'[]'::jsonb)
  ) into resposta
  from erp.cardapio_versao v join erp.cardapio c on c.unidade_id=v.unidade_id and c.id=v.cardapio_id
  where v.unidade_id=p_unidade and v.id=p_versao and v.estado='RASCUNHO';
  if not found then raise exception 'Rascunho indisponível' using errcode='PT404'; end if;
  return resposta;
end;
$$;

alter function erp_private.cardapio_consultar_rascunhos(bigint,bigint,bigint) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.cardapio_consultar_rascunhos(bigint,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function erp_private.cardapio_consultar_rascunhos(bigint,bigint,bigint) to authenticated;
create function erp.cardapio_consultar_rascunhos(p_unidade bigint,p_versao bigint,p_antes bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select erp_private.cardapio_consultar_rascunhos(p_unidade,p_versao,p_antes)
$$;
revoke all on function erp.cardapio_consultar_rascunhos(bigint,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function erp.cardapio_consultar_rascunhos(bigint,bigint,bigint) to authenticated;
revoke erp_stock_writer from current_user;

commit;
