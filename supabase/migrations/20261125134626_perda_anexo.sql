begin;

create table erp_private.perda_anexo (
  perda_id bigint primary key,
  unidade_id bigint not null,
  mime text not null check (mime in ('image/jpeg','image/png')),
  conteudo bytea not null check (octet_length(conteudo) between 1 and 2097152),
  hash bytea not null check (octet_length(hash)=32),
  foreign key (unidade_id,perda_id) references erp_private.perda_estoque(unidade_id,id)
);
alter table erp_private.perda_anexo enable row level security;
revoke all on erp_private.perda_anexo from public,anon,authenticated,service_role;
grant select,insert on erp_private.perda_anexo to erp_stock_writer;
create policy perda_anexo_leitura on erp_private.perda_anexo for select to erp_stock_writer
  using (erp_private.estoque_vinculado(unidade_id));
create policy perda_anexo_registro on erp_private.perda_anexo for insert to erp_stock_writer
  with check (exists (select 1 from erp_private.perda_estoque p
    where p.unidade_id=perda_anexo.unidade_id and p.id=perda_anexo.perda_id
      and p.autor_id=(select erp_private.ator_autenticado()) and p.estado='PENDENTE'));

create or replace function erp_private.perda_registrar_pendente(p_unidade bigint,p_dados jsonb)
returns bigint language plpgsql volatile security invoker set search_path='' as $$
declare
  ator uuid;
  lote bigint;
  local_id bigint;
  motivo bigint;
  competencia date;
  quantidade numeric;
  justificativa text;
  chave_registro uuid;
  atual record;
  perda erp_private.perda_estoque;
  foto bytea;
  foto_mime text;
  foto_hash bytea;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
    where u.id=ator and p.codigo='ESTOQUISTA')
    or not exists (select 1 from erp.unidade where id=p_unidade and codigo='RP-BUCAREIN') then
    raise exception 'Registro indisponível para este perfil ou unidade' using errcode='PT403';
  end if;

  perform erp_private.estoque_objeto(p_dados,array['lote_id','camara_id','data_registro','quantidade','motivo_id','justificativa','chave'],array['anexo']);
  if p_dados ? 'anexo' then
    perform erp_private.estoque_objeto(p_dados->'anexo',array['mime','base64']);
    foto_mime := p_dados->'anexo'->>'mime';
    if foto_mime is null or foto_mime not in ('image/jpeg','image/png')
      or jsonb_typeof(p_dados->'anexo'->'base64') is distinct from 'string'
      or length(p_dados->'anexo'->>'base64') not between 4 and 2796204
      or p_dados->'anexo'->>'base64' !~ '^[A-Za-z0-9+/]+={0,2}$' then
      raise exception 'Foto inválida' using errcode='PT422';
    end if;
    begin
      foto := decode(p_dados->'anexo'->>'base64','base64');
    exception when invalid_parameter_value then
      raise exception 'Foto inválida' using errcode='PT422';
    end;
    if octet_length(foto)>2097152
      or (foto_mime='image/jpeg' and substring(foto from 1 for 3)<>decode('ffd8ff','hex'))
      or (foto_mime='image/png' and substring(foto from 1 for 8)<>decode('89504e470d0a1a0a','hex')) then
      raise exception 'Foto inválida' using errcode='PT422';
    end if;
    foto_hash := sha256(foto);
  end if;
  lote := erp_private.estoque_id(p_dados->'lote_id');
  local_id := erp_private.estoque_id(p_dados->'camara_id');
  motivo := erp_private.estoque_id(p_dados->'motivo_id');
  competencia := erp_private.estoque_data(p_dados->'data_registro');
  quantidade := erp_private.estoque_decimal(p_dados->'quantidade');
  justificativa := erp_private.estoque_texto(p_dados->'justificativa',0,2000);
  if quantidade<=0 or competencia>(clock_timestamp() at time zone 'America/Sao_Paulo')::date
    or jsonb_typeof(p_dados->'chave') is distinct from 'string'
    or p_dados->>'chave' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Dados de perda inválidos' using errcode='PT422';
  end if;
  chave_registro := (p_dados->>'chave')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('erp.estoque.perda:'||p_unidade::text||':'||ator::text||':'||chave_registro::text,0));
  select x.* into perda from erp_private.perda_estoque x
    where x.unidade_id=p_unidade and x.autor_id=ator and x.chave=chave_registro;
  if found then
    if (perda.lote_id,perda.camara_id,perda.data_registro,perda.quantidade,perda.motivo_id,perda.justificativa)
      is distinct from (lote,local_id,competencia,quantidade,motivo,justificativa)
      or (select a.hash from erp_private.perda_anexo a where a.perda_id=perda.id) is distinct from foto_hash
      or (select a.mime from erp_private.perda_anexo a where a.perda_id=perda.id) is distinct from foto_mime then
      raise exception 'Chave reutilizada com outros dados' using errcode='PT409';
    end if;
    return perda.id;
  end if;

  perform erp_private.estoque_periodo_exigir_aberto(p_unidade,competencia);
  if not exists (select 1 from erp_private.perda_motivo m where m.id=motivo and m.ativo and (not m.exige_anexo or foto is not null)) then
    raise exception 'Motivo indisponível ou foto obrigatória' using errcode='PT422';
  end if;
  select s.quantidade,l.valor_unitario into atual from erp.saldo_lote_local s
    join erp.lote l on l.unidade_id=s.unidade_id and l.id=s.lote_id
    where s.unidade_id=p_unidade and s.lote_id=lote and s.camara_id=local_id
    for share of s;
  if not found or atual.quantidade<quantidade then
    raise exception 'Saldo do lote indisponível ou insuficiente' using errcode='PT409';
  end if;
  insert into erp_private.perda_estoque(unidade_id,lote_id,camara_id,data_registro,quantidade,motivo_id,justificativa,valor_unitario,autor_id,chave)
  values(p_unidade,lote,local_id,competencia,quantidade,motivo,justificativa,atual.valor_unitario,ator,chave_registro)
  returning * into perda;
  if foto is not null then
    insert into erp_private.perda_anexo(perda_id,unidade_id,mime,conteudo,hash)
      values(perda.id,p_unidade,foto_mime,foto,foto_hash);
  end if;
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,depois)
  values(p_unidade,ator,'perda_registrar','perda',perda.id,(to_jsonb(perda)-'chave') || jsonb_build_object('tem_anexo',foto is not null,'anexo_sha256',encode(foto_hash,'hex')));
  return perda.id;
