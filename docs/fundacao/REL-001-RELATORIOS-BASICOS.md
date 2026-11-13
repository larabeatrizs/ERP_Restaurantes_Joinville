# REL-001/A — Relatórios básicos de consulta

**13/11/2026 — publicado e verificado no staging; issue [#35](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/35)/[PR #36](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/36).** Continuidade da D1 e de DOM-002/issue #31 após CAD-005. Não representa aceite institucional ou conclusão dos relatórios gerenciais.

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

## Publicação e evidências executadas

Runtime `9fc60b845b3e72913bc92e0f8e418787df8802ee`, versão Cloudflare `dcff4c61-ccb5-4db0-bf74-c6644924b10b`, [mesma URL](https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev). [Jornada real](../evidencias/rel-001/jornada-hospedada.json) em 13/11: leitor sintético autenticado por nome de acesso, sem capacidades adicionais; 8 produtos, 6 itens de recebimentos e 6 posições exportados, PDF gerado em memória, CSS de impressão e 360/768/1280 px conferidos. A primeira revisão visual apontou compressão de palavras no celular; corrigida com largura mínima e rolagem horizontal somente na prévia, testes pertinentes reexecutados e nova publicação/jornada concluídas. [Desktop](../evidencias/rel-001/produtos-1280.png) e [mobile](../evidencias/rel-001/saldos-360.png) inspecionados antes de versionar; somente dados sintéticos.

[Preservação do banco](../evidencias/rel-001/verificacao-banco.json): oito migrations/20 tabelas, oito produtos/três fornecedores/cinco usuários, seis movimentos e 52 eventos mantidos. Hashes antes/depois idênticos para produtos, saldos, recebimentos, usuários de domínio, vínculos e capacidades de todos os perfis (incluindo ADMIN). Nenhuma mutation operacional na jornada, migration, novo ambiente, redefinição de senha ou acesso à identidade pessoal. Isso não substitui backup/restauração ou auditoria integral de Auth.

CI do primeiro fonte: [43504708217](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/43504708217), quatro jobs aprovados, com PostgreSQL nativo e 57 jornadas UI. Após a correção visual, lint/tipos e cinco jornadas de relatórios locais passaram novamente; build publicado com chunk principal de 506,28 kB. A rodada do runtime [43505035532](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/43505035532) também passou nos quatro jobs. Integração aguarda o HEAD documental final; o registro da PR/issue acompanhará CI e sincronização final.

Continuidade planejada: especificar e implementar o ciclo de vida/exclusão elegível de Produtos na issue #31, preservando RN-002 e histórico em todas as unidades. Administração integral (#19) e unidades/calendário (RF-006) continuam dependências D1; filtros avançados e relatórios gerenciais não foram encerrados por este incremento.
