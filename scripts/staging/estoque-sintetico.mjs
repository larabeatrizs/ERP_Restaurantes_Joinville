// Gera bootstrap administrativo privado; não autentica nem executa SQL remotamente.
// Contas devem ter sido criadas/verificadas por Auth Admin, nunca por fixtures SQL.
export function stockProvisionSql(state) {
 const labels=['editorA','readerA','editorB','stockkeeperA'];
 const ids=Object.fromEntries(labels.map(label=>[label,state.users?.find(user=>user.label===label)?.id]));
 if(state.projectRef!=='vpowsedoajpdbeckimuv'||!labels.every(label=>typeof ids[label]==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ids[label]))||new Set(Object.values(ids)).size!==4)throw Error('Quatro identidades Auth verificadas e distintas são obrigatórias');
 if(!state.units||![state.units.A,state.units.B].every(id=>typeof id==='string'&&/^[1-9]\d*$/.test(id))||state.units.A===state.units.B)throw Error('Duas unidades sintéticas distintas são obrigatórias');
 const known=Object.values(ids).map(id=>`'${id}'`).join(',');
 return `BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $seed$
DECLARE perfil_estoque bigint;
BEGIN
IF EXISTS(SELECT 1 FROM erp.usuario WHERE id NOT IN (${known}))
 OR NOT EXISTS(SELECT 1 FROM erp.unidade WHERE id=${state.units.A} AND codigo='STG-INT003-A')
 OR NOT EXISTS(SELECT 1 FROM erp.unidade WHERE id=${state.units.B} AND codigo='STG-INT003-B')
 THEN RAISE EXCEPTION 'Somente fundacao sintetica INT003/EST001'; END IF;
IF EXISTS(SELECT 1 FROM erp.produto) OR EXISTS(SELECT 1 FROM erp.entrada)
 OR EXISTS(SELECT 1 FROM erp.unidade_medida) OR EXISTS(SELECT 1 FROM erp.categoria)
 OR EXISTS(SELECT 1 FROM erp.fornecedor) OR EXISTS(SELECT 1 FROM erp.camara)
 THEN RAISE EXCEPTION 'Bootstrap exige catalogos novos vazios; nao substituir dados existentes'; END IF;
IF (SELECT count(*) FROM auth.users WHERE id IN (${known}))<>4 THEN RAISE EXCEPTION 'Auth real verificado obrigatorio'; END IF;
INSERT INTO erp.perfil(codigo) VALUES('ESTOQUISTA') RETURNING id INTO perfil_estoque;
INSERT INTO erp.usuario(id,perfil_id,nome) VALUES('${ids.stockkeeperA}',perfil_estoque,'Conta sintética EST001 estoque A');
INSERT INTO erp.usuario_unidade(usuario_id,unidade_id) VALUES('${ids.stockkeeperA}',${state.units.A});
INSERT INTO erp.perfil_permissao(perfil_id,permissao)
 SELECT id,p FROM erp.perfil CROSS JOIN(VALUES('PRODUTO_LER'),('PRODUTO_GERIR'),('ESTOQUE_LER'),('RECEBIMENTO_APROVAR_DIVERGENCIA')) x(p) WHERE codigo='GESTOR_UNIDADE';
INSERT INTO erp.perfil_permissao(perfil_id,permissao)
 SELECT id,p FROM erp.perfil CROSS JOIN(VALUES('PRODUTO_LER'),('ESTOQUE_LER')) x(p) WHERE codigo='AUDITOR';
INSERT INTO erp.perfil_permissao(perfil_id,permissao)
 SELECT perfil_estoque,p FROM(VALUES('CONFIGURACAO_LER'),('PRODUTO_LER'),('PRODUTO_GERIR'),('ESTOQUE_LER'),('RECEBIMENTO_GERIR')) x(p);
INSERT INTO erp.unidade_medida(sigla,descricao,grandeza,fator_base) VALUES('KG','Quilograma — demonstração EST001','MASSA',1),('UN','Unidade — demonstração EST001','CONTAGEM',1);
INSERT INTO erp.categoria(descricao,tipo_item,armazenamento_padrao) VALUES('Demonstração EST001 — Grãos','ALIMENTO','SECO'),('Demonstração EST001 — Proteína resfriada','ALIMENTO','RESFRIADO');
-- Documento numerico sintetico de teste; nao representa identificacao fiscal validada.
INSERT INTO erp.fornecedor(razao_social,cnpj_cpf) VALUES('Demonstração EST001 — Fornecedor sintético','99999999000191');
INSERT INTO erp.camara(unidade_id,nome,tipo) VALUES(${state.units.A},'Demonstração EST001 — Depósito seco','SECO'),(${state.units.A},'Demonstração EST001 — Câmara resfriada','RESFRIADO'),(${state.units.B},'Demonstração EST001 — Depósito seco','SECO');
END $seed$;
COMMIT;
`;
}
