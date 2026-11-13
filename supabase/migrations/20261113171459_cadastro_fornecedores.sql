-- CAD-005: additive shared supplier metadata and mediated CRUD; no seed.
begin;
alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check(permissao in (
'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO','PRODUTO_LER','PRODUTO_GERIR','ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA','CATEGORIA_EDITAR','CATEGORIA_CICLO_VIDA','MEDIDA_EDITAR','MEDIDA_CICLO_VIDA','FORNECEDOR_EDITAR','FORNECEDOR_CICLO_VIDA'));
-- Official RFB/Serpro module-11 algorithm: ASCII minus 48 supports existing numeric CNPJ too.
create or replace function erp_private.estoque_documento_valido(p text) returns boolean
language plpgsql immutable strict security invoker set search_path='' as $$
declare base integer; etapa integer; i integer; soma integer; peso integer; digito integer;
begin
 if p !~ '^([0-9]{11}|[A-Z0-9]{12}[0-9]{2})$' or p=repeat(substr(p,1,1),length(p)) then return false; end if;
 base:=length(p)-2;
 for etapa in 0..1 loop
  soma:=0;
  for i in 1..base+etapa loop
   if base=9 then peso:=base+etapa+2-i; else peso:=2+((base+etapa-i)%8); end if;
   soma:=soma+(ascii(substr(p,i,1))-48)*peso;
  end loop;
  digito:=11-(soma%11); if digito>=10 then digito:=0; end if;
  if digito<>substr(p,base+etapa+1,1)::integer then return false; end if;
 end loop;
 return true;
end $$;
alter table erp.fornecedor add column revisao bigint not null default 1 check(revisao>0),
 add column nome_fantasia text check(nome_fantasia is null or length(btrim(nome_fantasia)) between 1 and 200),
 add column contato text check(contato is null or length(btrim(contato)) between 1 and 200),
 add column telefone text check(telefone is null or length(btrim(telefone)) between 1 and 40),
 add column email text check(email is null or length(btrim(email)) between 1 and 254),
 add column endereco text check(endereco is null or length(btrim(endereco)) between 1 and 500),
 add column observacoes text check(observacoes is null or length(btrim(observacoes)) between 1 and 2000),
 add column tipo_fornecedor text check(tipo_fornecedor is null or length(btrim(tipo_fornecedor)) between 1 and 100),
 add column condicao_pagamento text check(condicao_pagamento is null or length(btrim(condicao_pagamento)) between 1 and 200),
 add column prazo_entrega_dias integer check(prazo_entrega_dias>=0),
 add column pedido_minimo numeric(18,6) check(pedido_minimo>=0),
 add column agricultura_familiar boolean,
 add column canal_preferido text check(canal_preferido in ('EMAIL','WHATSAPP'));
