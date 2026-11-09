// Bootstrap administrativo limitado à fundação vazia de INT-003.
// Não cria identidades em auth.users; IDs devem vir de Auth Admin + login reais.
export function provisionSql(ids) {
  const labels = ['editorA','readerA','editorB'];
  if (!ids || !labels.every(label => typeof ids[label] === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ids[label])) || new Set(labels.map(label => ids[label])).size !== 3) throw Error('Três identidades Auth distintas são obrigatórias');
  const tables = ['auditoria_configuracao','parametro_unidade','perfil','perfil_permissao','unidade','usuario','usuario_unidade'];
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE ${tables.map(table => `erp.${table}`).join(', ')} IN ACCESS EXCLUSIVE MODE;
DO $bootstrap$
DECLARE gestor bigint; auditor bigint; a bigint; b bigint;
BEGIN
${tables.map(table => `IF EXISTS(SELECT 1 FROM erp.${table}) THEN RAISE EXCEPTION 'INT-003 exige fundação vazia'; END IF;`).join('\n')}
INSERT INTO erp.perfil(codigo) VALUES('GESTOR_UNIDADE') RETURNING id INTO gestor;
INSERT INTO erp.perfil(codigo) VALUES('AUDITOR') RETURNING id INTO auditor;
INSERT INTO erp.perfil_permissao(perfil_id,permissao) VALUES(gestor,'CONFIGURACAO_LER'),(gestor,'CONFIGURACAO_EDITAR'),(auditor,'CONFIGURACAO_LER');
INSERT INTO erp.usuario(id,perfil_id,nome) VALUES
('${ids.editorA}',gestor,'Conta sintética INT003 edição A'),
('${ids.readerA}',auditor,'Conta sintética INT003 consulta A'),
('${ids.editorB}',gestor,'Conta sintética INT003 edição B');
INSERT INTO erp.unidade(codigo,nome) VALUES('STG-INT003-A','Demonstração INT003 — Unidade A') RETURNING id INTO a;
INSERT INTO erp.unidade(codigo,nome) VALUES('STG-INT003-B','Demonstração INT003 — Unidade B') RETURNING id INTO b;
INSERT INTO erp.usuario_unidade(usuario_id,unidade_id) VALUES('${ids.editorA}',a),('${ids.readerA}',a),('${ids.editorB}',b);
PERFORM set_config('request.jwt.claim.sub','${ids.editorA}',true);
INSERT INTO erp.parametro_unidade(unidade_id,modo_saida,motivo_alteracao,criado_por,alterado_por) VALUES(a,'POSTERIOR','INT-003 provisionamento administrativo sintético','${ids.editorA}','${ids.editorA}');
PERFORM set_config('request.jwt.claim.sub','${ids.editorB}',true);
INSERT INTO erp.parametro_unidade(unidade_id,modo_saida,motivo_alteracao,criado_por,alterado_por) VALUES(b,'POSTERIOR','INT-003 provisionamento administrativo sintético','${ids.editorB}','${ids.editorB}');
END $bootstrap$;
COMMIT;
`;
}
