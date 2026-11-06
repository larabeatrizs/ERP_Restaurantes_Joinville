# Plano de investigação, fundação técnica e liberação — ERP Restaurantes Populares de Joinville

**Situação:** diagnóstico inicial realizado em 05/11/2026; execução/configuração ainda pendente.  
**Repositório do produto:** https://github.com/larabeatrizs/ERP_Restaurantes_Joinville  
**Branch/commit conferido:** `main` / `1baacd0ea5cb2efc265b29cff10bf47d58c067cf`.  
**Método:** https://github.com/jukazilli/processo-de-desenvolvimento-de-mvp-de-software-com-ia-assistida  
**Commit do método conferido:** `757eb1673fce98c7415c6ca1772f7ca51c9ac9ed`.

> **Natureza do registro:** plano e achados verificáveis para revisão humana. Não significa implementação, deploy, aprovação externa nem alteração de infra. Manter o DRS e Style Guide como fontes oficiais sem sobrescrevê-los.

## 1. Restrições e autoridades

- **DRS baseline de desenvolvimento:** `docs/requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md`, versão 1.3 (04/11/2026). Preservar IDs, regras, escopo, prioridades e critérios de aceitação. Verificar a precisão de tabelas extraídas do PDF antes de automatizar a rastreabilidade.
- **UI de referência obrigatória:** `docs/wireframe/Style Guide Restaurante Popular.html`. As sete telas identificadas são Login, Painel, Produtos, Cadastro de Produto, Entrada de Materiais, Aprovações e Cardápio. O arquivo HTML é uma referência, não prova de funcionamento ou cobertura completa de estados.
- **Infraestrutura definida pelo responsável:** Supabase (PostgreSQL e Auth), Cloudflare (frontend e backend), GitHub (código, CI/CD, decisões e entregas).
- **Exceções:** qualquer alteração de requisito ou tela aprovada, expansão de custo/escopo, alteração de dados pessoais ou concessão de poderes precisa de registro e aceite humanos. Lacuna documental não autoriza improvisação.
- **Governança:** fonte oficial por assunto; `docs/PROJETO.md` como índice/registro operativo do método; Issues como backlog; PRs como mudanças revisáveis; evidências de teste distintas do status da Issue e da decisão.

## 2. Estado real verificado

| Aspecto | Achado | Evidência / consequência |
|---|---|---|
| Código | Estrutura inicial; `backend/server.js` só implementa `GET /api/health` | Não demonstra ERP operacional |
| Frontend | `frontend/package.json` com Vite/React; sem aplicação completa nessa pasta; `escr/App.jsx` é tela de diagnóstico; `escr/main.jsx` vazio | Não há telas do ERP implementadas end-to-end |
| Banco versionado | `database/init.sql` com 14 tabelas de base | Não cobre sozinho as entidades e transações de todo o DRS |
| Execução antiga | `docker-compose.yml` com Postgres local, credenciais estáticas e Dockerfiles Node 18 | Não representa a implantação Supabase/Cloudflare |
| GitHub | Branch `main` sem proteção; nenhum PR/Issue encontrado, nenhum workflow/execução CI | CI/CD e governança ainda precisam de implementação |
| Supabase | Projeto `rp-joinville-db` ativo e saudável, PostgreSQL 17, região `us-east-1`; 14 tabelas em `public`, todas com zero linhas | Banco inicial foi criado, mas não demonstra aderência completa |
| Supabase migrações | Nenhuma migração registrada | Criar baseline versionada sem reaplicar cegamente DDL já existente |
| Segurança do Supabase | RLS desativada nas 14 tabelas; alerta de segurança crítico confirmado | **Bloqueio de exposição/produção até corrigir RLS, grants e políticas** |
| Cloudflare | Projeto/Worker/Pages/domínio/deploy/segredos não verificados | Necessária auditoria de conta e ambientes antes de dizer que existe deploy |
| Aceite externo | DRS seção 17.3 com campos de assinatura em branco | Não apresentar aprovação formal como concluída |

