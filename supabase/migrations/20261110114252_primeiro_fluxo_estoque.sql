-- EST-001: catálogo compartilhado e primeiro recebimento, sem dados/contas seed.
begin;

alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check (permissao in (
  'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO',
  'PRODUTO_LER','PRODUTO_GERIR','ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA'
));

create role erp_stock_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant erp_stock_writer to current_user;
grant usage on schema erp, erp_private to erp_stock_writer;
grant execute on function erp_private.ator_autenticado(), auth.uid() to erp_stock_writer;
grant select on erp.usuario,erp.usuario_unidade,erp.perfil_permissao,erp.unidade to erp_stock_writer;
create policy estoque_usuario on erp.usuario for select to erp_stock_writer
  using (id = (select erp_private.ator_autenticado()));
create policy estoque_vinculo on erp.usuario_unidade for select to erp_stock_writer
  using (usuario_id = (select erp_private.ator_autenticado()));
create policy estoque_permissao on erp.perfil_permissao for select to erp_stock_writer using (
  exists(select 1 from erp.usuario u where u.id=(select erp_private.ator_autenticado()) and u.perfil_id=perfil_permissao.perfil_id)
);
create policy estoque_unidade on erp.unidade for select to erp_stock_writer using (
  exists(select 1 from erp.usuario_unidade v where v.unidade_id=unidade.id and v.usuario_id=(select erp_private.ator_autenticado()))
);

create function erp_private.estoque_vinculado(p_unidade bigint) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from erp.usuario u join erp.usuario_unidade v on v.usuario_id=u.id
    join erp.unidade un on un.id=v.unidade_id
    where u.id=(select erp_private.ator_autenticado()) and u.status='ATIVO'
      and un.status='ATIVO' and un.id=p_unidade)
$$;
create function erp_private.estoque_capacidade(p_unidade bigint,p_permissao text) returns boolean
language sql stable security invoker set search_path='' as $$
  select erp_private.estoque_vinculado(p_unidade) and exists(
    select 1 from erp.usuario u join erp.perfil_permissao p on p.perfil_id=u.perfil_id
    where u.id=(select erp_private.ator_autenticado()) and u.status='ATIVO' and p.permissao=p_permissao)
$$;
create function erp_private.estoque_ator_ativo() returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from erp.usuario u where u.id=(select erp_private.ator_autenticado()) and u.status='ATIVO')
$$;

-- Built-in Unicode normalization, without extension or false IMMUTABLE unaccent.
create function erp_private.estoque_normalizar(p_texto text) returns text
language sql immutable strict parallel safe security invoker set search_path='' as $$
  select btrim(regexp_replace(regexp_replace(lower(normalize(p_texto,NFD)),U&'[\0300-\036f]','','g'),'[[:space:]]+',' ','g'))
$$;
create function erp_private.estoque_nf(p_texto text) returns text
language sql immutable strict parallel safe security invoker set search_path='' as $$
  select regexp_replace(btrim(p_texto),'[[:space:]]+',' ','g')
$$;
create function erp_private.estoque_documento_valido(p text) returns boolean
language plpgsql immutable strict security invoker set search_path='' as $$
declare base integer; etapa integer; i integer; soma integer; peso integer; digito integer;
begin
 if p !~ '^([0-9]{11}|[0-9]{14})$' or p=repeat(substr(p,1,1),length(p)) then return false; end if;
 base:=length(p)-2;
 for etapa in 0..1 loop
  soma:=0;
  for i in 1..base+etapa loop
   if base=9 then peso:=base+etapa+2-i; else peso:=2+((base+etapa-i)%8); end if;
   soma:=soma+substr(p,i,1)::integer*peso;
  end loop;
  digito:=11-(soma%11); if digito>=10 then digito:=0; end if;
  if digito<>substr(p,base+etapa+1,1)::integer then return false; end if;
 end loop;
 return true;
end $$;

