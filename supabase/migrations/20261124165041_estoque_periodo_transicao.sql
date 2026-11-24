begin;

grant select on erp_private.usuario_acesso_periodo to erp_stock_writer;
create policy estoque_acesso_periodo_proprio on erp_private.usuario_acesso_periodo
  for select to erp_stock_writer using (
    usuario_id = (select erp_private.ator_autenticado()) and erp_private.estoque_vinculado(unidade_id)
  );

grant insert on erp_private.estoque_periodo_evento to erp_stock_writer;
grant usage on sequence erp_private.estoque_periodo_evento_id_seq to erp_stock_writer;
create policy estoque_periodo_evento_insercao on erp_private.estoque_periodo_evento
  for insert to erp_stock_writer with check (
    ator_id = (select erp_private.ator_autenticado()) and erp_private.estoque_vinculado(unidade_id)
  );

create function erp_private.estoque_periodo_transicionar(
  p_unidade bigint, p_mes date, p_estado text, p_evento_esperado bigint, p_motivo text
)
returns bigint language plpgsql volatile security invoker set search_path = '' as $$
declare
  ator uuid;
  ultimo_id bigint;
  ultimo_estado text;
  evento_id bigint;
begin
  if p_unidade is null or p_unidade <= 0 or p_mes is null or not isfinite(p_mes)
    or extract(day from p_mes) <> 1
    or p_estado is null or p_estado not in ('FECHADO', 'REABERTO')
    or p_evento_esperado <= 0 or p_motivo is null or length(btrim(p_motivo)) not between 3 and 500 then
    raise exception 'Transição de estoque inválida' using errcode = 'PT422';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'A trava de estoque exige READ COMMITTED' using errcode = '25000';
  end if;
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;

  -- Protege a verificação de vínculos e perfil contra edição administrativa concorrente.
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao', 0));
  perform pg_advisory_xact_lock(erp_private.estoque_periodo_chave(p_unidade, p_mes));
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;

  ator := erp_private.ator_autenticado();
  if not exists (
    select 1 from erp_private.usuario_acesso_periodo a
    join erp.usuario u on u.id = a.usuario_id
    join erp.perfil p on p.id = u.perfil_id
    where a.usuario_id = ator and a.unidade_id = p_unidade
      and ((p_estado = 'FECHADO' and a.fechar)
        or (p_estado = 'REABERTO' and a.reabrir and p.codigo = 'GESTOR_CENTRAL'))
  ) then
    raise exception 'Ação não permitida' using errcode = 'PT403';
  end if;

  select e.id, e.estado into ultimo_id, ultimo_estado
    from erp_private.estoque_periodo_evento e
    where e.unidade_id = p_unidade and e.mes = p_mes
    order by e.id desc limit 1;
  if ultimo_id is distinct from p_evento_esperado then
    raise exception 'Período alterado. Consulte novamente' using errcode = 'PT409';
  end if;
  if (p_estado = 'FECHADO' and ultimo_estado = 'FECHADO')
    or (p_estado = 'REABERTO' and ultimo_estado is distinct from 'FECHADO') then
    raise exception 'Transição de período indisponível' using errcode = 'PT409';
  end if;

  insert into erp_private.estoque_periodo_evento(unidade_id,mes,estado,ator_id,motivo)
    values(p_unidade,p_mes,p_estado,ator,btrim(p_motivo)) returning id into evento_id;
  return evento_id;
end;
$$;

revoke all on function erp_private.estoque_periodo_transicionar(bigint,date,text,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function erp_private.estoque_periodo_transicionar(bigint,date,text,bigint,text)
  to erp_stock_writer;
commit;
