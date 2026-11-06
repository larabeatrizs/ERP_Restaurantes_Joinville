# Inventário da baseline FND-000

Baseline: [a53059b](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/tree/a53059bb5f1dd32f227bd017cc6ce2342e18b72e). Os caminhos abaixo referem-se a esse commit, antes dos novos artefatos da auditoria.

| Caminho | Papel e achado |
| --- | --- |
| README.md | Entrada do projeto, arquitetura-alvo e aviso de ausência de caminho de execução validado |
| .github/ISSUE_TEMPLATE/01-spec-driven.yml | Formulário SDD; não configura CI nem proteção de branch |
| .github/pull_request_template.md | Evidências exigidas em PR; checklist não é prova de execução |
| docs/PROJETO.md | Decisões, riscos e continuidade; ainda contém referências anteriores ao merge |
| docs/arquitetura/MVC_MONOREPO.md | Camadas e estrutura proposta; apps ainda não existem na baseline |
| docs/planejamento/RECONSTRUCAO_SDD.md | Fases, gates e códigos de trabalho propostos |
| docs/requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md | DRS funcional v1.3 e adendo técnico; preservar IDs e tabelas originais |
| docs/requisitos/PLANO_INVESTIGACAO_SETUP_ERP_JOINVILLE.md | Diagnóstico de 05/11 e plano; afirmações de infraestrutura são históricas |
| docs/wireframe/Style Guide Restaurante Popular.html | Referência empacotada de UI, inclui fontes e avisos de licença; não alterar |
| legacy/README.md | Política de uso histórico |
| legacy/backend/Dockerfile | Protótipo Node 18 |
| legacy/backend/package.json | Express, pg, cors, jsonwebtoken; versões abertas |
| legacy/backend/server.js | Apenas GET /api/health; sem persistência ou autenticação |
| legacy/database/init.sql | 14 tabelas; sem políticas RLS ou rotinas transacionais |
| legacy/docker-compose.yml | Serviços locais e credenciais de exemplo, sem implantação cloud comprovada |
| legacy/escr/App.jsx | Tela de diagnóstico da conexão com API |
| legacy/escr/main.jsx | Vazio |
| legacy/frontend/Dockerfile | Servidor de desenvolvimento Vite |
| legacy/frontend/package.json | Dependências abertas; sem build/test/lint |

Na baseline não existem `apps/`, `packages/`, `supabase/migrations/`, testes automatizados, lockfile raiz, scripts de CI ou workflows. Isso é ausência de implementação, não uma falha dos requisitos.

Reprodução quando o executor estiver disponível: `git ls-tree -r --name-only a53059bb5f1dd32f227bd017cc6ce2342e18b72e` e `git diff --find-renames a53059b^1 a53059b`. Comparar 19 caminhos acima e relatar qualquer diferença; não sobrescrever mudanças do usuário.
