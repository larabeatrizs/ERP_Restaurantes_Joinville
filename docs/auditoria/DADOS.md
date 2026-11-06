# Comparação documental de dados — FND-000

Fontes: [SQL histórico](../../legacy/database/init.sql), [DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) seções 6–14, e [diagnóstico histórico](../requisitos/PLANO_INVESTIGACAO_SETUP_ERP_JOINVILLE.md). Esta é comparação de requisitos com um artefato SQL; não é desenho físico aprovado nem auditoria de desempenho.

**Decisão de reconstrução:** a modelagem será refeita do zero a partir dos requisitos na **Fase B (DATA-001/SPEC-001)**, e implementada por migrations e testes na **Fase C2 (DB-001/SEC-002)**. Esta comparação serve à auditoria e à rastreabilidade; não impõe reaproveitamento das 14 tabelas nem exige reconstruir o banco para concluir a FND-000. Ver [plano](../planejamento/RECONSTRUCAO_SDD.md#momento-da-reconstrução-do-banco).

| Tabela no SQL legado | Contratos do DRS | Lacunas verificáveis no arquivo |
| --- | --- | --- |
| unidade_restaurante | RF-006, RN-016 | Sem calendário, refeições/horários, endereço e capacidade |
| perfil | RF-008, seção 4 | Apenas nome; sem modelo de autorização explícito |
| usuario | RF-008, RN-012 | senha_hash próprio; sem vínculo auth.users; fluxo de convite/inativação por definir |
| usuario_unidade | RN-004/012, CA-011 | Vínculo existe, mas não há RLS ou políticas no script |
| unidade_medida | RF-001, RN-001/003/019 | Sem status/fator-base/normalização de unicidade |
| categoria | RF-002, RN-014 | Sem status, armazenamento padrão e dias de alerta |
| produto | RF-003 | Sem apresentação/conversões, parâmetros por unidade, status, alérgenos e bloqueio de alteração da unidade após movimentação |
| fornecedor | RF-004, RN-003 | CNPJ/CPF é opcional e sem validação; faltam contatos, status e campos de agricultura familiar/condições |
| lote | RF-012/014/017 | Sem unidade, local, origem de recebimento ou regras para perecíveis; validade opcional sem vínculo à entrada |
| movimento_estoque | RF-012–017, RN-005–011 | Tipo/status livres; default APROVADA; sem solicitante/aprovador, cabeçalhos/itens, local, estorno ou rotina atômica |
| prato | RF-005, RN-017 | Sem ingredientes, versões, preparo, status, indiretos ou nutrição |
| cotacao | RF-033, RN-028/032 | Sem apresentação, data/responsável, histórico e regras de conversão |
| refeicao_servida | RF-018–020 | Sem data/turno, vínculo comensal, modalidade e fechamento de caixa |
| auditoria | RN-022, RNF-008, RF-030 | Sem data/hora/unidade/antes/depois; imutabilidade e retenção não implementadas |

Ausentes no SQL: cardápio/dias/refeições/pratos e versões; câmaras e saldo por local; documentos e itens de recebimento; requisição/conferência; inventário; parâmetros por unidade; histórico de importação; comensais e subsídios; amostras e descarte. Os nomes físicos futuros e a divisão em tabelas serão definidos em DATA-001/DB-001.

O script contém PK/FK/algumas UNIQUE; não contém `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `CHECK`, triggers ou funções de transação/auditoria. As FKs isoladamente não demonstram isolamento por unidade, aprovação ou integridade concorrente.

## Supabase — limite de evidência

O registro de 05/11 informa projeto `rp-joinville-db`, Postgres 17, região us-east-1, 14 tabelas public vazias, sem RLS e sem migrations registradas. Sem snapshot de DDL, não é possível afirmar que essas tabelas têm exatamente as mesmas colunas, constraints, grants ou funções do arquivo legado. **AC-04 permanece parcial.**

Para concluir, obter por ferramenta autenticada somente leitura: identidade do projeto/ambiente, versão, data da consulta, tabelas/colunas, PK/FK/check/unique, índices, RLS/policies, grants, funções/triggers e histórico de migrations. Não ler dados de pessoas nem publicar credenciais. Registrar diferenças por objeto e fonte. Não executar DDL, habilitar RLS, resetar banco ou reaplicar o SQL durante essa coleta.
