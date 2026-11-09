-- Consulta posterior; executar com CLI --read-only no destino confirmado.
select jsonb_build_object(
 'captured_at',clock_timestamp(),
 'public_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'tables_with_rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
 'anon_tables_with_access',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
 'authenticated_tables_with_access',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
 'anon_sequences_with_access',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and case when c.relkind='S' then has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') else false end),
 'authenticated_sequences_with_access',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and case when c.relkind='S' then has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE') else false end),
 'service_role_select_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('service_role',c.oid,'SELECT')),
 'rows_by_table',(select jsonb_agg(jsonb_build_object('table',c.relname,'count',((xpath('/row/n/text()',query_to_xml(format('select count(*) as n from public.%I',c.relname),false,true,'')))[1]::text)::bigint) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'erp_schema_exists',exists(select 1 from pg_namespace where nspname='erp')
) as verification;
