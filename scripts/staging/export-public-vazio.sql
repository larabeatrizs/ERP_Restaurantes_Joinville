-- SEC-003: cópia lógica de escopo restrito. Executar com CLI --read-only.
-- A geração posterior DEVE rejeitar objetos/tipos não suportados e qualquer linha.
select jsonb_build_object(
 'version', current_setting('server_version'),
 'captured_at', clock_timestamp(),
 'tables', (select jsonb_agg(jsonb_build_object(
   'name', c.relname, 'owner', pg_get_userbyid(c.relowner), 'rls', c.relrowsecurity,
   'force_rls', c.relforcerowsecurity,
   'count', ((xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text)::bigint,
   'columns', (select jsonb_agg(jsonb_build_object('name', a.attname,
     'type', format_type(a.atttypid,a.atttypmod), 'not_null', a.attnotnull,
     'identity', a.attidentity, 'generated', a.attgenerated,
     'default', pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
     where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints', (select coalesce(jsonb_agg(jsonb_build_object('name', con.conname,
     'definition', pg_get_constraintdef(con.oid,true)) order by con.conname),'[]'::jsonb)
     from pg_constraint con where con.conrelid=c.oid),
   'indexes', (select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid),'[]'::jsonb)
     from pg_index i where i.indrelid=c.oid and not exists(select 1 from pg_constraint con where con.conindid=i.indexrelid)),
   'acl', (select coalesce(jsonb_agg(jsonb_build_object('role', case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
     'privilege', g.privilege_type, 'grant_option', g.is_grantable) order by g.grantee,g.privilege_type),'[]'::jsonb)
     from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) g)
 ) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'sequences', (select coalesce(jsonb_agg(jsonb_build_object('name', c.relname,'owner',pg_get_userbyid(c.relowner),
   'type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,
   'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,
   'last',ps.last_value::text,
   'owned_table', ot.relname, 'owned_column', oa.attname,
   'acl',(select coalesce(jsonb_agg(jsonb_build_object('role',case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
     'privilege',g.privilege_type,'grant_option',g.is_grantable) order by g.grantee,g.privilege_type),'[]'::jsonb)
     from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) g)
 ) order by c.relname),'[]'::jsonb)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid
 join pg_sequences ps on ps.schemaname=n.nspname and ps.sequencename=c.relname
 left join pg_depend dep on dep.objid=c.oid and dep.classid='pg_class'::regclass and dep.deptype in ('a','i')
 left join pg_class ot on ot.oid=dep.refobjid left join pg_attribute oa on oa.attrelid=dep.refobjid and oa.attnum=dep.refobjsubid
 where n.nspname='public' and c.relkind='S'),
 'required_extensions', (select coalesce(jsonb_agg(jsonb_build_object('name',x.extname,'version',x.extversion,'schema',x.nspname) order by x.extname),'[]'::jsonb) from (
   select distinct ex.extname,ex.extversion,en.nspname from pg_attrdef ad
   join pg_class c on c.oid=ad.adrelid join pg_namespace n on n.oid=c.relnamespace
   join pg_depend d on d.classid='pg_attrdef'::regclass and d.objid=ad.oid and d.refclassid='pg_proc'::regclass
   join pg_depend m on m.classid='pg_proc'::regclass and m.objid=d.refobjid and m.refclassid='pg_extension'::regclass and m.deptype='e'
   join pg_extension ex on ex.oid=m.refobjid join pg_namespace en on en.oid=ex.extnamespace where n.nspname='public'
 ) x),
 'unsupported', jsonb_build_object(
   'inheritance',(select count(*) from pg_inherits i join pg_class c on c.oid=i.inhrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
   'non_builtin_columns',(select count(*) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid join pg_namespace tn on tn.oid=t.typnamespace where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped and tn.nspname<>'pg_catalog'),
   'other_relations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind not in ('r','S','i','I')),
   'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
   'policies',(select count(*) from pg_policies where schemaname='public'),
   'triggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
   'user_types',(select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d','r','m')),
   'column_acls',(select count(*) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and a.attacl is not null),
   'cross_schema_fk',(select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_class referenced on referenced.oid=con.confrelid join pg_namespace rn on rn.oid=referenced.relnamespace where n.nspname='public' and rn.nspname<>'public')
 )
) as backup;
