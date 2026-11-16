-- Align direct RPC text validation with the ECMAScript trim used by the DTO.
begin;
alter table erp.calendario_excecao add constraint calendario_descricao_conteudo check(descricao ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]');
grant erp_stock_writer to current_user;
do $patch$
declare source text; marker text; replacement text;
begin
 source:=pg_get_functiondef('erp_private.calendario_operacao(bigint,text,jsonb)'::regprocedure);
 marker:='motivo:=erp_private.estoque_texto(p_dados->''motivo'',3,500);';
 if position(marker in source)=0 then raise exception 'Calendar reason source changed';end if;
 replacement:=marker||$code$
 motivo:=regexp_replace(motivo,U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$','','g');
 if length(motivo)<3 then raise exception 'Motivo inválido' using errcode='PT422';end if;
 $code$;
 execute replace(source,marker,replacement);
end $patch$;
revoke erp_stock_writer from current_user;
notify pgrst,'reload schema';commit;
