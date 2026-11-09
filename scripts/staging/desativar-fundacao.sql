-- DB-004: retorno por desativação, sem excluir schemas, histórico ou dados.
-- Operação de escrita; executar apenas no destino confirmado e quando necessária.
do $retorno$
begin
  perform set_config('lock_timeout','5s',true);
  if not exists(select 1 from pg_namespace where nspname='erp')
    or not exists(select 1 from pg_namespace where nspname='erp_private') then
    raise exception 'Schemas esperados da fundação ausentes';
  end if;
  revoke usage on schema erp, erp_private from authenticated;
  if to_regprocedure('erp.atualizar_configuracao(bigint,bigint,jsonb,text)') is not null then
    revoke execute on function erp.atualizar_configuracao(bigint,bigint,jsonb,text) from authenticated;
  end if;
  if to_regprocedure('erp_private.atualizar_configuracao(bigint,bigint,jsonb,text)') is not null then
    revoke execute on function erp_private.atualizar_configuracao(bigint,bigint,jsonb,text) from authenticated;
  end if;
end
$retorno$;
