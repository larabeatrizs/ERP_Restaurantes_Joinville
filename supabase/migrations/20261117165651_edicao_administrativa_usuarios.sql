-- ADM-005: edit name/profile/links only. No seed, Auth mutation or credential change.
begin;
set local lock_timeout='5s';
alter table erp.usuario add column revisao bigint not null default 1 check(revisao>0);
alter table erp_private.auditoria_usuario drop constraint auditoria_usuario_acao_check;
alter table erp_private.auditoria_usuario add constraint auditoria_usuario_acao_check check(acao in ('CRIAR','ATIVAR_PRIMEIRO_ACESSO','PRIMEIRO_ACESSO_REEMITIDO','EDITAR'));
grant erp_user_admin to current_user;
grant delete on erp.usuario_unidade to erp_user_admin;
create function erp_private.admin_usuario_edicao(p_ator uuid,p_alvo uuid,p_dados jsonb default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare a record;t record;novo_perfil bigint;novas_unidades bigint[];anteriores bigint[];
 nome_novo text;motivo text;revisao_esperada bigint;gerir boolean;
begin
 if p_ator is null or p_alvo is null then raise exception 'Dados inválidos' using errcode='PT422';end if;
 if p_dados is not null then
  -- Serializes cross-administrator changes before deterministic row locks/auth recheck.
  perform pg_advisory_xact_lock(hashtextextended('erp.admin_edicao',0));
  perform u.id from erp.usuario u where u.id in(p_ator,p_alvo) order by u.id for update;
 end if;
 select u.status,p.codigo,exists(select 1 from erp.perfil_permissao pp where pp.perfil_id=u.perfil_id and pp.permissao='USUARIO_GERIR') gerir,
  exists(select 1 from erp.perfil_permissao pp where pp.perfil_id=u.perfil_id and pp.permissao='USUARIO_LER') ler into a
  from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id=p_ator;
 if not found or a.status<>'ATIVO' or a.codigo not in('ADMIN','GESTOR_CENTRAL','AUDITOR') or not a.ler
  or (p_dados is not null and (a.codigo<>'ADMIN' or not a.gerir)) then raise exception 'Acesso negado' using errcode='PT403';end if;
 gerir:=a.codigo='ADMIN' and a.gerir;
 select u.*,p.codigo perfil into t from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id=p_alvo;
 if not found then raise exception 'Usuário indisponível' using errcode='PT404';end if;
 anteriores:=array(select v.unidade_id from erp.usuario_unidade v where v.usuario_id=p_alvo order by v.unidade_id);
 if p_dados is null then
  return jsonb_build_object('id',t.id,'nome',t.nome,'perfil',t.perfil,'status',t.status,'primeiro_acesso',coalesce((select c.primeiro_acesso from erp_private.usuario_contato c where c.usuario_id=p_alvo),false),
   'unidades',to_jsonb(array(select x::text from unnest(anteriores) x)),'revisao',t.revisao::text,'proprio',p_ator=p_alvo,'pode_editar',gerir);
 end if;
 if jsonb_typeof(p_dados) is distinct from 'object' or not(p_dados ?& array['nome','perfil','unidades','revisao','motivo'])
  or p_dados-array['nome','perfil','unidades','revisao','motivo']<>'{}'::jsonb
  or jsonb_typeof(p_dados->'nome') is distinct from 'string' or jsonb_typeof(p_dados->'perfil') is distinct from 'string'
  or jsonb_typeof(p_dados->'motivo') is distinct from 'string' or jsonb_typeof(p_dados->'revisao') is distinct from 'string'
  or jsonb_typeof(p_dados->'unidades') is distinct from 'array' then raise exception 'Dados inválidos' using errcode='PT422';end if;
 nome_novo:=btrim(p_dados->>'nome');motivo:=btrim(p_dados->>'motivo');
 if length(nome_novo) not between 1 and 200 or length(motivo) not between 3 and 500 or nome_novo ~ '[[:cntrl:]]' or motivo ~ '[[:cntrl:]]'
  or nome_novo ~ ('['||chr(127)||'-'||chr(159)||']') or motivo ~ ('['||chr(127)||'-'||chr(159)||']')
  or p_dados->>'revisao' !~ '^[1-9][0-9]{0,18}$' or jsonb_array_length(p_dados->'unidades')=0
  or exists(select 1 from jsonb_array_elements(p_dados->'unidades') x where jsonb_typeof(x) is distinct from 'string' or x#>>'{}' !~ '^[1-9][0-9]{0,18}$')
 then raise exception 'Revise os dados' using errcode='PT422';end if;
 revisao_esperada:=(p_dados->>'revisao')::bigint;
 if revisao_esperada<>t.revisao then raise exception 'Cadastro alterado; recarregue' using errcode='PT412';end if;
 select array_agg(x::bigint order by x::bigint) into novas_unidades from jsonb_array_elements_text(p_dados->'unidades') x;
 select p.id into novo_perfil from erp.perfil p where p.codigo=p_dados->>'perfil';
 if novo_perfil is null or cardinality(novas_unidades)<>(select count(distinct x) from unnest(novas_unidades) x)
  or cardinality(novas_unidades)<>(select count(*) from erp.unidade u where u.id=any(novas_unidades) and u.status='ATIVO')
 then raise exception 'Perfil ou unidade indisponível' using errcode='PT422';end if;
 if p_ator=p_alvo and (novo_perfil<>t.perfil_id or novas_unidades<>anteriores) then raise exception 'Outro administrador deve alterar seu acesso' using errcode='PT403';end if;
 if t.perfil='ADMIN' and t.status='ATIVO' and p_dados->>'perfil'<>'ADMIN'
  and not exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id where u.id<>p_alvo and u.status='ATIVO' and p.codigo='ADMIN')
 then raise exception 'Preserve o último administrador ativo' using errcode='PT409';end if;
 if nome_novo=t.nome and novo_perfil=t.perfil_id and novas_unidades=anteriores then return erp_private.admin_usuario_edicao(p_ator,p_alvo,null);end if;
 update erp.usuario set nome=nome_novo,perfil_id=novo_perfil,revisao=revisao+1 where id=p_alvo;
 delete from erp.usuario_unidade where usuario_id=p_alvo and not(unidade_id=any(novas_unidades));
 insert into erp.usuario_unidade(usuario_id,unidade_id) select p_alvo,x from unnest(novas_unidades) x on conflict do nothing;
 insert into erp_private.auditoria_usuario(ator_id,usuario_id,acao,dados) values(p_ator,p_alvo,'EDITAR',jsonb_build_object('motivo',motivo,'revisao',(t.revisao+1)::text,
  'antes',jsonb_build_object('nome',t.nome,'perfil',t.perfil,'unidades',to_jsonb(array(select x::text from unnest(anteriores) x))),
  'depois',jsonb_build_object('nome',nome_novo,'perfil',p_dados->>'perfil','unidades',to_jsonb(array(select x::text from unnest(novas_unidades) x)))));
 return erp_private.admin_usuario_edicao(p_ator,p_alvo,null);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Dados inválidos' using errcode='PT422';
end $$;
grant create on schema erp_private to erp_user_admin;
alter function erp_private.admin_usuario_edicao(uuid,uuid,jsonb) owner to erp_user_admin;
revoke create on schema erp_private from erp_user_admin;
revoke all on function erp_private.admin_usuario_edicao(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function erp_private.admin_usuario_edicao(uuid,uuid,jsonb) to service_role;
create function erp.admin_usuario_edicao(p_ator uuid,p_alvo uuid,p_dados jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select erp_private.admin_usuario_edicao(p_ator,p_alvo,p_dados)$$;
revoke all on function erp.admin_usuario_edicao(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function erp.admin_usuario_edicao(uuid,uuid,jsonb) to service_role;
revoke erp_user_admin from current_user;
notify pgrst,'reload schema';commit;
