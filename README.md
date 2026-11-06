# ERP — Restaurantes Populares de Joinville

Sistema web para gestão dos Restaurantes Populares de Joinville, com estoque por lote e unidade, entradas, saídas, cardápios, relatórios e rastreabilidade.

> **Estado atual:** fundação técnica iniciada em branch, com bootstrap de monorepo, API de liveness e raiz React. Os protótipos estão em `legacy/`. As telas, o banco novo e os módulos de negócio ainda não foram implementados; não há ERP funcional ou implantação comprovada.

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
- **Gestão e integração:** GitHub, PRs, Issues e CI/CD (a configurar).

O bootstrap usa `apps/web`, `apps/api` e `packages/contracts`. `supabase/migrations` será criado na fase C2, após a modelagem nova na fase B. Consulte a documentação arquitetural antes de mover arquivos.

## Legado arquivado — não reutilizar como base do novo código

Os diretórios e arquivos anteriores foram movidos **sem mudanças de conteúdo** para `legacy/frontend/`, `legacy/backend/`, `legacy/database/`, `legacy/escr/` e `legacy/docker-compose.yml`. Eles servem exclusivamente para consulta e comparação, conforme [política do legado](legacy/README.md). **Nenhum novo workspace, build, teste, import ou deploy deve depender desse código.**

A arquitetura de produção não utiliza VPS/Docker. Instalar Docker não é pré-requisito para o projeto novo. O comando antigo de Compose é apenas histórico, não uma instrução de execução atual.

## Como iniciar o desenvolvimento

Use Node **24.22.2** (também indicado em `.node-version`) e o npm incluído nessa distribuição. Na raiz:

```sh
npm ci
npm run check
```

Para desenvolver, use dois terminais: `npm run dev:api` (API em `http://127.0.0.1:8787/api/health`) e `npm run dev:web` (Vite em `http://127.0.0.1:5173`). A View renderiza vazia neste bootstrap: as telas aprovadas serão implementadas em WEB-001. O proxy `/api` do Vite aponta para a API local.

`npm run check` executa lint, tipos, testes HTTP e builds. O build da API é um **dry-run**, sem deploy. O health indica apenas liveness, sem testar banco ou autenticação. Veja [escopo e evidências MONO-001](docs/fundacao/MONO-001.md).

O recorte [DB-001/C2.1](docs/fundacao/DB-001-CONFIGURACOES.md) acrescenta testes SQL: `npm run test:db` usa PGlite em memória, e `npm test` executa HTTP e banco. O CI também roda a suíte SQL em PostgreSQL 17 descartável. Não apontar DATABASE_TEST_URL para ambientes existentes: a suíte requer banco de teste vazio e valida o destino local. Não aplicar os arquivos de bootstrap/fixtures no Supabase.

Se a rede usa certificados corporativos já confiáveis no Windows e o npm retornar `SELF_SIGNED_CERT_IN_CHAIN`, execute `$env:NODE_USE_SYSTEM_CA = '1'` no PowerShell antes do npm. Não desative a validação TLS. Nesta máquina, o Node portátil foi instalado em `%LOCALAPPDATA%/CodexTools/node-v24.22.2-win-x64`; adicione esse diretório ao PATH da sessão se `node` não for encontrado. Isso não altera o PATH global.

Não aplicar `legacy/database/init.sql` diretamente ao projeto Supabase existente: o schema foi parcialmente criado e precisa ser reconstruído em migrations a partir dos requisitos, em ambiente isolado e com autorização. Não usar as credenciais de exemplo presentes em `legacy/docker-compose.yml`; se algum valor foi usado fora de ambiente local, rotacioná-lo.

## Metodologia de desenvolvimento

Adota-se **desenvolvimento orientado por especificações (Spec-Driven Development, SDD)** como interpretação operacional provisória do termo “driven development”, a ratificar antes da primeira issue funcional. Issues exigem requisitos/decisões, especificação, cenários e testes antes da implementação; TDD/BDD são práticas complementares. Os templates estão em `.github/ISSUE_TEMPLATE/` e `.github/pull_request_template.md`.

## Próximos trabalhos

Concluir as evidências da auditoria `FND-000`, revisar o bootstrap `MONO-001` e avançar os contratos da fase B, incluindo a modelagem do banco refeita do zero a partir do DRS. Migrations, segurança e testes de banco pertencem à C2. O trabalho funcional segue a **Entrega 1 — Fundação e Estoque** da seção 15.2 do DRS, sem alterar o design aprovado.