create table erp.unidade_medida (
 id bigint generated always as identity primary key,
 sigla text not null check(length(btrim(sigla)) between 1 and 12),
 descricao text not null check(length(btrim(descricao)) between 1 and 200),
 descricao_normalizada text generated always as (erp_private.estoque_normalizar(descricao)) stored unique,
 grandeza text not null default 'MASSA' check(grandeza in ('MASSA','VOLUME','CONTAGEM')),
 fator_base numeric(18,6) check(fator_base>0),
 status text not null default 'ATIVO' check(status in ('ATIVO','INATIVO'))
);
create table erp.categoria (
 id bigint generated always as identity primary key,
 descricao text not null check(length(btrim(descricao)) between 1 and 200),
 descricao_normalizada text generated always as (erp_private.estoque_normalizar(descricao)) stored unique,
 tipo_item text not null default 'ALIMENTO' check(tipo_item in ('ALIMENTO','LIMPEZA','DESCARTAVEL')),
 armazenamento_padrao text not null default 'SECO' check(armazenamento_padrao in ('SECO','RESFRIADO','CONGELADO')),
 dias_alerta_validade integer check(dias_alerta_validade>=0),
 status text not null default 'ATIVO' check(status in ('ATIVO','INATIVO'))
);
create table erp.produto (
 id bigint generated always as identity primary key,
 descricao text not null check(length(btrim(descricao)) between 1 and 200),
 complemento text not null default '' check(length(complemento)<=200),
 descricao_normalizada text generated always as (erp_private.estoque_normalizar(descricao)) stored,
 complemento_normalizado text generated always as (erp_private.estoque_normalizar(complemento)) stored,
 unidade_medida_id bigint not null references erp.unidade_medida(id),
 categoria_id bigint not null references erp.categoria(id),
 perecivel boolean not null,
 armazenamento text not null check(armazenamento in ('SECO','RESFRIADO','CONGELADO')),
 fator_correcao numeric(18,6) not null check(fator_correcao>0),
 apresentacao_compra text not null check(length(btrim(apresentacao_compra)) between 1 and 100),
 quantidade_apresentacao numeric(18,6) not null check(quantidade_apresentacao>0),
 status text not null check(status in ('ATIVO','INATIVO')),
 revisao bigint not null default 1 check(revisao>0),
 movimentado boolean not null default false,
 unique(descricao_normalizada,complemento_normalizado)
);
create index produto_medida_idx on erp.produto(unidade_medida_id);
create index produto_categoria_idx on erp.produto(categoria_id);
create table erp.produto_unidade (
 unidade_id bigint not null references erp.unidade(id),
 produto_id bigint not null references erp.produto(id),
 estoque_minimo numeric(18,6) not null check(estoque_minimo>=0),
 estoque_maximo numeric(18,6), ponto_reposicao numeric(18,6),
 primary key(unidade_id,produto_id),
 check(estoque_maximo is null or estoque_maximo>=estoque_minimo),
 check(ponto_reposicao is null or ponto_reposicao>=0)
);
create index produto_unidade_produto_idx on erp.produto_unidade(produto_id);
create table erp.fornecedor (
 id bigint generated always as identity primary key,
 razao_social text not null check(length(btrim(razao_social)) between 1 and 200),
 razao_social_normalizada text generated always as (erp_private.estoque_normalizar(razao_social)) stored unique,
 cnpj_cpf text not null unique check(erp_private.estoque_documento_valido(cnpj_cpf)),
 status text not null default 'ATIVO' check(status in ('ATIVO','INATIVO'))
);
create table erp.camara (
 id bigint generated always as identity primary key,
 unidade_id bigint not null references erp.unidade(id),
 nome text not null check(length(btrim(nome)) between 1 and 200),
 tipo text not null check(tipo in ('SECO','RESFRIADO','CONGELADO')),
 status text not null default 'ATIVO' check(status in ('ATIVO','INATIVO')),
 unique(unidade_id,id), unique(unidade_id,nome)
);
create table erp.entrada (
 id bigint generated always as identity primary key,
 unidade_id bigint not null references erp.unidade(id),
 data_entrada date not null,
 origem text not null default 'COMPRA' check(origem='COMPRA'),
 fornecedor_id bigint not null references erp.fornecedor(id),
 numero_nf text not null check(length(btrim(numero_nf)) between 1 and 60),
 numero_nf_normalizado text generated always as (erp_private.estoque_nf(numero_nf)) stored,
 total_nota numeric(18,6) check(total_nota>=0),
 observacoes text not null default '' check(length(observacoes)<=2000),
 estado text not null default 'RASCUNHO' check(estado in ('RASCUNHO','CONFIRMADA')),
 criado_por uuid not null references erp.usuario(id),
 criado_em timestamptz not null default now(),
 confirmado_por uuid references erp.usuario(id), confirmado_em timestamptz,
 divergencia_aprovada_por uuid references erp.usuario(id), divergencia_motivo text,
 divergencia_aprovada_em timestamptz,
 unique(unidade_id,id), unique(fornecedor_id,numero_nf_normalizado),
 check((confirmado_por is null and confirmado_em is null and estado='RASCUNHO') or
       (confirmado_por is not null and confirmado_em is not null and estado='CONFIRMADA')),
 check((divergencia_aprovada_por is null and divergencia_motivo is null and divergencia_aprovada_em is null) or
       (divergencia_aprovada_por is not null and divergencia_aprovada_por<>criado_por and length(btrim(divergencia_motivo)) between 3 and 500 and divergencia_aprovada_em is not null))
);
create index entrada_unidade_idx on erp.entrada(unidade_id,id desc);
create index entrada_criado_por_idx on erp.entrada(criado_por);
create index entrada_confirmado_por_idx on erp.entrada(confirmado_por);
create index entrada_aprovador_idx on erp.entrada(divergencia_aprovada_por);
create table erp.entrada_item (
 id bigint generated always as identity primary key,
 unidade_id bigint not null, entrada_id bigint not null,
 produto_id bigint not null references erp.produto(id),
 unidade_medida_id bigint not null references erp.unidade_medida(id),
 quantidade numeric(18,6) not null check(quantidade>0),
 valor_unitario numeric(18,6) not null check(valor_unitario>=0),
 numero_lote text check(numero_lote is null or length(btrim(numero_lote)) between 1 and 100),
 validade date, camara_id bigint not null, temperatura numeric(18,6),
 aspecto_embalagem text not null check(length(btrim(aspecto_embalagem)) between 1 and 200),
 conformidade text not null check(conformidade in ('CONFORME','RESSALVA','RECUSADO')),
 motivo text not null default '' check(length(motivo)<=500),
 unique(unidade_id,id),
 foreign key(unidade_id,entrada_id) references erp.entrada(unidade_id,id),
 foreign key(unidade_id,produto_id) references erp.produto_unidade(unidade_id,produto_id),
 foreign key(unidade_id,camara_id) references erp.camara(unidade_id,id),
 check(conformidade='CONFORME' or length(btrim(motivo))>=3)
);
create index entrada_item_entrada_idx on erp.entrada_item(unidade_id,entrada_id);
create index entrada_item_produto_idx on erp.entrada_item(produto_id);
create index entrada_item_medida_idx on erp.entrada_item(unidade_medida_id);
create index entrada_item_local_idx on erp.entrada_item(unidade_id,camara_id);
create table erp.lote (
 id bigint generated always as identity primary key,
 unidade_id bigint not null, entrada_item_id bigint not null unique,
 produto_id bigint not null references erp.produto(id),
 codigo text not null check(length(btrim(codigo)) between 1 and 100), validade date,
 valor_unitario numeric(18,6) not null check(valor_unitario>=0),
 unique(unidade_id,id),
 foreign key(unidade_id,entrada_item_id) references erp.entrada_item(unidade_id,id),
 foreign key(unidade_id,produto_id) references erp.produto_unidade(unidade_id,produto_id)
);
create index lote_item_unidade_idx on erp.lote(unidade_id,entrada_item_id);
create index lote_produto_idx on erp.lote(produto_id);
create table erp.saldo_lote_local (
 unidade_id bigint not null, lote_id bigint not null, camara_id bigint not null,
 quantidade numeric(18,6) not null check(quantidade>=0),
 primary key(unidade_id,lote_id,camara_id),
 foreign key(unidade_id,lote_id) references erp.lote(unidade_id,id),
 foreign key(unidade_id,camara_id) references erp.camara(unidade_id,id)
);
create index saldo_local_idx on erp.saldo_lote_local(unidade_id,camara_id);
create table erp.movimento_estoque (
 id bigint generated always as identity primary key,
 unidade_id bigint not null, entrada_item_id bigint not null unique,
 lote_id bigint not null, camara_id bigint not null,
 quantidade_delta numeric(18,6) not null check(quantidade_delta<>0),
 valor_unitario_snapshot numeric(18,6) not null check(valor_unitario_snapshot>=0),
 ator_id uuid not null references erp.usuario(id), ocorrido_em timestamptz not null default now(),
 foreign key(unidade_id,entrada_item_id) references erp.entrada_item(unidade_id,id),
 foreign key(unidade_id,lote_id) references erp.lote(unidade_id,id),
 foreign key(unidade_id,camara_id) references erp.camara(unidade_id,id)
);
create index movimento_item_idx on erp.movimento_estoque(unidade_id,entrada_item_id);
create index movimento_lote_idx on erp.movimento_estoque(unidade_id,lote_id);
create index movimento_local_idx on erp.movimento_estoque(unidade_id,camara_id);
create index movimento_ator_idx on erp.movimento_estoque(ator_id);
create table erp.auditoria_estoque (
 id bigint generated always as identity primary key,
 unidade_id bigint not null references erp.unidade(id),
 ator_id uuid not null references erp.usuario(id),
 acao text not null, entidade text not null, entidade_id bigint not null,
 antes jsonb, depois jsonb not null, ocorrido_em timestamptz not null default now()
);
create index auditoria_estoque_unidade_idx on erp.auditoria_estoque(unidade_id,id);
create index auditoria_estoque_ator_idx on erp.auditoria_estoque(ator_id);
create table erp.comando_estoque (
 unidade_id bigint not null, ator_id uuid not null references erp.usuario(id),
 acao text not null check(acao='entrada_confirmar'), chave uuid not null,
 entrada_id bigint not null, conteudo jsonb not null, resultado jsonb,
 primary key(unidade_id,ator_id,acao,chave),
 foreign key(unidade_id,entrada_id) references erp.entrada(unidade_id,id)
);
create index comando_estoque_ator_idx on erp.comando_estoque(ator_id);
create index comando_estoque_entrada_idx on erp.comando_estoque(unidade_id,entrada_id);

