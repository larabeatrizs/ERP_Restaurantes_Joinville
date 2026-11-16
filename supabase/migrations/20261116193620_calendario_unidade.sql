-- CAD-007: structured unit calendar aggregate. No unit/identity seed or permission grant.
begin;
grant erp_stock_writer to current_user;
alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check(permissao in (
'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO','PRODUTO_LER','PRODUTO_GERIR','PRODUTO_CICLO_VIDA','CALENDARIO_EDITAR','ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA','CATEGORIA_EDITAR','CATEGORIA_CICLO_VIDA','MEDIDA_EDITAR','MEDIDA_CICLO_VIDA','FORNECEDOR_EDITAR','FORNECEDOR_CICLO_VIDA'));
create table erp.calendario_unidade(unidade_id bigint primary key references erp.unidade(id),revisao bigint not null default 1 check(revisao>0),atende_feriados boolean not null);
create table erp.calendario_semanal(unidade_id bigint not null references erp.calendario_unidade(unidade_id),dia_semana smallint not null check(dia_semana between 0 and 6),primary key(unidade_id,dia_semana));
create table erp.refeicao_habilitada(unidade_id bigint not null references erp.calendario_unidade(unidade_id),tipo text not null check(tipo in ('CAFE_MANHA','ALMOCO','JANTAR')),inicio time not null,fim time not null,capacidade integer check(capacidade>0),primary key(unidade_id,tipo),check(inicio<fim));
create table erp.calendario_excecao(unidade_id bigint not null references erp.calendario_unidade(unidade_id),data date not null check(data between date '0001-01-01' and date '9999-12-31'),tipo text not null check(tipo in ('FERIADO','FECHADO','ESPECIAL')),descricao text not null check(length(btrim(descricao)) between 1 and 200),primary key(unidade_id,data),unique(unidade_id,data,tipo));
create table erp.calendario_refeicao_especial(unidade_id bigint not null,data date not null,regime text not null default 'ESPECIAL' check(regime='ESPECIAL'),tipo text not null check(tipo in ('CAFE_MANHA','ALMOCO','JANTAR')),inicio time not null,fim time not null,capacidade integer check(capacidade>0),primary key(unidade_id,data,tipo),foreign key(unidade_id,data,regime) references erp.calendario_excecao(unidade_id,data,tipo) on delete cascade,check(inicio<fim));
do $$ declare t text; begin
 foreach t in array array['calendario_unidade','calendario_semanal','refeicao_habilitada','calendario_excecao','calendario_refeicao_especial'] loop
  execute format('alter table erp.%I enable row level security',t);
  execute format('create policy calendario_local on erp.%I for all to erp_stock_writer using(erp_private.estoque_vinculado(unidade_id)) with check(erp_private.estoque_vinculado(unidade_id))',t);
  execute format('revoke all on table erp.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on erp.%I to erp_stock_writer',t);
 end loop;
end $$;
revoke delete on erp.calendario_unidade from erp_stock_writer;

create function erp_private.calendario_refeicoes_json(p_unidade bigint,p_data date default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('tipo',r.tipo,'inicio',to_char(r.inicio,'HH24:MI'),'fim',to_char(r.fim,'HH24:MI'),'capacidade',r.capacidade) order by r.inicio,r.tipo),'[]'::jsonb)
 from (select tipo,inicio,fim,capacidade from erp.refeicao_habilitada where unidade_id=p_unidade and p_data is null
 union all select tipo,inicio,fim,capacidade from erp.calendario_refeicao_especial where unidade_id=p_unidade and data=p_data) r
