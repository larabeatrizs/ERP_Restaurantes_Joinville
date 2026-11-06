-- Dados sintéticos, nunca executados no projeto conectado.
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000004');
insert into erp.perfil(codigo) values ('ADMIN'),('ESTOQUISTA');
insert into erp.perfil_permissao(perfil_id,permissao)
 select id,p from erp.perfil cross join (values ('CONFIGURACAO_LER'),('CONFIGURACAO_HISTORICO')) as x(p)
 where codigo='ADMIN';
insert into erp.usuario(id,perfil_id,nome,status)
 select '00000000-0000-4000-8000-000000000001',id,'Administrador fictício A','ATIVO' from erp.perfil where codigo='ADMIN';
insert into erp.usuario(id,perfil_id,nome,status)
 select '00000000-0000-4000-8000-000000000002',id,'Administrador fictício B','ATIVO' from erp.perfil where codigo='ADMIN';
insert into erp.usuario(id,perfil_id,nome,status)
 select '00000000-0000-4000-8000-000000000003',id,'Usuário fictício sem permissão','ATIVO' from erp.perfil where codigo='ESTOQUISTA';
insert into erp.usuario(id,perfil_id,nome,status)
 select '00000000-0000-4000-8000-000000000004',id,'Usuário fictício inativo','INATIVO' from erp.perfil where codigo='ADMIN';
insert into erp.unidade(codigo,nome) values ('TESTE_A','Unidade fictícia A'),('TESTE_B','Unidade fictícia B');
insert into erp.usuario_unidade(usuario_id,unidade_id) values
 ('00000000-0000-4000-8000-000000000001',1),
 ('00000000-0000-4000-8000-000000000002',2),
 ('00000000-0000-4000-8000-000000000003',1),
 ('00000000-0000-4000-8000-000000000004',1);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into erp.parametro_unidade(unidade_id,modo_saida,motivo_alteracao)
 values (1,'POSTERIOR','Carga sintética A'),(2,'PREVIA','Carga sintética B');
select set_config('request.jwt.claim.sub','',false);
