# PROJETO — ERP Restaurantes Populares de Joinville

> **Estado em 09/11/2026:** [INT-003](fundacao/INT-003-JORNADA-REAL.md) demonstrou a jornada de configurações com Auth/API/RPC reais: três contas sintéticas, duas unidades e View/Worker locais conectados ao Supabase hospedado. Data API expõe somente erp; três migrations aplicadas, RLS/auditoria/concorrência verificadas e public legado contido. Advisor atual: um WARN de proteção contra senhas vazadas e 14 INFO do legado sem políticas. Publicação Cloudflare e módulos de negócio continuam pendentes; FND_READY não atingido. Staging compartilhado; AMB-001/issue #9 congelada até o encerramento. Não há liberação operacional.

## 01 — Ponto de partida e fontes de autoridade

- **Produto:** ERP web dos Restaurantes Populares de Joinville (RP1 e RP2), com estoque por lote/unidade, entradas, saídas, cardápios, relatórios e rastreabilidade.
- **Contrato funcional:** [Documento de Requisitos de Software](requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), versão 1.3 (04/11/2026) e adendo técnico 1.3-A em revisão (05/11/2026). Os IDs `RF-`, `RN-`, `RNF-` e `CA-`, as prioridades e os critérios funcionais são preservados.
- **Interface visual de referência obrigatória:** [Style Guide Restaurante Popular](wireframe/Style%20Guide%20Restaurante%20Popular.html). A referência não pode ser modificada sem ressalva/decisão explícita. Abrange as telas identificadas de Login, Painel, Produtos, Cadastro de Produto, Entrada de Materiais, Aprovações e Cardápio; estados e fluxos sem especificação explícita exigem levantamento, não invenção.
- **Método de trabalho:** [processo de desenvolvimento de MVP de software com IA assistida](https://github.com/jukazilli/processo-de-desenvolvimento-de-mvp-de-software-com-ia-assistida), etapas 01–14. Este arquivo é o documento principal; Issues são a fila de trabalho e PRs guardam alterações revisáveis.
- **Baseline desta auditoria:** `main` @ `a53059bb5f1dd32f227bd017cc6ce2342e18b72e`; alterações posteriores devem ser verificadas antes de iniciar novas tarefas. A baseline inicial de `1baacd0` permanece como referência histórica nos diagnósticos antigos.

**Legado:** `legacy/frontend/`, `legacy/backend/`, `legacy/database/`, `legacy/escr/` e `legacy/docker-compose.yml` foram deslocados da raiz sem alteração de conteúdo. Seu uso é exclusivamente como referência histórica; o código novo e os schemas devem nascer de especificações e testes, não de extensão do protótipo. Ver [política do legado](../legacy/README.md).

**Regra de precedência:** requisito funcional aprovado e interface aprovada prevalecem sobre a implementação atual; decisões de infraestrutura e arquitetura do projeto controlam como implementar, mas não autorizam alterar regras de negócio, permissões ou UI. Conflitos são documentados e submetidos a revisão. Fonte técnica proposta não equivale a aceite institucional.

## 06 — Qualidade, riscos e proteção de dados

Contratos prioritários do DRS: `RNF-002` (isolamento por unidade), `RNF-003` (autenticação e controle de acesso), `RNF-004` (backup/restauração), `RNF-007` (LGPD), `RNF-008` (auditoria), `RNF-009` (acessibilidade), `RNF-010` (integridade transacional), `RNF-011` (manutenibilidade), `RNF-013` (monitoramento) e `RNF-015` (localização).

Riscos identificados no inventário inicial:
1. O inventário inicial encontrou 14 tabelas public vazias sem RLS. SEC-003 aplicou contenção; DB-004/INT-003 verificaram as sete tabelas novas com RLS/grants restritos e a jornada Auth/RLS real com dados sintéticos, sem reabrir public. **P0 remanescente:** controles completos de Auth, backup/recuperação e demais gates antes de dados reais. O WARN atual de proteção contra senhas vazadas exige revisão no hardening de Auth; 14 INFO de RLS sem políticas refletem a negação intencional de acesso ao legado.
2. `database/init.sql` não implementa integralmente o modelo conceitual do DRS e contém a tabela `usuario.senha_hash`, incompatível com a decisão de delegar autenticação ao Supabase Auth sem revisão de schema.
3. Requisitos antigos ainda mencionavam VPS e cópias externas à VPS; a reconciliação proposta conserva as metas de recuperação e substitui a hospedagem, não dispensa backups.
4. A região `us-east-1` do projeto Supabase observado precisa de análise jurídica/operacional de dados e latência antes de uso com dados pessoais reais.
5. O DRS tem trechos extraídos de PDF com tabelas quebradas; conferir o documento original ao reconstruir matrizes de acesso e contratos, sem inferir colunas.

## 07 — Arquitetura e decisões técnicas

### Decisões determinadas pela responsável do projeto (05/11/2026)

| ID | Decisão | Alcance | Estado |
| --- | --- | --- | --- |
| ARQ-001 | **Monorepo** para frontend, backend, componentes compartilhados, migrações, testes e documentos | Organização do código | Bootstrap e CI verificados; integrado à main |
| ARQ-002 | **MVC adaptado a web/API**, com separação adicional de serviços e repositórios | Arquitetura do software | Controller/Service de liveness implementados; camadas de negócio pendentes |
| INF-001 | **Cloudflare** para hospedar frontend e backend, em substituição à VPS/Docker como destino de produção | Infraestrutura | Definida; produto Cloudflare e implantação ainda sujeitos a verificação |
| INF-002 | **Supabase PostgreSQL + Supabase Auth** para persistência e identidade | Dados e autenticação | Jornada real de configurações verificada em INT-003; demais módulos e controles pendentes |
| UX-001 | Manter o Style Guide existente como contrato visual obrigatório, salvo exceções analisadas | Experiência | Reafirmada; estados faltantes pendentes |

**Delimitação do MVC:** `View` = React/Vite e componentes da interface; `Controller` = handlers/rotas HTTP da API em Cloudflare Workers; `Model` = entidades/validações/invariantes de domínio e adaptadores de persistência sobre PostgreSQL. Serviços de aplicação orquestram casos de uso; repositórios isolam acesso ao banco. Não incluir SQL, autorização administrativa ou segredos na View.

A [especificação técnica da arquitetura](arquitetura/MVC_MONOREPO.md) governa limites, estrutura-alvo e contratos de dependência. O diagrama é desenho-alvo, não retrato de uma implantação existente.

### Reconciliação formal da mudança de infraestrutura

- **Substituído:** VPS hospedando PostgreSQL, backend Node com servidor de longa duração, frontend em contêiner e `docker-compose` como instrução de produção.
- **Adotado:** frontend estático em Cloudflare, API em Cloudflare Workers, banco/Auth no Supabase, CI/CD pelo GitHub; a seleção entre produtos específicos de frontend Cloudflare é decisão técnica a validar na fundação, sem reabrir a plataforma escolhida.
- **Mantido:** HTTPS, permissões por papel/unidade, desempenho, disponibilidade, logs, trilha de auditoria, integridade, teste de recuperação, RPO **24 h**, RTO **4 h**, retenção **30 diários/12 mensais** e teste trimestral conforme `RNF-004`. Essas metas ainda exigem solução e verificação de custo/capacidade; não são garantia fornecida pelos serviços.
- **Legado:** `docker-compose.yml` e `database/init.sql` permanecem como referências históricas até migração planejada; não devem ser tratados como receita de implantação vigente.
- **Confirmação externa pendente:** aceite técnico/institucional da reconciliação pelo responsável autorizado e aprovações de privacidade/produção.

## 08 — Tecnologias e regras de uso

| Responsabilidade | Tecnologia estabelecida ou proposta | Observação |
| --- | --- | --- |
| Interface | React + Vite (existente no repositório) | Preservar telas/estilo aprovados; versões e toolchain na fundação |
| API/Controllers | Cloudflare Workers com Web APIs nativas no bootstrap novo | Express legado não foi reutilizado; rotas de negócio pendentes |
| Modelos e regras | TypeScript no bootstrap novo e contratos tipados | Modelos e regras de negócio ainda não implementados |
| Persistência | Supabase PostgreSQL (Postgres 17 observado na conexão) | Migrations versionadas, transações e RLS |
| Identidade | Supabase Auth | Vincular `auth.users.id` ao perfil e às unidades de negócio; abandonar senhas próprias no domínio |
| Monorepo | npm workspaces implementado no bootstrap | Node 24.22.2, versões diretas fixadas e lockfile; execução local verificada |
| Automação | GitHub Actions + ferramenta oficial Cloudflare/Supabase | Tokens com escopo mínimo, revisão e ambientes separados |

**Fontes oficiais de tecnologia**: [React/Vite + Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Express em Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [migrações e ambientes](https://supabase.com/docs/guides/deployment/managing-environments). Verificar compatibilidade/versões na issue de fundação.

## 09 — Infraestrutura, segurança e operação planejadas

`Navegador → React/View (Cloudflare) → API/Controller (Cloudflare Worker) → Service/Model/Repository → Supabase PostgreSQL`. Login pelo Supabase Auth; a API valida a identidade e aplica permissões de perfil e unidade, reforçadas por RLS e grants.

- **Frontend:** somente URL pública da API, URL e chave publicável do Supabase; nunca usar `service_role`, chave secreta, senha ou token de deploy no navegador.
- **Worker:** credenciais server-side apenas por Secrets do runtime e apenas onde indispensáveis; validar JWT e autorização por operação; não usar chave administrativa para contornar RLS em rotas de usuário.
- **Dados:** migrations com histórico, transações atômicas para movimentos de estoque, bloqueio de saldo negativo, idempotência, auditoria e testes de isolamento entre RP1 e RP2.
- **Ambientes:** conforme [ADR-002](decisoes/ADR-002-STAGING-COMPARTILHADO.md), staging compartilhado para desenvolvimento/testes durante a construção. Provisão de ambientes permanentes separados congelada em AMB-001 até o encerramento. Testes locais/CI efêmeros continuam; staging não é produção liberada.
- **Operação:** backup e restauração testados, observabilidade, recuperação e rollback planejados antes de pilotar com dados reais; região e bases legais sujeitas a aceite institucional.

## 10 — Trabalho no GitHub

**Metodologia:** Spec-Driven Development (SDD, interpretação operacional de “driven development”, pendente de confirmação do nome da prática antes da primeira implementação funcional). Primeiro especificação rastreável do DRS/UI, cenários de aceitação e testes; depois código, verificação, PR e aceite. TDD/BDD complementam o processo. Referência: [Plano de reconstrução](planejamento/RECONSTRUCAO_SDD.md). Templates obrigatórios de issue e PR no `.github/` documentam contratos, evidências e riscos.


- **Backlog oficial:** [Issues](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues); **revisões:** [Pull requests](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pulls).
- Priorizar `FND-000` (auditoria/reconciliação), depois ADR/arquitetura, autorização, modelo de dados, staging e CI; identificadores são nomes de trabalho propostos, não números existentes.
- Cada issue deve referenciar IDs do DRS e estados da UI, critérios observáveis, dependências, verificações e evidências. Usar branch e PR antes de integrar na `main`; não marcar concluído sem testes/aceite adequados.
- Não duplicar o backlog neste arquivo: as issues representam o trabalho operacional.

## 11 — Fundação técnica (execução inicial)

O bootstrap, a modelagem e os recortes C2.1/C2.2 foram integrados à main pelas PRs #3–#7. Evidências locais/CI em [revisão da fundação](planejamento/REVISAO_FUNDACAO.md). A [API-001](fundacao/API-001-CONFIGURACOES.md) acrescentou rotas e adaptador de Auth/RPC; [INT-003](fundacao/INT-003-JORNADA-REAL.md) verificou a jornada real com aplicação local e Supabase hospedado, incluindo concorrência, revogação/inativação e isolamento por unidade. Publicação da aplicação e fundação completa continuam pendentes.

1. Usar os arquivos em `legacy/` somente para auditoria; **criar novos** `apps/web`, `apps/api`, `packages/*` e `supabase/migrations` sem copiar o protótipo como aplicação.
2. Definir bootstrap do monorepo, versões fixadas, lockfile, lint, testes, build e CI.
3. **Refazer do zero a modelagem conceitual, lógica e física do banco conforme o DRS na Fase B (DATA-001/SPEC-001)**. Na **Fase C2 (DB-001/SEC-002)**, implementar esse desenho revisado por migrations novas, relacionamentos, constraints, grants/RLS, auditoria e testes em banco isolado. A FND-000 inventaria e identifica lacunas; não antecipa essas entregas. O SQL legado e o schema atual não são a base obrigatória do novo modelo. O banco Supabase conectado não deve ser apagado ou alterado sem plano e autorização. Ver [momento da reconstrução](planejamento/RECONSTRUCAO_SDD.md#momento-da-reconstrução-do-banco).
4. Implementar novos Auth, perfis, vínculos por unidade, grants/RLS e testes negativos, sem reaproveitar `legacy/backend`.
5. **Recriar backend MVC, regras de negócio e contratos HTTP** em `apps/api`, com testes de domínio, autorização, integração e concorrência.
6. **Recriar frontend** em `apps/web`, aderente ao Style Guide e integrado às APIs, com testes de acessibilidade, estados e comparação visual.
7. Configurar staging e secrets, validar deploy e smoke test com dados sintéticos.
8. Demonstrar backup/restauração, observabilidade, recuperação e procedimentos de operação.

**Gate `FND_READY`:** pipeline e staging comprovados, autorização/RLS testadas, migrations reaplicáveis, sem segredos em código, UI de referência conferida e evidências vinculadas a commit. **Estado atual: NÃO ATINGIDO.**

## 12 — Incrementos funcionais

Seguir `15.2` do DRS, preservando sua ordem:
1. **Entrega 1 — Fundação e estoque:** RF-001–RF-008, RF-036, entradas/saídas/perdas, posição, validade, segurança/auditoria/backup.
2. **Entrega 2 — Planejamento e rastreabilidade:** ficha técnica, cardápio, previsão, inventário, custos, transferências e rastreio.
3. **Entrega 3 — Gestão e atendimento:** cotações, indicadores, previstos × realizados, relatórios e registro de atendimento nos limites do DRS.

Realizar a primeira implantação operacional no RP1, com duas semanas em paralelo às planilhas segundo `15.4`; RP2 só depois da validação pertinente.

## 15 — Registro das pendências e aprovações

| Item | Por que importa | Estado |
| --- | --- | --- |
| Modelo de autenticação e vínculo `auth.users` / perfil / unidade | Define segurança e migrations | Recorte de configurações verificado com identidades reais em INT-003; RF-008 integral e permissões operacionais pendentes |
| Acesso ao banco via Supabase HTTP/RPC ou acesso direto controlado | Afeta transações, custo e isolamento | HTTP/RPC comprovado para configurações; movimentos de estoque ainda exigem transações/testes próprios |
| Staging, backup, região e orçamento | Afeta custos, recuperação e LGPD | Staging compartilhado definido; separação congelada em AMB-001; backup/região/orçamento ainda exigem planejamento |
| Deploy frontend Cloudflare e API Worker | Afeta toolchain sem mudar a decisão de plataforma | Worker nativo local verificado; implantação remota pendente |
| Estados e jornadas não cobertos pelo Style Guide | Evita extrapolar UI aprovada | Pendente de inventário |
| Validação externa e assinaturas da seção 17.3 do DRS | Condição para liberação institucional | Não comprovada |
| AMB-001 — separar ambientes permanentes e preparar limpeza/reconstrução | Decisão da responsável: usar staging compartilhado agora | Congelada até o encerramento funcional; sem reset imediato |

## 16 — Continuidade e evidências

- **Baseline histórica:** relocação do código do protótipo para `legacy/`, documentação da reconstrução integral e templates de SDD/PR. Os incrementos seguintes registram a implementação nova.
- **Auditoria em andamento:** [FND-000](auditoria/FND-000.md), vinculada à issue #2, reúne inventário, matriz de investigação, mapa de UI, comparação documental dos dados e decisões/dependências. Seus limites e critérios ainda pendentes estão explícitos no relatório.
- **Skills do projeto:** `erp-requisitos` e `erp-entregas`, versionadas em `.agents/skills/` e encaminhadas por `AGENTS.md`. Apoiam rastreabilidade e revisão por critério; não concedem autorização operacional nem provam conformidade.
- **Execução iniciada:** [MONO-001](fundacao/MONO-001.md), bootstrap técnico independente dos contratos funcionais ainda abertos. Não declara encerramento de FND-000 nem da fase B inteira.
- **Fase B em revisão:** [DATA-001](dados/DATA-001.md), [dicionário](dados/DICIONARIO.md), [transações](dados/TRANSACOES_ESTOQUE.md) e [SEC-001](seguranca/SEC-001.md). Fonte PDF conferida textualmente nas páginas 10/11/51/52; conflitos de perdas, cotação, transferência, atendimento e abertura de saldo continuam explícitos.
- **Decisões para revisão:** [DOM-001](decisoes/DOM-001-PROPOSTAS.md) apresenta propostas concretas por item e seus efeitos. Não estão aprovadas por terem sido documentadas; implementar somente o recorte cujas decisões estejam registradas.
- **Direção de parametrização (06/11/2026):** a responsável definiu painel simples para habilitar/configurar ações onde permitido. [CONFIG-001](fundacao/CONFIG-001.md) detalha mapeamento existente, catálogo, fluxo de interface, contratos, persistência e integração desacoplada. Invariantes permanecem obrigatórias; presets e exceções ainda precisam de consolidação. Especificação na B, dados/segurança na C2, API na C3 e painel na C4.
- **Revisão publicada:** [PRs e CI](planejamento/REVISAO_FUNDACAO.md), com ordem de dependência e evidências por commit. O documento preserva snapshots históricos; as integrações posteriores constam nas PRs e nos registros abaixo.
- **C2.1:** [DB-001 configurações/identidade](fundacao/DB-001-CONFIGURACOES.md) implementa primeira migration e laboratório isolado, sem provisionamento no banco conectado. Leitura e proteção de parâmetros/trilha, complementadas pelo salvamento C2.2 abaixo. API, Auth real e painel continuam pendentes. Esse recorte não resolve automaticamente as permissões de negócio ainda em discussão.
- **C2.2 / salvamento:** [CONFIG-002](fundacao/CONFIG-002.md), branch `feat/config-002-salvamento`, implementa atualização parcial mediada, papel executor restrito, revisão esperada e auditoria atômica. Não há endpoint ou login real nesta etapa. Concorrência de duas conexões é verificada separadamente no PostgreSQL 17 do CI.
- **Política vigente:** [ADR-002](decisoes/ADR-002-STAGING-COMPARTILHADO.md) define staging compartilhado e integração de recortes verificados à main. [API-001](fundacao/API-001-CONFIGURACOES.md) registra a evolução HTTP e suas limitações de validação. AMB-001 não bloqueia os laboratórios descartáveis ou a implementação.
- **Recorte C4:** [WEB-001](fundacao/WEB-001-CONFIGURACOES.md), painel por unidade sobre API-001, com revisão, motivo e tratamento de conflito. Seus testes sintéticos foram complementados pela jornada real INT-003 abaixo.
- **Integração:** [INT-001](fundacao/INT-001-STAGING.md) entrega roteiro/coletor; [INT-002](fundacao/INT-002-SNAPSHOT-REMOTO.md) confirmou acesso CLI e a baseline anterior à contenção em 09/11/2026: 14 tabelas public vazias sem RLS, privilégios para anon, 14 erros e nenhum backup listado pela API. A evolução dessa baseline é SEC-003 abaixo. Schemas novos ainda ausentes; nenhuma migration do produto hospedada foi aplicada.
- **Contenção aplicada:** [SEC-003](fundacao/SEC-003-CONTENCAO-LEGADO.md) produziu salvaguarda restrita do public vazio e demonstrou reconstrução/retorno em PostgreSQL 17 local. No staging, 14 tabelas receberam RLS e privilégios de aplicação foram revogados; dados/administração preservados. Advisor de segurança posterior: zero achados. Backup completo da plataforma e integração funcional continuam pendentes.
- **Fundação hospedada:** [DB-004](fundacao/DB-004-STAGING.md) aplicou as duas migrations iniciais, com preflight/dry-run, retorno por desativação testado e pós-condições readonly: sete tabelas erp vazias com RLS, grants/role/functions restritos, histórico coincidente e zero achados do advisor. Public permaneceu contido. Não foram criadas identidades ou configurações de unidade.
- **Jornada real em 09/11:** [INT-003](fundacao/INT-003-JORNADA-REAL.md) configurou somente erp na Data API, provisionou três identidades reais sintéticas e duas unidades, aplicou a terceira migration corretiva e verificou 12 cenários HTTP mais a interface real desktop/móvel. Editor salva/audita; leitor não escreve; concorrência e revogação negam operações indevidas. Auditoria preservada e valores de demonstração restaurados. Aplicação executada localmente; sem deploy Cloudflare. Advisor CLI atual retornou um WARN de Auth; conector confirmou e acrescentou 14 INFO do legado contido. [Evidências](evidencias/int-003/jornada-real.json).
- **Próximo passo:** preparar publicação controlada de View/Worker na Cloudflare do mesmo staging e validar o endereço hospedado; depois seguir as jornadas de cadastros/estoque da D1 e os recortes de políticas CONFIG-001 conforme contratos. FND-000 ainda exige revisão dos critérios para fechamento. Sem ambientes permanentes adicionais ou reset nesta fase.
- **Estimativa de planejamento:** [09/11/2026](planejamento/ESTIMATIVA-2026-11-09.md): 8–12 semanas para D1 com piloto acompanhado e 16–24 semanas totais para as três entregas/preparação final, sob dedicação técnica próxima de integral e validações rápidas; recalibrar após duas jornadas de negócio. Não é prazo contratado ou liberação antecipada de produção.
- **Critério de governança:** registrar mudanças futuras na seção afetada e na issue/PR correspondente; nenhuma decisão documental prova implantação real.
