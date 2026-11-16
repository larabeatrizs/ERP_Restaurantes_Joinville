-- Opt-in fixture: no capabilities granted to ADMIN or a personal identity.
begin;
do $$ begin
 if (select count(*) from erp.usuario u join erp.perfil p on p.id=u.perfil_id where p.codigo='GESTOR_UNIDADE')<>2
 or exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id left join auth.users a on a.id=u.id where p.codigo='GESTOR_UNIDADE' and (a.email is null or a.email !~ '^(int003|est001)-[^@]+@example[.]invalid$'))
 then raise exception 'Expected synthetic staging managers only'; end if;
end $$;
insert into erp.perfil_permissao select id,'PRODUTO_CICLO_VIDA' from erp.perfil where codigo='GESTOR_UNIDADE' on conflict do nothing;
commit;
