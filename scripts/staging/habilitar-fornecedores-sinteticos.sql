-- Opt-in staging fixture, separate from migration; never grants personal ADMIN capabilities.
begin;
do $$ begin
 if (select count(*) from erp.usuario u join erp.perfil p on p.id=u.perfil_id where p.codigo='GESTOR_UNIDADE')<>2
 or (select count(*) from erp.usuario u join erp.perfil p on p.id=u.perfil_id where p.codigo='ESTOQUISTA')<>1
 or exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id left join auth.users a on a.id=u.id where p.codigo in ('GESTOR_UNIDADE','ESTOQUISTA') and (a.email is null or a.email !~ '^(int003|est001)-[^@]+@example[.]invalid$'))
 then raise exception 'Expected synthetic staging profiles only'; end if;
end $$;
insert into erp.perfil_permissao select id,'FORNECEDOR_EDITAR' from erp.perfil where codigo in ('GESTOR_UNIDADE','ESTOQUISTA') on conflict do nothing;
insert into erp.perfil_permissao select id,'FORNECEDOR_CICLO_VIDA' from erp.perfil where codigo='GESTOR_UNIDADE' on conflict do nothing;
commit;