**Consultas realizadas:** estrutura/arquivos/commits/branches/PRs/Issues/Actions GitHub; leitura do DRS, Style Guide, README e framework; listagem de projeto, tabelas, migrações e advisors de segurança no Supabase. Não houve modificação remota, migração, criação de conta ou teste de interface em execução.

## 3. Alertas impeditivos de produção e lacunas

1. **P0 — RLS desligada:** 14 tabelas `public` acessíveis às roles com grants existentes, sem política de isolamento. Implementar autorização por perfil/unidade e regras de segregação, testar cenários negativos e somente então expor dados reais. Não tratar uma chave publicável como segredo de segurança.
2. **P0 — Contrato funcional vs SQL:** mapear RF/RN/RNF/CA para entidades, constraints, estados e transações; avaliar se `usuario` deve vincular `id` a `auth.users` e eliminar gerenciamento próprio de senhas após migração segura. Como as tabelas estão vazias, planejar substituição em staging sem migração de registros reais, confirmando novamente antes de executar.
3. **P0 — Divergência infra:** a seção de restrições do DRS menciona VPS com backup; a decisão atual é Cloudflare/Supabase. Registrar ADR/ressalva de implantação, demonstrar equivalência operacional, obter ratificação do responsável, sem editar silenciosamente o DRS.
4. **P0 — Privacidade e operação:** DRS 17.2 condiciona fundamento legal e retenção de alguns dados a confirmação. Região atual `us-east-1` requer avaliação de requisitos de transferência internacional, contrato, proteção e latência; responsável municipal deve avaliar antes do uso de dados pessoais reais.
5. **P1 — Base de código:** definir caminho de build e runtime real, compatibilidade de Express com Workers, origem única do frontend e assets e status da UI; remover referências antigas a Render/Vercel de código de produção.
6. **P1 — Proteção de segredos:** `.env` de exemplo sem valores, `.gitignore`, GitHub Environments e Cloudflare Worker secrets. `docker-compose.yml` público contém senhas de exemplo e `JWT_SECRET` fixo; nunca reutilizar esses valores. Se alguma credencial já foi usada fora do localhost, rotacionar.
7. **P1 — Backup:** Supabase Free não inclui backup diário automático; provar estratégia e restauração antes de entrada em operação. Backups de Storage, quando usado, exigem tratamento separado.
8. **P1 — UI:** inventário de telas, fluxos e estados ausentes; comparar implementação por captura de tela com a referência e registrar diferenças antes de aprovar exceções.
9. **P1 — Aprovação formal:** versão 1.3 é base de implementação, mas a seção 17.3 ainda precisa de evidência de aceite dos responsáveis para a liberação institucional.

## 4. Sequência de investigação e execução com gates

### Fase A — Auditoria controlada e mapa de aderência (etapas 01, 06–08)

**Perguntas:** O que existe? Qual fonte é oficial? Qual RF/RN/RNF/CA exige qual implementação? O que a UI já define ou omite? O deploy Cloudflare existe? Quais decisões externas faltam?

**Ações:**
- Fixar baseline por commit; listar todos arquivos, rotas, modelos, telas, migrations, tests, Actions e ambientes existentes.
- Construir mapa `ID de requisito → prioridade → tela/estado → endpoint → tabela/policy → teste → evidência`, sem renumerar IDs. Verificar entradas de tabelas quebradas no Markdown pela conversão do PDF.
- Extrair tokens, componentes, telas, estados, imagens e tipografia do HTML do Style Guide; identificar o que é referência aprovada, pendente ou não especificado.
- Criar registro de divergências com gravidade, fonte, impacto, hipótese, responsável e decisão pendente.
- Revisar compatibilidade do runtime Cloudflare com Express e drivers, limites de CPU e hospedagem estática; distinguir hipótese técnica de teste real.

**Saídas:** minuta de `docs/PROJETO.md` (seções 01, 06–09, 15 e 16), inventário e Issues de lacunas.  
**Gate A:** fontes reconhecidas, itens críticos classificados e nenhum requisito/UI alterado sem decisão.

### Fase B — Projeto de integração e política de dados (etapas 07–09)

**Arquitetura-alvo a validar:**

