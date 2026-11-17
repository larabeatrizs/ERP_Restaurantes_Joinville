-- Qualify unit columns: the provisioning function also has a local "nome" variable.
begin;
grant erp_user_admin to current_user;
do $patch$
declare source text; marker text; replacement text;
begin
 source:=pg_get_functiondef('erp_private.admin_usuarios_servico(uuid,text,jsonb)'::regprocedure);
 marker:=$old$jsonb_build_object('id',id::text,'codigo',codigo,'nome',nome)$old$;
 replacement:=$new$jsonb_build_object('id',unidade.id::text,'codigo',unidade.codigo,'nome',unidade.nome)$new$;
 if position(marker in source)=0 then raise exception 'Administrative unit projection changed';end if;
 execute replace(source,marker,replacement);
end $patch$;
revoke erp_user_admin from current_user;
notify pgrst,'reload schema';commit;
