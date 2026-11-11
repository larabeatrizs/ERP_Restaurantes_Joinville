-- CAD-003: shared categories, separate edit/lifecycle capabilities; no seed.
begin;
alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check (permissao in (
 'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO','PRODUTO_LER','PRODUTO_GERIR',
 'ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA','CATEGORIA_EDITAR','CATEGORIA_CICLO_VIDA'
));
alter table erp.categoria add column revisao bigint not null default 1 check(revisao>0);
grant erp_stock_writer to current_user;
grant insert,update,delete on erp.categoria to erp_stock_writer;
grant usage on sequence erp.categoria_id_seq to erp_stock_writer;

create function erp_private.categoria_json(p_id bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id::text,'revisao',c.revisao::text,'descricao',c.descricao,'tipo_item',c.tipo_item,
  'armazenamento_padrao',c.armazenamento_padrao,'dias_alerta_validade',c.dias_alerta_validade,'status',c.status,
  'pode_excluir',not exists(select 1 from erp.produto p where p.categoria_id=c.id)) from erp.categoria c where c.id=p_id
$$;
revoke all on function erp_private.categoria_json(bigint) from public,anon,authenticated;
grant execute on function erp_private.categoria_json(bigint) to erp_stock_writer;

create function erp_private.categoria_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 ator uuid:=erp_private.ator_autenticado(); requerido text; registro erp.categoria%rowtype;
 v_id bigint; revisao bigint; v_descricao text; tipo text; armazenamento text; dias integer;
 antes jsonb; resultado jsonb; lista jsonb; total integer; busca text; filtro text; ordem text; deslocamento integer;
