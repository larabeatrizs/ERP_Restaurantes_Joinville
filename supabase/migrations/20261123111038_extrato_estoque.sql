begin;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.estoque_extrato(p_unidade bigint, p_acao text, p_dados jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  produto bigint;
  lote bigint;
  inicio date;
  fim date;
  tipo text;
  pagina integer;
  limite integer;
  medida text;
  resposta jsonb;
begin
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;
  if not erp_private.estoque_capacidade(p_unidade, 'ESTOQUE_LER') then
    raise exception 'Ação não permitida' using errcode = 'PT403';
  end if;
  if p_acao is null or p_acao not in ('listar', 'exportar') or jsonb_typeof(p_dados) is distinct from 'object'
    or p_dados - array['produto_id','lote_id','data_inicio','data_fim','tipo','offset'] <> '{}'::jsonb then
    raise exception 'Filtros inválidos' using errcode = 'PT422';
  end if;

  produto := erp_private.estoque_id(p_dados->'produto_id');
  if p_dados ? 'lote_id' then lote := erp_private.estoque_id(p_dados->'lote_id'); end if;
  if (p_dados ? 'tipo' and coalesce(p_dados->>'tipo', '') not in ('ENTRADA','REQUISICAO_RAPIDA'))
    or (p_dados ? 'offset' and (jsonb_typeof(p_dados->'offset') <> 'number'
      or coalesce(p_dados->>'offset', '') !~ '^(0|[1-9][0-9]{0,9})$')) then
    raise exception 'Filtros inválidos' using errcode = 'PT422';
  end if;
  if p_dados ? 'data_inicio' then inicio := erp_private.estoque_data(p_dados->'data_inicio'); end if;
  if p_dados ? 'data_fim' then fim := erp_private.estoque_data(p_dados->'data_fim'); end if;
  begin
    pagina := coalesce((p_dados->>'offset')::integer, 0);
  exception when numeric_value_out_of_range then
    raise exception 'Filtros inválidos' using errcode = 'PT422';
  end;
  if inicio > fim or (p_acao = 'exportar' and pagina <> 0) then
    raise exception 'Filtros inválidos' using errcode = 'PT422';
  end if;
  tipo := p_dados->>'tipo';
  limite := case p_acao when 'exportar' then 10000 else 50 end;

  select um.sigla into medida
    from erp.produto_unidade pu
    join erp.produto p on p.id = pu.produto_id
    join erp.unidade_medida um on um.id = p.unidade_medida_id
    where pu.unidade_id = p_unidade and pu.produto_id = produto;
  if not found or (lote is not null and not exists (
    select 1 from erp.lote l where l.unidade_id = p_unidade and l.id = lote and l.produto_id = produto
  )) then
    raise exception 'Seleção indisponível' using errcode = 'PT404';
  end if;

  with livro as materialized (
    select m.id, m.ocorrido_em, m.lote_id, l.codigo as codigo_lote, c.nome as local,
      case when m.entrada_item_id is not null then 'ENTRADA' else 'REQUISICAO_RAPIDA' end as origem,
      m.quantidade_delta,
      sum(m.quantidade_delta) over (order by m.ocorrido_em, m.id rows unbounded preceding) as saldo_apos
    from erp.lote l
    join erp.movimento_estoque m on m.unidade_id = l.unidade_id and m.lote_id = l.id
    join erp.camara c on c.unidade_id = m.unidade_id and c.id = m.camara_id
    where l.unidade_id = p_unidade and l.produto_id = produto and (lote is null or l.id = lote)
  ), filtrado as (
    select * from livro
    where (inicio is null or ocorrido_em >= inicio::timestamp at time zone 'America/Sao_Paulo')
      and (fim is null or ocorrido_em < (fim + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (tipo is null or origem = tipo)
  ), linhas as (
    select * from filtrado order by ocorrido_em, id limit limite offset pagina
  )
  select jsonb_build_object(
    'unidade_id', p_unidade::text, 'produto_id', produto::text, 'lote_id', lote::text,
    'unidade_medida', medida, 'saldo_corrente', (select coalesce(sum(quantidade_delta), 0)::text from livro),
    'total', (select count(*) from filtrado),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id::text, 'ocorrido_em', to_char(ocorrido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'lote_id', lote_id::text, 'lote', codigo_lote, 'local', local, 'tipo', origem,
      'quantidade', quantidade_delta::text, 'saldo_apos', saldo_apos::text
    ) order by ocorrido_em, id) from linhas), '[]'::jsonb)
  ) into resposta;
  return resposta;
end;
$$;

alter function erp_private.estoque_extrato(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.estoque_extrato(bigint,text,jsonb) from public, anon;
grant execute on function erp_private.estoque_extrato(bigint,text,jsonb) to authenticated;

create function erp.estoque_extrato(p_unidade bigint, p_acao text, p_dados jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select erp_private.estoque_extrato(p_unidade, p_acao, p_dados)
$$;
revoke all on function erp.estoque_extrato(bigint,text,jsonb) from public, anon;
grant execute on function erp.estoque_extrato(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
commit;
