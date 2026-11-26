begin;

alter table erp.prato_versao add column chave_criacao uuid, add column hash_criacao bytea,
  add constraint prato_versao_criacao_check check (
    (chave_criacao is null and hash_criacao is null)
    or (chave_criacao is not null and hash_criacao is not null and octet_length(hash_criacao)=32)
  );
create unique index prato_versao_chave_criacao_idx on erp.prato_versao(criado_por,chave_criacao)
  where chave_criacao is not null;
alter table erp.prato_item add column unidade_medida_id bigint references erp.unidade_medida(id);
create index prato_item_unidade_medida_idx on erp.prato_item(unidade_medida_id);

create function erp_private.prato_item_capturar_unidade()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  select p.unidade_medida_id into new.unidade_medida_id from erp.produto p where p.id=new.produto_id;
  return new;
end;
$$;
revoke all on function erp_private.prato_item_capturar_unidade() from public,anon,authenticated,service_role;
create trigger prato_item_unidade before insert on erp.prato_item
  for each row execute function erp_private.prato_item_capturar_unidade();

grant select,insert on erp.prato,erp.prato_versao,erp.prato_item to erp_stock_writer;
grant usage on sequence erp.prato_id_seq,erp.prato_versao_id_seq to erp_stock_writer;
do $policies$
declare tabela text;
begin
  foreach tabela in array array['prato','prato_versao','prato_item'] loop
    execute format('create policy ficha_leitura on erp.%I for select to erp_stock_writer using ((select erp_private.estoque_ator_ativo()))',tabela);
    execute format('create policy ficha_criacao on erp.%I for insert to erp_stock_writer with check ((select erp_private.estoque_ator_ativo()))',tabela);
  end loop;
end;
$policies$;

create function erp_private.prato_ficha_json(p_prato bigint,p_numero bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p.id::text,'descricao',p.descricao,'tipo_prato',p.tipo_prato,'status',p.status,
    'versao_id',v.id::text,'numero',v.numero,'rendimento_porcoes',v.rendimento_porcoes,
    'peso_porcao_g',v.peso_porcao_g::text,'unidade_porcao',v.unidade_porcao,
    'porcoes_por_unidade_compra',v.porcoes_por_unidade_compra::text,'modo_preparo',v.modo_preparo,'kcal_porcao',v.kcal_porcao::text,
    'itens',coalesce((
      select jsonb_agg(jsonb_build_object('produto_id',i.produto_id::text,'produto',pr.descricao,'unidade',m.sigla,
        'quantidade_receita',i.quantidade_receita::text,'quantidade_porcao',round(i.quantidade_receita/v.rendimento_porcoes,12)::text,
        'fator_correcao',i.fator_correcao::text,'custo_indireto',i.custo_indireto,'observacao',i.observacao) order by i.produto_id)
      from erp.prato_item i join erp.produto pr on pr.id=i.produto_id
      join erp.unidade_medida m on m.id=coalesce(i.unidade_medida_id,pr.unidade_medida_id) where i.prato_versao_id=v.id
    ),'[]'::jsonb))
  from erp.prato p join lateral (
    select pv.* from erp.prato_versao pv
    where pv.prato_id=p.id and (p_numero is null or pv.numero=p_numero)
    order by pv.numero desc limit 1
  ) v on true where p.id=p_prato
$$;

