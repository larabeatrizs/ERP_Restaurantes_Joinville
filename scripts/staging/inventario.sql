-- INT-001: executar no projeto confirmado, usando SQL Editor/MCP ou conexão administrativa.
-- Somente metadados; não lê linhas de negócio, auth.users ou corpos de funções.
-- Não contém DDL/DML. Estimativas não comprovam ausência de dados.
-- CLI v3: db query --remote=<ref> --read-only --file scripts/staging/inventario.sql
-- No SQL Editor/MCP, envolver com BEGIN TRANSACTION READ ONLY e ROLLBACK.
select jsonb_build_object(
  'capturado_em_utc', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'postgres', current_setting('server_version'),
  'somente_leitura', current_setting('transaction_read_only'),
  'historico_migrations_existe', to_regclass('supabase_migrations.schema_migrations') is not null,
  'schemas', (select coalesce(jsonb_agg(nspname order by nspname), '[]'::jsonb)
    from pg_namespace where nspname in ('public','erp','erp_private')),
  'relacoes', (select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'nome', c.relname, 'tipo', c.relkind,
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
    'linhas_estimadas', case when c.reltuples < 0 then null else c.reltuples::bigint end,
    'opcoes', c.reloptions,
    'grants', (select coalesce(jsonb_agg(jsonb_build_object(
      'papel', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'privilegio', a.privilege_type, 'delegavel', a.is_grantable)
      order by a.grantee, a.privilege_type), '[]'::jsonb)
      from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a)
    ) order by n.nspname, c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public','erp','erp_private') and c.relkind in ('r','p','v','m','f')),
  'politicas', (select coalesce(jsonb_agg(jsonb_build_object(
    'schema', schemaname, 'tabela', tablename, 'nome', policyname,
    'papeis', roles, 'comando', cmd, 'permissiva', permissive,
    'using', qual, 'with_check', with_check)
    order by schemaname, tablename, policyname), '[]'::jsonb)
    from pg_policies where schemaname in ('public','erp','erp_private')),
  'funcoes', (select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'nome', p.proname,
    'argumentos', pg_get_function_identity_arguments(p.oid),
    'security_definer', p.prosecdef, 'proprietario', pg_get_userbyid(p.proowner),
    'search_path', (select setting from unnest(p.proconfig) setting where setting like 'search_path=%' limit 1),
    'grants', (select coalesce(jsonb_agg(jsonb_build_object(
      'papel', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'privilegio', a.privilege_type) order by a.grantee, a.privilege_type), '[]'::jsonb)
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a)
    ) order by n.nspname, p.proname, p.oid), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','erp','erp_private')),
  'papeis_tecnicos', (select coalesce(jsonb_agg(jsonb_build_object(
    'nome', rolname, 'login', rolcanlogin, 'superusuario', rolsuper,
    'bypass_rls', rolbypassrls, 'cria_papel', rolcreaterole, 'cria_banco', rolcreatedb)
    order by rolname), '[]'::jsonb)
    from pg_roles where rolname in ('anon','authenticated','service_role','erp_config_writer'))
) as inventario;
