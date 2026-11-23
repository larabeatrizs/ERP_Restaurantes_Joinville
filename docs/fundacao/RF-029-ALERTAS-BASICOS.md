# RF-029 — Alertas básicos de estoque

[Issue #76](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/76). Entrega 1. DRS seção 11.3, RF-029, RN-004, RN-012, RN-013, RN-014 e CA-012.

**Início → Alertas de estoque** consulta as condições atuais da unidade ao abrir ou atualizar. A lista prioriza vencidos, lotes a vencer e estoque mínimo. Cada lote ou produto aparece uma vez por tipo. A atualização remove condições resolvidas. Esse recorte aplica notificação interna como consulta de condições atuais, com entrega ao abrir o painel.

| Condição | Destinatário na unidade ativa |
| --- | --- |
| Saldo menor ou igual ao mínimo de produto ativo | Estoquista e nutricionista |
| Lote com saldo e validade entre hoje e o limite inclusivo | Estoquista e gestor da unidade |
| Lote vencido com saldo | Gestor da unidade |

A View chama `GET /api/unidades/:id/estoque/alertas` autenticado. O Repository usa a RPC de leitura, que verifica o vínculo ativo e resolve o perfil a partir do ator autenticado. Dias de validade seguem categoria, unidade e padrão de sete dias, com data civil de São Paulo. O teste de banco verifica igualdade, prioridade, destinatários, isolamento e resolução. HTTP e navegador exercitam autenticação e troca de unidade com dados sintéticos.

Histórico de notificações, confirmação de leitura, envio por e-mail e demais gatilhos do RF-029 permanecem em recortes futuros.
