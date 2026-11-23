# RF-017 — Extrato de movimentação de estoque

23/11/2026. Entrega 1, [issue #65](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/65). Revisão técnica da fase B e validação compartilhada dos filtros. Fontes: [DRS, seções 9 e 15.2](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) e [plano de reconstrução](../planejamento/RECONSTRUCAO_SDD.md).

## Contrato revisado

| Fonte | Comportamento e implementação prevista | Verificação |
| --- | --- | --- |
| RF-017, RN-005 | A partir de Saldos, selecionar um produto e opcionalmente um lote. Exibir saldo corrente da seleção e consultar o livro em ordem de instante e ID. Origem, lote, local e quantidade aparecem na linha. Usar os estados e componentes existentes do ERP para o extrato complementar. | Compra de 20 e retiradas de 2 e 3 exibem três movimentos e saldo 15. Outro lote do produto pertence à visão por produto. |
| RF-017, RNF-015 | Controller e Service compartilham os filtros `produto_id`, `lote_id`, `data_inicio`, `data_fim` e `tipo`. IDs são strings bigint. Datas civis opcionais seguem America/Sao_Paulo, com inclusão das duas datas informadas. Tipos iniciais correspondem às origens existentes de entrada confirmada e requisição rápida. | O contrato cobre dias inválidos, intervalos invertidos, IDs fora da faixa bigint, tipos desconhecidos e campos adicionais. Testar as fronteiras de fuso no banco. |
| RN-004, RN-012, RNF-002, CA-011 | Repository e banco exigem sessão, unidade vinculada e ESTOQUE_LER. Resolver produto/lote na unidade a partir das relações do livro, inclusive para histórico de itens inativos. Validar a pertença do lote antes de ler movimentos. | Consulta e CSV recusam unidade alheia, lote incompatível, perfil sem leitura e vínculo revogado. |
| RF-017, RN-022 | O livro `erp.movimento_estoque` fornece os registros das origens já implementadas. A saída conserva precisão decimal. A exportação aplica a mesma seleção, filtros e ordenação, com proteção de fórmulas nos campos de texto. | CSV da consulta e falha posterior sem arquivo parcial. Consulta e exportação são operações de leitura. |

## Decisão de apresentação confirmada

A responsável confirmou **saldo após cada movimentação**. A coluna acumula o todo da seleção até cada movimento, inclusive os anteriores ao início do período e os tipos ocultos pelo filtro. A visão por produto inclui todos os seus lotes na unidade. A visão por lote acumula somente o lote selecionado. O saldo corrente permanece no resumo.

O [contrato compartilhado](../../packages/contracts/src/stock-ledger.ts) valida o filtro, o escopo da resposta e a ordem das linhas. A tela acessa `GET /api/unidades/:id/estoque/extrato` a partir de Saldos. A API consulta a RPC de leitura com a sessão autenticada. O CSV usa uma consulta única com os filtros aplicados, com limite técnico de 10.000 linhas. Acima do limite a tela orienta a refinar os filtros. A consulta única fornece um snapshot consistente e evita entregar um arquivo parcial.

Perdas, transferências, estornos e abertura de estoque permanecem nos respectivos recortes.

## Evidências de 23/11/2026

| Critério | Evidência | Ambiente |
| --- | --- | --- |
| Saldo após cada linha | Entrada de 20 e retiradas de 2 e 3 retornaram 20, 18 e 15. O filtro de tipo preservou os acumulados. | Testes de estoque em PostgreSQL descartável e PGlite. |
| Lote, datas e isolamento | Testes confirmaram o acúmulo por produto e por lote, o limite da data civil de São Paulo, o desempate por ID e as negações de produto, lote, unidade e perfil. | PostgreSQL descartável e PGlite. |
| Consulta e CSV | Testes HTTP cobriram autenticação e filtros. A jornada de navegador conferiu o saldo por linha, o CSV filtrado com quantidade negativa e a recusa de exportação sem permissão. | API e navegador locais. 77 testes Playwright passaram. [CI da PR #67](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/45164027608) com quatro jobs aprovados. |
| Migration e publicação | Migration `20261123112140`, conteúdo conferido por hash. A consulta com contexto autenticado alcançou a validação de filtros e seleção nas duas unidades. Os modos de consulta e exportação retornaram HTTP 401 sem sessão. O HTML e o bundle publicados coincidiram com o build local. | [Staging compartilhado](https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev), commit `d7b97bc`, versão Cloudflare `340b21e8-7cb9-44f6-ba26-e4606e62ea91`. |

O Supabase atribuiu a versão da migration no momento da aplicação. O arquivo foi renomeado para coincidir com o histórico remoto, com o mesmo SQL. O staging preservou um administrador, dois vínculos de unidade e 60 nomes pendentes. A base segue com zero movimentos. Por isso, a verificação hospedada cobre as rotas, o bundle e a fronteira de autorização, enquanto o cálculo com dados e o CSV foram exercitados em laboratório e com API simulada no navegador.
