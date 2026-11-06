# ERP — Restaurantes Populares de Joinville

Sistema web para gestão dos Restaurantes Populares de Joinville, com estoque por lote e unidade, entradas, saídas, cardápios, relatórios e rastreabilidade.

> **Estado atual:** documentação e arquitetura em reconciliação; os protótipos foram isolados em `legacy/`. A nova aplicação MVC/monorepo será construída do zero nas fases de fundação e desenvolvimento. Não há ERP funcional ou implantação comprovada.

## Fontes oficiais

- [Documento principal do projeto](docs/PROJETO.md) — decisões, arquitetura, infraestrutura, riscos e continuidade.
- [Arquitetura MVC em monorepo](docs/arquitetura/MVC_MONOREPO.md) — separação de camadas, estrutura-alvo e limites.
- [Plano de reconstrução SDD](docs/planejamento/RECONSTRUCAO_SDD.md) — fases, reconstrução de schemas, regras de negócio, API e UI, gates e fluxo de issues/PRs.
- [Documento de requisitos (DRS)](docs/requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) — RF, RN, RNF, CA, prioridades e regras do sistema.
- [Style Guide aprovado](docs/wireframe/Style%20Guide%20Restaurante%20Popular.html) — referência visual obrigatória.

## Arquitetura adotada

- **Organização:** monorepo.
- **Padrão:** MVC adaptado à aplicação web, com Controllers, Services, Models e Repositories isolados.
- **View:** React + Vite, hospedado na Cloudflare.
- **API/Controllers:** Cloudflare Workers.
- **Banco e autenticação:** Supabase PostgreSQL e Supabase Auth.
- **Gestão e integração:** GitHub, PRs, Issues e CI/CD (a configurar).

A proposta de layout de código é `apps/web`, `apps/api`, `packages/contracts` e `supabase/migrations`, **ainda não criada**. Consulte a documentação arquitetural antes de mover arquivos.

## Legado arquivado — não reutilizar como base do novo código

Os diretórios e arquivos anteriores foram movidos **sem mudanças de conteúdo** para `legacy/frontend/`, `legacy/backend/`, `legacy/database/`, `legacy/escr/` e `legacy/docker-compose.yml`. Eles servem exclusivamente para consulta e comparação, conforme [política do legado](legacy/README.md). **Nenhum novo workspace, build, teste, import ou deploy deve depender desse código.**

A arquitetura de produção não utiliza VPS/Docker. Instalar Docker não é pré-requisito para o projeto novo. O comando antigo de Compose é apenas histórico, não uma instrução de execução atual.

## Como iniciar o desenvolvimento

A configuração atual do repositório **ainda não dispõe de um caminho validado de execução do monorepo**. Antes de declarar um comando oficial, concluir a fundação: dependências fixadas, workspaces, migrations, Supabase Auth e RLS, runtime Workers, variáveis e secrets, CI, staging e testes de integração.

Não aplicar `legacy/database/init.sql` diretamente ao projeto Supabase existente: o schema foi parcialmente criado e precisa ser reconstruído em migrations a partir dos requisitos, em ambiente isolado e com autorização. Não usar as credenciais de exemplo presentes em `legacy/docker-compose.yml`; se algum valor foi usado fora de ambiente local, rotacioná-lo.

## Metodologia de desenvolvimento

Adota-se **desenvolvimento orientado por especificações (Spec-Driven Development, SDD)** como interpretação operacional provisória do termo “driven development”, a ratificar antes da primeira issue funcional. Issues exigem requisitos/decisões, especificação, cenários e testes antes da implementação; TDD/BDD são práticas complementares. Os templates estão em `.github/ISSUE_TEMPLATE/` e `.github/pull_request_template.md`.

## Próximos trabalhos

Iniciar pela auditoria documental `FND-000`, validar decisões de backend/Auth/modelo de dados e executar a fundação técnica em uma branch/PR. O trabalho funcional segue a **Entrega 1 — Fundação e Estoque** da seção 15.2 do DRS, sem alterar o design aprovado.
