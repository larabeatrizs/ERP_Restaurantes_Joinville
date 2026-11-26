begin;

grant delete on erp.cardapio_refeicao to erp_stock_writer;
create policy cardapio_refeicao_remover_rascunho on erp.cardapio_refeicao for delete to erp_stock_writer
  using (exists (select 1 from erp.cardapio_dia d join erp.cardapio_versao v
    on v.unidade_id=d.unidade_id and v.id=d.cardapio_versao_id
    where d.unidade_id=cardapio_refeicao.unidade_id and d.id=cardapio_refeicao.cardapio_dia_id and v.estado='RASCUNHO'));

create or replace function erp_private.cardapio_editar_estimativas(p_unidade bigint,p_versao bigint,p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
declare
  ator uuid;
  atual erp.cardapio_versao;
  esperada bigint;
  item jsonb;
  dia date;
  tipo text;
  refeicoes jsonb;
  antes jsonb;
  depois jsonb;
  alteradas integer;
  removidas integer;
  substituir boolean;
  periodo erp.cardapio;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'A gravação exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=ator and p.codigo='NUTRICIONISTA') then
    raise exception 'Ação não permitida' using errcode='PT403';
  end if;

  perform erp_private.estoque_objeto(p_dados,array['revisao','refeicoes'],array['substituir']);
  substituir := p_dados ? 'substituir';
  if substituir and p_dados->'substituir' is distinct from 'true'::jsonb then
    raise exception 'Modo de edição inválido' using errcode='PT422';
  end if;
  esperada := erp_private.estoque_id(p_dados->'revisao');
  refeicoes := p_dados->'refeicoes';
  if p_versao is null or p_versao<=0 or jsonb_typeof(refeicoes) is distinct from 'array' then
    raise exception 'Dados inválidos' using errcode='PT422';
  end if;
  if jsonb_array_length(refeicoes) not between 1 and 93
    or (select count(distinct (value->>'data',value->>'tipo_refeicao')) from jsonb_array_elements(refeicoes))<>jsonb_array_length(refeicoes) then
    raise exception 'Refeições inválidas ou repetidas' using errcode='PT422';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('erp.calendario:'||p_unidade::text,0));
  select v.* into atual from erp.cardapio_versao v
    where v.unidade_id=p_unidade and v.id=p_versao and v.estado='RASCUNHO' for update;
  if not found then raise exception 'Rascunho indisponível' using errcode='PT404'; end if;
  if atual.revisao<>esperada then raise exception 'Rascunho desatualizado' using errcode='PT412'; end if;
  select * into periodo from erp.cardapio where unidade_id=p_unidade and id=atual.cardapio_id;
  antes := erp_private.cardapio_consultar_rascunhos(p_unidade,p_versao,null);

  for item in select value from jsonb_array_elements(refeicoes) loop
    perform erp_private.estoque_objeto(item,array['data','tipo_refeicao','estimadas']);
    dia := erp_private.estoque_data(item->'data');
    tipo := erp_private.estoque_texto(item->'tipo_refeicao',1,20);
    if jsonb_typeof(item->'estimadas') is distinct from 'number' or item->>'estimadas' !~ '^(0|[1-9][0-9]{0,9})$'
      or (item->>'estimadas')::numeric>2147483647
      or dia not between periodo.inicio and periodo.fim
      or (not substituir and not exists (select 1 from erp.cardapio_dia d join erp.cardapio_refeicao r
        on r.unidade_id=d.unidade_id and r.cardapio_dia_id=d.id
        where d.unidade_id=p_unidade and d.cardapio_versao_id=p_versao and d.data=dia and r.tipo_refeicao=tipo))
      or not exists (select 1 from erp_private.cardapio_grade(p_unidade,dia,dia) g where g.tipo_refeicao=tipo) then
      raise exception 'Refeição ou estimativa indisponível para este dia' using errcode='PT422';
    end if;
  end loop;

  if substituir then
    insert into erp.cardapio_dia(unidade_id,cardapio_id,cardapio_versao_id,periodo_inicio,periodo_fim,data)
      select distinct p_unidade,atual.cardapio_id,p_versao,periodo.inicio,periodo.fim,m.data
      from jsonb_to_recordset(refeicoes) as m(data date)
      on conflict (unidade_id,cardapio_versao_id,data) do nothing;

    insert into erp.cardapio_refeicao as r(unidade_id,cardapio_dia_id,tipo_refeicao,estimadas)
      select p_unidade,d.id,m.tipo_refeicao,m.estimadas
      from jsonb_to_recordset(refeicoes) as m(data date,tipo_refeicao text,estimadas integer)
      join erp.cardapio_dia d on d.unidade_id=p_unidade and d.cardapio_versao_id=p_versao and d.data=m.data
      on conflict (unidade_id,cardapio_dia_id,tipo_refeicao) do update set estimadas=excluded.estimadas
        where r.estimadas is distinct from excluded.estimadas;
    get diagnostics alteradas = row_count;

    delete from erp.cardapio_refeicao r using erp.cardapio_dia d
      where d.unidade_id=p_unidade and d.cardapio_versao_id=p_versao
        and r.unidade_id=d.unidade_id and r.cardapio_dia_id=d.id
        and not exists (select 1 from jsonb_to_recordset(refeicoes) as m(data date,tipo_refeicao text)
          where m.data=d.data and m.tipo_refeicao=r.tipo_refeicao);
    get diagnostics removidas = row_count;
    alteradas := alteradas+removidas;
  else
    update erp.cardapio_refeicao r set estimadas=m.estimadas
      from erp.cardapio_dia d
      join jsonb_to_recordset(refeicoes) as m(data date,tipo_refeicao text,estimadas integer) on m.data=d.data
      where d.unidade_id=p_unidade and d.cardapio_versao_id=p_versao
        and r.unidade_id=d.unidade_id and r.cardapio_dia_id=d.id and r.tipo_refeicao=m.tipo_refeicao
        and r.estimadas is distinct from m.estimadas;
    get diagnostics alteradas = row_count;
  end if;
  if alteradas=0 then return antes; end if;
  update erp.cardapio_versao v set revisao=v.revisao+1 where v.unidade_id=p_unidade and v.id=p_versao;
  depois := erp_private.cardapio_consultar_rascunhos(p_unidade,p_versao,null);
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois)
    values(p_unidade,ator,case when substituir then 'cardapio_ajustar_refeicoes' else 'cardapio_editar_estimativas' end,'cardapio',atual.cardapio_id,antes,depois);
  return depois;
end;
$$;

commit;
