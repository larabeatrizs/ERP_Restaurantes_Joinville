-- DB-004: consulta posterior às migrations. CLI --read-only, sem dados pessoais.
select jsonb_build_object(
 'captured_at',clock_timestamp(),
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
   'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
   'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
   'count',((xpath('/row/n/text()',query_to_xml(format('select count(*) as n from erp.%I',c.relname),false,true,'')))[1]::text)::bigint)
   order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and c.relkind='r'),
 'anon_erp_usage',has_schema_privilege('anon','erp','USAGE'),
 'anon_private_usage',has_schema_privilege('anon','erp_private','USAGE'),
 'authenticated_erp_usage',has_schema_privilege('authenticated','erp','USAGE'),
 'writer',(select jsonb_build_object('login',rolcanlogin,'superuser',rolsuper,'bypass_rls',rolbypassrls,
   'create_role',rolcreaterole,'create_database',rolcreatedb,
   'authenticated_member',pg_has_role('authenticated',oid,'MEMBER'),
   'private_create',has_schema_privilege(oid,'erp_private','CREATE')) from pg_roles where rolname='erp_config_writer'),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
   'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,
   'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'))
   order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('erp','erp_private'))
) as foundation;
