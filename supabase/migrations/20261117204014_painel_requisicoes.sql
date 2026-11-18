begin;
grant erp_stock_writer to current_user;
create function erp_private.requisicao_painel(p_unidade bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_lista jsonb;v_modo text;
begin
 v_lista:=erp_private.requisicao_operacao(p_unidade,'listar','{}');
 select modo_saida into v_modo from erp.parametro_unidade where unidade_id=p_unidade;
 return v_lista||jsonb_build_object('unidade_id',p_unidade::text,'usuario_id',erp_private.ator_autenticado()::text,
 'pode_registrar',erp_private.estoque_capacidade(p_unidade,'REQUISICAO_REGISTRAR'),
 'pode_conferir',erp_private.estoque_capacidade(p_unidade,'REQUISICAO_CONFERIR'),'modo_saida',v_modo,
 'produtos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'descricao',p.descricao,'unidade',m.sigla) order by p.descricao,p.id)
 from erp.produto p join erp.produto_unidade pu on pu.produto_id=p.id join erp.unidade_medida m on m.id=p.unidade_medida_id
 where pu.unidade_id=p_unidade and p.status='ATIVO'),'[]'::jsonb));
end $$;
revoke all on function erp_private.requisicao_painel(bigint) from public,anon;
grant create on schema erp_private to erp_stock_writer;
alter function erp_private.requisicao_painel(bigint) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
grant execute on function erp_private.requisicao_painel(bigint) to authenticated;
create function erp.requisicao_painel(p_unidade bigint) returns jsonb
language sql security invoker set search_path='' as $$ select erp_private.requisicao_painel(p_unidade) $$;
revoke all on function erp.requisicao_painel(bigint) from public,anon;
grant execute on function erp.requisicao_painel(bigint) to authenticated;
revoke erp_stock_writer from current_user;
commit;
