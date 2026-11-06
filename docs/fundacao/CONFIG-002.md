# CONFIG-002 — Salvamento mediado com revisão

Data: 06/11/2026. Recorte C2.2, branch `feat/config-002-salvamento`, sobre a PR #6. Especificação antes da implementação. Fontes: CONFIG-001, DB-001/C2.1, RNF-002/003/008/010 e contrato do painel. Nenhum objeto será aplicado ao banco hospedado neste recorte.

## Contrato

Operação de atualização de configuração já existente: unidade, revisão esperada, conjunto parcial de campos conhecidos e motivo. Não cria unidade, usuário, permissão ou configuração inicial. Exige leitura e edição explícitas, usuário/unidade ativos e vínculo atual. Nenhum preset de permissão de produção é introduzido; fixtures são fictícias.

Campos permitidos: modo_saida, margem_percentual, dias_alerta_validade, prazo_amostra_horas, periodicidade_inventario_dias, referencia_preco e alerta_email_habilitado. Não aceitar campos de autoria, revisão, unidade ou chaves desconhecidas no conteúdo. Margem usa string decimal canônica com até duas casas; inteiros usam números JSON inteiros, booleano usa booleano. Não aceitar null ou converter texto em booleano.

Revisão positiva é obrigatória. Sob lock da linha, revisão antiga falha sem gravar. A operação aplica os campos fornecidos, conserva os demais, incrementa a revisão por trigger e produz auditoria na mesma transação. Conjunto vazio é inválido. Atualização com valores iguais ainda produz uma revisão justificada, sem ser tratada como idempotência de comando.

Erros de contrato: PT428 = revisão ausente, PT412 = revisão desatualizada, PT422 = conteúdo/revisão/motivo inválidos, PT404 = configuração ausente para unidade cujo acesso já foi autorizado, 42501 = sessão/acesso negados. A futura camada HTTP mapeará esses erros ao contrato HTTP; não há rota nova nesta etapa.

## Fronteira de segurança proposta

Usar um wrapper SECURITY INVOKER em `erp` que chama uma única função SECURITY DEFINER em `erp_private`, com search_path vazio e nomes qualificados. A função interna pertence a `erp_config_writer`, papel NOLOGIN/NOSUPERUSER/NOBYPASSRLS, sem capacidade de criar papéis/bancos e sem ownership das tabelas. Conceder somente SELECT necessários, UPDATE das colunas configuráveis e INSERT na trilha/sequência correspondente. As policies do papel também verificam acesso do ator.

Motivo da elevação restrita: o cliente não pode ter UPDATE direto e ignorar revisão/workflow. Não usar função pertencente a postgres nem dar bypass de RLS ao executor. Impedir execução para PUBLIC/anon, fixar argumentos e validar novamente o contexto após adquirir o lock. Não aceitar SQL dinâmico de dados do usuário. A migração precisa de autoridade administrativa para criar o papel e transferir ownership; compatibilidade com o projeto Supabase real será validada separadamente antes de aplicação.

## Verificações previstas

- Salvar como authenticated com capacidade explícita; alterações, revisão e auditoria coerentes.
- Negar escrita direta, outra unidade, ausência de claim, usuário/unidade inativos, capacidade/vínculo revogados e role anon.
- Negar precondição ausente/desatualizada, chaves desconhecidas, payload vazio, nulls, tipos errados e motivos inválidos, sem alterações parciais.
- Conferir ownership/atributos do executor, ausência de memberships concedidas ao cliente, ausência de EXECUTE público e search_path fixo.
- Induzir falha de auditoria e comprovar rollback da configuração/revisão.
- No PostgreSQL real do CI, duas conexões com a mesma revisão: uma grava, a outra recebe PT412, com somente uma revisão e um evento adicional. PGlite não será apresentado como prova de concorrência entre conexões.

Integração com serviço/repository/controller HTTP e Supabase Auth real continua no próximo recorte C3. Tela de configurações continua na C4. Resultados reais e limitações serão acrescentados após execução.

## Implementação e revisão da fronteira

A migration `20261106202428_configuracoes_salvamento_mediado.sql` foi criada pela CLI 3.0.0 após consulta de `migration new --help`, sem conexão remota. O papel executor só pode atualizar as sete colunas configuráveis e motivo; não pode alterar autoria, criar usuários/permissões, apagar auditoria ou criar objetos no schema. A capacidade de criação no schema e a membership necessárias à transferência de ownership são temporárias e removidas na própria migration. RLS continua aplicada ao executor, que não é proprietário das tabelas.

Não existe INSERT de configuração nesta operação. A carga inicial continua sendo uma tarefa administrativa separada. O wrapper invoker pode chamar a função interna, mas uma chamada direta à interna recebe as mesmas validações; ela não confia no wrapper como única barreira.

A função valida novamente o acesso depois da espera pelo lock, e o UPDATE também tem policy própria. Isso não pretende revogar retroativamente uma transação já autorizada/confirmada; uma política de cancelamento de transação por revogação concorrente exigiria protocolo adicional. Nenhum poder global é concedido por ser Admin.

## Evidências locais

PGlite: **27 casos passaram e um foi omitido intencionalmente**, o teste de duas conexões. A suíte tem 28 casos no total e mantém os testes anteriores da C2.1. Os usuários/perfis e permissões de edição existem somente nas fixtures sintéticas. A leitura de metadados de usuário não é usada como fonte de autorização.

Os casos novos exercem a chamada sob `authenticated`, não sob proprietário. A falha induzida de auditoria durante o salvamento autenticado reverteu valores/revisão; os testes também confirmaram ausência de EXECUTE público, executor sem login/bypass, tipos estritos, proibição de campos extras, autoria derivada da sessão e conflito de revisão sem trilha duplicada. O PostgreSQL 17 no CI executará o caso concorrente real; não inferir seu resultado a partir do PGlite.

**Limites:** sem validação de JWT real/Supabase hospedado, endpoint HTTP, painel, restauração ou alterações de dados reais. Não há cache de configuração, motor de workflow ou opção para desligar invariantes. A operação de atualização parcial será exposta como PATCH com If-Match na C3; nenhum endpoint foi criado neste recorte. FND_READY não atingido.

Fontes consultadas: [funções e search_path no PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createfunction.html), [privilégios e roles](https://www.postgresql.org/docs/17/sql-grant.html), [funções Supabase](https://supabase.com/docs/guides/database/functions) e changelog Supabase de 06/11/2026. A compatibilidade do papel/migration com o stack Supabase real continua exigindo validação isolada antes de qualquer aplicação hospedada.
