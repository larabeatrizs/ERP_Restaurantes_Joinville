-- EST-002/C2: no accounts, resets, synthetic movements or ADMIN privileges.
begin;
set local lock_timeout='5s';
grant erp_stock_writer to current_user;
alter table erp.perfil_permissao drop constraint perfil_permissao_permissao_check;
alter table erp.perfil_permissao add constraint perfil_permissao_permissao_check check(permissao in (
'CONFIGURACAO_LER','CONFIGURACAO_EDITAR','CONFIGURACAO_HISTORICO','PRODUTO_LER','PRODUTO_GERIR','PRODUTO_CICLO_VIDA','CALENDARIO_EDITAR','ESTOQUE_LER','RECEBIMENTO_GERIR','RECEBIMENTO_APROVAR_DIVERGENCIA','CATEGORIA_EDITAR','CATEGORIA_CICLO_VIDA','MEDIDA_EDITAR','MEDIDA_CICLO_VIDA','FORNECEDOR_EDITAR','FORNECEDOR_CICLO_VIDA',
'USUARIO_LER','USUARIO_GERIR','USUARIO_CICLO_VIDA','REQUISICAO_REGISTRAR','REQUISICAO_CONFERIR'));
-- DRS RF-013/RN-034: I does not grant A; ADMIN remains consultation only here.
-- BEGIN WITHDRAWAL CAPABILITY SEED
insert into erp.perfil_permissao(perfil_id,permissao)
 select id,'REQUISICAO_REGISTRAR' from erp.perfil where codigo in('ESTOQUISTA','COZINHA') on conflict do nothing;
insert into erp.perfil_permissao(perfil_id,permissao)
 select id,'REQUISICAO_CONFERIR' from erp.perfil where codigo in('GESTOR_UNIDADE','NUTRICIONISTA') on conflict do nothing;
-- END WITHDRAWAL CAPABILITY SEED

create table erp.requisicao_rapida (
 id bigint generated always as identity primary key, unidade_id bigint not null references erp.unidade(id),
 produto_id bigint not null, quantidade numeric(18,6) not null check(quantidade>0),
 solicitante_id uuid not null references erp.usuario(id), retirado_por text not null check(length(btrim(retirado_por)) between 1 and 200),
 data_movimento date not null, criado_em timestamptz not null default clock_timestamp(),
 modo_snapshot text not null check(modo_snapshot='POSTERIOR'), configuracao_revisao bigint not null check(configuracao_revisao>0),
 estado text not null default 'REGISTRADA' check(estado in('REGISTRADA','CONFERIDA','CONTESTADA')),
 revisao bigint not null default 1 check(revisao>0), conferido_por uuid references erp.usuario(id), conferido_em timestamptz,
 motivo text not null default '', unique(unidade_id,id),
 foreign key(unidade_id,produto_id) references erp.produto_unidade(unidade_id,produto_id),
 check((estado='REGISTRADA' and conferido_por is null and conferido_em is null and motivo='')
   or (estado in('CONFERIDA','CONTESTADA') and conferido_por is not null and conferido_em is not null and conferido_por<>solicitante_id
       and (estado<>'CONTESTADA' or length(btrim(motivo)) between 3 and 500)))
);
create index requisicao_unidade_estado_idx on erp.requisicao_rapida(unidade_id,estado,id desc);
create index requisicao_produto_idx on erp.requisicao_rapida(unidade_id,produto_id);
create index requisicao_solicitante_idx on erp.requisicao_rapida(solicitante_id);
create index requisicao_conferido_idx on erp.requisicao_rapida(conferido_por);
create table erp.requisicao_item (
 id bigint generated always as identity primary key, unidade_id bigint not null, requisicao_id bigint not null,
 lote_id bigint not null, camara_id bigint not null, quantidade numeric(18,6) not null check(quantidade>0),
 unique(unidade_id,id), unique(unidade_id,requisicao_id,lote_id,camara_id),
 foreign key(unidade_id,requisicao_id) references erp.requisicao_rapida(unidade_id,id),
 foreign key(unidade_id,lote_id) references erp.lote(unidade_id,id),
 foreign key(unidade_id,camara_id) references erp.camara(unidade_id,id)
);
create index requisicao_item_lote_idx on erp.requisicao_item(unidade_id,lote_id);
create index requisicao_item_camara_idx on erp.requisicao_item(unidade_id,camara_id);
create table erp.requisicao_comando (
 unidade_id bigint not null references erp.unidade(id), ator_id uuid not null references erp.usuario(id), chave uuid not null,
 conteudo jsonb not null, resultado jsonb not null, primary key(unidade_id,ator_id,chave)
);
create index requisicao_comando_ator_idx on erp.requisicao_comando(ator_id);