end;
$$;

-- Preserve the existing RPCs and add only metadata needed by the two panels.
do $patch$
declare
  registro text := pg_get_functiondef('erp_private.perda_registro_web(bigint,jsonb)'::regprocedure);
  painel text := pg_get_functiondef('erp_private.perda_painel(bigint,bigint,text)'::regprocedure);
  motivo text := '''descricao'',m.descricao)';
  filtro text := 'm.ativo and not m.exige_anexo';
  valor text := '''valor_prejuizo'',x.valor_prejuizo::text';
begin
  if strpos(registro,motivo)=0 or strpos(registro,filtro)=0 or strpos(painel,valor)=0 then
    raise exception 'Pontos de integração dos anexos mudaram';
  end if;
  execute replace(replace(registro,motivo,'''descricao'',m.descricao,''exige_anexo'',m.exige_anexo)'),filtro,'m.ativo');
  execute replace(painel,valor,valor||',''tem_anexo'',exists (select 1 from erp_private.perda_anexo a where a.perda_id=x.id and a.unidade_id=x.unidade_id)');
end;
$patch$;

grant erp_stock_writer to current_user;
grant create on schema erp_private to erp_stock_writer;

create function erp_private.perda_anexo_consultar(p_unidade bigint,p_perda bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  ator uuid;
  resposta jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('erp.admin_edicao',0));
  if not erp_private.estoque_vinculado(p_unidade) then
    raise exception 'Unidade indisponível' using errcode='PT404';
  end if;
  ator := erp_private.ator_autenticado();
  if not exists (select 1 from erp.unidade where id=p_unidade and codigo='RP-BUCAREIN')
    or not exists (select 1 from erp.usuario u join erp.perfil p on p.id=u.perfil_id
      where u.id=ator and (p.codigo='NUTRICIONISTA' or (p.codigo='GESTOR_UNIDADE'
        and exists (select 1 from erp_private.perda_substituto s where s.unidade_id=p_unidade and s.usuario_id=ator)))) then
    raise exception 'Anexo indisponível para este perfil ou unidade' using errcode='PT403';
  end if;
  select jsonb_build_object('mime',a.mime,'base64',replace(encode(a.conteudo,'base64'),chr(10),''))
    into resposta
    from erp_private.perda_anexo a join erp_private.perda_estoque p on p.unidade_id=a.unidade_id and p.id=a.perda_id
    where a.unidade_id=p_unidade and a.perda_id=p_perda and p.autor_id<>ator;
  if not found then raise exception 'Anexo indisponível' using errcode='PT404'; end if;
  return resposta;
end;
$$;
alter function erp_private.perda_anexo_consultar(bigint,bigint) owner to erp_stock_writer;
revoke create on schema erp_private from erp_stock_writer;
revoke all on function erp_private.perda_anexo_consultar(bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_anexo_consultar(bigint,bigint) to authenticated;

create function erp.perda_anexo_consultar(p_unidade bigint,p_perda bigint)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select erp_private.perda_anexo_consultar(p_unidade,p_perda)
$$;
revoke all on function erp.perda_anexo_consultar(bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function erp.perda_anexo_consultar(bigint,bigint) to authenticated;
revoke erp_stock_writer from current_user;

commit;