-- All data access is mediated by the narrow RPC, never direct client DML.
do $policies$
declare t text;
begin
 for t in select unnest(array['unidade_medida','categoria','produto','fornecedor']) loop
  execute format('alter table erp.%I enable row level security',t);
  execute format('create policy estoque_global on erp.%I for all to erp_stock_writer using ((select erp_private.estoque_ator_ativo())) with check ((select erp_private.estoque_ator_ativo()))',t);
 end loop;
 for t in select unnest(array['produto_unidade','camara','entrada','entrada_item','lote','saldo_lote_local','movimento_estoque','auditoria_estoque','comando_estoque']) loop
  execute format('alter table erp.%I enable row level security',t);
  execute format('create policy estoque_local on erp.%I for all to erp_stock_writer using (erp_private.estoque_vinculado(unidade_id)) with check (erp_private.estoque_vinculado(unidade_id))',t);
 end loop;
 for t in select unnest(array['unidade_medida','categoria','produto','fornecedor','produto_unidade','camara','entrada','entrada_item','lote','saldo_lote_local','movimento_estoque','auditoria_estoque','comando_estoque']) loop
  execute format('revoke all on table erp.%I from public,anon,authenticated',t);
  execute format('grant select on table erp.%I to erp_stock_writer',t);
 end loop;
end $policies$;
grant insert,update on erp.produto,erp.produto_unidade,erp.entrada,erp.comando_estoque to erp_stock_writer;
-- Row locks revalidate active catalogues without granting CREATE/DELETE.
grant update(status) on erp.unidade_medida,erp.categoria,erp.fornecedor,erp.camara to erp_stock_writer;
grant insert on erp.entrada_item,erp.lote,erp.saldo_lote_local,erp.movimento_estoque,erp.auditoria_estoque to erp_stock_writer;
grant usage on sequence erp.produto_id_seq,erp.entrada_id_seq,erp.entrada_item_id_seq,erp.lote_id_seq,erp.movimento_estoque_id_seq,erp.auditoria_estoque_id_seq to erp_stock_writer;
revoke all on sequence erp.unidade_medida_id_seq,erp.categoria_id_seq,erp.produto_id_seq,erp.fornecedor_id_seq,erp.camara_id_seq,erp.entrada_id_seq,erp.entrada_item_id_seq,erp.lote_id_seq,erp.movimento_estoque_id_seq,erp.auditoria_estoque_id_seq from public,anon,authenticated;

