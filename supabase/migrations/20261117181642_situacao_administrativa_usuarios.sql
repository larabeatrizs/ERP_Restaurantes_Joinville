-- ADM-006: no Auth mutation, no user/identity seed. X remains distinct from I.
begin;
set local lock_timeout='5s';
-- BEGIN CAPABILITY SEED
insert into erp.perfil_permissao(perfil_id,permissao)
 select id,'USUARIO_CICLO_VIDA' from erp.perfil where codigo='ADMIN' on conflict do nothing;
-- END CAPABILITY SEED
alter table erp_private.auditoria_usuario drop constraint auditoria_usuario_acao_check;
alter table erp_private.auditoria_usuario add constraint auditoria_usuario_acao_check check(acao in('CRIAR','ATIVAR_PRIMEIRO_ACESSO','PRIMEIRO_ACESSO_REEMITIDO','EDITAR','ALTERAR_SITUACAO'));
grant erp_user_admin to current_user;
create function erp_private.admin_usuario_situacao(p_ator uuid,p_alvo uuid,p_dados jsonb default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare a record;t record;pendente boolean;status_novo text;motivo text;rev bigint;
begin
 if p_ator is null or p_alvo is null then raise exception 'Dados inválidos' using errcode='PT422';end if;
 if p_dados is not null then
  -- Same lock as profile/link editing: mixed concurrent changes cannot remove all admins.
  perform pg_advisory_xact_lock(hashtextextended('erp.admin_edicao',0));
  perform u.id from erp.usuario u where u.id in(p_ator,p_alvo) order by u.id for update;
 end if;
 select u.status,p.codigo,
  exists(select 1 from erp.perfil_permissao pp where pp.perfil_id=u.perfil_id and pp.permissao='USUARIO_LER') ler,
  exists(select 1 from erp.perfil_permissao pp where pp.perfil_id=u.perfil_id and pp.permissao='USUARIO_CICLO_VIDA') ciclo
 into a from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id=p_ator;
 if not found or a.status<>'ATIVO' or not a.ler or a.codigo not in('ADMIN','GESTOR_CENTRAL','AUDITOR')
  or (p_dados is not null and (a.codigo<>'ADMIN' or not a.ciclo)) then raise exception 'Acesso negado' using errcode='PT403';end if;
 select u.*,p.codigo perfil into t from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id=p_alvo;
 if not found then raise exception 'Usuário indisponível' using errcode='PT404';end if;
 select coalesce((select c.primeiro_acesso from erp_private.usuario_contato c where c.usuario_id=p_alvo),false) into pendente;
 if p_dados is null then return jsonb_build_object('id',t.id,'nome',t.nome,'status',t.status,'revisao',t.revisao::text,'primeiro_acesso',pendente,'proprio',p_ator=p_alvo,
  'pode_alterar',a.codigo='ADMIN' and a.ciclo and p_ator<>p_alvo and not pendente and t.status in('ATIVO','INATIVO'));end if;
 if jsonb_typeof(p_dados) is distinct from 'object' or not(p_dados ?& array['status','revisao','motivo']) or p_dados-array['status','revisao','motivo']<>'{}'::jsonb
  or jsonb_typeof(p_dados->'status') is distinct from 'string' or jsonb_typeof(p_dados->'revisao') is distinct from 'string' or jsonb_typeof(p_dados->'motivo') is distinct from 'string'
 then raise exception 'Dados inválidos' using errcode='PT422';end if;
 status_novo:=p_dados->>'status';motivo:=btrim(p_dados->>'motivo');
 if status_novo not in('ATIVO','INATIVO') or p_dados->>'revisao' !~ '^[1-9][0-9]{0,18}$' or length(motivo) not between 3 and 500
  or motivo ~ '[[:cntrl:]]' or motivo ~ ('['||chr(127)||'-'||chr(159)||']') then raise exception 'Revise os dados' using errcode='PT422';end if;
 rev:=(p_dados->>'revisao')::bigint;
 if rev<>t.revisao then raise exception 'Cadastro alterado; recarregue' using errcode='PT412';end if;
 if p_ator=p_alvo then raise exception 'Outro administrador deve alterar seu acesso' using errcode='PT403';end if;
 if pendente or t.status='BLOQUEADO' then raise exception 'Primeiro acesso ou desbloqueio exige fluxo próprio' using errcode='PT409';end if;
 if t.status=status_novo then return erp_private.admin_usuario_situacao(p_ator,p_alvo,null);end if;
 if status_novo='INATIVO' and t.perfil='ADMIN' and not exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id<>p_alvo and u.status='ATIVO' and p.codigo='ADMIN')
 then raise exception 'Preserve o último administrador ativo' using errcode='PT409';end if;
 update erp.usuario set status=status_novo,revisao=revisao+1 where id=p_alvo;
 insert into erp_private.auditoria_usuario(ator_id,usuario_id,acao,dados) values(p_ator,p_alvo,'ALTERAR_SITUACAO',jsonb_build_object('status_anterior',t.status,'status_novo',status_novo,'revisao',(t.revisao+1)::text,'motivo',motivo));
 return erp_private.admin_usuario_situacao(p_ator,p_alvo,null);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Dados inválidos' using errcode='PT422';
end $$;
grant create on schema erp_private to erp_user_admin;
alter function erp_private.admin_usuario_situacao(uuid,uuid,jsonb) owner to erp_user_admin;
revoke create on schema erp_private from erp_user_admin;
revoke all on function erp_private.admin_usuario_situacao(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function erp_private.admin_usuario_situacao(uuid,uuid,jsonb) to service_role;
create function erp.admin_usuario_situacao(p_ator uuid,p_alvo uuid,p_dados jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select erp_private.admin_usuario_situacao(p_ator,p_alvo,p_dados)$$;
revoke all on function erp.admin_usuario_situacao(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function erp.admin_usuario_situacao(uuid,uuid,jsonb) to service_role;
revoke erp_user_admin from current_user;
notify pgrst,'reload schema';commit;
