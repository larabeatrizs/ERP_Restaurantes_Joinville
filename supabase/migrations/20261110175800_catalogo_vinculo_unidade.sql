-- CAD-002: vínculo explícito ao catálogo global, sem copiar saldo ou produto.
begin;
grant erp_stock_writer to current_user;

create function erp_private.catalogo_unidade(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 ator uuid:=erp_private.ator_autenticado();
 produto erp.produto; anterior erp.produto_unidade;
 produto_id bigint; revisao bigint; medida_id bigint; categoria_id bigint;
 minimo numeric; maximo numeric; reposicao numeric; consulta text; deslocamento integer; resultado jsonb;
begin
 if ator is null then raise exception 'Acesso negado' using errcode='PT403'; end if;
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if p_acao is null or p_acao not in ('disponiveis','vincular') then raise exception 'Ação inválida' using errcode='PT422'; end if;
 if not erp_private.estoque_capacidade(p_unidade,case when p_acao='vincular' then 'PRODUTO_GERIR' else 'PRODUTO_LER' end) then
  raise exception 'Ação não permitida' using errcode='PT403';
 end if;
 if p_acao='disponiveis' then
  perform erp_private.estoque_objeto(p_dados,array['q','offset']);
  consulta:=erp_private.estoque_normalizar(erp_private.estoque_texto(p_dados->'q',0,200));
  if jsonb_typeof(p_dados->'offset')<>'number' or p_dados->>'offset' !~ '^(0|[1-9][0-9]{0,9})$' then
   raise exception 'Offset inválido' using errcode='PT422';
  end if;
  deslocamento:=(p_dados->>'offset')::integer;
  with candidatos as materialized (
   select p.id,p.revisao,p.descricao,p.complemento,p.descricao_normalizada,p.complemento_normalizado,
    um.sigla as unidade_sigla,c.descricao as categoria_descricao,p.apresentacao_compra,p.armazenamento
   from erp.produto p join erp.unidade_medida um on um.id=p.unidade_medida_id join erp.categoria c on c.id=p.categoria_id
   where p.status='ATIVO' and um.status='ATIVO' and c.status='ATIVO'
    and not exists(select 1 from erp.produto_unidade pu where pu.produto_id=p.id and pu.unidade_id=p_unidade)
    and (consulta='' or strpos(p.descricao_normalizada||' '||p.complemento_normalizado,consulta)>0)
  ), pagina as (
   select * from candidatos order by descricao_normalizada,complemento_normalizado,id limit 50 offset deslocamento
  ) select jsonb_build_object('total',(select count(*) from candidatos),'produtos',coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id::text,'revisao',p.revisao::text,'descricao',p.descricao,'complemento',p.complemento,
    'unidade_sigla',p.unidade_sigla,'categoria_descricao',p.categoria_descricao,'apresentacao_compra',p.apresentacao_compra,
    'armazenamento',p.armazenamento) order by p.descricao_normalizada,p.complemento_normalizado,p.id) from pagina p
  ),'[]'::jsonb)) into resultado;
  return resultado;
 end if;

 perform erp_private.estoque_objeto(p_dados,array['id','revisao','estoque_minimo','estoque_maximo','ponto_reposicao']);
 produto_id:=erp_private.estoque_id(p_dados->'id'); revisao:=erp_private.estoque_id(p_dados->'revisao');
 minimo:=erp_private.estoque_decimal(p_dados->'estoque_minimo');
 maximo:=case when p_dados->'estoque_maximo'<>'null'::jsonb then erp_private.estoque_decimal(p_dados->'estoque_maximo') end;
 reposicao:=case when p_dados->'ponto_reposicao'<>'null'::jsonb then erp_private.estoque_decimal(p_dados->'ponto_reposicao') end;
 if maximo is not null and maximo<minimo then raise exception 'Máximo menor que mínimo' using errcode='PT422'; end if;
 select p.* into produto from erp.produto p where p.id=produto_id;
 if not found then raise exception 'Produto indisponível' using errcode='PT404'; end if;
 medida_id:=produto.unidade_medida_id; categoria_id:=produto.categoria_id;
 -- Mesma ordem da edição: medida, categoria e produto. FOR UPDATE evita upgrade da FK.
 perform 1 from erp.unidade_medida um where um.id=medida_id and um.status='ATIVO' for share;
 if not found then raise exception 'Medida inativa' using errcode='PT422'; end if;
 perform 1 from erp.categoria c where c.id=categoria_id and c.status='ATIVO' for share;
 if not found then raise exception 'Categoria inativa' using errcode='PT422'; end if;
 select p.* into produto from erp.produto p where p.id=produto_id for update;
 if not found then raise exception 'Produto indisponível' using errcode='PT404'; end if;
 -- Revalidar após qualquer espera; claims antigos não mantêm uma concessão revogada.
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if not erp_private.estoque_capacidade(p_unidade,'PRODUTO_GERIR') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 if produto.revisao<>revisao or produto.unidade_medida_id<>medida_id or produto.categoria_id<>categoria_id then
  raise exception 'Produto alterado' using errcode='PT412';
 end if;
 if produto.status<>'ATIVO' then raise exception 'Produto inativo' using errcode='PT422'; end if;
 select pu.* into anterior from erp.produto_unidade pu where pu.unidade_id=p_unidade and pu.produto_id=produto_id;
 if found then
  if anterior.estoque_minimo is distinct from minimo or anterior.estoque_maximo is distinct from maximo
    or anterior.ponto_reposicao is distinct from reposicao then raise exception 'Vínculo já configurado' using errcode='PT409'; end if;
  return jsonb_build_object('produto',erp_private.estoque_produto_json(produto_id,p_unidade));
 end if;
 insert into erp.produto_unidade(unidade_id,produto_id,estoque_minimo,estoque_maximo,ponto_reposicao)
  values(p_unidade,produto_id,minimo,maximo,reposicao);
 resultado:=erp_private.estoque_produto_json(produto_id,p_unidade);
 insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois)
  values(p_unidade,ator,'produto_vincular','produto_unidade',produto_id,null,resultado);
 return jsonb_build_object('produto',resultado);
exception
 when unique_violation then raise exception 'Vínculo concorrente' using errcode='PT409';
 when check_violation or not_null_violation or foreign_key_violation or numeric_value_out_of_range or invalid_text_representation then
  raise exception 'Conteúdo inválido' using errcode='PT422';
end $$;

revoke all on function erp_private.catalogo_unidade(bigint,text,jsonb) from public,anon,authenticated;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.catalogo_unidade(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.catalogo_unidade(bigint,text,jsonb) to authenticated;

create function erp.catalogo_unidade(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.catalogo_unidade(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.catalogo_unidade(bigint,text,jsonb) from public,anon;
grant execute on function erp.catalogo_unidade(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
notify pgrst, 'reload schema';
commit;
