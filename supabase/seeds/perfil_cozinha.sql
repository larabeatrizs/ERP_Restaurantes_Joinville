-- EST-002: provisionamento explícito após migrations; sem conta, senha ou vínculo seed.
-- Não pertence às migrations: perfis são configuração inicial operacional.
begin;
do $$ begin
 if to_regprocedure('erp.requisicao_painel(bigint)') is null then raise exception 'Aplique migrations EST-002 antes do seed';end if;
end $$;
insert into erp.perfil(codigo) values('COZINHA') on conflict(codigo) do nothing;
insert into erp.perfil_permissao(perfil_id,permissao)
 select id,'REQUISICAO_REGISTRAR' from erp.perfil where codigo='COZINHA' on conflict do nothing;
commit;
