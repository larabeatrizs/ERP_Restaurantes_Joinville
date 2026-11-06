# Plano de reconstrução — desenvolvimento orientado por especificações (SDD)

**Estado:** roteiro aprovado para planejamento da reconstrução, com metodologia **Spec-Driven Development (SDD)** adotada como **interpretação operacional provisória** da expressão "driven development" informada pela responsável. Se ela se referia a TDD, BDD ou outra prática, a denominação deverá ser ratificada em issue de decisão antes da primeira issue funcional. **TDD e BDD serão técnicas complementares** para verificação do contrato, não substitutos do DRS e da UI.

## Princípios inegociáveis
1. **Fontes de verdade:** DRS v1.3 + adendo técnico 1.3-A (IDs RF/RN/RNF/CA), Style Guide aprovado, `docs/PROJETO.md` e decisões arquiteturais vigentes. Nenhuma lacuna autoriza inventar regra ou redesenhar UI.
2. **Código novo, produto preservado:** `legacy/` apenas referência histórica. O banco será **remodelado do zero em migrations versionadas**, frontend/backend/regras de negócio serão **reimplementados** em `apps/*`, sem estender as pastas legadas. Recriação não significa apagar o projeto Supabase existente sem revisão e autorização.
3. **Uma entrega = especificação verificável + testes + implementação + evidências.** Cada issue funcional define estado inicial, entrada, regra, resultado, exceções e observabilidade, com casos positivos e negativos.
4. **Ordem de segurança:** análise do schema existente → desenho aprovado → migrações em ambiente isolado → testes de Auth/RLS/concorrência → staging → eventual produção com aceite e plano de recuperação.
5. **Separação MVC:** View/Controller/Services/Models/Repositories e banco; dependências e responsabilidades auditáveis.

## Fases e gates — associadas ao método de MVP

| Fase | Método | Trabalho novo | Gate |
| --- | --- | --- | --- |
| A — Reconciliação | 06–09 | Arquivar legado, auditar DRS/UI, registrar arquitetura MVC/monorepo, avaliar riscos e decisões | Documentação consistente; divergências críticas classificadas |
| B — Especificação de solução | 07–10 | Matriz RF/RN/RNF/CA → tela → API → domínio → banco → teste; contratos, ADRs, autorização/RLS; **refazer do zero a modelagem conceitual, lógica e física do banco conforme os requisitos do sistema**, com relacionamentos, invariantes e interfaces | Modelagem e especificação da fundação revisadas e rastreáveis ao DRS, sem alteração tácita da UI |
| C1 — Fundação do monorepo | 10–11 | Criar `apps/web`, `apps/api`, `packages/contracts`, toolchain, CI, padrões, lint, tipos, testes e design tokens extraídos da referência | Build reproduzível e CI validado |
| C2 — Banco e segurança NOVOS | 11 | **Recriar todos os schemas necessários** a partir do modelo conceitual e RF/RN/RNF: modelos e constraints, migrations, seeds sintéticos, auth.users, perfis, unidades, RLS, operações atômicas, auditoria; comparar com schema existente | Banco isolado reconstruído integralmente por migrations; testes de negação/concorrência e advisor sem bloqueadores |
| C3 — API e domínio NOVOS | 11–12 | Implementar controllers, services, models, repositories, validação, erros, Auth/segregação, documentação de contratos; testes de unidade/integração e publicação de Worker em staging | Chamadas autorizadas/negadas testadas e dados persistidos de forma segura |
| C4 — Frontend NOVO | 11–12 | Recriar View React/Vite **fiel ao Style Guide** (telas, estados, responsividade, a11y), integrar APIs e Auth, testes de interface/fluxos | Comparação visual/funcional e navegação de ponta a ponta aprovadas |
| D1 — Entrega 1 do DRS | 12 | Cadastros, carga inicial, entrada/saída/aprovações/perdas/consulta, alertas, auditoria | CA da Entrega 1 com evidências de staging |
| D2 — Entrega 2 do DRS | 12 | Fichas técnicas, cardápios, previsão, custo/nutrição, transferência, inventário/rastreabilidade | CA da Entrega 2 comprovados |
| D3 — Entrega 3 do DRS | 12 | Gestão, cotações, relatórios, indicadores, atendimento dentro do escopo aprovado | CA da Entrega 3 comprovados |
| E — Piloto e operação | 13–14 | Backup/recuperação, aprovação institucional e privacidade, carga real autorizada, piloto RP1 com planilhas em paralelo, expansão RP2 | Aceite, monitoramento e recuperação demonstrados |

**Observação de paralelismo:** fundações C2/C3/C4 podem ter tarefas preparatórias em paralelo depois que os contratos de B estiverem estáveis; integração ponta a ponta precisa de migrations e segurança completas. Não interpretar a ordem didática como licença para iniciar funcionalidades sem gate.

