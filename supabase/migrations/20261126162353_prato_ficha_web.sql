begin;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;
create function erp_private.prato_ficha_web(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  busca text;
begin
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
alter function erp_private.prato_ficha_web(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.prato_ficha_web(bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.prato_ficha_web(bigint,text,jsonb) to authenticated;
create function erp.prato_ficha_web(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.prato_ficha_web(p_unidade,p_acao,p_dados)
$$;
revoke all on function erp.prato_ficha_web(bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.prato_ficha_web(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;

commit;
