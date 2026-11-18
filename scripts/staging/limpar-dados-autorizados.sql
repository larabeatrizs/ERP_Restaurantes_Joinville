-- Operação pontual autorizada em 18/11/2026; NÃO é migration nem seed.
-- Exige transação externa, backup privado verificado e parâmetros locais.
-- Jamais usar CASCADE, RESTART IDENTITY, desabilitar triggers ou RLS.
set local lock_timeout = '5s';
set local statement_timeout = '25s';
select pg_advisory_xact_lock(hashtextextended('erp.admin_edicao',0));
lock table erp.auditoria_configuracao, erp.auditoria_estoque, erp.calendario_excecao, erp.calendario_refeicao_especial, erp.calendario_semanal, erp.calendario_unidade, erp.camara, erp.categoria, erp.comando_estoque, erp.entrada, erp.entrada_item, erp.fornecedor, erp.lote, erp.movimento_estoque, erp.parametro_unidade, erp.perfil, erp.perfil_permissao, erp.produto, erp.produto_unidade, erp.refeicao_habilitada, erp.requisicao_comando, erp.requisicao_item, erp.requisicao_rapida, erp.saldo_lote_local, erp.unidade, erp.unidade_medida, erp.usuario, erp.usuario_unidade, erp_private.auditoria_login, erp_private.auditoria_usuario, erp_private.usuario_contato, erp_private.usuario_login, erp_private.usuario_provisionamento, auth.users in access exclusive mode;
do $cleanup$
declare
  keep_admin uuid := current_setting('erp.cleanup.admin_id')::uuid;
  expected_credential text := current_setting('erp.cleanup.admin_credential_hash');
  expected_counts jsonb := current_setting('erp.cleanup.expected_counts')::jsonb;
  item record;
  actual bigint;
  admin_before jsonb;
  credential_after text;
begin
  if current_setting('erp.cleanup.authorization') <> '2026-11-18-preservar-admin'
     or current_setting('erp.cleanup.project') <> 'vpowsedoajpdbeckimuv'
     or current_setting('erp.cleanup.backup_sha256') !~ '^[a-fA-F0-9]{64}$'
  then raise exception 'Contexto ou backup ausente'; end if;
  select to_jsonb(u) into strict admin_before from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=keep_admin and p.codigo='ADMIN' and u.status='ATIVO';
  if (select md5(concat_ws('|',id::text,email,encrypted_password)) from auth.users where id=keep_admin) is distinct from expected_credential
     or (select count(*) from auth.users) <> 8
     or exists(select 1 from storage.objects)
  then raise exception 'Auth ou Storage divergente do inventário'; end if;
  for item in select key,value from jsonb_each_text(expected_counts) loop
    if item.key !~ '^(erp|erp_private|public)\.[a-z_]+$' then raise exception 'Tabela não permitida'; end if;
    execute format('select count(*) from %I.%I',split_part(item.key,'.',1),split_part(item.key,'.',2)) into actual;
    if actual <> item.value::bigint then raise exception 'Inventário divergente: %',item.key; end if;
  end loop;
  truncate table erp.auditoria_configuracao, erp.auditoria_estoque, erp.calendario_excecao, erp.calendario_refeicao_especial, erp.calendario_semanal, erp.calendario_unidade, erp.camara, erp.categoria, erp.comando_estoque, erp.entrada, erp.entrada_item, erp.fornecedor, erp.lote, erp.movimento_estoque, erp.parametro_unidade, erp.produto, erp.produto_unidade, erp.refeicao_habilitada, erp.requisicao_comando, erp.requisicao_item, erp.requisicao_rapida, erp.saldo_lote_local, erp.unidade, erp.unidade_medida, erp.usuario_unidade, erp_private.auditoria_login, erp_private.auditoria_usuario, erp_private.usuario_provisionamento;
  delete from erp_private.usuario_contato where usuario_id<>keep_admin;
  delete from erp_private.usuario_login where usuario_id<>keep_admin;
  delete from erp.usuario where id<>keep_admin;
  delete from auth.users where id<>keep_admin;
  if (select count(*) from erp.usuario)<>1 or (select count(*) from auth.users)<>1
     or (select to_jsonb(u) from erp.usuario u where id=keep_admin) is distinct from admin_before
  then raise exception 'Administrador não preservado'; end if;
  select md5(concat_ws('|',id::text,email,encrypted_password)) into credential_after from auth.users where id=keep_admin;
  if credential_after is distinct from expected_credential then raise exception 'Credencial do administrador alterada'; end if;
  for item in select key from jsonb_each_text(expected_counts)
    where key not in ('erp.perfil','erp.perfil_permissao','erp.usuario','erp_private.usuario_login','erp_private.usuario_contato') loop
    execute format('select count(*) from %I.%I',split_part(item.key,'.',1),split_part(item.key,'.',2)) into actual;
    if actual<>0 then raise exception 'Tabela não vazia: %',item.key; end if;
  end loop;
end
$cleanup$;
