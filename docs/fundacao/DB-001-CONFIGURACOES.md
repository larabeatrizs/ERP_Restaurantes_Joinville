# DB-001 — Configurações, identidade e isolamento: recorte C2.1

Data: 06/11/2026. Branch `feat/db-001-configuracoes`, a partir de `9abffa5` da PR #5. Escopo técnico de CONFIG-001, RNF-002/003/008/010/011 e parâmetros de RF-007/008/010/029/037. Não representa os 56 objetos do desenho integral nem uma entrega funcional do ERP.

## Contrato consolidado para este recorte

- Configurações locais são uma linha tipada por unidade, com modo de saída explicitamente informado, margem percentual 0–100, dias de alerta >=0, prazo de amostra e periodicidade de inventário >0, referência de preço em lista fechada e flag de email. Zero/falso têm significado e não são convertidos em ausência.
- Parâmetros guardam revisão, motivo e autoria. Uma gravação válida incrementa a revisão e produz trilha antes/depois atomicamente. O ator vem do contexto autenticado, não do corpo da configuração.
- Leitura requer usuário ativo, unidade ativa, vínculo atual e permissão explícita. Consultar histórico exige permissão adicional. Não há acesso global automático para Admin/Central; o futuro acesso global exige contrato separado.
- Escrever configuração, cadastrar permissões ou editar a trilha diretamente como cliente é proibido. O código CONFIGURACAO_EDITAR é apenas reservado; a operação de salvamento mediada, validação If-Match e controller pertencem ao próximo recorte.
- Não provisionar permissões de produção a partir de escolhas ainda pendentes. Nenhuma associação perfil-permissão, usuário ou unidade real é inserida pela migration. Os oito códigos de perfil são restringidos, mas nem esses cadastros são preenchidos em produção neste recorte.
- Aprovação de perdas/transferências/cotações, política de inventário e cardinalidade da requisição rápida continuam fora deste primeiro schema executável. Não foram tornadas opcionais por um booleano sem regra testada.

## Artefatos implementados

- `supabase/migrations/20261106201235_configuracoes_identidade_base.sql`, criada via **Supabase CLI 3.0.0**, após consulta de `migration new --help` (comando local, sem conexão ao projeto).
- Sete tabelas em schema `erp`: perfil, usuario, unidade, usuario_unidade, perfil_permissao, parametro_unidade e auditoria_configuracao.
- Schema `erp_private` para helpers/triggers SECURITY INVOKER com search_path fixo, sem funções SECURITY DEFINER. Sem grants de DML direto para anon/authenticated. RLS habilitada nas sete tabelas; leitura protegida por vínculo, estado e capacidade.
- Triggers de revisão/autoria e auditoria, com recusa de UPDATE/DELETE comuns na trilha. Isso não impede um superusuário de administrar o banco; não se declara imutabilidade contra o proprietário que desabilite triggers ou altere o schema.
- Suíte única em `tests/database/configuracoes.test.mjs`, executável com PGlite em memória ou PostgreSQL real por pg.

O schema `erp` não é exposto automaticamente pelo Data API por esta tarefa; a definição da exposição do ambiente será feita com segurança na integração. A migration requer as roles e objetos do Auth de um ambiente Supabase compatível. **Não criar auth.users nem o substituto auth.uid() em produção.**

## Laboratório e limitações

Como não há Docker/PostgreSQL nativo nesta máquina, `npm run test:db` cria um PostgreSQL WASM efêmero via PGlite 0.5.15. Nenhum arquivo de banco ou credencial real é usado. O bootstrap de testes simula auth.users, roles e auth.uid() com claim local; **não valida assinatura JWT, login, expiração, recuperação ou Supabase Auth real**.

O CI acrescenta job `database-postgres` com serviço **postgres:17-alpine** descartável, banco `erp_config_test`. A mesma suíte usa pg 8.23.1. A URL de teste aceita apenas localhost/127.0.0.1 e nome exato desse banco; não aceita URL de projeto conectado. O laboratório precisa ser vazio: não há reset/drop automatizado. Credenciais no workflow são exclusivamente desse serviço fictício e efêmero.

Os testes de leitura/escrita do cliente usam `SET LOCAL ROLE authenticated` e confirmam o papel ativo. Testes de revisão, constraints e rollback usam deliberadamente o proprietário do laboratório para exercer triggers, porque clientes ainda não possuem operação mediada de escrita. Não apresentar esses testes como salvamento autenticado de painel pronto.

Não há teste de duas conexões simultâneas neste recorte. Concorrência de If-Match, transações de estoque e testes completos no stack Supabase continuam necessários. O PostgreSQL real do CI testa o mesmo bootstrap simulado de identidade, não todos os serviços Supabase.

## Verificação

Executados em PGlite: **16 testes passaram**, incluindo separação da leitura do histórico e unidade/autoria inválidas. Também passaram os cinco testes HTTP, lint/tipos/build do monorepo na verificação do recorte. O resultado contra PostgreSQL 17 real deve ser consultado no CI da PR correspondente; não é inferido pelo resultado do PGlite.

**CI remoto comprovado:** PR [#6](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/6), commit `c45133f`, [execução 42287219801](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42287219801). Jobs `check` e `database-postgres` concluíram com **success**; a suíte SQL foi executada no serviço PostgreSQL 17 real. Novos commits exigem conferir a execução correspondente antes do merge. Não houve implantação ou aplicação no banco hospedado.

Cenários: leitura por unidade; perfil sem capacidade; usuário inativo/claim ausente; vínculo revogado; unidade inativa; anon negado; DML direto bloqueado; zero/falso; revisão e antes/depois; dados inválidos; ator derivado da sessão; falha induzida de auditoria com rollback; trilha imutável; histórico segregado. O banco conectado permanece intocado.

## Próximo recorte

Continuidade implementada em branch: [CONFIG-002/C2.2](CONFIG-002.md) acrescenta salvamento mediado e revisão esperada. O retrato acima da C2.1 preserva seus resultados; a função privilegiada estreita e suas permissões estão explicitamente documentadas e testadas no novo recorte.

Implementar a operação mediada de atualização com revisão esperada, autorização de edição explícita e histórico atômico; testar conflito e acesso direto, então integrar repository/service/controller na C3. A escolha da fronteira privilegiada precisa de revisão específica antes de conceder execução. Depois construir o painel C4 conforme CONFIG-001. FND-000 continua aberta, e FND_READY ainda não foi atingido.

Fontes técnicas: [PGlite em memória](https://pglite.dev/docs/), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [mudanças da CLI v3](https://supabase.com/changelog/supabase-cli-v3). Changelog Supabase consultado novamente antes da execução.