-- Exactly one immutable source per ledger row. Existing receipt rows satisfy this unchanged.
alter table erp.movimento_estoque alter column entrada_item_id drop not null;
alter table erp.movimento_estoque add column requisicao_item_id bigint unique;
alter table erp.movimento_estoque add constraint movimento_requisicao_fk foreign key(unidade_id,requisicao_item_id) references erp.requisicao_item(unidade_id,id);
alter table erp.movimento_estoque add constraint movimento_origem_check check(
 (entrada_item_id is not null and requisicao_item_id is null and quantidade_delta>0)
 or (entrada_item_id is null and requisicao_item_id is not null and quantidade_delta<0));
create index movimento_requisicao_idx on erp.movimento_estoque(unidade_id,requisicao_item_id);
create trigger requisicao_item_imutavel before update or delete on erp.requisicao_item for each row execute function erp_private.estoque_imutavel();
create trigger requisicao_comando_imutavel before update or delete on erp.requisicao_comando for each row execute function erp_private.estoque_imutavel();
create function erp_private.requisicao_imutavel() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Retirada imutável' using errcode='42501';end if;
 if old.estado<>'REGISTRADA' or new.estado not in('CONFERIDA','CONTESTADA')
  or (to_jsonb(new)-array['estado','revisao','conferido_por','conferido_em','motivo'])<>(to_jsonb(old)-array['estado','revisao','conferido_por','conferido_em','motivo'])
  or new.revisao<>old.revisao+1 then raise exception 'Retirada imutável' using errcode='42501';end if;
 return new;
end $$;
revoke all on function erp_private.requisicao_imutavel() from public,anon,authenticated;
create trigger requisicao_imutavel before update or delete on erp.requisicao_rapida for each row execute function erp_private.requisicao_imutavel();
do $$ declare t text; begin
 foreach t in array array['requisicao_rapida','requisicao_item','requisicao_comando'] loop
  execute format('alter table erp.%I enable row level security',t);
  execute format('revoke all on erp.%I from public,anon,authenticated',t);
  execute format('create policy requisicao_local on erp.%I for all to erp_stock_writer using (erp_private.estoque_vinculado(unidade_id)) with check (erp_private.estoque_vinculado(unidade_id))',t);
  execute format('grant select,insert on erp.%I to erp_stock_writer',t);
 end loop;
end $$;
grant update(estado,revisao,conferido_por,conferido_em,motivo) on erp.requisicao_rapida to erp_stock_writer;
grant update(quantidade) on erp.saldo_lote_local to erp_stock_writer;
grant usage on sequence erp.requisicao_rapida_id_seq,erp.requisicao_item_id_seq to erp_stock_writer;
revoke all on sequence erp.requisicao_rapida_id_seq,erp.requisicao_item_id_seq from public,anon,authenticated;
grant select on erp.parametro_unidade to erp_stock_writer;
create policy requisicao_configuracao on erp.parametro_unidade for select to erp_stock_writer using(erp_private.estoque_vinculado(unidade_id));

create function erp_private.requisicao_json(p_id bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id::text,'unidade_id',r.unidade_id::text,'produto_id',r.produto_id::text,
 'quantidade',r.quantidade::text,'solicitante_id',r.solicitante_id::text,'retirado_por',r.retirado_por,
 'data_movimento',r.data_movimento::text,'modo_snapshot',r.modo_snapshot,'configuracao_revisao',r.configuracao_revisao::text,
 'estado',r.estado,'revisao',r.revisao::text,'conferido_por',r.conferido_por::text,'motivo',r.motivo,
 'itens',coalesce((select jsonb_agg(jsonb_build_object('id',i.id::text,'lote_id',i.lote_id::text,
 'camara_id',i.camara_id::text,'quantidade',i.quantidade::text) order by i.id) from erp.requisicao_item i
 where i.unidade_id=r.unidade_id and i.requisicao_id=r.id),'[]'::jsonb)) from erp.requisicao_rapida r where r.id=p_id
$$;
revoke all on function erp_private.requisicao_json(bigint) from public,anon,authenticated;
grant execute on function erp_private.requisicao_json(bigint) to erp_stock_writer;