$$;
create function erp_private.calendario_json(p_unidade bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unidade_id',c.unidade_id::text,'revisao',c.revisao::text,'atende_feriados',c.atende_feriados,
 'dias_semana',coalesce((select jsonb_agg(s.dia_semana order by s.dia_semana) from erp.calendario_semanal s where s.unidade_id=p_unidade),'[]'::jsonb),
 'refeicoes',erp_private.calendario_refeicoes_json(p_unidade),
 'excecoes',coalesce((select jsonb_agg(jsonb_build_object('data',e.data::text,'tipo',e.tipo,'descricao',e.descricao,'refeicoes',erp_private.calendario_refeicoes_json(p_unidade,e.data)) order by e.data) from erp.calendario_excecao e where e.unidade_id=p_unidade),'[]'::jsonb))
 from erp.calendario_unidade c where c.unidade_id=p_unidade
$$;
create function erp_private.calendario_inserir_refeicao(p_unidade bigint,p_data date,p jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_tipo text; v_inicio text; v_fim text; v_cap integer;
begin
 perform erp_private.estoque_objeto(p,array['tipo','inicio','fim','capacidade']);
 v_tipo:=erp_private.estoque_texto(p->'tipo',1,20);v_inicio:=erp_private.estoque_texto(p->'inicio',5,5);v_fim:=erp_private.estoque_texto(p->'fim',5,5);
 if v_tipo not in ('CAFE_MANHA','ALMOCO','JANTAR') or v_inicio !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_fim !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_inicio>=v_fim then raise exception 'Refeição inválida' using errcode='PT422'; end if;
 if p->'capacidade'<>'null'::jsonb then
  if jsonb_typeof(p->'capacidade')<>'number' or p->>'capacidade' !~ '^[1-9][0-9]{0,9}$' then raise exception 'Capacidade inválida' using errcode='PT422'; end if;
  v_cap:=(p->>'capacidade')::integer;
 end if;
 if p_data is null then insert into erp.refeicao_habilitada(unidade_id,tipo,inicio,fim,capacidade) values(p_unidade,v_tipo,v_inicio::time,v_fim::time,v_cap);
 else insert into erp.calendario_refeicao_especial(unidade_id,data,tipo,inicio,fim,capacidade) values(p_unidade,p_data,v_tipo,v_inicio::time,v_fim::time,v_cap); end if;
end $$;
create function erp_private.calendario_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare ator uuid:=erp_private.ator_autenticado(); atual erp.calendario_unidade; antes jsonb; depois jsonb; unidade jsonb; item jsonb; m jsonb; dia date; tipo text; motivo text; esperada bigint;
begin
 if ator is null then raise exception 'Acesso negado' using errcode='PT403'; end if;
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
 if p_acao is null or p_acao not in ('ler','salvar') then raise exception 'Ação inválida' using errcode='PT422'; end if;
 if not (erp_private.estoque_capacidade(p_unidade,'CALENDARIO_EDITAR') or (p_acao='ler' and erp_private.estoque_capacidade(p_unidade,'CONFIGURACAO_LER'))) then raise exception 'Ação não permitida' using errcode='PT403'; end if;
 if p_acao='ler' then perform erp_private.estoque_objeto(p_dados,'{}');
 else
  perform erp_private.estoque_objeto(p_dados,array['dias_semana','atende_feriados','refeicoes','excecoes','revisao','motivo']);
  motivo:=erp_private.estoque_texto(p_dados->'motivo',3,500);
  if p_dados->'revisao'<>'null'::jsonb then esperada:=erp_private.estoque_id(p_dados->'revisao');end if;
  if jsonb_typeof(p_dados->'atende_feriados')<>'boolean' or jsonb_typeof(p_dados->'dias_semana')<>'array' or jsonb_array_length(p_dados->'dias_semana')>7
   or jsonb_typeof(p_dados->'refeicoes')<>'array' or jsonb_array_length(p_dados->'refeicoes')>3 or jsonb_typeof(p_dados->'excecoes')<>'array' or jsonb_array_length(p_dados->'excecoes')>200 then raise exception 'Calendário inválido' using errcode='PT422'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('erp.calendario:'||p_unidade::text,0));
  if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404'; end if;
  if not erp_private.estoque_capacidade(p_unidade,'CALENDARIO_EDITAR') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  select * into atual from erp.calendario_unidade where unidade_id=p_unidade for update;
  if (atual.unidade_id is not null and esperada is null) or (esperada is not null and (atual.unidade_id is null or esperada<>atual.revisao)) then raise exception 'Revisão desatualizada' using errcode='PT412'; end if;
  antes:=erp_private.calendario_json(p_unidade);
  insert into erp.calendario_unidade(unidade_id,atende_feriados) values(p_unidade,(p_dados->>'atende_feriados')::boolean)
   on conflict(unidade_id) do update set atende_feriados=excluded.atende_feriados,revisao=erp.calendario_unidade.revisao+1;
  delete from erp.calendario_excecao where unidade_id=p_unidade;delete from erp.refeicao_habilitada where unidade_id=p_unidade;delete from erp.calendario_semanal where unidade_id=p_unidade;
  for item in select value from jsonb_array_elements(p_dados->'dias_semana') loop
   if jsonb_typeof(item)<>'number' or item#>>'{}' !~ '^[0-6]$' then raise exception 'Dia inválido' using errcode='PT422';end if;
   insert into erp.calendario_semanal values(p_unidade,(item#>>'{}')::smallint);
  end loop;
  for m in select value from jsonb_array_elements(p_dados->'refeicoes') loop perform erp_private.calendario_inserir_refeicao(p_unidade,null,m);end loop;
  for item in select value from jsonb_array_elements(p_dados->'excecoes') loop
   perform erp_private.estoque_objeto(item,array['data','tipo','descricao','refeicoes']);dia:=erp_private.estoque_data(item->'data');tipo:=erp_private.estoque_texto(item->'tipo',1,20);
   if tipo not in ('FERIADO','FECHADO','ESPECIAL') or jsonb_typeof(item->'refeicoes')<>'array' or jsonb_array_length(item->'refeicoes')>3 or (tipo='ESPECIAL' and jsonb_array_length(item->'refeicoes')=0) or (tipo<>'ESPECIAL' and jsonb_array_length(item->'refeicoes')<>0) then raise exception 'Exceção inválida' using errcode='PT422'; end if;
   insert into erp.calendario_excecao values(p_unidade,dia,tipo,erp_private.estoque_texto(item->'descricao',1,200));
   for m in select value from jsonb_array_elements(item->'refeicoes') loop perform erp_private.calendario_inserir_refeicao(p_unidade,dia,m);end loop;
  end loop;
  if not erp_private.estoque_capacidade(p_unidade,'CALENDARIO_EDITAR') then raise exception 'Ação não permitida' using errcode='PT403'; end if;
  depois:=erp_private.calendario_json(p_unidade);
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois) values(p_unidade,ator,'calendario_salvar','calendario_unidade',p_unidade,antes,jsonb_build_object('configuracao',depois,'motivo',motivo));
 end if;
 select jsonb_build_object('id',id::text,'codigo',codigo,'nome',nome) into unidade from erp.unidade where id=p_unidade;
 return jsonb_build_object('unidade',unidade,'calendario',erp_private.calendario_json(p_unidade),'pode_editar',erp_private.estoque_capacidade(p_unidade,'CALENDARIO_EDITAR'));
exception when unique_violation or check_violation or foreign_key_violation or numeric_value_out_of_range or invalid_text_representation or invalid_parameter_value then raise exception 'Calendário inválido' using errcode='PT422';
end $$;
do $$ declare f record; begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname like 'calendario_%' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to erp_stock_writer',f.signature);end loop;end $$;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.calendario_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.calendario_operacao(bigint,text,jsonb) to authenticated;
create function erp.calendario_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb language sql security invoker set search_path='' as $$ select erp_private.calendario_operacao(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.calendario_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.calendario_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
notify pgrst,'reload schema';commit;
