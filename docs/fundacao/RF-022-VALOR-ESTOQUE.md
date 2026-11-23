# RF-022 — Valor imobilizado em estoque

23/11/2026, Entrega 1. [Issue #69](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/69). [DRS, seções 11.2 e 15.2](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md). RF-022, RN-004, RN-012, RN-015, RNF-015 e isolamento observável do CA-011.

**Saldo → Consultar valor imobilizado** apresenta o valor por categoria e o total de todos os lotes da unidade ativa. A pesquisa da tabela de saldos continua aplicável à tabela e ao relatório de posições. O valor imobilizado considera a unidade inteira.

A View reutiliza a prévia de relatórios e seu CSV. O serviço lê as posições pela API de estoque e carrega o catálogo ativo e inativo em paralelo quando há saldo. Controller, Repository e banco preservam a autorização de leitura vigente em cada chamada. A categoria vem do vínculo atual do produto no catálogo. Produto com saldo e sem correspondência, inconsistência de paginação ou falha de autorização impede a geração do relatório. A troca de unidade remove a prévia anterior.

O cálculo multiplica a quantidade pelo valor unitário persistido no lote. O total da unidade e cada subtotal são arredondados a centavos a partir dos próprios valores exatos. Por isso, a soma visual dos subtotais arredondados pode diferir do total da unidade. Com zero saldo, o relatório mostra total zero. O resultado é uma consulta operacional de saldos e catálogo, obtidos em requisições distintas. Fechamento contábil e consolidação entre unidades seguem seus recortes.

| Critério | Verificação |
| --- | --- |
| Valor exato por lote, categoria e unidade | Teste de navegador com dois lotes de valor inferior a um centavo e outra categoria com produto inativo. |
| Isolamento e integridade da consulta | Teste de navegador troca a unidade e simula produto ausente. A consulta falha antes da prévia quando o catálogo está incompleto. |
| CSV | Teste de navegador confere o total exportado da mesma prévia. |
