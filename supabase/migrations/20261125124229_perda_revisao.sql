begin;

create table erp_private.perda_substituto (
  unidade_id bigint primary key references erp.unidade(id),
  usuario_id uuid not null references erp.usuario(id)
);
alter table erp_private.perda_substituto enable row level security;
revoke all on erp_private.perda_substituto from public, anon, authenticated, service_role;
grant select on erp_private.perda_substituto to erp_stock_writer;
create policy perda_substituto_leitura on erp_private.perda_substituto
  for select to erp_stock_writer using (erp_private.estoque_vinculado(unidade_id));

alter table erp_private.perda_estoque
  add column revisor_id uuid references erp.usuario(id),
  add column revisado_em timestamptz,
  add constraint perda_unidade_id_unique unique (unidade_id,id),
  add constraint perda_revisao_check check (
    (estado='PENDENTE' and revisor_id is null and revisado_em is null)
    or (estado in ('APROVADA','REJEITADA') and revisor_id is not null
      and revisor_id<>autor_id and revisado_em is not null)
  );

grant update (estado,revisor_id,revisado_em) on erp_private.perda_estoque to erp_stock_writer;
create policy perda_estoque_revisao on erp_private.perda_estoque for update to erp_stock_writer
  using (erp_private.estoque_vinculado(unidade_id) and estado='PENDENTE')
  with check (erp_private.estoque_vinculado(unidade_id)
    and revisor_id=(select erp_private.ator_autenticado()) and estado in ('APROVADA','REJEITADA'));

alter table erp.movimento_estoque
  add column perda_id bigint unique,
  add constraint movimento_perda_fk foreign key (unidade_id,perda_id)
    references erp_private.perda_estoque(unidade_id,id),
  drop constraint movimento_origem_check,
  add constraint movimento_origem_check check (
    num_nonnulls(entrada_item_id,requisicao_item_id,perda_id)=1
    and ((entrada_item_id is not null and quantidade_delta>0)
      or (entrada_item_id is null and quantidade_delta<0))
  );

create function erp_private.perda_revisar(p_unidade bigint,p_perda bigint,p_decisao text)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare
  ator uuid;
  competencia date;
  perda erp_private.perda_estoque;
  revisao_em timestamptz;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.unidade where id=p_unidade and codigo='RP-BUCAREIN')
    or not exists (
      select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
      where u.id=ator and (p.codigo='NUTRICIONISTA' or (p.codigo='GESTOR_UNIDADE'
        and exists (select 1 from erp_private.perda_substituto s
          where s.unidade_id=p_unidade and s.usuario_id=ator)))
    ) then
    raise exception 'Revisão indisponível para este perfil ou unidade' using errcode='PT403';
  end if;
  if p_decisao is null or p_decisao not in ('APROVADA','REJEITADA') then
    raise exception 'Decisão de perda inválida' using errcode='PT422';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'A trava de estoque exige READ COMMITTED' using errcode='25000';
  end if;

  select data_registro into competencia from erp_private.perda_estoque
    where unidade_id=p_unidade and id=p_perda;
  if not found then
    raise exception 'Perda indisponível' using errcode='PT404';
  end if;
  perform pg_advisory_xact_lock_shared(erp_private.estoque_periodo_chave(p_unidade,competencia));
  -- Serializa revisões também depois da transição, quando a política de UPDATE
  -- deixa de admitir a linha. Uma nova leitura reconhece o reenvio.
  perform pg_advisory_xact_lock(hashtextextended('erp.perda.revisao:'||p_perda::text,0));
  select * into perda from erp_private.perda_estoque where unidade_id=p_unidade and id=p_perda;
  if perda.autor_id=ator then
    raise exception 'O autor não pode revisar a própria perda' using errcode='PT403';
  end if;
  if perda.estado<>'PENDENTE' then
    if perda.estado=p_decisao and perda.revisor_id=ator then
      return perda.estado;
    end if;
    raise exception 'Perda já revisada' using errcode='PT409';
  end if;

  revisao_em := clock_timestamp();
  if p_decisao='APROVADA' then
    perform erp_private.estoque_periodo_exigir_aberto(p_unidade,competencia);
    update erp.saldo_lote_local set quantidade=quantidade-perda.quantidade
      where unidade_id=p_unidade and lote_id=perda.lote_id and camara_id=perda.camara_id
        and quantidade>=perda.quantidade;
    if not found then
      raise exception 'Saldo do lote indisponível ou insuficiente' using errcode='PT409';
    end if;
    revisao_em := clock_timestamp();
    insert into erp.movimento_estoque(unidade_id,perda_id,lote_id,camara_id,quantidade_delta,valor_unitario_snapshot,ator_id,ocorrido_em)
    values(p_unidade,perda.id,perda.lote_id,perda.camara_id,-perda.quantidade,perda.valor_unitario,ator,revisao_em);
  end if;

  update erp_private.perda_estoque set estado=p_decisao,revisor_id=ator,revisado_em=revisao_em
    where unidade_id=p_unidade and id=p_perda;
  if not found then
    raise exception 'Perda indisponível para revisão' using errcode='PT409';
  end if;
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois)
  values(p_unidade,ator,case p_decisao when 'APROVADA' then 'perda_aprovar' else 'perda_rejeitar' end,
    'perda',perda.id,to_jsonb(perda)-'chave',
    (to_jsonb(perda)-'chave') || jsonb_build_object('estado',p_decisao,'revisor_id',ator,'revisado_em',revisao_em));
  return p_decisao;
end;
$$;

revoke all on function erp_private.perda_revisar(bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_revisar(bigint,bigint,text) to erp_stock_writer;

do $patch$
declare
  fonte text := pg_get_functiondef('erp_private.estoque_extrato(bigint,text,jsonb)'::regprocedure);
  tipos text := '(''ENTRADA'',''REQUISICAO_RAPIDA'')';
  origem text := 'else ''REQUISICAO_RAPIDA'' end as origem';
begin
  if strpos(fonte,tipos)=0 or strpos(fonte,origem)=0 then
    raise exception 'Pontos de integração do extrato mudaram';
  end if;
  execute replace(replace(fonte,tipos,'(''ENTRADA'',''REQUISICAO_RAPIDA'',''PERDA'')'),
    origem,'when m.perda_id is not null then ''PERDA'' '||origem);
end;
$patch$;

commit;
