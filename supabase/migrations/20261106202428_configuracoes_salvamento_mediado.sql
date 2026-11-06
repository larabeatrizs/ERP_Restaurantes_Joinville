-- CONFIG-002: atualização restrita, sem alterar grants de DML do cliente.
begin;
create role erp_config_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant erp_config_writer to current_user;
grant usage on schema erp, erp_private, auth to erp_config_writer;
grant execute on function auth.uid() to erp_config_writer;
grant select on erp.usuario, erp.usuario_unidade, erp.perfil_permissao,
  erp.unidade, erp.parametro_unidade to erp_config_writer;
grant update (modo_saida,margem_percentual,dias_alerta_validade,prazo_amostra_horas,
  periodicidade_inventario_dias,referencia_preco,alerta_email_habilitado,motivo_alteracao)
  on erp.parametro_unidade to erp_config_writer;
grant insert on erp.auditoria_configuracao to erp_config_writer;
grant usage on sequence erp.auditoria_configuracao_id_seq to erp_config_writer;
grant execute on function erp_private.pode_ler_configuracao(bigint) to erp_config_writer;

create policy escritor_usuario on erp.usuario for select to erp_config_writer
  using (id = (select auth.uid()));
create policy escritor_vinculo on erp.usuario_unidade for select to erp_config_writer
  using (usuario_id = (select auth.uid()));
