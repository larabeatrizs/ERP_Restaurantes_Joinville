# Plano de reconstrução — desenvolvimento orientado por especificações (SDD)

**Estado:** roteiro aprovado para planejamento da reconstrução, com metodologia **Spec-Driven Development (SDD)** adotada como **interpretação operacional provisória** da expressão "driven development" informada pela responsável. Se ela se referia a TDD, BDD ou outra prática, a denominação deverá ser ratificada em issue de decisão antes da primeira issue funcional. **TDD e BDD serão técnicas complementares** para verificação do contrato, não substitutos do DRS e da UI.

## Princípios inegociáveis

**Atualização de ambiente — ADR-002:** durante a construção, o staging existente é compartilhado por desenvolvimento e testes. A provisão de ambientes permanentes separados fica congelada em AMB-001 até o encerramento. As referências abaixo a ambiente isolado continuam válidas para laboratórios locais/CI descartáveis; não exigem novo ambiente permanente nem impedem avanço no staging. Separação de ambientes de produção e limpeza/reconstrução são etapas finais planejadas, sem reset imediato.
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

## Continuidade em 09/11/2026

API-001/PR #8 e WEB-001/PR #10 integradas à main. Depois de INT-001/002, SEC-003 e DB-004, [INT-003](../fundacao/INT-003-JORNADA-REAL.md) demonstrou login/configurações reais com View/Worker locais e Supabase hospedado, três identidades sintéticas, duas unidades e Data API restrita a erp. A terceira migration corrigiu resolução de auth.uid sem ampliar acesso ao schema auth. Doze cenários HTTP e fluxo real de navegador verificaram edição, auditoria, concorrência, revogação e isolamento; isso complementa os testes sintéticos anteriores, sem comprovar deploy.

Próxima dependência: publicação controlada de View/Worker na Cloudflare do **mesmo staging compartilhado**, com smoke no endereço hospedado, seguida pelas jornadas de cadastros/estoque D1. Os demais controles de Auth, recuperação, modelagem integral e políticas CONFIG-001/DOM-001 continuam sujeitos aos seus contratos/gates; advisor atual contém WARN de proteção contra senhas vazadas e INFO do legado intencionalmente contido. AMB-001/issue #9 permanece congelada até o encerramento, sem reset ou ambientes permanentes adicionais. [Estimativa inicial de 09/11](ESTIMATIVA-2026-11-09.md) registrada sob premissas explícitas, para recalibrar após duas jornadas de negócio.

## Continuidade em 16/11/2026

**Incremento EST-002/C2 em 17/11:** migration implementa registro rápido de um produto no dia corrente em POSTERIOR, FEFO/baixa única atômica e conferência distinta com revisão/auditoria. Reconstrução e testes locais; concorrência nativa pertence à CI. Nenhuma execução hospedada neste recorte. Próxima continuidade C3/C4 na issue #52: API/View, seguida de inventário/migration/jornada sintética no mesmo staging. Conciliação depende de refeições reais; fechamento futuro deve integrar o lock de unidade e validação de período antes de sua liberação.

