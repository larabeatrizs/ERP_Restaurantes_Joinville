# ERP — Restaurantes Populares de Joinville

Sistema web para gestão dos Restaurantes Populares de Joinville, com estoque por lote e unidade, entradas, saídas, cardápios, relatórios e rastreabilidade.

> **Estado atual:** fundação com API e painel de configurações por unidade. Login, consulta, edição, auditoria, concorrência e isolamento foram verificados com Supabase Auth/Data API reais e View/Worker locais. Publicação Cloudflare, banco integral e módulos de negócio continuam pendentes. Os protótipos estão em `legacy/`. Não há liberação operacional comprovada.

Atualização 09/11/2026: após [SEC-003](docs/fundacao/SEC-003-CONTENCAO-LEGADO.md) e [DB-004](docs/fundacao/DB-004-STAGING.md), [INT-003](docs/fundacao/INT-003-JORNADA-REAL.md) expôs somente erp, criou três identidades/duas unidades sintéticas e aplicou uma migration corretiva aditiva. Jornada real demonstrada; legado permanece contido. Advisor atual: WARN de proteção contra senhas vazadas e 14 INFO do legado sem políticas, registrados para hardening. Não executar bootstrap/fixtures dos testes de laboratório contra o banco hospedado.

Ambiente atual declarado como **staging compartilhado de desenvolvimento e testes**, conforme [ADR-002](docs/decisoes/ADR-002-STAGING-COMPARTILHADO.md). Recortes verificados são integrados à main; ambientes permanentes separados ficam para AMB-001 ao final. Não há reset imediato do banco.

## Fontes oficiais

- [Documento principal do projeto](docs/PROJETO.md) — decisões, arquitetura, infraestrutura, riscos e continuidade.
- [Arquitetura MVC em monorepo](docs/arquitetura/MVC_MONOREPO.md) — separação de camadas, estrutura-alvo e limites.
- [Plano de reconstrução SDD](docs/planejamento/RECONSTRUCAO_SDD.md) — fases, reconstrução de schemas, regras de negócio, API e UI, gates e fluxo de issues/PRs.
- [Modelagem nova — DATA-001](docs/dados/DATA-001.md) — modelo conceitual, dicionário físico proposto e contratos de estoque/acesso em revisão na fase B.
- [Documento de requisitos (DRS)](docs/requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) — RF, RN, RNF, CA, prioridades e regras do sistema.
- [Style Guide aprovado](docs/wireframe/Style%20Guide%20Restaurante%20Popular.html) — referência visual obrigatória.

## Arquitetura adotada

- **Organização:** monorepo.
- **Padrão:** MVC adaptado à aplicação web, com Controllers, Services, Models e Repositories isolados.
- **View:** React + Vite, hospedado na Cloudflare.
- **API/Controllers:** Cloudflare Workers.
- **Banco e autenticação:** Supabase PostgreSQL e Supabase Auth.
- **Gestão e integração:** GitHub, PRs, Issues e CI com checks, PostgreSQL descartável e navegador. Deploy ainda pendente.

O código novo usa `apps/web`, `apps/api` e `packages/contracts`. `supabase/migrations` contém os recortes de configurações/identidade da fase C2, derivados da modelagem nova. Consulte a documentação arquitetural antes de mover arquivos.

## Legado arquivado — não reutilizar como base do novo código

Os diretórios e arquivos anteriores foram movidos **sem mudanças de conteúdo** para `legacy/frontend/`, `legacy/backend/`, `legacy/database/`, `legacy/escr/` e `legacy/docker-compose.yml`. Eles servem exclusivamente para consulta e comparação, conforme [política do legado](legacy/README.md). **Nenhum novo workspace, build, teste, import ou deploy deve depender desse código.**

A arquitetura de produção não utiliza VPS/Docker. Instalar Docker não é pré-requisito para o projeto novo. O comando antigo de Compose é apenas histórico, não uma instrução de execução atual.

## Como iniciar o desenvolvimento

Use Node **24.22.2** (também indicado em `.node-version`) e o npm incluído nessa distribuição. Na raiz:

```sh
npm ci
npm run check
```

Para desenvolver, use dois terminais: `npm run dev:api` (API em `http://127.0.0.1:8787/api/health`) e `npm run dev:web` (Vite em `http://127.0.0.1:5173`). O proxy `/api` do Vite aponta para a API local. Copie os exemplos `apps/web/.env.example` para `.env.local` e `apps/api/.dev.vars.example` para `.dev.vars`, preenchendo somente URL/chave publicável do projeto existente em uso. Sem esses valores, o login informa acesso não configurado e a API protegida não libera acesso. Não versionar os arquivos preenchidos.