## Momento da reconstrução do banco

Determinação reafirmada pela responsável em 06/11/2026: **a modelagem do banco deve ser refeita do zero, conforme os requisitos do sistema, na etapa determinada por este plano**. O SQL legado e o banco existente são fontes de comparação histórica, não o modelo a ser continuado ou uma base obrigatória para o novo desenho.

- **Fase A / FND-000:** inventariar o existente, apontar lacunas e preparar as decisões e o backlog. Não exige entregar a nova modelagem nem executar sua implementação para encerrar a auditoria.
- **Fase B / DATA-001 e SPEC-001:** construir a nova modelagem conceitual, lógica e física a partir do DRS, com vínculo RF/RN/RNF/CA, entidades, relacionamentos, constraints, estados, transações, autorização e auditoria. Revisar o desenho antes de implementá-lo.
- **Fase C2 / DB-001 e SEC-002:** implementar o desenho revisado em migrations novas, dados sintéticos, Auth, grants/RLS e testes em ambiente isolado, conforme as dependências do plano.

Refazer do zero descreve a origem da modelagem e da implementação; não determina excluir o banco conectado. A eventual substituição do ambiente existente exige plano próprio, inventário atualizado e autorização no momento aplicável. A ausência da nova modelagem durante a FND-000 não é, por si só, pendência de aceite dessa issue.

## Roteiro obrigatório de uma issue SDD

O recorte [CONFIG-001](../fundacao/CONFIG-001.md), solicitado em 06/11/2026, especifica o painel simples de parâmetros e políticas. A direção está definida; presets e exceções devem ser consolidados na B. Persistência/segurança entram na C2, serviço/contratos HTTP na C3 e interface integrada na C4, preservando invariantes não configuráveis e o Style Guide.

1. **Fonte e rastreabilidade:** links exatos de RF/RN/RNF/CA, seção do DRS, componentes/telas do Style Guide e decisões aprovadas; citar o que é premissa.
2. **Specification first:** descrever regras, invariantes, estados, autorização por papel/unidade, entradas/saídas, API e dados; explicitar fora de escopo.
3. **Exemplos executáveis:** cenários Given/When/Then ou critérios observáveis com casos positivos, negativos, fronteira, concorrência e falhas de rede quando relevantes.
4. **Teste antes ou junto da implementação (TDD quando viável):** casos automatizados vinculados a critérios, com evidência de falha inicial quando aplicável; evitar testes que apenas reproduzam o código.
5. **Implementação do menor incremento vertical:** migração + Model/Service/Repository + Controller + View + testes/documentação necessários, sem expandir escopo.
6. **Verificação e aceite:** `npm ci`/lint/typecheck/test/build, testes de integração, RLS, a11y, imagem comparativa para UI e staging se pertinente; registrar o que não foi executado.
7. **Handoff:** commit, PR, ambiente, resultados, diferenças, bloqueios, decisão humana e próxima tarefa.

## Estratégia de issues e PRs

- **Issues de decisão/arquitetura** antes das funcionais: `FND-000`, `ARQ-001`, `DATA-001`, `SEC-001`, `UX-001`, `OPS-001`.
- **Issues da fundação:** `MONO-001` (workspace), `DB-001` (schema novo), `SEC-002` (Auth/RLS), `API-001` (estrutura MVC), `WEB-001` (estrutura fiel à UI), `CICD-001`, `E2E-001`.
- **Issues funcionais:** partir da Entrega 1 da seção 15.2 do DRS e dividir por jornadas verticais de tamanho revisável, mantendo dependências reais e critérios existentes.
- **PRs:** uma issue/recorte verificável por PR; branch `docs/`, `feat/`, `fix/` ou `infra/`; título referencia ID de trabalho; incluir especificação, testes, alterações de schema e evidências; revisão antes de merge. PR de migração de schema é separado de carga de dados de produção.
- **Proteção:** `main` recebe somente PRs aprovadas; deploy de staging após checks; deploy de produção exige revisão humana separada. A criação de templates **não** configura automaticamente branch protection/CI.
- **Rastreabilidade:** manter links na issue; `docs/PROJETO.md` aponta para o backlog, sem duplicá-lo; migrar uma decisão durável para documento e PR.

## Gate operacional
**NÃO EXECUTAR AGORA:** reconstrução SQL no Supabase conectado, reset/drop de tabelas, criação paga de staging, alteração de RLS, deploy Cloudflare ou importação de dados pessoais. A autorização recebida permite **planejar** e **implementar na fase adequada**; a execução sobre ambientes conectados requer inventário, risco e aceite conforme a governança.
