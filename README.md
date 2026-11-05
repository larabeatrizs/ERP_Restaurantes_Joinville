# ERP — Restaurantes Populares de Joinville

Sistema web para gestão dos Restaurantes Populares de Joinville, com estoque por lote e unidade, entradas, saídas, cardápios, relatórios e rastreabilidade.

> **Estado atual:** documentação e arquitetura em reconciliação; o código deste repositório ainda é um esqueleto inicial. Não representa o ERP funcional nem uma implantação ativa.

## Fontes oficiais

- [Documento principal do projeto](docs/PROJETO.md) — decisões, arquitetura, infraestrutura, riscos e continuidade.
- [Arquitetura MVC em monorepo](docs/arquitetura/MVC_MONOREPO.md) — separação de camadas, estrutura-alvo e limites.
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

## Sobre a infraestrutura antiga

Os arquivos `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` e `database/init.sql` são legado do protótipo. Eles **não definem a infraestrutura de produção** e não devem ser apresentados como setup Cloudflare/Supabase.

O comando antigo `docker-compose up -d --build` é, no máximo, uma tentativa de execução local do protótipo legado. Não é necessário instalar Docker para a arquitetura de produção escolhida.

## Como iniciar o desenvolvimento

A configuração atual do repositório **ainda não dispõe de um caminho validado de execução do monorepo**. Antes de declarar um comando oficial, concluir a fundação: dependências fixadas, workspaces, migrations, Supabase Auth e RLS, runtime Workers, variáveis e secrets, CI, staging e testes de integração.

Não aplicar `database/init.sql` diretamente ao projeto Supabase existente: o schema foi parcialmente criado e precisa ser reconciliado e versionado. Não usar as credenciais de exemplo presentes no `docker-compose.yml`; se algum valor foi usado fora de ambiente local, rotacioná-lo.

## Próximos trabalhos

Iniciar pela auditoria documental `FND-000`, validar decisões de backend/Auth/modelo de dados e executar a fundação técnica em uma branch/PR. O trabalho funcional segue a **Entrega 1 — Fundação e Estoque** da seção 15.2 do DRS, sem alterar o design aprovado.