O painel exige identidade, perfil, vínculo/capacidades e configuração da unidade no schema `erp`, único schema exposto na Data API do staging. Não há provisionamento automático de conta/unidade nem aplicação de migrations no banco remoto pelo frontend. Consulte [WEB-001](docs/fundacao/WEB-001-CONFIGURACOES.md) e [INT-003](docs/fundacao/INT-003-JORNADA-REAL.md) para escopo, estados, evidências e limitações.

Testes do navegador: `npx playwright install chromium` e `npm run test:web`. No Windows, também é possível usar Edge já instalado: `$env:PLAYWRIGHT_CHANNEL='msedge'` no PowerShell. As respostas Auth/API dos testes são fictícias e não usam o staging real. Para repetir a extração dos assets da referência: `node scripts/extract-styleguide-assets.mjs`; o HTML mestre permanece intacto.

Verificação real opt-in: com API/View locais iniciadas, definir `ERP_STAGING_TEST_STATE` para o `identidades.json` privado fora do checkout e executar `npm run test:staging` e `npm run test:staging:web`. Esses comandos usam as contas sintéticas de INT-003 e fazem alterações controladas no staging, preservando auditoria. Credenciais/resultados privados não são enviados ao CI nem versionados. Consulte o roteiro INT-003 antes de repetir; não reprovisionar as contas existentes.

`npm run check` executa lint, tipos, testes HTTP e builds. O build da API é um **dry-run**, sem deploy. O health indica apenas liveness, sem testar banco ou autenticação. Veja [escopo e evidências MONO-001](docs/fundacao/MONO-001.md).

O recorte [DB-001/C2.1](docs/fundacao/DB-001-CONFIGURACOES.md) acrescenta testes SQL: `npm run test:db` usa PGlite em memória, e `npm test` executa HTTP e banco. O CI também roda a suíte SQL em PostgreSQL 17 descartável. Não apontar DATABASE_TEST_URL para ambientes existentes: a suíte requer banco de teste vazio e valida o destino local. Não aplicar os arquivos de bootstrap/fixtures no Supabase.

A [API de configurações](docs/fundacao/API-001-CONFIGURACOES.md) implementa GET/PATCH em `/api/unidades/{id}/configuracoes`, com Bearer e revisão por ETag/If-Match. Runtime exige SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY; o exemplo sem valores reais está em `apps/api/.dev.vars.example`. Sem configuração, as rotas protegidas retornam 503. Nenhuma chave administrativa deve ser usada. INT-003 validou a integração real com execução local; o endereço hospedado ainda precisa ser publicado/verificado.

Se a rede usa certificados corporativos já confiáveis no Windows e o npm retornar `SELF_SIGNED_CERT_IN_CHAIN`, execute `$env:NODE_USE_SYSTEM_CA = '1'` no PowerShell antes do npm. Não desative a validação TLS. Nesta máquina, o Node portátil foi instalado em `%LOCALAPPDATA%/CodexTools/node-v24.22.2-win-x64`; adicione esse diretório ao PATH da sessão se `node` não for encontrado. Isso não altera o PATH global.

Não aplicar `legacy/database/init.sql` diretamente ao projeto Supabase existente: o schema foi parcialmente criado e precisa ser reconstruído em migrations a partir dos requisitos, em ambiente isolado e com autorização. Não usar as credenciais de exemplo presentes em `legacy/docker-compose.yml`; se algum valor foi usado fora de ambiente local, rotacioná-lo.

## Metodologia de desenvolvimento

Adota-se **desenvolvimento orientado por especificações (Spec-Driven Development, SDD)** como interpretação operacional provisória do termo “driven development”, a ratificar antes da primeira issue funcional. Issues exigem requisitos/decisões, especificação, cenários e testes antes da implementação; TDD/BDD são práticas complementares. Os templates estão em `.github/ISSUE_TEMPLATE/` e `.github/pull_request_template.md`.

## Próximos trabalhos

Publicar/verificar View e Worker na Cloudflare do mesmo staging; depois avançar nas jornadas de cadastros/estoque da **Entrega 1 — Fundação e Estoque** da seção 15.2 do DRS. Modelagem integral e contratos restantes seguem a fase B, com implementação por migrations e testes próprios na C2. Manter o design aprovado e AMB-001 congelada até o encerramento. A [estimativa inicial de 09/11/2026](docs/planejamento/ESTIMATIVA-2026-11-09.md) registra premissas, faixas e revisão após as primeiras jornadas de negócio.