alter table erp.fornecedor add constraint fornecedor_documento_canonico check(cnpj_cpf=regexp_replace(upper(btrim(cnpj_cpf)),'[[:space:]./-]','','g'));
alter table erp.fornecedor add constraint fornecedor_email_formato check(email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');
grant erp_stock_writer to current_user;
grant insert,update,delete on erp.fornecedor to erp_stock_writer;
grant usage on sequence erp.fornecedor_id_seq to erp_stock_writer;
create function erp_private.fornecedor_json(p_id bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object('id',c.id::text,'revisao',c.revisao::text,'razao_social',c.razao_social,'cnpj_cpf',c.cnpj_cpf,'nome_fantasia',c.nome_fantasia,'contato',c.contato,'telefone',c.telefone,'email',c.email,'endereco',c.endereco,'observacoes',c.observacoes,'tipo_fornecedor',c.tipo_fornecedor,'condicao_pagamento',c.condicao_pagamento,'prazo_entrega_dias',c.prazo_entrega_dias,'pedido_minimo',c.pedido_minimo::text,'agricultura_familiar',c.agricultura_familiar,'canal_preferido',c.canal_preferido,'status',c.status,
'pode_excluir',not exists(select 1 from erp.entrada e where e.fornecedor_id=c.id)) from erp.fornecedor c where c.id=p_id
$$;
revoke all on function erp_private.fornecedor_json(bigint) from public,anon,authenticated;
grant execute on function erp_private.fornecedor_json(bigint) to erp_stock_writer;
create function erp_private.fornecedor_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 ator uuid:=erp_private.ator_autenticado(); requerido text; registro erp.fornecedor%rowtype;
 v_id bigint; revisao bigint; v_razao text; v_documento text; k text; limite integer;
 antes jsonb; resultado jsonb; lista jsonb; total integer; busca text; filtro text; ordem text; deslocamento integer;
begin
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if p_acao is null or p_acao not in ('listar','exportar','criar','editar','status','excluir') then raise exception 'Ação inválida' using errcode='PT422'; end if;
 requerido:=case when p_acao in ('criar','editar') then 'FORNECEDOR_EDITAR' when p_acao in ('status','excluir') then 'FORNECEDOR_CICLO_VIDA' else 'PRODUTO_LER' end;
 if not erp_private.estoque_capacidade(p_unidade,requerido) and not (p_acao in ('listar','exportar') and
  (erp_private.estoque_capacidade(p_unidade,'FORNECEDOR_EDITAR') or erp_private.estoque_capacidade(p_unidade,'FORNECEDOR_CICLO_VIDA'))) then
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
  select count(*)::integer into total from erp.fornecedor c where c.status=filtro and (strpos(c.razao_social_normalizada,busca)>0 or strpos(erp_private.estoque_normalizar(coalesce(c.nome_fantasia,'')),busca)>0 or strpos(erp_private.estoque_normalizar(c.cnpj_cpf),regexp_replace(busca,'[[:space:]./-]','','g'))>0);
  select coalesce(jsonb_agg(erp_private.fornecedor_json(c.id) order by
    case when ordem='asc' then c.razao_social_normalizada end asc,case when ordem='desc' then c.razao_social_normalizada end desc,c.id),'[]'::jsonb)
   into lista from (select c.id,c.razao_social_normalizada from erp.fornecedor c where c.status=filtro and (strpos(c.razao_social_normalizada,busca)>0 or strpos(erp_private.estoque_normalizar(coalesce(c.nome_fantasia,'')),busca)>0 or strpos(erp_private.estoque_normalizar(c.cnpj_cpf),regexp_replace(busca,'[[:space:]./-]','','g'))>0)
    order by case when ordem='asc' then c.razao_social_normalizada end asc,case when ordem='desc' then c.razao_social_normalizada end desc,c.id
    limit case when p_acao='exportar' then 10001 else 50 end offset deslocamento) c;
  if p_acao='exportar' and jsonb_array_length(lista)>10000 then raise exception 'Refine os filtros' using errcode='PT413'; end if;
  return jsonb_build_object('fornecedores',lista,'total',total,'capacidades',jsonb_build_object(
   'editar',erp_private.estoque_capacidade(p_unidade,'FORNECEDOR_EDITAR'),'ciclo_vida',erp_private.estoque_capacidade(p_unidade,'FORNECEDOR_CICLO_VIDA')));
 end if;
 if p_acao in ('criar','editar') then
  if p_acao='criar' then perform erp_private.estoque_objeto(p_dados,array['razao_social','cnpj_cpf','nome_fantasia','contato','telefone','email','endereco','observacoes','tipo_fornecedor','condicao_pagamento','prazo_entrega_dias','pedido_minimo','agricultura_familiar','canal_preferido']);
  else perform erp_private.estoque_objeto(p_dados,array['id','revisao','razao_social','cnpj_cpf','nome_fantasia','contato','telefone','email','endereco','observacoes','tipo_fornecedor','condicao_pagamento','prazo_entrega_dias','pedido_minimo','agricultura_familiar','canal_preferido']); end if;
  v_razao:=erp_private.estoque_texto(p_dados->'razao_social',1,200);
  v_documento:=regexp_replace(upper(erp_private.estoque_texto(p_dados->'cnpj_cpf',1,24)),'[[:space:]./-]','','g');
  if erp_private.estoque_normalizar(v_razao)='' or not erp_private.estoque_documento_valido(v_documento) then raise exception 'Campos invalidos' using errcode='PT422'; end if;
  for k,limite in select key,value::integer from jsonb_each_text('{"nome_fantasia":200,"contato":200,"telefone":40,"email":254,"endereco":500,"observacoes":2000,"tipo_fornecedor":100,"condicao_pagamento":200}'::jsonb) loop
   if p_dados->k<>'null'::jsonb then perform erp_private.estoque_texto(p_dados->k,1,limite); end if;
  end loop;
  if p_dados->'email'<>'null'::jsonb and p_dados->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Email invalido' using errcode='PT422'; end if;
  if p_dados->'prazo_entrega_dias'<>'null'::jsonb and (jsonb_typeof(p_dados->'prazo_entrega_dias')<>'number' or p_dados->>'prazo_entrega_dias' !~ '^(0|[1-9][0-9]{0,9})$') then raise exception 'Prazo invalido' using errcode='PT422'; end if;
  if p_dados->'pedido_minimo'<>'null'::jsonb then perform erp_private.estoque_decimal(p_dados->'pedido_minimo'); end if;
  if jsonb_typeof(p_dados->'agricultura_familiar')<>'boolean' then raise exception 'Escolha agricultura familiar' using errcode='PT422'; end if;
  if p_dados->'canal_preferido'<>'null'::jsonb and (jsonb_typeof(p_dados->'canal_preferido')<>'string' or p_dados->>'canal_preferido' not in ('EMAIL','WHATSAPP')) then raise exception 'Canal invalido' using errcode='PT422'; end if;
 elsif p_acao='status' then perform erp_private.estoque_objeto(p_dados,array['id','revisao','status']);
  if jsonb_typeof(p_dados->'status')<>'string' or p_dados->>'status' not in ('ATIVO','INATIVO') then raise exception 'Status inválido' using errcode='PT422'; end if;
 else perform erp_private.estoque_objeto(p_dados,array['id','revisao']); end if;
 if p_acao<>'criar' then
  v_id:=erp_private.estoque_id(p_dados->'id'); revisao:=erp_private.estoque_id(p_dados->'revisao');
  -- Conflicts with the SHARE lock used by receipt creation/confirmation: no orphan races.
  select c.* into registro from erp.fornecedor c where c.id=v_id for update;
  if not found then raise exception 'Fornecedor indisponível' using errcode='PT404'; end if;
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  if not erp_private.estoque_capacidade(p_unidade,requerido) then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  if registro.revisao<>revisao then raise exception 'Fornecedor alterada' using errcode='PT412'; end if;
  antes:=erp_private.fornecedor_json(v_id);
 end if;
 if p_acao='criar' then
  insert into erp.fornecedor as c(razao_social,cnpj_cpf,nome_fantasia,contato,telefone,email,endereco,observacoes,tipo_fornecedor,condicao_pagamento,prazo_entrega_dias,pedido_minimo,agricultura_familiar,canal_preferido) values(v_razao,v_documento,nullif(btrim(p_dados->>'nome_fantasia'),''),nullif(btrim(p_dados->>'contato'),''),nullif(btrim(p_dados->>'telefone'),''),nullif(btrim(p_dados->>'email'),''),nullif(btrim(p_dados->>'endereco'),''),nullif(btrim(p_dados->>'observacoes'),''),nullif(btrim(p_dados->>'tipo_fornecedor'),''),nullif(btrim(p_dados->>'condicao_pagamento'),''),(p_dados->>'prazo_entrega_dias')::integer,(p_dados->>'pedido_minimo')::numeric,(p_dados->>'agricultura_familiar')::boolean,nullif(btrim(p_dados->>'canal_preferido'),'')) returning c.id into v_id;
 elsif p_acao='editar' then
  update erp.fornecedor c set razao_social=v_razao,cnpj_cpf=v_documento,nome_fantasia=nullif(btrim(p_dados->>'nome_fantasia'),''),contato=nullif(btrim(p_dados->>'contato'),''),telefone=nullif(btrim(p_dados->>'telefone'),''),email=nullif(btrim(p_dados->>'email'),''),endereco=nullif(btrim(p_dados->>'endereco'),''),observacoes=nullif(btrim(p_dados->>'observacoes'),''),tipo_fornecedor=nullif(btrim(p_dados->>'tipo_fornecedor'),''),condicao_pagamento=nullif(btrim(p_dados->>'condicao_pagamento'),''),prazo_entrega_dias=(p_dados->>'prazo_entrega_dias')::integer,pedido_minimo=(p_dados->>'pedido_minimo')::numeric,agricultura_familiar=(p_dados->>'agricultura_familiar')::boolean,canal_preferido=nullif(btrim(p_dados->>'canal_preferido'),''),revisao=c.revisao+1 where c.id=v_id;
 elsif p_acao='status' then
  if registro.status=p_dados->>'status' then return jsonb_build_object('fornecedor',antes); end if;
  update erp.fornecedor c set status=p_dados->>'status',revisao=c.revisao+1 where c.id=v_id;
 else
  if exists(select 1 from erp.entrada e where e.fornecedor_id=v_id) then raise exception 'FORNECEDOR_VINCULADA' using errcode='PT409'; end if;
  delete from erp.fornecedor c where c.id=v_id;
 end if;
 resultado:=case when p_acao='excluir' then 'null'::jsonb else erp_private.fornecedor_json(v_id) end;
 -- A create may also wait on the unique index; revalidate before committing any write.
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if not erp_private.estoque_capacidade(p_unidade,requerido) then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois)
  values(p_unidade,ator,'fornecedor_'||p_acao,'fornecedor',v_id,antes,resultado);
 if p_acao='excluir' then return jsonb_build_object('excluida',true); end if;
 return jsonb_build_object('fornecedor',resultado);
exception
 when unique_violation then raise exception 'FORNECEDOR_DUPLICADA' using errcode='PT409';
 when foreign_key_violation then raise exception 'FORNECEDOR_VINCULADA' using errcode='PT409';
 when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then raise exception 'Campos inválidos' using errcode='PT422';
end $$;
revoke all on function erp_private.fornecedor_operacao(bigint,text,jsonb) from public,anon,authenticated;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.fornecedor_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.fornecedor_operacao(bigint,text,jsonb) to authenticated;
create function erp.fornecedor_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.fornecedor_operacao(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.fornecedor_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.fornecedor_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
notify pgrst, 'reload schema';
commit;
