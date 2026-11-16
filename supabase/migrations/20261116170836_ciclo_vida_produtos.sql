-- CAD-006: mediated global lifecycle, local aggregate deletion only when never used.
begin;
grant erp_stock_writer to current_user;
alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check(permissao in (
'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO','PRODUTO_LER','PRODUTO_GERIR','PRODUTO_CICLO_VIDA','ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA','CATEGORIA_EDITAR','CATEGORIA_CICLO_VIDA','MEDIDA_EDITAR','MEDIDA_CICLO_VIDA','FORNECEDOR_EDITAR','FORNECEDOR_CICLO_VIDA'));

-- Boolean/reference boundary: no login, no membership for runtime, no operational data returned.
create role erp_product_reference_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant erp_product_reference_reader to current_user;
grant usage on schema erp,erp_private to erp_product_reference_reader;
grant select on erp.produto_unidade,erp.entrada_item,erp.lote to erp_product_reference_reader;
create policy produto_referencia on erp.produto_unidade for select to erp_product_reference_reader using(true);
create policy produto_referencia on erp.entrada_item for select to erp_product_reference_reader using(true);
create policy produto_referencia on erp.lote for select to erp_product_reference_reader using(true);
grant execute on function erp_private.ator_autenticado() to erp_product_reference_reader;
create function erp_private.produto_exclusao_motivo(p_id bigint,p_unidade bigint) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if erp_private.ator_autenticado() is null then raise exception 'Acesso negado' using errcode='PT403'; end if;
 if exists(select 1 from erp.entrada_item where produto_id=p_id) or exists(select 1 from erp.lote where produto_id=p_id) then return 'VINCULADO'; end if;
 if exists(select 1 from erp.produto_unidade where produto_id=p_id and unidade_id<>p_unidade) then return 'OUTRA_UNIDADE'; end if;
 return null;
end $$;
revoke all on function erp_private.produto_exclusao_motivo(bigint,bigint) from public,anon,authenticated;
grant create on schema erp_private to erp_product_reference_reader;
alter function erp_private.produto_exclusao_motivo(bigint,bigint) owner to erp_product_reference_reader;
revoke create on schema erp_private from erp_product_reference_reader;
grant execute on function erp_private.produto_exclusao_motivo(bigint,bigint) to erp_stock_writer;

create or replace function erp_private.estoque_produto_json(p_id bigint,p_unidade bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id::text,'revisao',p.revisao::text,'descricao',p.descricao,'complemento',p.complemento,
 'unidade_medida_id',p.unidade_medida_id::text,'categoria_id',p.categoria_id::text,'perecivel',p.perecivel,'armazenamento',p.armazenamento,
 'fator_correcao',p.fator_correcao::text,'apresentacao_compra',p.apresentacao_compra,'quantidade_apresentacao',p.quantidade_apresentacao::text,
 'estoque_minimo',pu.estoque_minimo::text,'estoque_maximo',pu.estoque_maximo::text,'ponto_reposicao',pu.ponto_reposicao::text,
 'status',p.status,'unidade_sigla',um.sigla,'categoria_descricao',c.descricao,
 'pode_excluir',not p.movimentado and motivo.valor is null,
 'motivo_exclusao',case when p.movimentado then 'VINCULADO' else motivo.valor end)
 from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade
 join erp.unidade_medida um on um.id=p.unidade_medida_id join erp.categoria c on c.id=p.categoria_id
 cross join lateral(select erp_private.produto_exclusao_motivo(p.id,p_unidade) valor) motivo where p.id=p_id
$$;