```text
Navegador ── HTTPS ── Frontend React/Vite (Cloudflare)
    │                            │
    │── autenticação ────────── Supabase Auth
    │                            │
    └── requisições ── API Cloudflare Worker
                              │ JWT do usuário verificado + autorização por perfil/unidade
                              └── Supabase PostgREST/PostgreSQL + RLS + transações/auditoria
```

- Preferir cliente Supabase via HTTPS no Worker quando suportar os casos de uso; usar Postgres direto/Hyperdrive somente se a análise de atomicidade/latência justificar e o custo for aprovado.
- Express em Workers é documentado pelo Cloudflare, mas **o `app.listen()` atual não deve ser considerado deployável sem adaptação e teste**. Preservar Express se tecnicamente viável, sem reescrever por moda.
- No navegador, permitir somente URL e chave **publishable** do Supabase, URL pública da API; nenhuma chave secreta nem senha do banco.
- No Worker, validar token, perfil, vínculo a unidade, estado e permissões; usar RLS com contexto do usuário; operações administrativas com chave secreta somente em caminhos privilegiados, autorizados e auditados.
- Para estoque, garantir transações atômicas (lançamento/baixa/aprovação/inventário), idempotência, integridade e auditoria. Definir RPC/serviço com avaliação de privilégios; não introduzir `SECURITY DEFINER` genericamente.
- Resolver explicitamente o relacionamento entre `auth.users`, perfis, unidades, ações e auditoria, mantendo os contratos do DRS.

**Gate B:** ADRs revisadas; contrato API/dados/autorização e estratégia de ambiente aprovados.

### Fase C — Fundação reproduzível em staging (etapas 09–11)

**FND-001 — Repositório:** branch principal protegida quando suportado pelo plano, revisão PR, CI e permissões mínimas; não editar direto em `main`.  
**FND-002 — Toolchain:** runtime atual suportado, versões fixadas, lockfiles, `npm ci`, lint, testes, build, `.gitignore`, `.env.example`.  
**FND-003 — Supabase staging:** conferir custo e autorização; criar projeto isolado somente se necessário e aprovado; região/segurança/sem dados reais.  
**FND-004 — Migrations:** criar baseline reconciliada com o SQL já aplicado; versionar migrações em `supabase/migrations`; testar criação de banco vazio e detectar drift; usar CLI `--help` da versão instalada antes dos comandos.  
**FND-005 — Auth:** configurar URLs de redirecionamento, métodos de login e cadastro/invites; vincular cadastro a `auth.users`, perfis e unidades; criar usuários de teste fictícios com privilégios distintos.  
**FND-006 — RLS e grants:** ativar com policies adequadas, revisar Data API/grants, testar acesso autorizado, negado e segregação entre unidades; executar Security Advisor.  
**FND-007 — API Cloudflare staging:** adaptar servidor ao Worker/rotas, habilitar secrets, health/readiness, logs, CORS restritivo e tratamento de erros.  
**FND-008 — Frontend Cloudflare staging:** montar SPA real a partir da referência visual e integrar URL da API/Auth; testar deploy e rotas SPA.  
**FND-009 — GitHub Environments e secrets:** `staging` e `production`, nomes/escopos/reviewers, token Cloudflare limitado, token Supabase de deploy, proteção de produção e rotação.  
**FND-010 — CI/CD:** PR executa qualidade, build, testes, verificação de migração e segurança. Deploy staging após sucesso; produção com aprovação explícita e artefato/commit conhecido.  
**FND-011 — Dados de teste:** seeds sintéticos por unidade, perfis e cenários negativos; nenhuma pessoa real ou senha em logs.  
**FND-012 — Operação:** monitoramento, alertas, métricas, backups externos quando exigidos, restauração testada e rollback de código/dados com plano de migração reversível/compatível.  
**FND-013 — Smoke test ponta a ponta:** login → listagem por unidade → operação autorizada persistida → consulta → tentativa negada → auditoria; capturas e logs sem dados sensíveis.  
**FND-014 — Checkpoint e aceite da fundação:** registrar URLs não sensíveis, commit, testes e riscos; não marcar `FND_READY` antes de evidência real.

**Gate C — FND_READY:** staging acessível, migrações reexecutáveis, tokens/roles/RLS corretos, Worker e frontend conectados, CI verde, segredos fora do Git, observabilidade e plano de restauração comprovados.