begin
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if p_acao is null or p_acao not in ('listar','exportar','criar','editar','status','excluir') then raise exception 'Ação inválida' using errcode='PT422'; end if;
 requerido:=case when p_acao in ('criar','editar') then 'CATEGORIA_EDITAR' when p_acao in ('status','excluir') then 'CATEGORIA_CICLO_VIDA' else 'PRODUTO_LER' end;
 if not erp_private.estoque_capacidade(p_unidade,requerido) and not (p_acao in ('listar','exportar') and
  (erp_private.estoque_capacidade(p_unidade,'CATEGORIA_EDITAR') or erp_private.estoque_capacidade(p_unidade,'CATEGORIA_CICLO_VIDA'))) then
  raise exception 'Ação não permitida' using errcode='PT403';
 end if;
 if p_acao in ('listar','exportar') then
  perform erp_private.estoque_objeto(p_dados,array['q','status','ordem','offset']);
  busca:=erp_private.estoque_normalizar(erp_private.estoque_texto(p_dados->'q',0,200));
  filtro:=erp_private.estoque_texto(p_dados->'status',1,10); ordem:=erp_private.estoque_texto(p_dados->'ordem',1,4);
  if filtro not in ('ATIVO','INATIVO') or ordem not in ('asc','desc') or jsonb_typeof(p_dados->'offset')<>'number'
   or (p_dados->>'offset') !~ '^(0|[1-9][0-9]{0,9})$' then raise exception 'Filtros inválidos' using errcode='PT422'; end if;
  deslocamento:=(p_dados->>'offset')::integer;
  if p_acao='exportar' and deslocamento<>0 then raise exception 'Exportação integral' using errcode='PT422'; end if;
  select count(*)::integer into total from erp.categoria c where c.status=filtro and strpos(c.descricao_normalizada,busca)>0;
  select coalesce(jsonb_agg(erp_private.categoria_json(c.id) order by
    case when ordem='asc' then c.descricao_normalizada end asc,case when ordem='desc' then c.descricao_normalizada end desc,c.id),'[]'::jsonb)
   into lista from (select c.id,c.descricao_normalizada from erp.categoria c where c.status=filtro and strpos(c.descricao_normalizada,busca)>0
    order by case when ordem='asc' then c.descricao_normalizada end asc,case when ordem='desc' then c.descricao_normalizada end desc,c.id
    limit case when p_acao='exportar' then 10001 else 50 end offset deslocamento) c;
  if p_acao='exportar' and jsonb_array_length(lista)>10000 then raise exception 'Refine os filtros' using errcode='PT413'; end if;
  return jsonb_build_object('categorias',lista,'total',total,'capacidades',jsonb_build_object(
   'editar',erp_private.estoque_capacidade(p_unidade,'CATEGORIA_EDITAR'),'ciclo_vida',erp_private.estoque_capacidade(p_unidade,'CATEGORIA_CICLO_VIDA')));
 end if;
 if p_acao in ('criar','editar') then
  if p_acao='criar' then perform erp_private.estoque_objeto(p_dados,array['descricao','tipo_item','armazenamento_padrao','dias_alerta_validade']);
  else perform erp_private.estoque_objeto(p_dados,array['id','revisao','descricao','tipo_item','armazenamento_padrao','dias_alerta_validade']); end if;
  v_descricao:=erp_private.estoque_texto(p_dados->'descricao',1,200); tipo:=erp_private.estoque_texto(p_dados->'tipo_item',1,20);
  if erp_private.estoque_normalizar(v_descricao)='' then raise exception 'Descrição obrigatória' using errcode='PT422'; end if;
  armazenamento:=erp_private.estoque_texto(p_dados->'armazenamento_padrao',1,20);
  if tipo not in ('ALIMENTO','LIMPEZA','DESCARTAVEL') or armazenamento not in ('SECO','RESFRIADO','CONGELADO') then raise exception 'Campos inválidos' using errcode='PT422'; end if;
  if p_dados->'dias_alerta_validade'='null'::jsonb then dias:=null;
  else
   if jsonb_typeof(p_dados->'dias_alerta_validade')<>'number' or (p_dados->>'dias_alerta_validade') !~ '^(0|[1-9][0-9]{0,9})$' then raise exception 'Dias inválidos' using errcode='PT422'; end if;
   dias:=(p_dados->>'dias_alerta_validade')::integer;
  end if;
 elsif p_acao='status' then perform erp_private.estoque_objeto(p_dados,array['id','revisao','status']);
  if jsonb_typeof(p_dados->'status')<>'string' or p_dados->>'status' not in ('ATIVO','INATIVO') then raise exception 'Status inválido' using errcode='PT422'; end if;
 else perform erp_private.estoque_objeto(p_dados,array['id','revisao']); end if;
 if p_acao<>'criar' then
  v_id:=erp_private.estoque_id(p_dados->'id'); revisao:=erp_private.estoque_id(p_dados->'revisao');
  -- Conflicts with the SHARE lock used by product creation/linking: no orphan races.
  select c.* into registro from erp.categoria c where c.id=v_id for update;
  if not found then raise exception 'Categoria indisponível' using errcode='PT404'; end if;
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  if not erp_private.estoque_capacidade(p_unidade,requerido) then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  if registro.revisao<>revisao then raise exception 'Categoria alterada' using errcode='PT412'; end if;
  antes:=erp_private.categoria_json(v_id);
 end if;
 if p_acao='criar' then
  insert into erp.categoria as c(descricao,tipo_item,armazenamento_padrao,dias_alerta_validade)
   values(v_descricao,tipo,armazenamento,dias) returning c.id into v_id;
 elsif p_acao='editar' then
  update erp.categoria c set descricao=v_descricao,tipo_item=tipo,armazenamento_padrao=armazenamento,
   dias_alerta_validade=dias,revisao=c.revisao+1 where c.id=v_id;
 elsif p_acao='status' then
  if registro.status=p_dados->>'status' then return jsonb_build_object('categoria',antes); end if;
  update erp.categoria c set status=p_dados->>'status',revisao=c.revisao+1 where c.id=v_id;
 else
  if exists(select 1 from erp.produto p where p.categoria_id=v_id) then raise exception 'CATEGORIA_VINCULADA' using errcode='PT409'; end if;
  delete from erp.categoria c where c.id=v_id;
 end if;
 resultado:=case when p_acao='excluir' then 'null'::jsonb else erp_private.categoria_json(v_id) end;
 -- A create may also wait on the unique index; revalidate before committing any write.
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if not erp_private.estoque_capacidade(p_unidade,requerido) then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois)
  values(p_unidade,ator,'categoria_'||p_acao,'categoria',v_id,antes,resultado);
 if p_acao='excluir' then return jsonb_build_object('excluida',true); end if;
 return jsonb_build_object('categoria',resultado);
exception
 when unique_violation then raise exception 'CATEGORIA_DUPLICADA' using errcode='PT409';
 when foreign_key_violation then raise exception 'CATEGORIA_VINCULADA' using errcode='PT409';
 when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then raise exception 'Campos inválidos' using errcode='PT422';
end $$;
revoke all on function erp_private.categoria_operacao(bigint,text,jsonb) from public,anon,authenticated;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.categoria_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.categoria_operacao(bigint,text,jsonb) to authenticated;
create function erp.categoria_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.categoria_operacao(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.categoria_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.categoria_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
notify pgrst, 'reload schema';
commit;