-- Fail closed if the source contract changed. Preserve the complete stock RPC and its owner/ACL.
do $patch$
declare source text; marker text; replacement text;
begin
 source:=pg_get_functiondef('erp_private.estoque_operacao(bigint,text,jsonb)'::regprocedure);
 marker:='''produto_escrever'',erp_private.estoque_capacidade(p_unidade,''PRODUTO_GERIR''),';
 if position(marker in source)=0 then raise exception 'Stock context source changed'; end if;
 source:=replace(source,marker,marker||'''produto_ciclo_vida'',erp_private.estoque_capacidade(p_unidade,''PRODUTO_CICLO_VIDA''),');
 marker:='if not erp_private.estoque_capacidade(p_unidade,''PRODUTO_GERIR'') then raise exception ''Ação não permitida'' using errcode=''PT403''; end if;';
 if position(marker in source)=0 then raise exception 'Product write source changed'; end if;
 replacement:=marker||E'\n if ((not p_dados?''id'' and p_dados->>''status''<>''ATIVO'') or (p_dados?''id'' and p_dados->>''status''<>produto.status)) and not erp_private.estoque_capacidade(p_unidade,''PRODUTO_CICLO_VIDA'') then raise exception ''Ação não permitida'' using errcode=''PT403''; end if;';
 source:=replace(source,marker,replacement);
 marker:='resultado:=erp_private.estoque_produto_json(id,p_unidade);';
 if position(marker in source)=0 then raise exception 'Product result source changed'; end if;
 source:=replace(source,marker,'if not erp_private.estoque_vinculado(p_unidade) then raise exception ''Unidade indisponível'' using errcode=''PT404''; end if; '||replacement||marker);
 execute source;
end $patch$;

grant delete on erp.produto,erp.produto_unidade to erp_stock_writer;
create function erp_private.produto_ciclo_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ator uuid:=erp_private.ator_autenticado(); produto erp.produto; v_id bigint; revisao bigint; antes jsonb; depois jsonb; novo_status text;
begin
 if ator is null then raise exception 'Acesso negado' using errcode='PT403'; end if;
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if not erp_private.estoque_capacidade(p_unidade,'PRODUTO_CICLO_VIDA') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 if p_acao is null or p_acao not in ('status','excluir') then raise exception 'Ação inválida' using errcode='PT422'; end if;
 perform erp_private.estoque_objeto(p_dados,case when p_acao='status' then array['id','revisao','status'] else array['id','revisao'] end);
 v_id:=erp_private.estoque_id(p_dados->'id'); revisao:=erp_private.estoque_id(p_dados->'revisao');
 select p.* into produto from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade where p.id=v_id for update of p;
 if not found then raise exception 'Produto indisponível' using errcode='PT404'; end if;
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if not erp_private.estoque_capacidade(p_unidade,'PRODUTO_CICLO_VIDA') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 if produto.revisao<>revisao then raise exception 'Revisão desatualizada' using errcode='PT412'; end if;
 antes:=erp_private.estoque_produto_json(v_id,p_unidade);
 if p_acao='status' then
  novo_status:=erp_private.estoque_texto(p_dados->'status',1,10);
  if novo_status not in ('ATIVO','INATIVO') then raise exception 'Status inválido' using errcode='PT422'; end if;
  update erp.produto set status=novo_status,revisao=erp.produto.revisao+1 where id=v_id;
  depois:=erp_private.estoque_produto_json(v_id,p_unidade);
 else
  if produto.movimentado or erp_private.produto_exclusao_motivo(v_id,p_unidade) is not null then raise exception 'PRODUTO_VINCULADO' using errcode='PT409'; end if;
  delete from erp.produto_unidade where produto_id=v_id and unidade_id=p_unidade;
  delete from erp.produto where id=v_id;
  depois:='null'::jsonb;
 end if;
 if not erp_private.estoque_capacidade(p_unidade,'PRODUTO_CICLO_VIDA') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois) values(p_unidade,ator,'produto_'||p_acao,'produto',v_id,antes,depois);
 if p_acao='excluir' then return jsonb_build_object('excluida',true); end if;
 return jsonb_build_object('produto',depois);
exception when foreign_key_violation then raise exception 'PRODUTO_VINCULADO' using errcode='PT409';
end $$;
revoke all on function erp_private.produto_ciclo_operacao(bigint,text,jsonb) from public,anon,authenticated;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.produto_ciclo_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.produto_ciclo_operacao(bigint,text,jsonb) to authenticated;
create function erp.produto_ciclo_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.produto_ciclo_operacao(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.produto_ciclo_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.produto_ciclo_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer,erp_product_reference_reader from current_user;
notify pgrst,'reload schema';
commit;