create function erp_private.prato_primeira_ficha(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' set lock_timeout='5s' as $$
declare
  ator uuid;
  perfil text;
  resposta jsonb;
  prato bigint;
  versao bigint;
  chave uuid;
  hash_pedido bytea;
  anterior bytea;
  rendimento integer;
  item jsonb;
  itens jsonb;
  insumo bigint;
  quantidade numeric;
  fator numeric;
  indireto boolean;
begin
  if p_acao is null or p_acao not in ('ler','criar') then raise exception 'Ação inválida' using errcode='PT422'; end if;
  if p_acao='criar' and current_setting('transaction_isolation')<>'read committed' then
    raise exception 'A gravação exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  ator := erp_private.ator_autenticado();
  select p.codigo into perfil from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id=ator;
  if perfil is null or perfil not in ('ADMIN','GESTOR_CENTRAL','GESTOR_UNIDADE','NUTRICIONISTA','ESTOQUISTA','COZINHA','AUDITOR')
    or (p_acao='criar' and perfil<>'NUTRICIONISTA') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;

  if p_acao='ler' then
    perform erp_private.estoque_objeto(p_dados,array['id'],array['numero']);
    resposta := erp_private.prato_ficha_json(erp_private.estoque_id(p_dados->'id'),
      case when p_dados ? 'numero' then erp_private.estoque_id(p_dados->'numero') end);
    if resposta is null then raise exception 'Ficha técnica indisponível' using errcode='PT404'; end if;
    return resposta;
  end if;

  perform erp_private.estoque_objeto(p_dados,array['descricao','tipo_prato','rendimento_porcoes','itens','chave'],
    array['peso_porcao_g','unidade_porcao','porcoes_por_unidade_compra','modo_preparo','kcal_porcao']);
  if jsonb_typeof(p_dados->'chave') is distinct from 'string'
    or p_dados->>'chave' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_dados->'rendimento_porcoes') is distinct from 'number'
    or p_dados->>'rendimento_porcoes' !~ '^[1-9][0-9]{0,9}$'
    or jsonb_typeof(p_dados->'itens') is distinct from 'array' then
    raise exception 'Dados de ficha inválidos' using errcode='PT422';
  end if;
  if jsonb_array_length(p_dados->'itens') not between 1 and 100 or (p_dados->>'rendimento_porcoes')::numeric>2147483647 then
    raise exception 'Informe o rendimento e de 1 a 100 insumos' using errcode='PT422';
  end if;
  rendimento := (p_dados->>'rendimento_porcoes')::integer;
  chave := (p_dados->>'chave')::uuid;
  select jsonb_agg(value order by value->>'produto_id') into itens from jsonb_array_elements(p_dados->'itens');
  hash_pedido := sha256(convert_to(((p_dados-array['chave','itens'])||jsonb_build_object('itens',itens))::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('erp.prato.criar:'||ator::text||':'||chave::text,0));
  select v.prato_id,v.hash_criacao into prato,anterior from erp.prato_versao v
    where v.criado_por=ator and v.chave_criacao=chave;
  if found then
    if anterior<>hash_pedido then raise exception 'Chave reutilizada com outros dados' using errcode='PT409'; end if;
    return erp_private.prato_ficha_json(prato,1);
  end if;

  insert into erp.prato(descricao,tipo_prato)
    values(erp_private.estoque_texto(p_dados->'descricao',1,200),erp_private.estoque_texto(p_dados->'tipo_prato',1,30))
    returning id into prato;
  insert into erp.prato_versao(prato_id,numero,rendimento_porcoes,peso_porcao_g,unidade_porcao,
    porcoes_por_unidade_compra,modo_preparo,kcal_porcao,criado_por,chave_criacao,hash_criacao)
    values(prato,1,rendimento,
      case when p_dados ? 'peso_porcao_g' then erp_private.estoque_decimal(p_dados->'peso_porcao_g') end,
      case when p_dados ? 'unidade_porcao' then erp_private.estoque_texto(p_dados->'unidade_porcao',1,100) end,
      case when p_dados ? 'porcoes_por_unidade_compra' then erp_private.estoque_decimal(p_dados->'porcoes_por_unidade_compra') end,
      case when p_dados ? 'modo_preparo' then erp_private.estoque_texto(p_dados->'modo_preparo',1,10000) end,
      case when p_dados ? 'kcal_porcao' then erp_private.estoque_decimal(p_dados->'kcal_porcao') end,
      ator,chave,hash_pedido) returning id into versao;

  for item in select value from jsonb_array_elements(itens) loop
    perform erp_private.estoque_objeto(item,array['produto_id','quantidade_receita','custo_indireto'],array['fator_correcao','observacao']);
    if jsonb_typeof(item->'custo_indireto') is distinct from 'boolean' then
      raise exception 'Classificação do insumo inválida' using errcode='PT422';
    end if;
    insumo := erp_private.estoque_id(item->'produto_id');
    quantidade := erp_private.estoque_decimal(item->'quantidade_receita');
    indireto := (item->>'custo_indireto')::boolean;
    if item ? 'fator_correcao' then
      fator := erp_private.estoque_decimal(item->'fator_correcao');
    else
      select p.fator_correcao into fator from erp.produto p where p.id=insumo;
      if not found then raise exception 'Insumo indisponível' using errcode='PT422'; end if;
    end if;
    insert into erp.prato_item(prato_versao_id,produto_id,quantidade_receita,fator_correcao,custo_indireto,observacao)
      values(versao,insumo,quantidade,fator,indireto,
        case when item ? 'observacao' then erp_private.estoque_texto(item->'observacao',1,2000) end);
  end loop;

  resposta := erp_private.prato_ficha_json(prato,1);
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,depois)
    values(p_unidade,ator,'prato_criar','prato',prato,resposta);
  return resposta;
end;
$$;

revoke all on function erp_private.prato_ficha_json(bigint,bigint),erp_private.prato_primeira_ficha(bigint,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function erp_private.prato_ficha_json(bigint,bigint),erp_private.prato_primeira_ficha(bigint,text,jsonb)
  to erp_stock_writer;

commit;
