begin;

create or replace function erp_private.prato_ficha_web(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  busca text;
  cursor_id bigint;
  filtro_tipo text;
begin
  if p_acao='listar' then
    if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
    if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
      where u.id=(select erp_private.ator_autenticado())
        and p.codigo in ('ADMIN','GESTOR_CENTRAL','GESTOR_UNIDADE','NUTRICIONISTA','ESTOQUISTA','COZINHA','AUDITOR')) then
      raise exception 'Ação não permitida' using errcode='PT403';
    end if;
    perform erp_private.estoque_objeto(p_dados,array['q'],array['tipo','antes']);
    busca := erp_private.estoque_normalizar(erp_private.estoque_texto(p_dados->'q',0,200));
    if p_dados ? 'antes' then cursor_id := erp_private.estoque_id(p_dados->'antes'); end if;
    if p_dados ? 'tipo' then
      filtro_tipo := erp_private.estoque_texto(p_dados->'tipo',1,30);
      if filtro_tipo not in ('ARROZ','FEIJAO','PROTEINA','GUARNICAO','SALADA','SOBREMESA_FRUTA',
        'BEBIDA','PANIFICACAO','ACOMPANHAMENTO','FRUTA','BOLO_DOCE') then
        raise exception 'Tipo de prato inválido' using errcode='PT422';
      end if;
    end if;
    return (
      with pagina as (
        select p.id,p.descricao,p.tipo_prato,p.status,v.numero,v.rendimento_porcoes,
          row_number() over (order by p.id desc) as ordem
        from erp.prato p join lateral (
          select pv.id,pv.numero,pv.rendimento_porcoes from erp.prato_versao pv
          where pv.prato_id=p.id order by pv.numero desc limit 1
        ) v on true
        where (cursor_id is null or p.id<cursor_id)
          and (filtro_tipo is null or p.tipo_prato=filtro_tipo)
          and (busca='' or strpos(p.descricao_normalizada,busca)>0 or exists (
            select 1 from erp.prato_item i join erp.produto pr on pr.id=i.produto_id
            where i.prato_versao_id=v.id and strpos(pr.descricao_normalizada||' '||pr.complemento_normalizado,busca)>0
          ))
        order by p.id desc limit 26
      )
      select jsonb_build_object(
        'pratos',coalesce(jsonb_agg(jsonb_build_object(
          'id',id::text,'descricao',descricao,'tipo_prato',tipo_prato,'status',status,
          'numero',numero,'rendimento_porcoes',rendimento_porcoes
        ) order by id desc) filter (where ordem<=25),'[]'::jsonb),
        'proximo',case when count(*)>25 then (min(id) filter (where ordem<=25))::text end
      ) from pagina
    );
  end if;
  if p_acao is distinct from 'insumos' then
    return erp_private.prato_primeira_ficha(p_unidade,p_acao,p_dados);
  end if;
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=(select erp_private.ator_autenticado()) and p.codigo='NUTRICIONISTA') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;
  perform erp_private.estoque_objeto(p_dados,array['q']);
  busca := erp_private.estoque_normalizar(erp_private.estoque_texto(p_dados->'q',0,200));
  return jsonb_build_object('insumos',coalesce((
    select jsonb_agg(jsonb_build_object('id',id::text,'descricao',descricao,'complemento',complemento,
      'unidade',sigla,'fator_correcao',fator_correcao::text,'custo_indireto',tipo_item='DESCARTAVEL') order by nome,id)
    from (
      select p.id,p.descricao,p.complemento,p.descricao_normalizada as nome,m.sigla,p.fator_correcao,c.tipo_item
      from erp.produto p join erp.categoria c on c.id=p.categoria_id
      join erp.unidade_medida m on m.id=p.unidade_medida_id
      where p.status='ATIVO' and c.tipo_item in ('ALIMENTO','DESCARTAVEL')
        and (busca='' or strpos(p.descricao_normalizada||' '||p.complemento_normalizado,busca)>0)
      order by p.descricao_normalizada,p.id limit 25
    ) itens
  ),'[]'::jsonb));
end;
$$;

commit;
