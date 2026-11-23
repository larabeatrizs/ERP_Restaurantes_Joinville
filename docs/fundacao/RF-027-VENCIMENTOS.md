# RF-027 — Validade e vencimentos

23/11/2026. Entrega 1, [issue #71](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/71). [DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), RF-027, RN-004, RN-007, RN-012, RN-014, RN-015, RNF-015 e CA-011. [CONFIG-001](CONFIG-001.md) e [CAD-003](CAD-003-CATEGORIAS.md) definem a herança dos dias.

**Saldo → Consultar vencimentos** exibe lotes vencidos e a vencer com saldo positivo, ordenados pela validade e pelo ID do lote. Cada linha reúne o saldo do lote na unidade e exibe produto, validade, situação, unidade de medida e valor em risco. A prévia fornece o mesmo recorte em CSV.

A View consulta `GET /api/unidades/:id/estoque/vencimentos`, que encaminha a sessão à RPC `erp.estoque_vencimentos`. A função privada aplica vínculo ativo e ESTOQUE_LER e lê saldo, lote, categoria e parâmetros da unidade em um snapshot. Validades anteriores à data civil de São Paulo são vencidas. Da data atual até o limite inclusivo, a situação é a vencer. O limite usa dias da categoria, depois da unidade e então o padrão de sete dias. Zero preserva o dia corrente. O valor em risco usa saldo × valor histórico unitário do lote, arredondado a centavos na exibição.

| Critério | Verificação |
| --- | --- |
| Vencido, hoje, limite inclusivo e herança | Teste do banco combina lotes de várias datas e três cenários de configuração, inclusive zero. |
| Saldo por lote e valor em risco | Teste do banco consolida duas posições e descarta saldo zero e validade ausente. O navegador confirma a exibição de R$ 40,00 para 5 × R$ 8,00. |
| Controle de acesso | Testes negam perfil sem ESTOQUE_LER, unidade sem vínculo e HTTP sem sessão. |
| Troca de unidade | Teste com transporte simulado confirma recorte vazio ao trocar para unidade sem lotes. |

Gatilhos persistidos, destinatários e canais de notificação seguem o RF-029.
