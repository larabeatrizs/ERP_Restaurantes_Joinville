# RF-017 — Extrato de movimentação de estoque

23/11/2026. Entrega 1, [issue #65](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/65). Revisão técnica da fase B e validação compartilhada dos filtros. Fontes: [DRS, seções 9 e 15.2](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) e [plano de reconstrução](../planejamento/RECONSTRUCAO_SDD.md).

## Contrato revisado

| Fonte | Comportamento e implementação prevista | Verificação |
| --- | --- | --- |
| RF-017, RN-005 | A partir de Saldos, selecionar um produto e opcionalmente um lote. Exibir saldo corrente da seleção e consultar o livro em ordem de instante e ID. Origem, lote, local e quantidade aparecem na linha. Usar os estados e componentes existentes do ERP para o extrato complementar. | Compra de 20 e retiradas de 2 e 3 exibem três movimentos e saldo 15. Outro lote do produto pertence à visão por produto. |
| RF-017, RNF-015 | Controller e Service compartilham os filtros `produto_id`, `lote_id`, `data_inicio`, `data_fim` e `tipo`. IDs são strings bigint. Datas civis opcionais seguem America/Sao_Paulo, com inclusão das duas datas informadas. Tipos iniciais correspondem às origens existentes de entrada confirmada e requisição rápida. | O contrato cobre dias inválidos, intervalos invertidos, IDs fora da faixa bigint, tipos desconhecidos e campos adicionais. Testar as fronteiras de fuso no banco. |
| RN-004, RN-012, RNF-002, CA-011 | Repository e banco exigem sessão, unidade vinculada e ESTOQUE_LER. Resolver produto/lote na unidade a partir das relações do livro, inclusive para histórico de itens inativos. Validar a pertença do lote antes de ler movimentos. | Consulta e CSV recusam unidade alheia, lote incompatível, perfil sem leitura e vínculo revogado. |
| RF-017, RN-022 | O livro `erp.movimento_estoque` fornece os registros das origens já implementadas. A saída conserva precisão decimal. A exportação aplica a mesma seleção, filtros e ordenação, com proteção de fórmulas nos campos de texto. | CSV da consulta e falha posterior sem arquivo parcial. Consulta e exportação são operações de leitura. |

## Decisão de apresentação em revisão

O DRS exige saldo corrente. A issue #65 propõe acrescentar **saldo após cada lançamento** e pede revisão antes da implementação dessa apresentação. A responsável pelo requisito pode confirmar a coluna adicional ou usar saldo corrente no resumo e deltas nas linhas. Se aprovada, a coluna acumula o todo da seleção até cada movimento, inclusive os anteriores ao início do período e os tipos ocultos pelo filtro. Na visão por produto o acúmulo inclui todos os seus lotes na unidade. Na visão por lote o acúmulo usa somente aquele lote. A escolha afeta a projeção SQL, a resposta HTTP e as colunas da tela e do CSV.

Neste incremento, o [contrato de filtros](../../packages/contracts/src/stock-ledger.ts) cobre a parte independente dessa decisão. O teste é executado por `npm run test:contracts`. O extrato funcional e o CA-011 neste fluxo dependem da implementação em banco, API e View e de evidências de integração. Perdas, transferências, estornos e abertura de estoque permanecem nos respectivos recortes.
