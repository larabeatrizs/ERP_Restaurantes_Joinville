begin;

create function erp_private.estoque_perdas_pode_consolidar(p_unidade bigint)
returns boolean language sql stable security invoker set search_path='' as $$
  select erp_private.estoque_capacidade(p_unidade,'ESTOQUE_LER') and exists (
    select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=(select erp_private.ator_autenticado()) and p.codigo in ('ADMIN','GESTOR_CENTRAL','AUDITOR')
  )
$$;
revoke all on function erp_private.estoque_perdas_pode_consolidar(bigint) from public,anon,authenticated,service_role;
grant execute on function erp_private.estoque_perdas_pode_consolidar(bigint) to erp_stock_writer;

create or replace function erp_private.estoque_perdas_relatorio(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  inicio date;
  anterior date;
  fim date;
  intervalo interval;
  resposta jsonb;
  filtro_produto text;
  filtro_categoria text;
  filtro_lote text;
  filtro_fornecedor text;
  filtro_motivo text;
  consolidado boolean;
  unidades bigint[];
  nomes_unidades jsonb;
begin
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  if not erp_private.estoque_capacidade(p_unidade,'ESTOQUE_LER') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;

  perform erp_private.estoque_objeto(p_dados,array['inicio','periodicidade'],
    array['produto','categoria','lote','fornecedor','motivo','escopo']);
  consolidado := p_dados ? 'escopo';
  if consolidado and p_dados->>'escopo' is distinct from 'consolidado' then
    raise exception 'Escopo inválido' using errcode='PT422';
  end if;
  if consolidado and not erp_private.estoque_perdas_pode_consolidar(p_unidade) then
    raise exception 'Visão consolidada indisponível' using errcode='PT403';
  end if;
  if consolidado then
    select array_agg(u.id order by u.id),jsonb_agg(jsonb_build_object('id',u.id::text,'nome',u.nome) order by u.id)
      into unidades,nomes_unidades
      from erp.unidade u where erp_private.estoque_vinculado(u.id);
  else
    unidades := array[p_unidade];
  end if;
  if p_dados ? 'produto' then filtro_produto := lower(erp_private.estoque_texto(p_dados->'produto',1,200)); end if;
  if p_dados ? 'categoria' then filtro_categoria := lower(erp_private.estoque_texto(p_dados->'categoria',1,200)); end if;
  if p_dados ? 'lote' then filtro_lote := lower(erp_private.estoque_texto(p_dados->'lote',1,100)); end if;
  if p_dados ? 'fornecedor' then filtro_fornecedor := lower(erp_private.estoque_texto(p_dados->'fornecedor',1,200)); end if;
  if p_dados ? 'motivo' then filtro_motivo := lower(erp_private.estoque_texto(p_dados->'motivo',1,200)); end if;
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
    select x.data_registro,x.valor_prejuizo,x.unidade_id,m.id as motivo_id,l.id as lote_id,
      m.descricao as motivo,l.codigo as lote,p.descricao as produto,c.descricao as categoria
    from erp_private.perda_estoque x
    join erp_private.perda_motivo m on m.id=x.motivo_id
    join erp.lote l on l.unidade_id=x.unidade_id and l.id=x.lote_id
    join erp.produto p on p.id=l.produto_id
    join erp.categoria c on c.id=p.categoria_id
    where x.unidade_id=any(unidades) and x.estado='APROVADA'
      and x.data_registro>=anterior and x.data_registro<fim
      and (filtro_produto is null or strpos(lower(concat_ws(' ',p.descricao,nullif(p.complemento,''))),filtro_produto)>0)
      and (filtro_categoria is null or strpos(lower(c.descricao),filtro_categoria)>0)
      and (filtro_lote is null or strpos(lower(l.codigo),filtro_lote)>0)
      and (filtro_motivo is null or strpos(lower(m.descricao),filtro_motivo)>0)
      and (filtro_fornecedor is null or exists (
        select 1 from erp.entrada_item i
        join erp.entrada e on e.unidade_id=i.unidade_id and e.id=i.entrada_id
        join erp.fornecedor f on f.id=e.fornecedor_id
        where i.unidade_id=l.unidade_id and i.id=l.entrada_item_id
          and strpos(lower(f.razao_social),filtro_fornecedor)>0
      ))
  ), grupos as (
    select unidade_id,motivo_id,lote_id,motivo,lote,produto,categoria,sum(valor_prejuizo) as prejuizo
    from perdas where data_registro>=inicio
    group by unidade_id,motivo_id,lote_id,motivo,lote,produto,categoria
    order by unidade_id,categoria,produto,lote,motivo,lote_id,motivo_id limit 10001
  )
  select jsonb_build_object(
    'unidade_id',p_unidade::text,'inicio',to_char(inicio,'YYYY-MM-DD'),
    'inicio_anterior',to_char(anterior,'YYYY-MM-DD'),'periodicidade',p_dados->>'periodicidade',
    'prejuizo_atual',coalesce((select sum(valor_prejuizo) from perdas where data_registro>=inicio),0)::text,
    'prejuizo_anterior',coalesce((select sum(valor_prejuizo) from perdas where data_registro<inicio),0)::text,
    'itens',coalesce((select jsonb_agg(jsonb_build_object(
      'motivo',motivo,'lote',lote,'produto',produto,'categoria',categoria,'prejuizo',prejuizo::text
    ) || case when consolidado then jsonb_build_object('unidade_id',unidade_id::text) else '{}'::jsonb end
      order by unidade_id,categoria,produto,lote,motivo,lote_id,motivo_id) from grupos),'[]'::jsonb)
  ) into resposta;

  if jsonb_array_length(resposta->'itens')>10000 then
    raise exception 'O período excede o limite do relatório' using errcode='PT422';
  end if;
  if consolidado then
    resposta := resposta || jsonb_build_object('unidades',nomes_unidades);
  end if;
  return resposta;
end;
$$;

do $patch$
declare
  fonte text := pg_get_functiondef('erp_private.estoque_operacao(bigint,text,jsonb)'::regprocedure);
  ponto text := '''divergencia_aprovar'',erp_private.estoque_capacidade(p_unidade,''RECEBIMENTO_APROVAR_DIVERGENCIA'')';
begin
  if strpos(fonte,ponto)=0 then raise exception 'Ponto de integração do contexto de estoque mudou'; end if;
  execute replace(fonte,ponto,ponto||',''perdas_consolidar'',erp_private.estoque_perdas_pode_consolidar(p_unidade)');
end;
$patch$;

commit;
