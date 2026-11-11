# CI-001 — Validação de navegador no CI

**Estado em 11/11/2026:** correção da preparação do job proposta na [issue #25](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/25), antes dos próximos cadastros D1.

## Falha observada

Na [execução da main 43046096940](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/43046096940), `check`, `stock-postgres` e `database-postgres` passaram. O job `browser` falhou em `playwright install --with-deps chromium`, antes dos testes, por `Temporary failure resolving 'azure.archive.ubuntu.com'` durante a instalação apt de fontes. A rodada anterior não pode ser declarada verde. As execuções completas anteriores de CAD-002 permanecem evidências históricas, sem substituir a nova rodada.

## Correção e limites

O job de navegador passa a usar a imagem oficial `mcr.microsoft.com/playwright:v1.65.0-noble`, com digest `sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`, confirmado no registry em 11/11/2026. Versão igual a `@playwright/test` no lockfile; atualizar ambas juntas futuramente. A imagem contém navegador/bibliotecas, e `npm ci` continua instalando os pacotes do projeto. Node permanece conforme `.node-version` via setup-node. `--ipc=host` segue a recomendação para Chromium no container de teste.

Removida somente a instalação redundante por apt. Os mesmos testes, configuração de Playwright, tentativas e timeout permanecem. Os outros três jobs não mudam. Fonte técnica: [Docker no Playwright](https://playwright.dev/docs/docker).

Container descartável do GitHub Actions, permitido por ADR-002; nenhum ambiente permanente novo, runtime, dependência npm, banco ou deploy alterado. O registry, npm e Actions continuam sendo dependências de rede; a correção elimina a etapa apt deste job, sem prometer ausência de falhas externas.

## Verificação

Revisão do diff e da correspondência de versões/digest. A verificação efetiva do container e dos 31 testes de navegador depende do CI desta PR; não foi executado Docker local nesta máquina. Registrar resultado da PR e da main após a execução, distinguindo aprovação de CI de publicação/aceite operacional.
