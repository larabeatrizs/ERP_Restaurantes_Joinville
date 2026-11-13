# REL-001/A — Relatórios básicos de consulta

**13/11/2026 — implementação local verificada; issue [#35](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/35).** Continuidade da D1 e de DOM-002/issue #31 após CAD-005. Publicação/verificação hospedada ainda pendentes neste snapshot. Não representa aceite institucional ou conclusão dos relatórios gerenciais.

## Contrato e rastreabilidade

DRS seção 7.1/RF-003 → relatório do catálogo vinculado à unidade, com parâmetros próprios e filtro de texto/status aplicado. RF-012 parcial → relação dos até 50 recebimentos mais recentes disponibilizados pela API. RF-017 parcial → posições por lote/local já consultadas, respeitando a pesquisa. RNF-002/003/007/015 → mesma sessão, vínculo e capacidades de leitura existentes, sem consulta administrativa ou novos dados pessoais.

As três consultas oferecem visualização identificada pela unidade, horário de geração em America/Sao_Paulo, escopo/filtro e quantidade; impressão pelo navegador (inclusive salvar PDF) e CSV UTF-8 com BOM, separador ponto e vírgula, aspas e neutralização de fórmulas. Decimais permanecem strings. Relatórios não somam quantidades de grandezas distintas nem confundem rascunho/recusa com crédito em estoque.

Produtos busca páginas de 50 desde offset zero até o total informado, independentemente da página aberta. Limite de 10 mil; total alterado, IDs repetidos, página incompleta ou falha interrompem sem oferecer arquivo parcial. As leituras são sequenciais, não um snapshot transacional: alterações concorrentes de conteúdo sem alteração de total podem ser observadas em momentos distintos; o documento indica consulta durante a geração, sem valor contábil de fechamento. Essa limitação não deve ser apresentada como consistência transacional.

Recebimentos declara sempre o teto de 50 recentes, incluindo estados e itens/conformidade no CSV/detalhamento, sem anunciar histórico completo. Saldos usa somente o resultado carregado e pesquisado, sem nova movimentação. Uma nova tentativa usa a sessão vigente; falhas não reaproveitam dados de outra unidade. Navegação/troca de unidade durante geração de Produtos fica bloqueada pelo mecanismo busy existente.

## Componentes e verificação

View ProductPanel/ReceiptPanel/Balances → relatório de consulta compartilhado → StockApi existente → StockController/Service/Repository → RPCs/RLS existentes. Sem migration, novo endpoint, capacidade ou chave privilegiada. Style Guide preservado; preview reutiliza dialog, tipografia, tabela e ações existentes.

Executado localmente: `npm run check` (lint, tipos, 89 API, laboratórios de banco/legado/provisionamento e build/dry-run) e `PLAYWRIGHT_CHANNEL=msedge npm run test:web` (57 passaram). Cinco cenários novos verificam leitor, 51 produtos, filtro aplicado, fórmulas/precisão, segunda página com falha, limite, IDs repetidos, recebimentos com estados/teto, saldos pesquisados e troca de unidade; CSS de impressão e 360/768/1280 px. Uma primeira tentativa usou seletores incorretos no novo teste de saldo; corrigidos para os rótulos reais e suíte completa reexecutada com sucesso. Os cenários de concorrência PostgreSQL ignorados pelo PGlite continuam sujeitos ao CI nativo; sem SQL novo neste recorte. Build mantém aviso de chunk principal acima de 500 kB (506,24 kB), pendência de desempenho existente.

Artefatos: `apps/web/src/services/stock-reports.ts`, `apps/web/src/views/ReportPreview.tsx`, integrações nas três Views e `tests/browser/estoque.spec.mjs`. `scripts/staging/verificar-relatorios.mjs` faz opt-in de leitura com conta sintética reservada, sem salvar CSV/PDF ou credenciais no checkout; evidência sanitizada registra contagem, exportação, impressão, responsividade e ausência de mutations.

RF-021–028 integrais, kardex completo, filtros avançados por data/produto/categoria, ordenação/ciclo de vida faltantes de Produtos e RF-008 permanecem próprios. SMTP geral, skeleton, importação final e AMB-001 continuam conforme decisões vigentes. Não alterar conta pessoal ou estoque.