### Fase D — Incrementos por capacidades de ponta a ponta (etapa 12)

Executar conforme **ordem e prioridades existentes na seção 15.2 do DRS**, não substituí-las por backlog genérico:
1. Fundação e estoque (cadastros, carga inicial, recebimento, saída/aprovação, perda, saldo e alertas).
2. Cardápio e planejamento, ficha técnica, previsão, custo e dados nutricionais.
3. Gestão, inventário, cotações, relatórios consolidados e rastreabilidade conforme o documento.
4. Atendimento/comensais e demais itens conforme o escopo/priorização original.

Cada incrementação: Issue com IDs RF/RN/RNF/CA → API + DB + RLS + UI existente → testes normais e negativos → PR → staging → conferência visual/funcional → aceite. Não atribuir status implementado por mera existência de telas ou SQL.

**Gate D:** jornada entregue e validada, com prova no commit e ambiente.

### Fase E — Piloto RP1, liberação e operação (etapas 13–14)

- Seguir seção 15.4: carregar produtos/unidades confirmados, fornecedores, fichas preenchidas pela nutricionista, saldo inicial por inventário e usuários autorizados; nunca importar dados sem revisar unidade de medida e apresentação.
- Testar com usuários/perfis do RP1 e dados de produção somente após aprovação institucional, segurança, LGPD e backup.
- Realizar **duas semanas de operação paralela com planilhas**, registrar divergências e aprovações, só depois descontinuar controles anteriores quando formalmente aceito.
- Validar critérios CA relevantes, acessibilidade/responsividade, latência, auditoria, segregação, recuperação, disponibilidade, consentimentos/bases legais pertinentes e procedimento de suporte.
- Promover versão validada e registrar seu commit, ambiente, autorizações, resultados e plano de retorno; expandir RP2 depois da avaliação do RP1.

**Gate E — PRODUÇÃO:** critérios de aceite cumpridos, responsáveis aprovaram, risco residual conhecido, monitoramento e recuperação demonstrados. Deploy não equivale a aceite operacional.

## 5. Configuração de variáveis, segredos e ambientes

| Local | Nome sugerido | Tipo | Finalidade |
|---|---|---|---|
| GitHub Environment | `CLOUDFLARE_API_TOKEN` | **Secret** | Credencial de deploy Wrangler com escopo mínimo |
| GitHub Environment | `CLOUDFLARE_ACCOUNT_ID` | Variable ou Secret | Identificador de conta Cloudflare |
| GitHub Environment | `SUPABASE_ACCESS_TOKEN` | **Secret** | Token de automação de migrations (escopado) |
| GitHub Environment | `SUPABASE_PROJECT_ID` | Variable | Project ref staging ou production |
| GitHub Environment | `SUPABASE_DB_PASSWORD` | **Secret** | Senha usada exclusivamente pelas migrações/CLI quando necessário |
| Build frontend | `VITE_SUPABASE_URL` | **Pública** | Endpoint de Auth/API Supabase |
| Build frontend | `VITE_SUPABASE_PUBLISHABLE_KEY` | **Pública** | Chave publicável, sempre com RLS |
| Build frontend | `VITE_API_URL` | **Pública** | Endpoint da API Cloudflare |
| Cloudflare Worker | `SUPABASE_URL` | Variable | Endpoint do Supabase |
| Cloudflare Worker | `SUPABASE_PUBLISHABLE_KEY` | Variable | Chave publishable para chamadas com JWT do usuário |
| Cloudflare Worker | `SUPABASE_SECRET_KEY` | **Secret, se indispensável** | Apenas operações administrativas restritas, jamais exportar para frontend |
| Cloudflare Worker | `ALLOWED_ORIGIN` | Variable | Origem HTTPS autorizada para CORS |
| Supabase Auth settings | Site URL / Redirect URLs | Configuração | Callback HTTPS staging/produção e local autorizado |