create function erp_private.estoque_imutavel() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Registro imutável' using errcode='42501'; end $$;
create trigger movimento_imutavel before update or delete on erp.movimento_estoque for each row execute function erp_private.estoque_imutavel();
create trigger auditoria_estoque_imutavel before update or delete on erp.auditoria_estoque for each row execute function erp_private.estoque_imutavel();
create trigger lote_imutavel before update or delete on erp.lote for each row execute function erp_private.estoque_imutavel();
create function erp_private.estoque_entrada_imutavel() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='entrada' then
  if old.estado='CONFIRMADA' then raise exception 'Entrada confirmada é imutável' using errcode='42501'; end if;
 else
  if tg_op<>'INSERT' and exists(select 1 from erp.entrada e where e.id=old.entrada_id and e.unidade_id=old.unidade_id and e.estado='CONFIRMADA') then
   raise exception 'Itens confirmados são imutáveis' using errcode='42501';
  end if;
  if tg_op<>'DELETE' and exists(select 1 from erp.entrada e where e.id=new.entrada_id and e.unidade_id=new.unidade_id and e.estado='CONFIRMADA') then
   raise exception 'Itens confirmados são imutáveis' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger entrada_imutavel before update or delete on erp.entrada for each row execute function erp_private.estoque_entrada_imutavel();
create trigger entrada_item_imutavel before insert or update or delete on erp.entrada_item for each row execute function erp_private.estoque_entrada_imutavel();
create function erp_private.estoque_produto_medida() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.unidade_medida_id<>old.unidade_medida_id and old.movimentado then
  raise exception 'Unidade-base imutável após movimento' using errcode='PT409';
 end if;
 if old.movimentado and not new.movimentado then raise exception 'Histórico de movimento imutável' using errcode='42501'; end if;
 return new;
end $$;
create trigger produto_medida before update on erp.produto for each row execute function erp_private.estoque_produto_medida();

create function erp_private.estoque_objeto(p jsonb,obrigatorios text[],opcionais text[] default '{}') returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or not p ?& obrigatorios or exists(select 1 from jsonb_object_keys(p) k where not k=any(obrigatorios||opcionais)) then
  raise exception 'Conteúdo inválido' using errcode='PT422';
 end if;
