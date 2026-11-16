-- Approved roles only; personal ADMIN and all user/unit links remain unchanged.
begin;
do $$ begin
 if (select count(*) from erp.usuario u join erp.perfil p on p.id=u.perfil_id where p.codigo='GESTOR_UNIDADE')<>2
 or exists(select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id left join auth.users a on a.id=u.id where p.codigo in ('GESTOR_UNIDADE','NUTRICIONISTA') and (a.email is null or a.email !~ '^(int003|est001)-[^@]+@example[.]invalid$'))
 then raise exception 'Expected synthetic calendar profiles only';end if;
end $$;
insert into erp.perfil(codigo) values('NUTRICIONISTA') on conflict(codigo) do nothing;
insert into erp.perfil_permissao select id,'CALENDARIO_EDITAR' from erp.perfil where codigo in ('GESTOR_UNIDADE','NUTRICIONISTA') on conflict do nothing;
commit;