**Importante:** GitHub Secrets são usados pelo pipeline; Cloudflare Worker Secrets são usados em execução. Um não substitui o outro. Não colocar segredo em `wrangler vars`, em `VITE_*`, na PR, README, logs ou chat. Diferenciar staging/production por chaves/projetos/URLs. Valores concretos devem ser obtidos pelo responsável diretamente no respectivo painel.

## 6. SQL indicado pelo Supabase Security Advisor (NÃO EXECUTADO)

A ferramenta retornou a seguinte correção para habilitar RLS nas 14 tabelas existentes:

```sql
ALTER TABLE "public"."unidade_restaurante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."perfil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usuario_unidade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."unidade_medida" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."categoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."produto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fornecedor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."movimento_estoque" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cotacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."refeicao_servida" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;
```

**Não executar cegamente:** com RLS habilitada e sem políticas, acessos das roles sem privilégios especiais serão negados. Primeiro definir políticas e grants por perfil/unidade e validações apropriadas, aplicar em staging, executar testes negativos e revisar Advisors. A sequência exata deve considerar se existe alguma aplicação já consumindo o banco.

Fonte de remediação: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

## 7. Critérios verificáveis / decisões para o responsável

| Condição | Evidência mínima |
|---|---|
| Especificação preservada | Matriz com IDs, fontes e diferenças aprovadas |
| Interface fiel | Capturas em resoluções de destino versus HTML mestre e lista de ressalvas |
| Dado isolado | Teste A não lê/escreve dados de B; perfil não aprova seu próprio lançamento |
| Auth real | Login/logout/expiração/usuário inativo/usuário sem unidade testados |
| Banco migrável | Banco vazio instalado por migrations; schema drift verificado; staging igual à versão esperada |
| Pipeline confiável | CI verde em PR; deploy e smoke staging com commit rastreado; produção exige autorização |
| Segredos protegidos | Secret scanners, revisão de bundle e logs, privilégios mínimos, nenhuma credencial administrativa no navegador |
| Recuperação operacional | Backup restaurado com registro de teste e procedimento documentado |
| Produção liberada | Aceite aplicável, RP1 em piloto, LGPD/region/contratos resolvidos, riscos documentados |

**Decisões humanas relevantes antes de novas ações:** (i) confirmar autoridade de aceite formal da versão 1.3 e exceção VPS→Cloudflare/Supabase; (ii) definir orçamento e política de staging/backup, inclusive custo potencial; (iii) decidir/confirmar região permitida e fundamento de tratamento de dados; (iv) autorizar execução de setup e deployments; (v) validar lacunas da referência visual. Não é necessário decidir tudo isso antes de iniciar uma investigação somente leitura.

## 8. Próximo recorte executável sugerido

Abrir **Issue FND-000 — Auditoria de conformidade e fundação** com escopo estritamente de leitura, inventário e proposta de ADR. Preparar `docs/PROJETO.md` (seções 01, 06–11, 15–16) com os vínculos para DRS e UI, registrar riscos, decidir gateway Cloudflare↔Supabase e elaborar migrações/RLS em branch. Após revisão e autorização separada, executar fundação de staging, nunca diretamente na produção.

### Fontes consultadas

- Produto: https://github.com/larabeatrizs/ERP_Restaurantes_Joinville
- Método: https://github.com/jukazilli/processo-de-desenvolvimento-de-mvp-de-software-com-ia-assistida
- Etapas e regras: https://github.com/jukazilli/processo-de-desenvolvimento-de-mvp-de-software-com-ia-assistida/blob/main/framework/regras-do-processo.md
- Infra do método: https://github.com/jukazilli/processo-de-desenvolvimento-de-mvp-de-software-com-ia-assistida/blob/main/framework/praticas/infraestrutura.md
- Express em Cloudflare Workers: https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- React/Vite Cloudflare: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- GitHub Actions Cloudflare: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Secrets Cloudflare: https://developers.cloudflare.com/workers/configuration/secrets/
- Migrações Supabase: https://supabase.com/docs/guides/deployment/managing-environments
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Keys Supabase: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- Backup Supabase: https://supabase.com/docs/guides/platform/backups

**Status ao concluir esta análise:** investigação inicial parcialmente completada; FND_READY = não; PRODUÇÃO = não comprovada; nenhuma mudança aplicada.
