# Código legado — somente referência histórica

Os diretórios `frontend/`, `backend/`, `database/` e `escr/` foram movidos da raiz do projeto para `legacy/` em 05/11/2026. `docker-compose.yml` também foi arquivado aqui.

## Finalidade
- **Ler, comparar e extrair informações verificáveis** sobre decisões do protótipo e possíveis regras relevantes.
- **Não** estender, copiar como implementação base, publicar, configurar como workspace, instalar dependências ou utilizar este código como aplicação de produção.
- Recriar o banco, frontend, backend e regras de negócio nas fases previstas em [docs/PROJETO.md](../docs/PROJETO.md) e [Plano de reconstrução](../docs/planejamento/RECONSTRUCAO_SDD.md), **partindo do DRS v1.3, do Style Guide e das decisões aprovadas**, não destes diretórios.
- Qualquer reutilização pontual de algoritmo/asset/consulta requer verificação de aderência, segurança, licenciamento e uma issue explicitamente autorizada. Reutilizar exemplos não cria presunção de conformidade.
- `legacy/database/init.sql` não é baseline de migrations do Supabase e **não deve ser executado** no banco existente.
- `legacy/docker-compose.yml` contém credenciais estáticas de exemplo; não reutilizá-las. Se algum valor já foi usado em serviço acessível externamente, rotacionar.
- O isolamento aqui é **organizacional**: outros scripts futuros não devem fazer import/build/deploy a partir de `legacy/`.

**Histórico Git preservado:** os blobs foram relocados sem mudanças de conteúdo. Arquivo legado não comprova estado funcional da aplicação.
