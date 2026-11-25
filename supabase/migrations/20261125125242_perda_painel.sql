begin;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.perda_painel(p_unidade bigint,p_perda bigint,p_decisao text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  ator uuid;
begin
  if p_perda is not null then
    return jsonb_build_object('id',p_perda::text,'estado',erp_private.perda_revisar(p_unidade,p_perda,p_decisao));
  end if;
  if p_decisao is not null then
    raise exception 'Identificador da perda ausente' using errcode='PT422';
  end if;
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.unidade where id=p_unidade and codigo='RP-BUCAREIN')
    or not exists (
      select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
      where u.id=ator and (p.codigo='NUTRICIONISTA' or (p.codigo='GESTOR_UNIDADE'
        and exists (select 1 from erp_private.perda_substituto s
          where s.unidade_id=p_unidade and s.usuario_id=ator)))
    ) then
    raise exception 'Revisão indisponível para este perfil ou unidade' using errcode='PT403';
  end if;

  return jsonb_build_object('unidade_id',p_unidade::text,'perdas',coalesce((
    select jsonb_agg(item order by data_registro,id) from (
      select x.data_registro,x.id,jsonb_build_object(
        'id',x.id::text,'data_registro',to_char(x.data_registro,'YYYY-MM-DD'),
        'produto',p.descricao,'lote',l.codigo,'local',c.nome,'unidade_medida',um.sigla,
        'motivo',m.descricao,'justificativa',x.justificativa,
        'quantidade',x.quantidade::text,'valor_prejuizo',x.valor_prejuizo::text
      ) as item
      from erp_private.perda_estoque x
      join erp.lote l on l.unidade_id=x.unidade_id and l.id=x.lote_id
      join erp.produto p on p.id=l.produto_id
      join erp.unidade_medida um on um.id=p.unidade_medida_id
      join erp.camara c on c.unidade_id=x.unidade_id and c.id=x.camara_id
      join erp_private.perda_motivo m on m.id=x.motivo_id
      where x.unidade_id=p_unidade and x.estado='PENDENTE' and x.autor_id<>ator
      order by x.data_registro,x.id limit 50
    ) pendentes
  ),'[]'::jsonb));
end;
$$;

alter function erp_private.perda_painel(bigint,bigint,text) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.perda_painel(bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_painel(bigint,bigint,text) to authenticated;

create function erp.perda_painel(p_unidade bigint,p_perda bigint,p_decisao text)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.perda_painel(p_unidade,p_perda,p_decisao)
$$;

revoke all on function erp.perda_painel(bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function erp.perda_painel(bigint,bigint,text) to authenticated;
revoke erp_stock_writer from current_user;

commit;
