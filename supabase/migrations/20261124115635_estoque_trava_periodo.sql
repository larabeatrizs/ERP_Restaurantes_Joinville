begin;

create table erp_private.estoque_periodo_evento (
  id bigint generated always as identity primary key,
  unidade_id bigint not null references erp.unidade(id),
  mes date not null check (extract(day from mes) = 1),
  estado text not null check (estado in ('FECHADO', 'REABERTO')),
  ator_id uuid not null references erp.usuario(id),
  motivo text not null check (length(btrim(motivo)) between 3 and 500),
  ocorrido_em timestamptz not null default now()
);
create index estoque_periodo_evento_consulta_idx
  on erp_private.estoque_periodo_evento(unidade_id, mes, id desc);

alter table erp_private.estoque_periodo_evento enable row level security;
revoke all on erp_private.estoque_periodo_evento from public, anon, authenticated;
revoke all on sequence erp_private.estoque_periodo_evento_id_seq from public, anon, authenticated;
grant select on erp_private.estoque_periodo_evento to erp_stock_writer;
create policy estoque_periodo_evento_leitura on erp_private.estoque_periodo_evento
  for select to erp_stock_writer using (erp_private.estoque_vinculado(unidade_id));

create function erp_private.estoque_periodo_chave(p_unidade bigint, p_data date)
returns bigint language sql immutable strict security invoker set search_path = '' as $$
  select hashtextextended(
    'erp.estoque.periodo:' || p_unidade::text || ':' ||
    extract(year from p_data)::text || ':' || extract(month from p_data)::text, 0
  )
$$;

-- Transições usam a mesma chave em modo exclusivo antes de gravar o evento.
-- VOLATILE mantém a leitura posterior ao lock sob READ COMMITTED.
create function erp_private.estoque_periodo_exigir_aberto(p_unidade bigint, p_data date)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare
  mes_competencia date;
  estado_atual text;
begin
  if p_unidade is null or p_unidade <= 0 or p_data is null or not isfinite(p_data) then
    raise exception 'Competência inválida' using errcode = 'PT422';
  end if;
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'A trava de estoque exige READ COMMITTED' using errcode = '25000';
  end if;

  mes_competencia := p_data - (extract(day from p_data)::integer - 1);
  perform pg_advisory_xact_lock_shared(erp_private.estoque_periodo_chave(p_unidade, p_data));
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode = 'PT404';
  end if;

  select e.estado into estado_atual
    from erp_private.estoque_periodo_evento e
    where e.unidade_id = p_unidade and e.mes = mes_competencia
    order by e.id desc limit 1;
  if estado_atual = 'FECHADO' then
    raise exception 'Período de estoque fechado' using errcode = 'PT409';
  end if;
end;
$$;

revoke all on function erp_private.estoque_periodo_chave(bigint,date) from public, anon, authenticated;
revoke all on function erp_private.estoque_periodo_exigir_aberto(bigint,date) from public, anon, authenticated;
grant execute on function erp_private.estoque_periodo_chave(bigint,date) to erp_stock_writer;
grant execute on function erp_private.estoque_periodo_exigir_aberto(bigint,date) to erp_stock_writer;
commit;
