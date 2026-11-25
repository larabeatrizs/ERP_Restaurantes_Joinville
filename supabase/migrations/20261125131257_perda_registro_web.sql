begin;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.perda_registro_web(p_unidade bigint,p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_dados is not null then
    return jsonb_build_object('id',erp_private.perda_registrar_pendente(p_unidade,p_dados)::text);
  end if;
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
      where u.id=(select erp_private.ator_autenticado()) and p.codigo='ESTOQUISTA')
    or not exists (select 1 from erp.unidade where id=p_unidade and codigo='RP-BUCAREIN') then
    raise exception 'Registro indisponível para este perfil ou unidade' using errcode='PT403';
  end if;

  return jsonb_build_object(
    'unidade_id',p_unidade::text,
    'data_referencia',(clock_timestamp() at time zone 'America/Sao_Paulo')::date::text,
    'motivos',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id::text,'descricao',m.descricao) order by m.descricao,m.id)
      from erp_private.perda_motivo m where m.ativo and not m.exige_anexo
    ),'[]'::jsonb),
    'posicoes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lote_id',s.lote_id::text,'camara_id',s.camara_id::text,'produto',p.descricao,'lote',l.codigo,
        'local',c.nome,'unidade_medida',m.sigla,'quantidade',s.quantidade::text,'valor_unitario',l.valor_unitario::text
      ) order by p.descricao,l.codigo,c.nome,s.lote_id,s.camara_id)
      from erp.saldo_lote_local s
      join erp.lote l on l.unidade_id=s.unidade_id and l.id=s.lote_id
      join erp.produto p on p.id=l.produto_id
      join erp.unidade_medida m on m.id=p.unidade_medida_id
      join erp.camara c on c.unidade_id=s.unidade_id and c.id=s.camara_id
      where s.unidade_id=p_unidade and s.quantidade>0
    ),'[]'::jsonb)
  );
end;
$$;

alter function erp_private.perda_registro_web(bigint,jsonb) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.perda_registro_web(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_registro_web(bigint,jsonb) to authenticated;

create function erp.perda_registro_web(p_unidade bigint,p_dados jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.perda_registro_web(p_unidade,p_dados)
$$;

revoke all on function erp.perda_registro_web(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp.perda_registro_web(bigint,jsonb) to authenticated;
revoke erp_stock_writer from current_user;

commit;