create policy escritor_permissao on erp.perfil_permissao for select to erp_config_writer using (
  exists (select 1 from erp.usuario u where u.id = (select auth.uid())
    and u.perfil_id = perfil_permissao.perfil_id)
);
create policy escritor_unidade on erp.unidade for select to erp_config_writer using (
  exists (select 1 from erp.usuario_unidade v join erp.usuario u on u.id = v.usuario_id
    where v.unidade_id = unidade.id and u.id = (select auth.uid()) and u.status = 'ATIVO')
);
create function erp_private.pode_editar_configuracao(p_unidade bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select erp_private.pode_ler_configuracao(p_unidade) and exists (
    select 1 from erp.usuario u
    join erp.perfil_permissao p on p.perfil_id = u.perfil_id
    join erp.unidade un on un.id = p_unidade
    where u.id = (select auth.uid()) and u.status = 'ATIVO'
      and un.status = 'ATIVO' and p.permissao = 'CONFIGURACAO_EDITAR'
  )
$$;
revoke all on function erp_private.pode_editar_configuracao(bigint) from public, anon, authenticated;
grant execute on function erp_private.pode_editar_configuracao(bigint) to erp_config_writer;
create policy escritor_parametro_leitura on erp.parametro_unidade for select to erp_config_writer
  using (erp_private.pode_editar_configuracao(unidade_id));
create policy escritor_parametro_escrita on erp.parametro_unidade for update to erp_config_writer
  using (erp_private.pode_editar_configuracao(unidade_id))
  with check (erp_private.pode_editar_configuracao(unidade_id));
create policy escritor_auditoria on erp.auditoria_configuracao for insert to erp_config_writer
  with check (ator_id = (select auth.uid()) and erp_private.pode_editar_configuracao(unidade_id));

create function erp_private.atualizar_configuracao(
  p_unidade bigint, p_revisao bigint, p_campos jsonb, p_motivo text
) returns erp.parametro_unidade
language plpgsql security definer set search_path = '' as $$
declare
  atual erp.parametro_unidade;
  resultado erp.parametro_unidade;
  chave text;
  valor jsonb;
begin
  if auth.uid() is null or not erp_private.pode_editar_configuracao(p_unidade) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_revisao is null then
    raise exception 'Revisão obrigatória' using errcode = 'PT428';
  end if;
  if p_revisao < 1 or p_motivo is null or length(btrim(p_motivo)) < 3
    or p_campos is null or jsonb_typeof(p_campos) <> 'object' or p_campos = '{}'::jsonb then
    raise exception 'Conteúdo inválido' using errcode = 'PT422';
  end if;
  for chave, valor in select * from jsonb_each(p_campos) loop
    if chave in ('modo_saida','referencia_preco') then
      if jsonb_typeof(valor) <> 'string' then
        raise exception 'Tipo inválido' using errcode = 'PT422';
      end if;
    elsif chave = 'margem_percentual' then
      if jsonb_typeof(valor) <> 'string'
        or (valor #>> '{}') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' then
        raise exception 'Decimal inválido' using errcode = 'PT422';
      end if;
    elsif chave in ('dias_alerta_validade','prazo_amostra_horas','periodicidade_inventario_dias') then
      if jsonb_typeof(valor) <> 'number' or (valor #>> '{}') !~ '^(0|[1-9][0-9]*)$' then
        raise exception 'Inteiro inválido' using errcode = 'PT422';
      end if;
    elsif chave = 'alerta_email_habilitado' then
      if jsonb_typeof(valor) <> 'boolean' then
        raise exception 'Booleano inválido' using errcode = 'PT422';
      end if;
    else
      raise exception 'Campo não permitido' using errcode = 'PT422';
    end if;
  end loop;

  select * into atual from erp.parametro_unidade where unidade_id = p_unidade for update;
  -- Revalidar após eventual espera pelo lock: permissões não são snapshots do formulário.
  if not erp_private.pode_editar_configuracao(p_unidade) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if atual.unidade_id is null then
    raise exception 'Configuração não encontrada' using errcode = 'PT404';
  end if;
  if atual.revisao <> p_revisao then
    raise exception 'Revisão desatualizada' using errcode = 'PT412';
  end if;

  update erp.parametro_unidade set
    modo_saida = case when p_campos ? 'modo_saida' then p_campos->>'modo_saida' else atual.modo_saida end,
    margem_percentual = case when p_campos ? 'margem_percentual' then (p_campos->>'margem_percentual')::numeric else atual.margem_percentual end,
    dias_alerta_validade = case when p_campos ? 'dias_alerta_validade' then (p_campos->>'dias_alerta_validade')::integer else atual.dias_alerta_validade end,
    prazo_amostra_horas = case when p_campos ? 'prazo_amostra_horas' then (p_campos->>'prazo_amostra_horas')::integer else atual.prazo_amostra_horas end,
    periodicidade_inventario_dias = case when p_campos ? 'periodicidade_inventario_dias' then (p_campos->>'periodicidade_inventario_dias')::integer else atual.periodicidade_inventario_dias end,
    referencia_preco = case when p_campos ? 'referencia_preco' then p_campos->>'referencia_preco' else atual.referencia_preco end,
    alerta_email_habilitado = case when p_campos ? 'alerta_email_habilitado' then (p_campos->>'alerta_email_habilitado')::boolean else atual.alerta_email_habilitado end,
    motivo_alteracao = btrim(p_motivo)
  where unidade_id = p_unidade and revisao = p_revisao returning * into resultado;
  if resultado.unidade_id is null then
    raise exception 'Revisão desatualizada' using errcode = 'PT412';
  end if;
  return resultado;
exception
  when check_violation or numeric_value_out_of_range or invalid_text_representation then
    raise exception 'Valor de configuração inválido' using errcode = 'PT422';
end
$$;
revoke all on function erp_private.atualizar_configuracao(bigint,bigint,jsonb,text) from public, anon, authenticated;
-- A transferência requer CREATE temporário no schema, removido ainda na migration.
grant create on schema erp_private to erp_config_writer;
alter function erp_private.atualizar_configuracao(bigint,bigint,jsonb,text) owner to erp_config_writer;
revoke create on schema erp_private from erp_config_writer;
grant execute on function erp_private.atualizar_configuracao(bigint,bigint,jsonb,text) to authenticated;

create function erp.atualizar_configuracao(
  p_unidade bigint, p_revisao bigint, p_campos jsonb, p_motivo text
) returns erp.parametro_unidade
language sql security invoker set search_path = '' as $$
  select erp_private.atualizar_configuracao(p_unidade,p_revisao,p_campos,p_motivo)
$$;
revoke all on function erp.atualizar_configuracao(bigint,bigint,jsonb,text) from public, anon;
grant execute on function erp.atualizar_configuracao(bigint,bigint,jsonb,text) to authenticated;
revoke erp_config_writer from current_user;
commit;
