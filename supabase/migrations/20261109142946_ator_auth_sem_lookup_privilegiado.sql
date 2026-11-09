-- INT-003: auth.uid resolvido em cria??o, sem ampliar acesso ao schema auth.
begin;
grant erp_config_writer to current_user;
create function erp_private.ator_autenticado() returns uuid
language sql stable security invoker set search_path = ''
begin atomic
  select auth.uid();
end;
revoke all on function erp_private.ator_autenticado() from public, anon;
grant execute on function erp_private.ator_autenticado() to authenticated, erp_config_writer;

create or replace function erp_private.pode_ler_configuracao(p_unidade bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from erp.usuario u
    join erp.usuario_unidade v on v.usuario_id = u.id
    join erp.perfil_permissao p on p.perfil_id = u.perfil_id
    where u.id = (select erp_private.ator_autenticado()) and u.status = 'ATIVO'
      and v.unidade_id = p_unidade and p.permissao = 'CONFIGURACAO_LER'
  )
$$;

create or replace function erp_private.pode_editar_configuracao(p_unidade bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select erp_private.pode_ler_configuracao(p_unidade) and exists (
    select 1 from erp.usuario u
    join erp.perfil_permissao p on p.perfil_id = u.perfil_id
    join erp.unidade un on un.id = p_unidade
    where u.id = (select erp_private.ator_autenticado()) and u.status = 'ATIVO'
      and un.status = 'ATIVO' and p.permissao = 'CONFIGURACAO_EDITAR'
  )
$$;

create or replace function erp_private.preparar_parametro()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare ator uuid := erp_private.ator_autenticado();
begin
  if not exists (select 1 from erp.usuario where id = ator and status = 'ATIVO') then
    raise exception 'Ator ativo obrigatório' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.unidade_id <> old.unidade_id then
      raise exception 'Unidade da configuração é imutável' using errcode = '23514';
    end if;
    new.revisao := old.revisao + 1;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  else
    new.revisao := 1;
    new.criado_por := ator;
  end if;
  new.alterado_por := ator;
  new.alterado_em := now();
  return new;
end
$$;

create or replace function erp_private.auditar_parametro()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into erp.auditoria_configuracao(unidade_id,ator_id,revisao,acao,motivo,antes,depois)
  values (new.unidade_id,erp_private.ator_autenticado(),new.revisao,tg_op,new.motivo_alteracao,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end
$$;

create or replace function erp_private.atualizar_configuracao(
  p_unidade bigint, p_revisao bigint, p_campos jsonb, p_motivo text
) returns erp.parametro_unidade
language plpgsql security definer set search_path = '' as $$
declare
  atual erp.parametro_unidade;
  resultado erp.parametro_unidade;
  chave text;
  valor jsonb;
begin
  if erp_private.ator_autenticado() is null or not erp_private.pode_editar_configuracao(p_unidade) then
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

revoke erp_config_writer from current_user;
commit;
