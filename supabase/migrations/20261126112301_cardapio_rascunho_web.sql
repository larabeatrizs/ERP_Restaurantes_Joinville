begin;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.cardapio_planejamento(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select erp_private.cardapio_rascunho(p_unidade,p_acao,p_dados)
$$;
alter function erp_private.cardapio_planejamento(bigint,text,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.cardapio_planejamento(bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.cardapio_planejamento(bigint,text,jsonb) to authenticated;

create function erp.cardapio_planejamento(p_unidade bigint,p_acao text,p_dados jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.cardapio_planejamento(p_unidade,p_acao,p_dados)
$$;
revoke all on function erp.cardapio_planejamento(bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.cardapio_planejamento(bigint,text,jsonb) to authenticated;
revoke erp_stock_writer from current_user;

commit;
