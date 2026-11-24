# RF-008 — Acessos no cadastro do usuário

24/11/2026. [Issue #84](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/84). A responsável definiu que os acessos sejam configurados para cada pessoa ao cadastrá-la em **Configurador → Usuários → Novo usuário**, após escolher perfil e unidades. A decisão orienta a evolução das demais operações do ERP.

## Primeiro recorte

- Exibir **Fechar mês de estoque** e **Reabrir mês de estoque** para a unidade selecionada. Cada opção é independente e começa desmarcada. O fechamento depende da seleção explícita para aquela pessoa e unidade. A reabertura fica disponível somente para gestor central, conforme RN-027.
- O [contrato compartilhado](../../packages/contracts/src/user-stock-period-access.ts) valida a seleção por unidade. Rejeita duplicidade, unidade fora dos vínculos escolhidos e reabertura para outros perfis. RN-012 continua regendo a relação entre perfil, unidade e operação.
- Na integração, o Controller valida o pedido do Configurador. O serviço de identidade aplica a autorização administrativa. A persistência privada registra a seleção com auditoria e a operação de fechamento ou reabertura revalida o acesso e o vínculo ativo sob a trava RN-027.

Este recorte entrega o contrato de seleção e seus testes. Formulário, persistência, edição de acessos e execução do fechamento continuam na [issue #84](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/84) e na [issue #81](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/81). A evolução dos demais acessos exige revisar cada operação e a transição de contas existentes.
