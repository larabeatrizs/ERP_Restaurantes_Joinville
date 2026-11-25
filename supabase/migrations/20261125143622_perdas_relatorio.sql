begin;

create index perda_aprovada_periodo_idx on erp_private.perda_estoque(unidade_id,data_registro)
  where estado='APROVADA';

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;
create function erp_private.estoque_perdas_relatorio(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  inicio date;
  anterior date;
  fim date;
  intervalo interval;
  resposta jsonb;
begin
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  if not erp_private.estoque_capacidade(p_unidade,'ESTOQUE_LER') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;

  perform erp_private.estoque_objeto(p_dados,array['inicio','periodicidade']);
  inicio := erp_private.estoque_data(p_dados->'inicio');
  intervalo := case p_dados->>'periodicidade' when 'mensal' then interval '1 month' when 'anual' then interval '1 year' end;
  if p_acao is distinct from 'listar' or intervalo is null or extract(day from inicio)<>1
    or extract(year from inicio) not between 2 and 9998
    or (p_dados->>'periodicidade'='anual' and extract(month from inicio)<>1) then
    raise exception 'Período inválido' using errcode='PT422';
  end if;
  anterior := (inicio-intervalo)::date;
  fim := (inicio+intervalo)::date;

  with perdas as materialized (
    select x.data_registro,x.id,x.lote_id,x.valor_prejuizo,x.motivo_id
    from erp_private.perda_estoque x
    where x.unidade_id=p_unidade and x.estado='APROVADA'
      and x.data_registro>=anterior and x.data_registro<fim
  ), grupos as (
    select m.id as motivo_id,l.id as lote_id,m.descricao as motivo,l.codigo as lote,
      p.descricao as produto,c.descricao as categoria,sum(x.valor_prejuizo) as prejuizo
    from perdas x
    join erp_private.perda_motivo m on m.id=x.motivo_id
    join erp.lote l on l.unidade_id=p_unidade and l.id=x.lote_id
    join erp.produto p on p.id=l.produto_id
    join erp.categoria c on c.id=p.categoria_id
    where x.data_registro>=inicio
    group by m.id,l.id,m.descricao,l.codigo,p.descricao,c.descricao
    order by c.descricao,p.descricao,l.codigo,m.descricao,l.id,m.id limit 10001
  )
  select jsonb_build_object(
    'unidade_id',p_unidade::text,'inicio',to_char(inicio,'YYYY-MM-DD'),
    'inicio_anterior',to_char(anterior,'YYYY-MM-DD'),'periodicidade',p_dados->>'periodicidade',
    'prejuizo_atual',coalesce((select sum(valor_prejuizo) from perdas where data_registro>=inicio),0)::text,
    'prejuizo_anterior',coalesce((select sum(valor_prejuizo) from perdas where data_registro<inicio),0)::text,
    'itens',coalesce((select jsonb_agg(jsonb_build_object(
      'motivo',motivo,'lote',lote,'produto',produto,'categoria',categoria,'prejuizo',prejuizo::text
    ) order by categoria,produto,lote,motivo,lote_id,motivo_id) from grupos),'[]'::jsonb)
  ) into resposta;

  if jsonb_array_length(resposta->'itens')>10000 then
    raise exception 'O período excede o limite do relatório' using errcode='PT422';
  end if;
  return resposta;
end;
$$;

alter function erp_private.estoque_perdas_relatorio(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.estoque_perdas_relatorio(bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.estoque_perdas_relatorio(bigint,text,jsonb) to authenticated;
create function erp.estoque_perdas_relatorio(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
  select erp_private.estoque_perdas_relatorio(p_unidade,p_acao,p_dados)
$$;
revoke all on function erp.estoque_perdas_relatorio(bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.estoque_perdas_relatorio(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;

commit;
