begin;

create index entrada_rascunho_competencia_idx
  on erp.entrada(unidade_id,data_entrada) where estado='RASCUNHO';

do $patch$
declare
  fonte text;
  ponto text;
  trecho text;
begin
  -- Check inside the exclusive period lock, after verifying actor and revision.
  fonte := pg_get_functiondef('erp_private.estoque_periodo_transicionar(bigint,date,text,bigint,text)'::regprocedure);
  ponto := 'insert into erp_private.estoque_periodo_evento(unidade_id,mes,estado,ator_id,motivo)';
  if length(fonte) - length(replace(fonte,ponto,'')) <> length(ponto) then
    raise exception 'Ponto de integração do fechamento mudou';
  end if;
  trecho := $guard$
  if p_estado = 'FECHADO' and exists (
    select 1 from erp.entrada e
    where e.unidade_id=p_unidade and e.estado='RASCUNHO'
      and e.data_entrada>=p_mes and e.data_entrada<p_mes + interval '1 month'
  ) then
    raise exception 'Resolva os recebimentos pendentes antes de fechar o mês' using errcode='PT409';
  end if;
  $guard$;
  execute replace(fonte,ponto,trecho||ponto);

  -- Creation and closure serialize through the same key even before a draft exists.
  fonte := pg_get_functiondef('erp_private.estoque_operacao(bigint,text,jsonb)'::regprocedure);
  ponto := $draft$if erp_private.estoque_data(p_dados->'data_entrada')>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data futura' using errcode='PT422'; end if;$draft$;
  if length(fonte) - length(replace(fonte,ponto,'')) <> length(ponto) then
    raise exception 'Ponto de integração do rascunho mudou';
  end if;
  trecho := $guard$
  perform erp_private.estoque_periodo_exigir_aberto(p_unidade,erp_private.estoque_data(p_dados->'data_entrada'));
  $guard$;
  execute replace(fonte,ponto,ponto||trecho);
end;
$patch$;

commit;
