begin;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.estoque_vencimentos(p_unidade bigint, p_acao text, p_dados jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  lotes jsonb;
begin
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;
  if not erp_private.estoque_capacidade(p_unidade, 'ESTOQUE_LER') then
    raise exception 'Ação não permitida' using errcode = 'PT403';
  end if;
  if p_acao is distinct from 'listar' or p_dados is distinct from '{}'::jsonb then
    raise exception 'Filtros inválidos' using errcode = 'PT422';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lote_id', l.id::text, 'lote', l.codigo, 'produto', p.descricao, 'validade', to_char(l.validade, 'YYYY-MM-DD'),
    'unidade_medida', um.sigla, 'quantidade', saldo.quantidade::text, 'valor_unitario', l.valor_unitario::text,
    'situacao', case when l.validade < hoje then 'VENCIDO' else 'A_VENCER' end
  ) order by l.validade, l.id), '[]'::jsonb) into lotes
  from (
    select lote_id, sum(quantidade) as quantidade
    from erp.saldo_lote_local
    where unidade_id = p_unidade and quantidade > 0
    group by lote_id
  ) saldo
  join erp.lote l on l.unidade_id = p_unidade and l.id = saldo.lote_id
  join erp.produto p on p.id = l.produto_id
  join erp.categoria c on c.id = p.categoria_id
  join erp.unidade_medida um on um.id = p.unidade_medida_id
  left join erp.parametro_unidade pu on pu.unidade_id = l.unidade_id
  where l.validade is not null and l.validade - hoje <= coalesce(c.dias_alerta_validade, pu.dias_alerta_validade, 7);

  return jsonb_build_object('unidade_id', p_unidade::text, 'data_referencia', to_char(hoje, 'YYYY-MM-DD'), 'lotes', lotes);
end;
$$;

alter function erp_private.estoque_vencimentos(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.estoque_vencimentos(bigint,text,jsonb) from public, anon;
grant execute on function erp_private.estoque_vencimentos(bigint,text,jsonb) to authenticated;

create function erp.estoque_vencimentos(p_unidade bigint, p_acao text, p_dados jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select erp_private.estoque_vencimentos(p_unidade, p_acao, p_dados)
$$;
revoke all on function erp.estoque_vencimentos(bigint,text,jsonb) from public, anon;
grant execute on function erp.estoque_vencimentos(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
commit;