create function erp_private.requisicao_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
 v_ator uuid; v_cfg record; v_produto erp.produto; v_doc erp.requisicao_rapida; v_linha record;
 v_chave uuid; v_id bigint; v_item bigint; v_prod bigint; v_q numeric; v_resta numeric; v_usar numeric;
 v_nome text; v_motivo text; v_estado text; v_rev bigint; v_hoje date; v_resultado jsonb; v_antes jsonb; v_cmd record;
begin
 v_ator:=erp_private.ator_autenticado();
 if v_ator is null then raise exception 'Sessão necessária' using errcode='PT403'; end if;
 if p_acao not in('registrar','conferir','listar') or p_acao is null then raise exception 'Ação inválida' using errcode='PT422';end if;
 if p_acao<>'listar' then
  -- Administrative profile/link/status changes take the exclusive counterpart.
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  -- Future period closure must use this same unit lock, before changing its state.
  perform pg_advisory_xact_lock(hashtextextended('erp.estoque.unidade:'||p_unidade::text,0));
 end if;
 if not erp_private.estoque_vinculado(p_unidade) then raise exception 'Unidade indisponível' using errcode='PT404';end if;
 if p_acao='listar' then
  perform erp_private.estoque_objeto(p_dados,'{}');
  if not (erp_private.estoque_capacidade(p_unidade,'ESTOQUE_LER') or erp_private.estoque_capacidade(p_unidade,'REQUISICAO_REGISTRAR') or erp_private.estoque_capacidade(p_unidade,'REQUISICAO_CONFERIR')) then raise exception 'Acesso negado' using errcode='PT403';end if;
  return jsonb_build_object('requisicoes',coalesce((select jsonb_agg(erp_private.requisicao_json(x.id) order by x.id desc)
   from(select r.id from erp.requisicao_rapida r where r.unidade_id=p_unidade order by r.id desc limit 50)x),'[]'::jsonb));
 elsif p_acao='registrar' then
  if not erp_private.estoque_capacidade(p_unidade,'REQUISICAO_REGISTRAR') then raise exception 'Acesso negado' using errcode='PT403';end if;
  perform erp_private.estoque_objeto(p_dados,array['produto_id','quantidade','retirado_por','chave']);
  v_prod:=erp_private.estoque_id(p_dados->'produto_id');v_q:=erp_private.estoque_decimal(p_dados->'quantidade');
  v_nome:=erp_private.estoque_texto(p_dados->'retirado_por',1,200);
  if v_q<=0 or v_nome !~ '[^[:space:]]' or jsonb_typeof(p_dados->'chave')<>'string'
    or p_dados->>'chave' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Dados inválidos' using errcode='PT422';end if;
  v_chave:=(p_dados->>'chave')::uuid;
  select * into v_cmd from erp.requisicao_comando c where c.unidade_id=p_unidade and c.ator_id=v_ator and c.chave=v_chave;
  if found then
   if v_cmd.conteudo<>p_dados then raise exception 'Chave reutilizada' using errcode='PT409';end if;
   return v_cmd.resultado;
  end if;
  select * into v_produto from erp.produto p where p.id=v_prod and p.status='ATIVO' for no key update;
  if not found or not exists(select 1 from erp.produto_unidade pu where pu.unidade_id=p_unidade and pu.produto_id=v_prod) then raise exception 'Produto indisponível' using errcode='PT422';end if;
  perform c.id from erp.camara c join erp.saldo_lote_local s on s.unidade_id=c.unidade_id and s.camara_id=c.id
   join erp.lote l on l.unidade_id=s.unidade_id and l.id=s.lote_id where s.unidade_id=p_unidade and l.produto_id=v_prod
   order by c.id for share of c;
  -- Stable physical lock order, independently of FEFO iteration order.
  perform s.lote_id from erp.saldo_lote_local s join erp.lote l on l.unidade_id=s.unidade_id and l.id=s.lote_id
   where s.unidade_id=p_unidade and l.produto_id=v_prod order by s.lote_id,s.camara_id for update of s;
  if not erp_private.estoque_capacidade(p_unidade,'REQUISICAO_REGISTRAR') then raise exception 'Acesso revogado' using errcode='PT403';end if;
  select * into v_cfg from erp.parametro_unidade c where c.unidade_id=p_unidade;
  if not found or v_cfg.modo_saida<>'POSTERIOR' then raise exception 'Modo Posterior necessário' using errcode='PT409';end if;
  v_hoje:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  insert into erp.requisicao_rapida(unidade_id,produto_id,quantidade,solicitante_id,retirado_por,data_movimento,modo_snapshot,configuracao_revisao)
   values(p_unidade,v_prod,v_q,v_ator,v_nome,v_hoje,'POSTERIOR',v_cfg.revisao) returning id into v_id;
  v_resta:=v_q;
  for v_linha in select s.*,l.valor_unitario from erp.saldo_lote_local s join erp.lote l on l.unidade_id=s.unidade_id and l.id=s.lote_id
   join erp.camara c on c.unidade_id=s.unidade_id and c.id=s.camara_id
   where s.unidade_id=p_unidade and l.produto_id=v_prod and s.quantidade>0 and c.status='ATIVO'
    and (l.validade>=v_hoje or (l.validade is null and not v_produto.perecivel))
   order by l.validade asc nulls last,l.id,s.camara_id loop
   exit when v_resta=0;
   v_usar:=least(v_resta,v_linha.quantidade);
   insert into erp.requisicao_item(unidade_id,requisicao_id,lote_id,camara_id,quantidade)
    values(p_unidade,v_id,v_linha.lote_id,v_linha.camara_id,v_usar) returning id into v_item;
   update erp.saldo_lote_local s set quantidade=s.quantidade-v_usar where s.unidade_id=p_unidade and s.lote_id=v_linha.lote_id and s.camara_id=v_linha.camara_id;
   insert into erp.movimento_estoque(unidade_id,requisicao_item_id,lote_id,camara_id,quantidade_delta,valor_unitario_snapshot,ator_id)
    values(p_unidade,v_item,v_linha.lote_id,v_linha.camara_id,-v_usar,v_linha.valor_unitario,v_ator);
   v_resta:=v_resta-v_usar;
  end loop;
  if v_resta<>0 then raise exception 'Saldo válido insuficiente' using errcode='PT409';end if;
  v_resultado:=jsonb_build_object('requisicao',erp_private.requisicao_json(v_id));
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,depois) values(p_unidade,v_ator,'requisicao_registrar','requisicao',v_id,v_resultado->'requisicao');
  insert into erp.requisicao_comando(unidade_id,ator_id,chave,conteudo,resultado) values(p_unidade,v_ator,v_chave,p_dados,v_resultado);
  return v_resultado;
 else
  if not erp_private.estoque_capacidade(p_unidade,'REQUISICAO_CONFERIR') then raise exception 'Acesso negado' using errcode='PT403';end if;
  perform erp_private.estoque_objeto(p_dados,array['id','revisao','estado','motivo']);
  v_id:=erp_private.estoque_id(p_dados->'id');v_rev:=erp_private.estoque_id(p_dados->'revisao');
  v_estado:=erp_private.estoque_texto(p_dados->'estado',1,20);v_motivo:=erp_private.estoque_texto(p_dados->'motivo',0,500);
  if v_estado not in('CONFERIDA','CONTESTADA') or (v_estado='CONTESTADA' and (length(btrim(v_motivo))<3 or v_motivo !~ '[^[:space:]]')) then raise exception 'Conferência inválida' using errcode='PT422';end if;
  select * into v_doc from erp.requisicao_rapida r where r.unidade_id=p_unidade and r.id=v_id for no key update;
  if not found then raise exception 'Retirada indisponível' using errcode='PT404';end if;
  if v_doc.solicitante_id=v_ator or not erp_private.estoque_capacidade(p_unidade,'REQUISICAO_CONFERIR') then raise exception 'Conferência negada' using errcode='PT403';end if;
  if v_doc.revisao<>v_rev then raise exception 'Revisão alterada' using errcode='PT412';end if;
  if v_doc.estado<>'REGISTRADA' then raise exception 'Conferência já concluída' using errcode='PT409';end if;
  v_antes:=erp_private.requisicao_json(v_id);
  update erp.requisicao_rapida set estado=v_estado,revisao=revisao+1,conferido_por=v_ator,conferido_em=clock_timestamp(),motivo=v_motivo where id=v_id;
  v_resultado:=jsonb_build_object('requisicao',erp_private.requisicao_json(v_id));
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,antes,depois) values(p_unidade,v_ator,'requisicao_conferir','requisicao',v_id,v_antes,v_resultado->'requisicao');
  return v_resultado;
 end if;
end $$;
revoke all on function erp_private.requisicao_operacao(bigint,text,jsonb) from public,anon;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.requisicao_operacao(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.requisicao_operacao(bigint,text,jsonb) to authenticated;
create function erp.requisicao_operacao(p_unidade bigint,p_acao text,p_dados jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.requisicao_operacao(p_unidade,p_acao,p_dados) $$;
revoke all on function erp.requisicao_operacao(bigint,text,jsonb) from public,anon;
grant execute on function erp.requisicao_operacao(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;
commit;
