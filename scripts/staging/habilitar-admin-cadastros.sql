-- Explicit temporary staging exception authorized by the responsible user on 17/11/2026.
-- Review/remove or formally ratify before production; no X, receipt, approval or parameter-edit grant.
begin;
do $$ begin
 if (select count(*) from erp.unidade where codigo in('STG-INT003-A','STG-INT003-B'))<>2
  or not exists(select 1 from erp.perfil where codigo='ADMIN') then raise exception 'Confirmed shared staging required';end if;
end $$;
insert into erp.perfil_permissao(perfil_id,permissao)
 select id,p from erp.perfil cross join(values('PRODUTO_GERIR'),('CATEGORIA_EDITAR'),('MEDIDA_EDITAR'),('FORNECEDOR_EDITAR'))x(p)
 where codigo='ADMIN' on conflict do nothing;
commit;
select 'temporary_catalog_writes_enabled'::text result;
