begin;
grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;
grant select(id,codigo) on erp.perfil to erp_stock_writer;
create policy estoque_perfil_proprio on erp.perfil for select to erp_stock_writer using (
  exists (select 1 from erp.usuario u where u.perfil_id = perfil.id and u.id = (select erp_private.ator_autenticado()))
);

create function erp_private.estoque_alertas(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  perfil text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  alertas jsonb;
begin
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;
  if p_acao is distinct from 'listar' or p_dados is distinct from '{}'::jsonb then
    raise exception 'Filtros inválidos' using errcode = 'PT422';
  end if;
  select p.codigo into perfil from erp.usuario u join erp.perfil p on p.id=u.perfil_id
  where u.id = (select erp_private.ator_autenticado());

  with posicoes as (
    select l.id,l.produto_id,l.codigo,l.validade,sum(s.quantidade) as quantidade
    from erp.saldo_lote_local s
    join erp.lote l on l.unidade_id=s.unidade_id and l.id=s.lote_id
    where s.unidade_id=p_unidade and s.quantidade>0
    group by l.id
  ), saldos as (
    select produto_id,sum(quantidade) as quantidade from posicoes group by produto_id
  ), itens as (
    select 3 as prioridade, p.id, p.descricao as produto, 'ESTOQUE_MINIMO' as tipo, null::text as lote, null::date as validade
    from erp.produto_unidade pu join erp.produto p on p.id=pu.produto_id
    left join saldos s on s.produto_id=p.id
    where perfil in ('ESTOQUISTA','NUTRICIONISTA') and pu.unidade_id=p_unidade
      and p.status='ATIVO' and coalesce(s.quantidade,0)<=pu.estoque_minimo
    union all
    select case when l.validade<hoje then 1 else 2 end, l.id, p.descricao,
      case when l.validade<hoje then 'LOTE_VENCIDO' else 'LOTE_A_VENCER' end, l.codigo,l.validade
    from posicoes l join erp.produto p on p.id=l.produto_id
    join erp.categoria c on c.id=p.categoria_id
    left join erp.parametro_unidade pu on pu.unidade_id=p_unidade
    where (l.validade<hoje and perfil='GESTOR_UNIDADE')
      or (perfil in ('ESTOQUISTA','GESTOR_UNIDADE') and l.validade>=hoje
        and l.validade-hoje<=coalesce(c.dias_alerta_validade,pu.dias_alerta_validade,7))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id::text,'produto',produto,'tipo',tipo,'lote',lote,'validade',to_char(validade,'YYYY-MM-DD')
  ) order by prioridade,validade,produto,id),'[]'::jsonb) into alertas
  from itens;
  return jsonb_build_object('unidade_id',p_unidade::text,'alertas',alertas);
end;
$$;

alter function erp_private.estoque_alertas(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.estoque_alertas(bigint,text,jsonb) from public,anon;
grant execute on function erp_private.estoque_alertas(bigint,text,jsonb) to authenticated;

create function erp.estoque_alertas(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select erp_private.estoque_alertas(p_unidade,p_acao,p_dados)
$$;
revoke all on function erp.estoque_alertas(bigint,text,jsonb) from public,anon;
grant execute on function erp.estoque_alertas(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
commit;
