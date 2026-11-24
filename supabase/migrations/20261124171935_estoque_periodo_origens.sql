begin;

-- Preserve the existing RPCs, owners, grants and all unrelated actions.
do $patch$
declare
  fonte text;
  ponto text;
  trecho text;
begin
  fonte := pg_get_functiondef('erp_private.estoque_operacao(bigint,text,jsonb)'::regprocedure);
  ponto := '-- Compatible with the KEY SHARE acquired by command/document foreign keys.';
  if length(fonte) - length(replace(fonte,ponto,'')) <> length(ponto) then
    raise exception 'Ponto de integração do recebimento mudou';
  end if;
  trecho := $guard$
  if p_acao='entrada_confirmar' then
   select e.* into ent from erp.entrada e where e.id=id and e.unidade_id=p_unidade;
   if found and ent.estado<>'CONFIRMADA' then
    perform erp_private.estoque_periodo_exigir_aberto(p_unidade,ent.data_entrada);
   end if;
  end if;
  $guard$;
  execute replace(fonte,ponto,trecho||ponto);

  fonte := pg_get_functiondef('erp_private.requisicao_operacao(bigint,text,jsonb)'::regprocedure);
  ponto := $clock$v_hoje:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;$clock$;
  if length(fonte) - length(replace(fonte,ponto,'')) <> length(ponto) then
    raise exception 'Ponto de data da requisição mudou';
  end if;
  fonte := replace(fonte,ponto,'');
  trecho := ponto || E'\n  perform erp_private.estoque_periodo_exigir_aberto(p_unidade,v_hoje);\n  ';
  ponto := 'select * into v_produto from erp.produto p where p.id=v_prod';
  if length(fonte) - length(replace(fonte,ponto,'')) <> length(ponto) then
    raise exception 'Ponto de integração da requisição mudou';
  end if;
  execute replace(fonte,ponto,trecho||ponto);
end;
$patch$;

commit;