**Continuidade atual em 17/11:** após ADM-003–006 publicados/verificados, retomar a D1 em [EST-002/issue #52](../fundacao/EST-002-REQUISICAO-RAPIDA.md): contrato B/C1 de requisição rápida Posterior, seguido de transação C2, API/View e jornada sintética. Distribuição 1:N por item/refeição confirmada pela responsável, mesma unidade/quantidade limitada/sem segundo débito. Sem refeição fictícia; consumidor de conciliação depende de cardápios reais. [Estimativa atual](STATUS-2026-11-17.md): 30% concluídos, aproximadamente 70% restantes, com o mesmo escopo integral e incerteza explícita. As continuidades abaixo são histórico.

Continuidade ADM-006/issue #50: [ativação/inativação](../fundacao/ADM-006-SITUACAO-USUARIOS.md) para contas com primeiro acesso concluído, com capacidade X separada de I, revisão/motivo/auditoria e o mesmo lock administrativo da edição. Proteger próprio acesso/último ADMIN e comprovar negação com token anterior; não liberar BLOQUEADO/convite nem alterar identidade. Sem exclusão/reset/novo ambiente. Demais controles RF-008, SMTP/rede e carga final seguem próprios.

Próxima continuidade ADM-005/issue #48: [edição e CSV administrativo](../fundacao/ADM-005-CONSULTA-E-EDICAO.md). A responsável confirmou regras de proteção de autogestão/último ADMIN. Seguir C2/C3/C4 com revisão, motivo, revalidação após locks, auditoria e concorrência antes de publicar mudanças de perfil/vínculos. CSV reutiliza leitura atual e não entrega arquivo parcial após falha/revogação. Preservar login/email/senha/status e conta pessoal; inativação/identidade e demais gates seguem recortes próprios.

Continuidade administrativa autorizada em 17/11: [ADM-004/issue #46](../fundacao/ADM-004-CONFIGURADOR.md), Configurador em outra origem Cloudflare do mesmo staging. Entrada global sem selecionar unidade operacional, APIs administrativas removidas da origem ERP e operações ausentes da origem Configurador. Preservar Auth/contas/permissões existentes, sem banco/ambiente adicional. RF-008 integral, SMTP e proteção de rede seguem seus gates; não confundir noindex com autorização nem origem separada com VPN.

Prioridade posterior de 17/11: [ADM-003/issue #44/PR #45](../fundacao/ADM-003-BASICO-18-11.md) publicou/verificou inclusão de usuários e uso dos quatro cadastros pelo ADMIN antes da meta de 18/11, conforme escolhas autorizadas. Serviço privado permanece no staging compartilhado, sem novo ambiente permanente. Primeiro acesso manual provisório ativo, SMTP geral adiado; rever exceção operacional ADMIN antes da produção. Gestão integral de usuários/segurança e demais jornadas D1 seguem seus recortes. Melhorias gerais/skeleton permanecem posteriores ao básico.

Recorte posterior: [ADM-002/C2](../fundacao/ADM-002-IDENTIDADE-PERSISTIDA.md) prepara registro privado de login/revisão/auditoria, sem cadastro automático ou promoção. Alcance administrativo global e consulta de gestor central/auditor confirmados pela responsável; operações por unidades vinculadas preservadas. Melhoria de foco de teclado acompanha a orientação de interface simples/acessível. Próximo C3/C4: endpoints/painel autorizados e adaptação/provisionamento de identidade, respeitando as fronteiras de ADM-001.

Após CAD-007/PR #41, retomar administração RF-008 nas issues #19/#31. [ADM-002/B](../fundacao/ADM-002-CONTRATO-USUARIOS.md) prepara o contrato compartilhado dos campos solicitados antes de migrations e endpoints privilegiados; não libera administração nem modifica contas. [Avanço estimado](STATUS-2026-11-16.md): cerca de 25% do ERP completo, faixa de 20%–30%, incluindo trabalho adiado no denominador. Próxima etapa é C2 de identidade persistida/autorização administrativa, seguida de C3/C4 e jornada sintética. SMTP geral, importação real final, skeleton e AMB-001 mantêm suas decisões vigentes.

## Momento da reconstrução do banco

### Administração e usuário inicial — atualização de 10/11/2026

[ADM-001](../fundacao/ADM-001-ADMINISTRACAO.md)/[issue #19](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/19) formaliza a lacuna de RF-008: não há gestão administrativa de usuários nem ADMIN cadastrado. Especificar na B, implementar capacidades/RLS/bootstrap sintético na C2, APIs/painel na C3/C4 e provisionar ADMIN_INICIAL na integração D1, após validar acesso restrito e controles de primeiro acesso/sessão. O email indicado pela responsável fica em registro privado fora do checkout; a senha não será seed versionada e será definida novamente por entrada segura. Não aguardar o fim do projeto para construir essa administração; AMB-001 congela ambientes permanentes separados, sem congelar RF-008. Subdomínio é proposta sujeita a domínio e proteção de rede; nenhum serviço/conta real foi criado neste mapeamento.

Continuidade posterior à constatação acima: a responsável solicitou acesso para acompanhar o sistema. ADM-001/A foi implementada/publicada: identidade ADMIN_INICIAL com somente três capacidades de consulta e duas unidades sintéticas, sem administração privilegiada. Bootstrap ensaiado, definição de senha e leitura/negações verificadas no hospedado; [evidência](../evidencias/adm-001/acesso-hospedado.json). Link privado permite escolher senha, sem reutilizar a enviada no chat. Esse acesso limitado não aguarda a conclusão da gestão completa; as etapas de RF-008/painel administrativo acima continuam antes do uso privilegiado e do piloto. Sem novos ambientes, migrations ou limpeza.

### Modelagem a partir dos requisitos

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
