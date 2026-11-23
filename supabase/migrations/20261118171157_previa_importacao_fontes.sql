begin;
create table erp_private.produto_importado (
 id bigint generated always as identity primary key,
 chave text not null unique,
 descricao text not null check(length(btrim(descricao)) between 1 and 200),
 origens jsonb not null check(jsonb_typeof(origens)='array' and jsonb_array_length(origens) between 1 and 20),
 criado_por uuid not null references erp.usuario(id),
 criado_em timestamptz not null default now(),
 estado text not null default 'PENDENTE' check(estado in ('PENDENTE','CONCLUIDO')),
 produto_id bigint references erp.produto(id) on delete set null,
 concluido_por uuid references erp.usuario(id),
 concluido_unidade bigint references erp.unidade(id),
 concluido_em timestamptz,
 entrada jsonb,
 resultado jsonb,
 check(chave=erp_private.estoque_normalizar(descricao)),
 check((estado='PENDENTE' and concluido_por is null and concluido_unidade is null and concluido_em is null and entrada is null and resultado is null and produto_id is null)
    or (estado='CONCLUIDO' and concluido_por is not null and concluido_unidade is not null and concluido_em is not null and entrada is not null and resultado is not null))
);
create index produto_importado_pendentes_idx on erp_private.produto_importado(chave,id) where estado='PENDENTE';
alter table erp_private.produto_importado enable row level security;
revoke all on table erp_private.produto_importado from public,anon,authenticated;
revoke all on sequence erp_private.produto_importado_id_seq from public,anon,authenticated;
grant select on erp_private.produto_importado to erp_stock_writer;
grant update(estado,produto_id,concluido_por,concluido_unidade,concluido_em,entrada,resultado) on erp_private.produto_importado to erp_stock_writer;
create policy importado_leitura on erp_private.produto_importado for select to erp_stock_writer using(true);
create policy importado_concluir on erp_private.produto_importado for update to erp_stock_writer using(true) with check(true);

grant erp_stock_writer to current_user;
create function erp_private.produto_importado_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare item erp_private.produto_importado; dados jsonb; resposta jsonb; consulta text; deslocamento integer; alvo bigint;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404';end if;
 if not erp_private.estoque_capacidade(p_unidade,'PRODUTO_GERIR') then raise exception 'Ação não permitida' using errcode='PT403';end if;
 if p_acao='listar' then
  perform erp_private.estoque_objeto(p_dados,array['q','offset']);
  consulta:=erp_private.estoque_texto(p_dados->'q',0,200);
  if jsonb_typeof(p_dados->'offset') is distinct from 'number' or (p_dados->>'offset')!~'^(0|[1-9][0-9]*)$' then raise exception 'Deslocamento inválido' using errcode='PT422';end if;
  deslocamento:=(p_dados->>'offset')::integer;
  return jsonb_build_object('total',(select count(*)::integer from erp_private.produto_importado i where estado='PENDENTE' and position(erp_private.estoque_normalizar(consulta) in chave)>0),
   'itens',coalesce((select jsonb_agg(jsonb_build_object('id',s.id::text,'descricao',s.descricao,'origens',s.origens) order by s.chave,s.id) from
    (select * from erp_private.produto_importado where estado='PENDENTE' and position(erp_private.estoque_normalizar(consulta) in chave)>0 order by chave,id limit 50 offset deslocamento)s),'[]'::jsonb));
 elsif p_acao='concluir' then
  perform erp_private.estoque_objeto(p_dados,array['id','produto']);alvo:=erp_private.estoque_id(p_dados->'id');dados:=p_dados->'produto';
  perform pg_advisory_xact_lock(hashtextextended('erp.estoque.unidade:'||p_unidade::text,0));
  select * into item from erp_private.produto_importado where id=alvo for update;
  if not found then raise exception 'Importado indisponível' using errcode='PT404';end if;
  if item.estado='CONCLUIDO' then
   if item.produto_id is null or item.concluido_por<>erp_private.ator_autenticado() or item.concluido_unidade<>p_unidade or item.entrada is distinct from dados then
    raise exception 'Cadastro já concluído; consulte os produtos' using errcode='PT409';end if;
   return item.resultado;
  end if;
  if jsonb_typeof(dados)<>'object' or dados?'id' or dados?'revisao' then raise exception 'Dados inválidos' using errcode='PT422';end if;
  resposta:=erp_private.estoque_operacao(p_unidade,'produto_salvar',dados);
  update erp_private.produto_importado set estado='CONCLUIDO',produto_id=(resposta->'produto'->>'id')::bigint,
   concluido_por=erp_private.ator_autenticado(),concluido_unidade=p_unidade,concluido_em=now(),entrada=dados,resultado=resposta where id=alvo;
  return resposta;
 end if;
 raise exception 'Ação inválida' using errcode='PT422';
end $$;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.produto_importado_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.produto_importado_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp_private.produto_importado_operacao(bigint,text,jsonb) to authenticated;
create function erp.produto_importado_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$select erp_private.produto_importado_operacao(p_unidade,p_acao,p_dados)$$;
revoke all on function erp.produto_importado_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.produto_importado_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
commit;