end $$;
create function erp_private.estoque_id(p jsonb) returns bigint
language plpgsql immutable security invoker set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'string' or (p#>>'{}') !~ '^[1-9][0-9]{0,18}$' then raise exception 'ID inválido' using errcode='PT422'; end if;
 return (p#>>'{}')::bigint;
exception when numeric_value_out_of_range then raise exception 'ID inválido' using errcode='PT422';
end $$;
create function erp_private.estoque_decimal(p jsonb,assinado boolean default false) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'string' or (p#>>'{}') !~ '^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' or (not assinado and left(p#>>'{}',1)='-') then
  raise exception 'Decimal inválido' using errcode='PT422';
 end if;
 return (p#>>'{}')::numeric;
end $$;
create function erp_private.estoque_texto(p jsonb,minimo integer,maximo integer) returns text
language plpgsql immutable security invoker set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'string' or length(btrim(p#>>'{}'))<minimo or length(p#>>'{}')>maximo then
  raise exception 'Texto inválido' using errcode='PT422';
 end if;
 return btrim(p#>>'{}');
end $$;
create function erp_private.estoque_data(p jsonb) returns date
language plpgsql immutable security invoker set search_path='' as $$
declare d date;
begin
 if p is null or jsonb_typeof(p)<>'string' or (p#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data inválida' using errcode='PT422'; end if;
 d:=(p#>>'{}')::date;
 if to_char(d,'YYYY-MM-DD')<>p#>>'{}' then raise exception 'Data inválida' using errcode='PT422'; end if;
 return d;
exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Data inválida' using errcode='PT422';
end $$;

create function erp_private.estoque_produto_json(p_id bigint,p_unidade bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id::text,'revisao',p.revisao::text,'descricao',p.descricao,'complemento',p.complemento,
 'unidade_medida_id',p.unidade_medida_id::text,'categoria_id',p.categoria_id::text,'perecivel',p.perecivel,'armazenamento',p.armazenamento,
 'fator_correcao',p.fator_correcao::text,'apresentacao_compra',p.apresentacao_compra,'quantidade_apresentacao',p.quantidade_apresentacao::text,
 'estoque_minimo',pu.estoque_minimo::text,'estoque_maximo',pu.estoque_maximo::text,'ponto_reposicao',pu.ponto_reposicao::text,
 'status',p.status,'unidade_sigla',um.sigla,'categoria_descricao',c.descricao)
 from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade
 join erp.unidade_medida um on um.id=p.unidade_medida_id join erp.categoria c on c.id=p.categoria_id where p.id=p_id
$$;
create function erp_private.estoque_entrada_json(p_id bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id::text,'unidade_id',e.unidade_id::text,'data_entrada',e.data_entrada::text,
 'fornecedor_id',e.fornecedor_id::text,'fornecedor',f.razao_social,'numero_nf',e.numero_nf,'total_nota',e.total_nota::text,
 'total_itens',(select coalesce(sum(i.quantidade*i.valor_unitario),0)::text from erp.entrada_item i where i.entrada_id=e.id and i.unidade_id=e.unidade_id),
 'observacoes',e.observacoes,'estado',e.estado,'divergencia_aprovada',e.divergencia_aprovada_por is not null,
 'itens',coalesce((select jsonb_agg(jsonb_build_object('id',i.id::text,'produto_id',i.produto_id::text,'produto',p.descricao,'unidade_medida',um.sigla,
 'quantidade',i.quantidade::text,'valor_unitario',i.valor_unitario::text,'numero_lote',i.numero_lote,'validade',i.validade::text,
 'camara_id',i.camara_id::text,'local',c.nome,'temperatura',i.temperatura::text,'aspecto_embalagem',i.aspecto_embalagem,'conformidade',i.conformidade,'motivo',i.motivo) order by i.id)
 from erp.entrada_item i join erp.produto p on p.id=i.produto_id join erp.unidade_medida um on um.id=i.unidade_medida_id join erp.camara c on c.id=i.camara_id and c.unidade_id=i.unidade_id where i.entrada_id=e.id and i.unidade_id=e.unidade_id),'[]'::jsonb))
 from erp.entrada e join erp.fornecedor f on f.id=e.fornecedor_id where e.id=p_id
$$;

create function erp_private.estoque_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
<<op>>
declare
 ator uuid:=erp_private.ator_autenticado();
 produto erp.produto; ent erp.entrada; item erp.entrada_item; cmd erp.comando_estoque;
 dados_item jsonb; resultado jsonb; antes jsonb; lista jsonb; id bigint; medida bigint; categoria bigint;
 local_id bigint; prod_id bigint; lote_id bigint; revisao bigint; total numeric; chave uuid;
 quantidade numeric; preco numeric; validade date; temperatura numeric; conformidade text; numero_lote text;
 consulta text; filtro text; deslocamento integer; n integer;
begin
 if ator is null then raise exception 'Acesso negado' using errcode='PT403'; end if;
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if p_acao is null or p_acao not in ('contexto','produtos','produto_salvar','entradas','entrada_criar','entrada_confirmar','entrada_aprovar_divergencia','saldos') then
  raise exception 'Ação inválida' using errcode='PT422';
 end if;
 if not (case
  when p_acao='produto_salvar' then erp_private.estoque_capacidade(p_unidade,'PRODUTO_GERIR')
  when p_acao='produtos' then erp_private.estoque_capacidade(p_unidade,'PRODUTO_LER')
  when p_acao in ('entrada_criar','entrada_confirmar') then erp_private.estoque_capacidade(p_unidade,'RECEBIMENTO_GERIR')
  when p_acao='entrada_aprovar_divergencia' then erp_private.estoque_capacidade(p_unidade,'RECEBIMENTO_APROVAR_DIVERGENCIA')
  when p_acao in ('entradas','saldos') then erp_private.estoque_capacidade(p_unidade,'ESTOQUE_LER')
  else erp_private.estoque_capacidade(p_unidade,'PRODUTO_LER') or erp_private.estoque_capacidade(p_unidade,'ESTOQUE_LER')
 end) then raise exception 'Ação não permitida' using errcode='PT403'; end if;

 if p_acao='contexto' then
  perform erp_private.estoque_objeto(p_dados,'{}');
  return jsonb_build_object(
   'medidas',coalesce((select jsonb_agg(jsonb_build_object('id',um.id::text,'sigla',um.sigla,'descricao',um.descricao) order by um.id) from erp.unidade_medida um where um.status='ATIVO'),'[]'::jsonb),
   'categorias',coalesce((select jsonb_agg(jsonb_build_object('id',c.id::text,'descricao',c.descricao,'armazenamento_padrao',c.armazenamento_padrao) order by c.id) from erp.categoria c where c.status='ATIVO'),'[]'::jsonb),
   'fornecedores',coalesce((select jsonb_agg(jsonb_build_object('id',f.id::text,'razao_social',f.razao_social) order by f.id) from erp.fornecedor f where f.status='ATIVO'),'[]'::jsonb),
   'locais',coalesce((select jsonb_agg(jsonb_build_object('id',c.id::text,'nome',c.nome,'tipo',c.tipo) order by c.id) from erp.camara c where c.unidade_id=p_unidade and c.status='ATIVO'),'[]'::jsonb),
   'capacidades',jsonb_build_object('produto_escrever',erp_private.estoque_capacidade(p_unidade,'PRODUTO_GERIR'),
     'recebimento_escrever',erp_private.estoque_capacidade(p_unidade,'RECEBIMENTO_GERIR'),
     'divergencia_aprovar',erp_private.estoque_capacidade(p_unidade,'RECEBIMENTO_APROVAR_DIVERGENCIA')));
 elsif p_acao='produtos' then
  perform erp_private.estoque_objeto(p_dados,'{}',array['q','status','offset']);
  consulta:=case when p_dados?'q' then erp_private.estoque_texto(p_dados->'q',0,200) else '' end;
  filtro:=case when p_dados?'status' then erp_private.estoque_texto(p_dados->'status',0,10) else 'ATIVO' end;
  if filtro not in ('','ATIVO','INATIVO') then raise exception 'Status inválido' using errcode='PT422'; end if;
  if p_dados?'offset' and (jsonb_typeof(p_dados->'offset')<>'number' or p_dados->>'offset' !~ '^[0-9]{1,10}$') then raise exception 'Offset inválido' using errcode='PT422'; end if;
  deslocamento:=coalesce((p_dados->>'offset')::integer,0);
  select count(*) into n from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade
   where (filtro='' or p.status=filtro) and (consulta='' or strpos(p.descricao_normalizada||' '||p.complemento_normalizado,erp_private.estoque_normalizar(consulta))>0);
  select coalesce(jsonb_agg(erp_private.estoque_produto_json(x.id,p_unidade) order by x.id),'[]'::jsonb) into lista from (
   select p.id from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade
   where (filtro='' or p.status=filtro) and (consulta='' or strpos(p.descricao_normalizada||' '||p.complemento_normalizado,erp_private.estoque_normalizar(consulta))>0)
   order by p.id limit 50 offset deslocamento) x;
  return jsonb_build_object('produtos',lista,'total',n);
 elsif p_acao='produto_salvar' then
  perform erp_private.estoque_objeto(p_dados,array['descricao','complemento','unidade_medida_id','categoria_id','perecivel','armazenamento','fator_correcao','apresentacao_compra','quantidade_apresentacao','estoque_minimo','estoque_maximo','ponto_reposicao','status'],array['id','revisao']);
  if (p_dados?'id')<>(p_dados?'revisao') or jsonb_typeof(p_dados->'perecivel')<>'boolean' then raise exception 'Produto inválido' using errcode='PT422'; end if;
  medida:=erp_private.estoque_id(p_dados->'unidade_medida_id'); categoria:=erp_private.estoque_id(p_dados->'categoria_id');
  perform 1 from erp.unidade_medida where unidade_medida.id=medida and status='ATIVO' for share;
  if not found then raise exception 'Unidade de medida inválida' using errcode='PT422'; end if;
  perform 1 from erp.categoria c where c.id=categoria and c.status='ATIVO' for share;
  if not found then raise exception 'Categoria inválida' using errcode='PT422'; end if;
  if p_dados?'id' then
   id:=erp_private.estoque_id(p_dados->'id'); revisao:=erp_private.estoque_id(p_dados->'revisao');
   select p.* into produto from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade where p.id=id for update of p;
   if not found then raise exception 'Produto indisponível' using errcode='PT404'; end if;
   if produto.revisao<>revisao then raise exception 'Revisão desatualizada' using errcode='PT412'; end if;
   if produto.unidade_medida_id<>medida and produto.movimentado then raise exception 'Unidade-base imutável após movimento' using errcode='PT409'; end if;
   antes:=erp_private.estoque_produto_json(id,p_unidade);
  end if;
  if not erp_private.estoque_capacidade(p_unidade,'PRODUTO_GERIR') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  if p_dados->>'armazenamento' not in ('SECO','RESFRIADO','CONGELADO') or p_dados->>'status' not in ('ATIVO','INATIVO') then raise exception 'Opção inválida' using errcode='PT422'; end if;
  if not p_dados?'id' then
   insert into erp.produto as novo(descricao,complemento,unidade_medida_id,categoria_id,perecivel,armazenamento,fator_correcao,apresentacao_compra,quantidade_apresentacao,status)
    values(erp_private.estoque_texto(p_dados->'descricao',1,200),erp_private.estoque_texto(p_dados->'complemento',0,200),medida,categoria,(p_dados->>'perecivel')::boolean,
     p_dados->>'armazenamento',erp_private.estoque_decimal(p_dados->'fator_correcao'),erp_private.estoque_texto(p_dados->'apresentacao_compra',1,100),erp_private.estoque_decimal(p_dados->'quantidade_apresentacao'),p_dados->>'status') returning novo.id into id;
  else
   update erp.produto p set descricao=erp_private.estoque_texto(p_dados->'descricao',1,200),complemento=erp_private.estoque_texto(p_dados->'complemento',0,200),
    unidade_medida_id=medida,categoria_id=categoria,perecivel=(p_dados->>'perecivel')::boolean,armazenamento=p_dados->>'armazenamento',
    fator_correcao=erp_private.estoque_decimal(p_dados->'fator_correcao'),apresentacao_compra=erp_private.estoque_texto(p_dados->'apresentacao_compra',1,100),
    quantidade_apresentacao=erp_private.estoque_decimal(p_dados->'quantidade_apresentacao'),status=p_dados->>'status',revisao=p.revisao+1 where p.id=id;
  end if;
  insert into erp.produto_unidade(unidade_id,produto_id,estoque_minimo,estoque_maximo,ponto_reposicao)
   values(p_unidade,id,erp_private.estoque_decimal(p_dados->'estoque_minimo'),case when p_dados->'estoque_maximo'<>'null'::jsonb then erp_private.estoque_decimal(p_dados->'estoque_maximo') end,
    case when p_dados->'ponto_reposicao'<>'null'::jsonb then erp_private.estoque_decimal(p_dados->'ponto_reposicao') end)
   on conflict(unidade_id,produto_id) do update set estoque_minimo=excluded.estoque_minimo,estoque_maximo=excluded.estoque_maximo,ponto_reposicao=excluded.ponto_reposicao;
  resultado:=erp_private.estoque_produto_json(id,p_unidade);
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois) values(p_unidade,ator,p_acao,'produto',id,antes,resultado);
  return jsonb_build_object('produto',resultado);
 elsif p_acao='entrada_criar' then
  perform erp_private.estoque_objeto(p_dados,array['data_entrada','fornecedor_id','numero_nf','total_nota','observacoes','itens']);
  if jsonb_typeof(p_dados->'itens')<>'array' then raise exception 'Itens inválidos' using errcode='PT422'; end if;
  if jsonb_array_length(p_dados->'itens') not between 1 and 50 then raise exception 'Itens inválidos' using errcode='PT422'; end if;
  if erp_private.estoque_data(p_dados->'data_entrada')>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data futura' using errcode='PT422'; end if;
  -- Consistent product lock order across creation and confirmation.
  perform p.id from erp.produto p where p.id in (select erp_private.estoque_id(x.value->'produto_id') from jsonb_array_elements(p_dados->'itens') x) order by p.id for share;
  id:=erp_private.estoque_id(p_dados->'fornecedor_id');
  perform 1 from erp.fornecedor f where f.id=id and f.status='ATIVO' for share;
  if not found then raise exception 'Fornecedor inválido' using errcode='PT422'; end if;
  if not erp_private.estoque_capacidade(p_unidade,'RECEBIMENTO_GERIR') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  insert into erp.entrada(unidade_id,data_entrada,fornecedor_id,numero_nf,total_nota,observacoes,criado_por)
   values(p_unidade,erp_private.estoque_data(p_dados->'data_entrada'),id,erp_private.estoque_texto(p_dados->'numero_nf',1,60),
    case when p_dados->'total_nota'<>'null'::jsonb then erp_private.estoque_decimal(p_dados->'total_nota') end,erp_private.estoque_texto(p_dados->'observacoes',0,2000),ator) returning entrada.id into id;
  for dados_item in select value from jsonb_array_elements(p_dados->'itens') loop
   perform erp_private.estoque_objeto(dados_item,array['produto_id','quantidade','valor_unitario','numero_lote','validade','camara_id','temperatura','aspecto_embalagem','conformidade','motivo']);
   prod_id:=erp_private.estoque_id(dados_item->'produto_id'); local_id:=erp_private.estoque_id(dados_item->'camara_id');
   select p.* into produto from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id and pu.unidade_id=p_unidade where p.id=prod_id and p.status='ATIVO' for share of p;
   if not found then raise exception 'Produto inválido para unidade' using errcode='PT422'; end if;
   perform 1 from erp.camara c where c.id=local_id and c.unidade_id=p_unidade and c.status='ATIVO' for share;
   if not found then raise exception 'Local inválido para unidade' using errcode='PT422'; end if;
   quantidade:=erp_private.estoque_decimal(dados_item->'quantidade'); preco:=erp_private.estoque_decimal(dados_item->'valor_unitario');
   validade:=case when dados_item->'validade'<>'null'::jsonb then erp_private.estoque_data(dados_item->'validade') end;
   temperatura:=case when dados_item->'temperatura'<>'null'::jsonb then erp_private.estoque_decimal(dados_item->'temperatura',true) end;
   numero_lote:=case when dados_item->'numero_lote'<>'null'::jsonb then erp_private.estoque_texto(dados_item->'numero_lote',1,100) end;
   if produto.perecivel and validade is null or validade<erp_private.estoque_data(p_dados->'data_entrada') or produto.armazenamento in ('RESFRIADO','CONGELADO') and temperatura is null then raise exception 'Validade/temperatura obrigatória ou inválida' using errcode='PT422'; end if;
   insert into erp.entrada_item(unidade_id,entrada_id,produto_id,unidade_medida_id,quantidade,valor_unitario,numero_lote,validade,camara_id,temperatura,aspecto_embalagem,conformidade,motivo)
    values(p_unidade,id,prod_id,produto.unidade_medida_id,quantidade,preco,numero_lote,validade,local_id,temperatura,erp_private.estoque_texto(dados_item->'aspecto_embalagem',1,200),
     erp_private.estoque_texto(dados_item->'conformidade',1,10),erp_private.estoque_texto(dados_item->'motivo',0,500));
  end loop;
  resultado:=erp_private.estoque_entrada_json(id);
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,depois) values(p_unidade,ator,p_acao,'entrada',id,resultado);
  return jsonb_build_object('entrada',resultado);
 elsif p_acao in ('entrada_confirmar','entrada_aprovar_divergencia') then
  perform erp_private.estoque_objeto(p_dados,case when p_acao='entrada_confirmar' then array['id','chave'] else array['id','motivo'] end);
  id:=erp_private.estoque_id(p_dados->'id');
  if p_acao='entrada_confirmar' then
   if jsonb_typeof(p_dados->'chave')<>'string' or p_dados->>'chave' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Chave inválida' using errcode='PT422'; end if;
   chave:=(p_dados->>'chave')::uuid;
   -- Never leak an entry from another unit through idempotency/FK handling.
   if not exists(select 1 from erp.entrada e where e.id=id and e.unidade_id=p_unidade) then raise exception 'Entrada indisponível' using errcode='PT404'; end if;
   insert into erp.comando_estoque(unidade_id,ator_id,acao,chave,entrada_id,conteudo) values(p_unidade,ator,p_acao,chave,id,jsonb_build_object('id',id::text)) on conflict do nothing;
   select c.* into cmd from erp.comando_estoque c where c.unidade_id=p_unidade and c.ator_id=ator and c.acao=p_acao and c.chave=chave for update;
   if cmd.conteudo<>jsonb_build_object('id',id::text) then raise exception 'Chave reutilizada com outro conteúdo' using errcode='PT409'; end if;
   if cmd.resultado is not null then return cmd.resultado; end if;
  end if;
  -- Compatible with the KEY SHARE acquired by command/document foreign keys.
  select e.* into ent from erp.entrada e where e.id=id and e.unidade_id=p_unidade for no key update;
  if not found then raise exception 'Entrada indisponível' using errcode='PT404'; end if;
  if not erp_private.estoque_capacidade(p_unidade,case when p_acao='entrada_confirmar' then 'RECEBIMENTO_GERIR' else 'RECEBIMENTO_APROVAR_DIVERGENCIA' end) then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  select sum(i.quantidade*i.valor_unitario) into total from erp.entrada_item i where i.entrada_id=id and i.unidade_id=p_unidade;
  if total is null then raise exception 'Entrada sem itens' using errcode='PT422'; end if;
  antes:=erp_private.estoque_entrada_json(id);
  if p_acao='entrada_aprovar_divergencia' then
   if ent.estado<>'RASCUNHO' then raise exception 'Entrada confirmada é imutável' using errcode='PT409'; end if;
   if ent.criado_por=ator then raise exception 'Autoaprovação negada' using errcode='PT403'; end if;
   if ent.total_nota is null or ent.total_nota=total then raise exception 'Entrada sem divergência' using errcode='PT422'; end if;
   update erp.entrada e set divergencia_aprovada_por=ator,divergencia_motivo=erp_private.estoque_texto(p_dados->'motivo',3,500),divergencia_aprovada_em=now() where e.id=id;
  elsif ent.estado<>'CONFIRMADA' then
   if ent.data_entrada>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data futura' using errcode='PT422'; end if;
   perform 1 from erp.fornecedor f where f.id=ent.fornecedor_id and f.status='ATIVO' for share;
   if not found then raise exception 'Fornecedor inativo' using errcode='PT422'; end if;
   if ent.total_nota is not null and ent.total_nota<>total and ent.divergencia_aprovada_por is null then raise exception 'Divergência requer aprovação distinta do gestor' using errcode='PT409'; end if;
   -- Lock shared catalogue rows in stable order and revalidate at confirmation.
   perform p.id from erp.produto p join erp.entrada_item i on i.produto_id=p.id where i.entrada_id=id and i.unidade_id=p_unidade order by p.id for no key update of p;
   for item in select i.* from erp.entrada_item i where i.entrada_id=id and i.unidade_id=p_unidade order by i.id loop
    select p.* into produto from erp.produto p where p.id=item.produto_id;
    if produto.unidade_medida_id<>item.unidade_medida_id then raise exception 'Unidade-base alterada após rascunho' using errcode='PT409'; end if;
    if produto.status<>'ATIVO' or not exists(select 1 from erp.produto_unidade pu where pu.produto_id=produto.id and pu.unidade_id=p_unidade) then raise exception 'Produto inativo ou sem vínculo' using errcode='PT422'; end if;
    perform 1 from erp.camara c where c.id=item.camara_id and c.unidade_id=p_unidade and c.status='ATIVO' for share;
    if not found then raise exception 'Local inativo' using errcode='PT422'; end if;
    if produto.perecivel and item.validade is null or item.validade<ent.data_entrada or produto.armazenamento in ('RESFRIADO','CONGELADO') and item.temperatura is null then raise exception 'Validade/temperatura inválida' using errcode='PT422'; end if;
    if item.conformidade<>'RECUSADO' then
     update erp.produto p set movimentado=true where p.id=item.produto_id;
     insert into erp.lote(unidade_id,entrada_item_id,produto_id,codigo,validade,valor_unitario) values(p_unidade,item.id,item.produto_id,coalesce(item.numero_lote,'E-'||id||'-I-'||item.id),item.validade,item.valor_unitario) returning lote.id into lote_id;
     insert into erp.saldo_lote_local(unidade_id,lote_id,camara_id,quantidade) values(p_unidade,lote_id,item.camara_id,item.quantidade);
     insert into erp.movimento_estoque(unidade_id,entrada_item_id,lote_id,camara_id,quantidade_delta,valor_unitario_snapshot,ator_id) values(p_unidade,item.id,lote_id,item.camara_id,item.quantidade,item.valor_unitario,ator);
    end if;
   end loop;
   update erp.entrada e set estado='CONFIRMADA',confirmado_por=ator,confirmado_em=now() where e.id=id;
  end if;
  resultado:=jsonb_build_object('entrada',erp_private.estoque_entrada_json(id));
  if p_acao='entrada_aprovar_divergencia' or ent.estado<>'CONFIRMADA' then
   insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois) values(p_unidade,ator,p_acao,'entrada',id,antes,resultado->'entrada');
  end if;
  if p_acao='entrada_confirmar' then update erp.comando_estoque c set resultado=op.resultado where c.unidade_id=p_unidade and c.ator_id=ator and c.acao=p_acao and c.chave=op.chave; end if;
  return resultado;
 elsif p_acao='entradas' then
  perform erp_private.estoque_objeto(p_dados,'{}');
  select coalesce(jsonb_agg(erp_private.estoque_entrada_json(x.id) order by x.id desc),'[]'::jsonb) into lista from (select e.id from erp.entrada e where e.unidade_id=p_unidade order by e.id desc limit 50) x;
  return jsonb_build_object('entradas',lista);
 elsif p_acao='saldos' then
  perform erp_private.estoque_objeto(p_dados,'{}');
  select coalesce(jsonb_agg(jsonb_build_object('produto_id',p.id::text,'produto',p.descricao,'unidade_medida',um.sigla,'lote_id',l.id::text,'lote',l.codigo,'validade',l.validade::text,
   'camara_id',c.id::text,'local',c.nome,'quantidade',s.quantidade::text,'valor_unitario',l.valor_unitario::text) order by p.id,l.id,c.id),'[]'::jsonb) into lista
   from erp.saldo_lote_local s join erp.lote l on l.id=s.lote_id and l.unidade_id=s.unidade_id join erp.produto p on p.id=l.produto_id
   join erp.unidade_medida um on um.id=p.unidade_medida_id join erp.camara c on c.id=s.camara_id and c.unidade_id=s.unidade_id where s.unidade_id=p_unidade;
  return jsonb_build_object('saldos',lista);
 end if;
exception
 when unique_violation then raise exception 'Registro duplicado' using errcode='PT409';
 when check_violation or not_null_violation or foreign_key_violation or numeric_value_out_of_range or invalid_text_representation then raise exception 'Conteúdo inválido' using errcode='PT422';
end $$;

-- Remove default PUBLIC execution from every helper introduced here.
do $grants$
declare fn record;
begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname like 'estoque_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to erp_stock_writer',fn.signature);
 end loop;
end $grants$;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.estoque_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.estoque_operacao(bigint,text,jsonb) to authenticated;
create function erp.estoque_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.estoque_operacao(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.estoque_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.estoque_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
commit;
