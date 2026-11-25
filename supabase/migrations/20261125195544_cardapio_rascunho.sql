begin;

alter table erp.cardapio_versao
  add column chave_criacao uuid,
  add column hash_criacao bytea,
  add constraint cardapio_versao_chave_criacao_check check (
    (chave_criacao is null and hash_criacao is null)
    or (chave_criacao is not null and hash_criacao is not null and octet_length(hash_criacao)=32)
  );
create unique index cardapio_versao_chave_criacao_idx
  on erp.cardapio_versao(unidade_id,nutricionista_id,chave_criacao) where chave_criacao is not null;

grant select,insert on erp.cardapio,erp.cardapio_versao,erp.cardapio_dia,erp.cardapio_refeicao to erp_stock_writer;
grant usage on sequence erp.cardapio_id_seq,erp.cardapio_versao_id_seq,erp.cardapio_dia_id_seq,erp.cardapio_refeicao_id_seq to erp_stock_writer;

do $policies$
declare tabela text;
begin
  foreach tabela in array array['cardapio','cardapio_versao','cardapio_dia','cardapio_refeicao'] loop
    execute format('create policy cardapio_leitura on erp.%I for select to erp_stock_writer using (erp_private.estoque_vinculado(unidade_id))',tabela);
    execute format('create policy cardapio_registro on erp.%I for insert to erp_stock_writer with check (erp_private.estoque_vinculado(unidade_id))',tabela);
  end loop;
end;
$policies$;

create function erp_private.cardapio_grade(p_unidade bigint,p_inicio date,p_fim date)
returns table(data date,tipo_refeicao text) language sql stable security invoker set search_path='' as $$
  with dias as (
    select p_inicio+n as data from generate_series(0,p_fim-p_inicio) n
  )
  select d.data,r.tipo
  from dias d
  join erp.calendario_unidade c on c.unidade_id=p_unidade
  left join erp.calendario_excecao e on e.unidade_id=p_unidade and e.data=d.data
  join erp.calendario_semanal s on s.unidade_id=p_unidade and s.dia_semana=extract(dow from d.data)
  join erp.refeicao_habilitada r on r.unidade_id=p_unidade
  where e.tipo is null or (e.tipo='FERIADO' and c.atende_feriados)
  union all
  select r.data,r.tipo from erp.calendario_refeicao_especial r
  where r.unidade_id=p_unidade and r.data between p_inicio and p_fim
$$;

