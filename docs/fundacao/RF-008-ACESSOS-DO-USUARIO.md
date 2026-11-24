# RF-008 — Acessos no cadastro do usuário

24/11/2026. [Issue #84](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/84). A responsável definiu que os acessos sejam configurados para cada pessoa ao cadastrá-la em **Configurador → Usuários → Novo usuário**, após escolher perfil e unidades. A decisão orienta a evolução das demais operações do ERP.

## Primeiro recorte

- Exibir **Fechar mês de estoque** e **Reabrir mês de estoque** para a unidade selecionada. Cada opção é independente e começa desmarcada. O fechamento depende da seleção explícita para aquela pessoa e unidade. A reabertura fica disponível somente para gestor central, conforme RN-027.
- O [contrato compartilhado](../../packages/contracts/src/user-stock-period-access.ts) valida a seleção por unidade. Rejeita duplicidade, unidade fora dos vínculos escolhidos e reabertura para outros perfis. RN-012 continua regendo a relação entre perfil, unidade e operação.
- Na integração, o Controller valida o pedido do Configurador. O serviço de identidade aplica a autorização administrativa. A persistência privada registra a seleção com auditoria e a operação de fechamento ou reabertura revalida o acesso e o vínculo ativo sob a trava RN-027.

## Cadastro e persistência

O formulário mostra escolhas para as unidades marcadas. Desmarcar a unidade remove suas escolhas do formulário. Mudar para um perfil diferente de gestor central remove a seleção de reabertura. A carga de criação passa pelo validador do serviço de identidade antes de qualquer chamada de provisionamento Auth. Uma seleção sem opções marcadas conserva o payload anterior, inclusive para retomadas de cadastro.

O pedido normalizado integra a intenção de provisionamento. A conclusão grava os acessos em tabela privada com RLS e registra a seleção no evento CRIAR. A validação do banco e a gravação participam da mesma transação da criação do usuário no domínio. Remover o vínculo apaga o acesso daquela unidade, e a edição para outro perfil revoga sua reabertura.

A edição explícita de acessos e a aplicação destas permissões nas operações continuam nas issues #84 e #81. A evolução dos demais acessos exige revisar cada operação e a transição de contas existentes.
