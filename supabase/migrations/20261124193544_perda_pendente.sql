begin;

create table erp_private.perda_motivo (
  id bigint generated always as identity primary key,
  descricao text not null check(length(btrim(descricao)) between 1 and 200),
  exige_anexo boolean not null,
  ativo boolean not null default true
);

create table erp_private.perda_estoque (
  id bigint generated always as identity primary key,
  unidade_id bigint not null,
  lote_id bigint not null,
  camara_id bigint not null,
  data_registro date not null check(isfinite(data_registro)),
  quantidade numeric(18,6) not null check(quantidade>0),
  motivo_id bigint not null references erp_private.perda_motivo(id),
  justificativa text not null check(length(justificativa)<=2000),
  valor_unitario numeric(18,6) not null check(valor_unitario>=0),
  valor_prejuizo numeric(36,12) generated always as (quantidade * valor_unitario) stored,
  estado text not null default 'PENDENTE' check(estado in ('PENDENTE','APROVADA','REJEITADA')),
  autor_id uuid not null references erp.usuario(id),
  chave uuid not null,
  criado_em timestamptz not null default now(),
  unique(unidade_id,autor_id,chave),
  foreign key(unidade_id,lote_id,camara_id) references erp.saldo_lote_local(unidade_id,lote_id,camara_id)
);
create index perda_pendente_competencia_idx
  on erp_private.perda_estoque(unidade_id,data_registro) where estado='PENDENTE';
create index perda_estoque_posicao_idx on erp_private.perda_estoque(unidade_id,lote_id,camara_id);

alter table erp_private.perda_motivo enable row level security;
alter table erp_private.perda_estoque enable row level security;
revoke all on erp_private.perda_motivo,erp_private.perda_estoque from public,anon,authenticated,service_role;
revoke all on sequence erp_private.perda_motivo_id_seq,erp_private.perda_estoque_id_seq from public,anon,authenticated,service_role;
grant select on erp_private.perda_motivo,erp_private.perda_estoque to erp_stock_writer;
grant insert on erp_private.perda_estoque to erp_stock_writer;
grant usage on sequence erp_private.perda_estoque_id_seq to erp_stock_writer;
create policy perda_motivo_leitura on erp_private.perda_motivo for select to erp_stock_writer using (true);
create policy perda_estoque_leitura on erp_private.perda_estoque for select to erp_stock_writer
  using (erp_private.estoque_vinculado(unidade_id));
create policy perda_estoque_registro on erp_private.perda_estoque for insert to erp_stock_writer
  with check (erp_private.estoque_vinculado(unidade_id)
    and autor_id=(select erp_private.ator_autenticado()) and estado='PENDENTE');

create function erp_private.perda_registrar_pendente(p_unidade bigint,p_dados jsonb)
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

  perform erp_private.estoque_objeto(p_dados,array['lote_id','camara_id','data_registro','quantidade','motivo_id','justificativa','chave']);
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
      is distinct from (lote,local_id,competencia,quantidade,motivo,justificativa) then
      raise exception 'Chave reutilizada com outros dados' using errcode='PT409';
    end if;
    return perda.id;
  end if;

  perform erp_private.estoque_periodo_exigir_aberto(p_unidade,competencia);
  if not exists (select 1 from erp_private.perda_motivo m where m.id=motivo and m.ativo and not m.exige_anexo) then
    raise exception 'Motivo indisponível para registro sem anexo' using errcode='PT422';
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
  insert into erp.auditoria_estoque(unidade_id,ator_id,acao,entidade,entidade_id,depois)
  values(p_unidade,ator,'perda_registrar','perda',perda.id,to_jsonb(perda)-'chave');
  return perda.id;
end;
$$;

revoke all on function erp_private.perda_registrar_pendente(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.perda_registrar_pendente(bigint,jsonb) to erp_stock_writer;

do $patch$
declare
  fonte text := pg_get_functiondef('erp_private.estoque_periodo_transicionar(bigint,date,text,bigint,text)'::regprocedure);
  ponto text := 'insert into erp_private.estoque_periodo_evento(unidade_id,mes,estado,ator_id,motivo)';
  trecho text := $guard$
  if p_estado='FECHADO' and exists (
    select 1 from erp_private.perda_estoque p where p.unidade_id=p_unidade and p.estado='PENDENTE'
      and p.data_registro>=p_mes and p.data_registro<p_mes + interval '1 month'
  ) then
    raise exception 'Resolva as perdas pendentes antes de fechar o mês' using errcode='PT409';
  end if;
  $guard$;
begin
  if length(fonte)-length(replace(fonte,ponto,''))<>length(ponto) then
    raise exception 'Ponto de integração de perdas pendentes mudou';
  end if;
  execute replace(fonte,ponto,trecho||ponto);
end;
$patch$;

commit;
