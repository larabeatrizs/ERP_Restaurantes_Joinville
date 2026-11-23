# RF-015 — Perdas por lote

23/11/2026. [Issue #79](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/79), Entrega 1, fases B/C1. DRS RF-015, RN-004/008/012/015/020/022/027, CA-007 e CA-022.

| Comportamento | Camada e verificação |
| --- | --- |
| Quantidade positiva até o saldo do lote no local e valoração pelo custo unitário do lote | O contrato compartilhado usa decimais exatos. Testes cobrem 5 × R$ 8,00 = R$ 40,00, quantidades mínimas, saldo insuficiente e entradas inválidas. |
| Pendência e aprovação em Bucarein | Limite zero conforme RN-020. Nutricionista titular e gestor somente como substituto configurado, conforme confirmação da responsável. A decisão deve ser aplicada pelo servidor a vínculos ativos e pela validação de autoria. |
| Baixa e trilha | Na fase C2, revalidar o saldo do lote/local sob lock, aplicar a baixa uma vez e registrar motivo, ator e valor do lote. Rejeição conserva saldo. Exercitar concorrência, reenvio e falha de auditoria em banco descartável. O extrato RF-017 e o relatório RF-023 devem reconhecer a origem depois da baixa aprovada. |

O primeiro recorte é uma função de valoração e validação de entrada, sem uso em fluxo operacional. Para completar a gravação, especificar a política de período aberto e os motivos parametrizados que exigem evidência. A configuração de Adhemar Garcia precisa de regra própria. Lançamento em lote, anexo e aprovação são etapas da entrega funcional.
