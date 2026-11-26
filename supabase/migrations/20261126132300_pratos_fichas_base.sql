begin;

create table erp.prato (
  id bigint generated always as identity primary key,
  descricao text not null check (length(btrim(descricao)) between 1 and 200),
  descricao_normalizada text generated always as (erp_private.estoque_normalizar(descricao)) stored unique,
  tipo_prato text not null check (tipo_prato in (
    'ARROZ','FEIJAO','PROTEINA','GUARNICAO','SALADA','SOBREMESA_FRUTA','BEBIDA',
    'PANIFICACAO','ACOMPANHAMENTO','FRUTA','BOLO_DOCE'
  )),
  status text not null default 'ATIVO' check (status in ('ATIVO','INATIVO'))
);

create table erp.prato_versao (
  id bigint generated always as identity primary key,
  prato_id bigint not null references erp.prato(id),
  numero integer not null check (numero>0),
  rendimento_porcoes integer not null check (rendimento_porcoes>0),
  peso_porcao_g numeric(18,6) check (peso_porcao_g>0),
  unidade_porcao text,
  porcoes_por_unidade_compra numeric(18,6) check (porcoes_por_unidade_compra>0),
  modo_preparo text,
  kcal_porcao numeric(18,6) check (kcal_porcao>=0),
  selada boolean not null default false,
  criado_por uuid not null references erp.usuario(id),
  criado_em timestamptz not null default now(),
  unique (prato_id,numero)
);
create index prato_versao_criado_por_idx on erp.prato_versao(criado_por);

create table erp.prato_item (
  prato_versao_id bigint not null references erp.prato_versao(id),
  produto_id bigint not null references erp.produto(id),
  quantidade_receita numeric(18,6) not null check (quantidade_receita>0),
  fator_correcao numeric(18,6) not null check (fator_correcao>0),
  custo_indireto boolean not null,
  observacao text,
  primary key (prato_versao_id,produto_id)
);
create index prato_item_produto_idx on erp.prato_item(produto_id);

create table erp.cardapio_prato (
  unidade_id bigint not null,
  cardapio_refeicao_id bigint not null,
  prato_versao_id bigint not null references erp.prato_versao(id),
  ordem integer not null check (ordem>0),
  grupo_opcao text,
  percentual_escolha numeric(7,4) check (percentual_escolha between 0 and 100),
  observacao text,
  primary key (unidade_id,cardapio_refeicao_id,ordem),
  foreign key (unidade_id,cardapio_refeicao_id) references erp.cardapio_refeicao(unidade_id,id)
);
create index cardapio_prato_versao_idx on erp.cardapio_prato(prato_versao_id);

create function erp_private.prato_item_validar()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'A gravação exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('erp.prato_versao:'||new.prato_versao_id::text,0));
  if exists (select 1 from erp.prato_versao v where v.id=new.prato_versao_id and v.selada) then
    raise exception 'A versão já utilizada pelo cardápio é imutável' using errcode='23514';
  end if;
  if not exists (select 1 from erp.produto p join erp.categoria c on c.id=p.categoria_id
    where p.id=new.produto_id and p.status='ATIVO'
      and ((c.tipo_item='ALIMENTO' and not new.custo_indireto)
        or (c.tipo_item='DESCARTAVEL' and new.custo_indireto))) then
    raise exception 'Produto ou classificação indisponível para a ficha' using errcode='23514';
  end if;
  return new;
end;
$$;

create function erp_private.cardapio_prato_validar()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.prato_versao_id=old.prato_versao_id then return new; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'A gravação exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('erp.prato_versao:'||new.prato_versao_id::text,0));
  if not exists (select 1 from erp.prato_versao v join erp.prato p on p.id=v.prato_id
    where v.id=new.prato_versao_id and p.status='ATIVO'
      and exists (select 1 from erp.prato_item i where i.prato_versao_id=v.id)) then
    raise exception 'Use uma versão de prato ativo com insumos' using errcode='23514';
  end if;
  update erp.prato_versao set selada=true where id=new.prato_versao_id and not selada;
  return new;
end;
$$;

create function erp_private.prato_versao_preservar()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and not old.selada and new.selada
    and (to_jsonb(new)-'selada')=(to_jsonb(old)-'selada') then
    return new;
  end if;
  raise exception 'Registro imutável' using errcode='42501';
end;
$$;

revoke all on function erp_private.prato_item_validar(),erp_private.cardapio_prato_validar(),erp_private.prato_versao_preservar()
  from public,anon,authenticated,service_role;

create trigger prato_item_validacao before insert on erp.prato_item
  for each row execute function erp_private.prato_item_validar();
create trigger prato_versao_imutavel before update or delete on erp.prato_versao
  for each row execute function erp_private.prato_versao_preservar();
create trigger prato_item_imutavel before update or delete on erp.prato_item
  for each row execute function erp_private.estoque_imutavel();
create trigger cardapio_prato_validacao before insert or update of prato_versao_id on erp.cardapio_prato
  for each row execute function erp_private.cardapio_prato_validar();

alter table erp.prato enable row level security;
alter table erp.prato_versao enable row level security;
alter table erp.prato_item enable row level security;
alter table erp.cardapio_prato enable row level security;
revoke all on erp.prato,erp.prato_versao,erp.prato_item,erp.cardapio_prato from public,anon,authenticated,service_role;
revoke all on sequence erp.prato_id_seq,erp.prato_versao_id_seq from public,anon,authenticated,service_role;

commit;