create function erp_private.cardapio_rascunho(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' set lock_timeout='5s' as $$
declare
  ator uuid;
  inicio date;
  fim date;
  tipo_periodo text;
  cardapio bigint;
  versao bigint;
  chave uuid;
  hash_pedido bytea;
  hash_anterior bytea;
  item jsonb;
  refeicoes jsonb;
  item_data date;
  item_tipo text;
begin
  if p_acao is null or p_acao not in ('grade','criar') then raise exception 'Ação inválida' using errcode='PT422'; end if;
  if p_acao='criar' and current_setting('transaction_isolation')<>'read committed' then
    raise exception 'A gravação exige READ COMMITTED' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=ator and p.codigo='NUTRICIONISTA') then raise exception 'Ação não permitida' using errcode='PT403'; end if;

  if p_acao='grade' then
    perform erp_private.estoque_objeto(p_dados,array['inicio','fim','tipo_periodo']);
  else
    perform erp_private.estoque_objeto(p_dados,array['inicio','fim','tipo_periodo','chave','refeicoes']);
  end if;
  inicio := erp_private.estoque_data(p_dados->'inicio');
  fim := erp_private.estoque_data(p_dados->'fim');
  tipo_periodo := erp_private.estoque_texto(p_dados->'tipo_periodo',1,10);
  if tipo_periodo not in ('SEMANAL','MENSAL') or fim<inicio
    or fim-inicio >= (case tipo_periodo when 'SEMANAL' then 7 else 31 end) then
    raise exception 'Período inválido' using errcode='PT422';
  end if;
  if p_acao='grade' then
    return jsonb_build_object('refeicoes',coalesce((
      select jsonb_agg(jsonb_build_object('data',to_char(g.data,'YYYY-MM-DD'),'tipo_refeicao',g.tipo_refeicao) order by g.data,g.tipo_refeicao)
      from erp_private.cardapio_grade(p_unidade,inicio,fim) g
    ),'[]'::jsonb));
  end if;

  if jsonb_typeof(p_dados->'chave') is distinct from 'string'
    or p_dados->>'chave' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_dados->'refeicoes') is distinct from 'array' then
    raise exception 'Dados de cardápio inválidos' using errcode='PT422';
  end if;
  if jsonb_array_length(p_dados->'refeicoes') not between 1 and 3*(fim-inicio+1) then
    raise exception 'Quantidade de refeições inválida' using errcode='PT422';
  end if;
  chave := (p_dados->>'chave')::uuid;
  select jsonb_agg(value order by value->>'data',value->>'tipo_refeicao') into refeicoes from jsonb_array_elements(p_dados->'refeicoes');
  hash_pedido := sha256(convert_to(((p_dados-array['chave','refeicoes'])||jsonb_build_object('refeicoes',refeicoes))::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('erp.cardapio.rascunho:'||p_unidade::text||':'||ator::text||':'||chave::text,0));
  select v.cardapio_id,v.id,v.hash_criacao into cardapio,versao,hash_anterior from erp.cardapio_versao v
    where v.unidade_id=p_unidade and v.nutricionista_id=ator and v.chave_criacao=chave;
  if found then
    if hash_anterior<>hash_pedido then raise exception 'Chave reutilizada com outros dados' using errcode='PT409'; end if;
    return jsonb_build_object('cardapio_id',cardapio::text,'versao_id',versao::text);
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('erp.calendario:'||p_unidade::text,0));
  if (select count(distinct (value->>'data',value->>'tipo_refeicao')) from jsonb_array_elements(refeicoes))
    <> jsonb_array_length(refeicoes) then
    raise exception 'Refeição repetida no mesmo dia' using errcode='PT422';
  end if;
  for item in select value from jsonb_array_elements(refeicoes) loop
    perform erp_private.estoque_objeto(item,array['data','tipo_refeicao','estimadas']);
    item_data := erp_private.estoque_data(item->'data');
    item_tipo := erp_private.estoque_texto(item->'tipo_refeicao',1,20);
    if jsonb_typeof(item->'estimadas') is distinct from 'number' or item->>'estimadas' !~ '^(0|[1-9][0-9]{0,9})$'
      or (item->>'estimadas')::numeric>2147483647
      or not exists (select 1 from erp_private.cardapio_grade(p_unidade,inicio,fim) g where g.data=item_data and g.tipo_refeicao=item_tipo) then
      raise exception 'Refeição ou estimativa indisponível para este dia' using errcode='PT422';
    end if;
  end loop;

  insert into erp.cardapio(unidade_id,inicio,fim,tipo_periodo) values(p_unidade,inicio,fim,tipo_periodo) returning id into cardapio;
  insert into erp.cardapio_versao(unidade_id,cardapio_id,numero,nutricionista_id,chave_criacao,hash_criacao)
    values(p_unidade,cardapio,1,ator,chave,hash_pedido) returning id into versao;
  insert into erp.cardapio_dia(unidade_id,cardapio_id,cardapio_versao_id,periodo_inicio,periodo_fim,data)
    select distinct p_unidade,cardapio,versao,inicio,fim,(value->>'data')::date from jsonb_array_elements(refeicoes);
  insert into erp.cardapio_refeicao(unidade_id,cardapio_dia_id,tipo_refeicao,estimadas)
    select p_unidade,d.id,r.value->>'tipo_refeicao',(r.value->>'estimadas')::integer
    from jsonb_array_elements(refeicoes) as r
    join erp.cardapio_dia d on d.unidade_id=p_unidade and d.cardapio_versao_id=versao and d.data=(r.value->>'data')::date;
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,depois)
    values(p_unidade,ator,'cardapio_criar_rascunho','cardapio',cardapio,
      jsonb_build_object('versao_id',versao::text,'estado','RASCUNHO','inicio',inicio,'fim',fim,'refeicoes',refeicoes));
  return jsonb_build_object('cardapio_id',cardapio::text,'versao_id',versao::text);
end;
$$;

revoke all on function erp_private.cardapio_grade(bigint,date,date),erp_private.cardapio_rascunho(bigint,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function erp_private.cardapio_grade(bigint,date,date),erp_private.cardapio_rascunho(bigint,text,jsonb)
  to erp_stock_writer;

commit;
