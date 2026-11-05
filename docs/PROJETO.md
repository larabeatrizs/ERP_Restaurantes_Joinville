# PROJETO — ERP Restaurantes Populares de Joinville

> **Estado:** reconciliação documental iniciada em 05/11/2026, em revisão por pull request. Este documento registra o plano e as decisões técnicas expressamente determinadas pela responsável do projeto; **não** comprova deploy, código funcional, homologação, nem aceite da Secretaria/AMINC.

## 01 — Ponto de partida e fontes de autoridade

- **Produto:** ERP web dos Restaurantes Populares de Joinville (RP1 e RP2), com estoque por lote/unidade, entradas, saídas, cardápios, relatórios e rastreabilidade.
- **Contrato funcional:** [Documento de Requisitos de Software](requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), versão 1.3 (04/11/2026) e adendo técnico 1.3-A em revisão (05/11/2026). Os IDs `RF-`, `RN-`, `RNF-` e `CA-`, as prioridades e os critérios funcionais são preservados.
- **Interface visual de referência obrigatória:** [Style Guide Restaurante Popular](wireframe/Style%20Guide%20Restaurante%20Popular.html). A referência não pode ser modificada sem ressalva/decisão explícita. Abrange as telas identificadas de Login, Painel, Produtos, Cadastro de Produto, Entrada de Materiais, Aprovações e Cardápio; estados e fluxos sem especificação explícita exigem levantamento, não invenção.
- **Método de trabalho:** [processo de desenvolvimento de MVP de software com IA assistida](https://github.com/jukazilli/processo-de-desenvolvimento-de-mvp-de-software-com-ia-assistida), etapas 01–14. Este arquivo é o documento principal; Issues são a fila de trabalho e PRs guardam alterações revisáveis.
- **Baseline de código observado:** `main` @ `1baacd0ea5cb2efc265b29cff10bf47d58c067cf`; alterações posteriores devem ser verificadas antes de iniciar novas tarefas.

**Regra de precedência:** requisito funcional aprovado e interface aprovada prevalecem sobre a implementação atual; decisões de infraestrutura e arquitetura do projeto controlam como implementar, mas não autorizam alterar regras de negócio, permissões ou UI. Conflitos são documentados e submetidos a revisão. Fonte técnica proposta não equivale a aceite institucional.

## 06 — Qualidade, riscos e proteção de dados

Contratos prioritários do DRS: `RNF-002` (isolamento por unidade), `RNF-003` (autenticação e controle de acesso), `RNF-004` (backup/restauração), `RNF-007` (LGPD), `RNF-008` (auditoria), `RNF-009` (acessibilidade), `RNF-010` (integridade transacional), `RNF-011` (manutenibilidade), `RNF-013` (monitoramento) e `RNF-015` (localização).

Riscos identificados no inventário inicial:
1. Supabase contém 14 tabelas `public` e, na última verificação, todas estavam sem RLS e vazias. **P0: não conectar dados reais nem liberar a Data API até revisar grants, RLS, políticas e testes de negação.** Revalidar o estado antes de qualquer operação.
2. `database/init.sql` não implementa integralmente o modelo conceitual do DRS e contém a tabela `usuario.senha_hash`, incompatível com a decisão de delegar autenticação ao Supabase Auth sem revisão de schema.
3. Requisitos antigos ainda mencionavam VPS e cópias externas à VPS; a reconciliação proposta conserva as metas de recuperação e substitui a hospedagem, não dispensa backups.
4. A região `us-east-1` do projeto Supabase observado precisa de análise jurídica/operacional de dados e latência antes de uso com dados pessoais reais.
5. O DRS tem trechos extraídos de PDF com tabelas quebradas; conferir o documento original ao reconstruir matrizes de acesso e contratos, sem inferir colunas.

## 07 — Arquitetura e decisões técnicas

### Decisões determinadas pela responsável do projeto (05/11/2026)

| ID | Decisão | Alcance | Estado |
| --- | --- | --- | --- |
| ARQ-001 | **Monorepo** para frontend, backend, componentes compartilhados, migrações, testes e documentos | Organização do código | Definida; estrutura física ainda não migrada |
| ARQ-002 | **MVC adaptado a web/API**, com separação adicional de serviços e repositórios | Arquitetura do software | Definida; implementação pendente |
| INF-001 | **Cloudflare** para hospedar frontend e backend, em substituição à VPS/Docker como destino de produção | Infraestrutura | Definida; produto Cloudflare e implantação ainda sujeitos a verificação |
| INF-002 | **Supabase PostgreSQL + Supabase Auth** para persistência e identidade | Dados e autenticação | Definida; integração/autorização pendentes |
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
| API/Controllers | Cloudflare Workers; aproveitamento do Express existente sujeito a teste | `app.listen()` atual não é prova de compatibilidade |
| Modelos e regras | TypeScript proposto para módulos novos e contratos tipados | Escolha de linguagem ainda não implica migração automática de código JS |
| Persistência | Supabase PostgreSQL (Postgres 17 observado na conexão) | Migrations versionadas, transações e RLS |
| Identidade | Supabase Auth | Vincular `auth.users.id` ao perfil e às unidades de negócio; abandonar senhas próprias no domínio |
| Monorepo | npm workspaces **proposto** | Confirmar gerenciador, versões e lockfile na Fase B |
| Automação | GitHub Actions + ferramenta oficial Cloudflare/Supabase | Tokens com escopo mínimo, revisão e ambientes separados |

**Fontes oficiais de tecnologia**: [React/Vite + Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Express em Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [migrações e ambientes](https://supabase.com/docs/guides/deployment/managing-environments). Verificar compatibilidade/versões na issue de fundação.

## 09 — Infraestrutura, segurança e operação planejadas

`Navegador → React/View (Cloudflare) → API/Controller (Cloudflare Worker) → Service/Model/Repository → Supabase PostgreSQL`. Login pelo Supabase Auth; a API valida a identidade e aplica permissões de perfil e unidade, reforçadas por RLS e grants.

- **Frontend:** somente URL pública da API, URL e chave publicável do Supabase; nunca usar `service_role`, chave secreta, senha ou token de deploy no navegador.
- **Worker:** credenciais server-side apenas por Secrets do runtime e apenas onde indispensáveis; validar JWT e autorização por operação; não usar chave administrativa para contornar RLS em rotas de usuário.
- **Dados:** migrations com histórico, transações atômicas para movimentos de estoque, bloqueio de saldo negativo, idempotência, auditoria e testes de isolamento entre RP1 e RP2.
- **Ambientes:** local/teste, staging e produção isolados de forma verificável. Projeto Supabase existente não é automaticamente considerado produção; custos e criação de novos recursos requerem autorização.
- **Operação:** backup e restauração testados, observabilidade, recuperação e rollback planejados antes de pilotar com dados reais; região e bases legais sujeitas a aceite institucional.

## 10 — Trabalho no GitHub

- **Backlog oficial:** [Issues](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues); **revisões:** [Pull requests](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pulls).
- Priorizar `FND-000` (auditoria/reconciliação), depois ADR/arquitetura, autorização, modelo de dados, staging e CI; identificadores são nomes de trabalho propostos, não números existentes.
- Cada issue deve referenciar IDs do DRS e estados da UI, critérios observáveis, dependências, verificações e evidências. Usar branch e PR antes de integrar na `main`; não marcar concluído sem testes/aceite adequados.
- Não duplicar o backlog neste arquivo: as issues representam o trabalho operacional.

## 11 — Fundação técnica (planejada; não executada)

1. Revisar estrutura legada e escolher layout físico alvo `apps/web` / `apps/api` / `packages/*` / `supabase/migrations`.
2. Definir bootstrap do monorepo, versões fixadas, lockfile, lint, testes, build e CI.
3. Reconciliar schema atual com DRS, criar baseline de migrations e validar bootstrap em banco vazio isolado.
4. Implementar Auth, perfis, vínculos por unidade, grants/RLS e testes negativos.
5. Adaptar API ao runtime Cloudflare e disponibilizar frontend fiel à referência.
6. Configurar staging e secrets, validar deploy e smoke test com dados sintéticos.
7. Demonstrar backup/restauração, observabilidade, recuperação e procedimentos de operação.

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
| Modelo de autenticação e vínculo `auth.users` / perfil / unidade | Define segurança e migrations | Pendente de desenho e teste |
| Acesso ao banco via Supabase HTTP/RPC ou acesso direto controlado | Afeta transações, custo e isolamento | Pendente de prova técnica |
| Staging, backup, região e orçamento | Afeta custos, recuperação e LGPD | Pendente de autorização |
| Deploy frontend Cloudflare e compatibilidade Express/Workers | Afeta toolchain sem mudar a decisão de plataforma | Pendente de prova |
| Estados e jornadas não cobertos pelo Style Guide | Evita extrapolar UI aprovada | Pendente de inventário |
| Validação externa e assinaturas da seção 17.3 do DRS | Condição para liberação institucional | Não comprovada |

## 16 — Continuidade e evidências

- **Esta alteração:** documentação de arquitetura e reconciliação exclusivamente; sem criação de infraestrutura, migrations, código funcional ou alteração de estilos.
- **Próximo recorte:** revisar/aceitar o PR, abrir/associar `FND-000`, fechar contrato de Auth e modelagem, preparar base do monorepo em PR posterior.
- **Critério de governança:** registrar mudanças futuras na seção afetada e na issue/PR correspondente; nenhuma decisão documental prova implantação real.
