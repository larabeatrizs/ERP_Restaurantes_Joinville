begin;

create table erp.cardapio (
  id bigint generated always as identity primary key,
  unidade_id bigint not null references erp.unidade(id),
  inicio date not null check (isfinite(inicio)),
  fim date not null check (isfinite(fim) and fim>=inicio),
  tipo_periodo text not null check (tipo_periodo in ('SEMANAL','MENSAL')),
  unique (unidade_id,id),
  unique (unidade_id,id,inicio,fim)
);

create table erp.cardapio_versao (
  id bigint generated always as identity primary key,
  unidade_id bigint not null,
  cardapio_id bigint not null,
  numero integer not null check (numero>0),
  nutricionista_id uuid not null references erp.usuario(id),
  estado text not null default 'RASCUNHO'
    check (estado in ('RASCUNHO','EM_VALIDACAO','PUBLICADO','ENCERRADO','CANCELADO')),
  justificativa text,
  publicado_em timestamptz,
  check (estado not in ('PUBLICADO','ENCERRADO') or publicado_em is not null),
  foreign key (unidade_id,cardapio_id) references erp.cardapio(unidade_id,id),
  unique (unidade_id,cardapio_id,numero),
  unique (unidade_id,cardapio_id,id)
);
create index cardapio_versao_nutricionista_idx on erp.cardapio_versao(nutricionista_id);

create table erp.cardapio_dia (
  id bigint generated always as identity primary key,
  unidade_id bigint not null,
  cardapio_id bigint not null,
  cardapio_versao_id bigint not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  data date not null check (data between periodo_inicio and periodo_fim),
  observacao text,
  foreign key (unidade_id,cardapio_id,cardapio_versao_id)
    references erp.cardapio_versao(unidade_id,cardapio_id,id),
  -- A chave composta garante o intervalo inclusive se o período pai for alterado.
  foreign key (unidade_id,cardapio_id,periodo_inicio,periodo_fim)
    references erp.cardapio(unidade_id,id,inicio,fim),
  unique (unidade_id,cardapio_versao_id,data),
  unique (unidade_id,id)
);
create index cardapio_dia_versao_idx on erp.cardapio_dia(unidade_id,cardapio_id,cardapio_versao_id);

create table erp.cardapio_refeicao (
  id bigint generated always as identity primary key,
  unidade_id bigint not null,
  cardapio_dia_id bigint not null,
  tipo_refeicao text not null check (tipo_refeicao in ('CAFE_MANHA','ALMOCO','JANTAR')),
  estimadas integer not null check (estimadas>=0),
  justificativa_estimativa text,
  foreign key (unidade_id,cardapio_dia_id) references erp.cardapio_dia(unidade_id,id),
  unique (unidade_id,cardapio_dia_id,tipo_refeicao),
  unique (unidade_id,id)
);

alter table erp.cardapio enable row level security;
alter table erp.cardapio_versao enable row level security;
alter table erp.cardapio_dia enable row level security;
alter table erp.cardapio_refeicao enable row level security;
revoke all on erp.cardapio,erp.cardapio_versao,erp.cardapio_dia,erp.cardapio_refeicao
  from public,anon,authenticated,service_role;
revoke all on sequence erp.cardapio_id_seq,erp.cardapio_versao_id_seq,erp.cardapio_dia_id_seq,erp.cardapio_refeicao_id_seq
  from public,anon,authenticated,service_role;

commit;
