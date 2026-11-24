# RN-027 — Trava mensal do estoque

24/11/2026. [Issue #81](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/81). Fundação C2 para RF-015 e RF-025. O DRS exige bloquear lançamentos de período fechado até reabertura autorizada pelo gestor central. A responsável confirmou que mês sem registro aceita lançamentos.

A migration cria uma trilha privada de eventos por unidade e primeiro dia do mês. Cada evento registra estado, motivo, ator e instante. O executor de estoque pode ler somente as unidades vinculadas ao ator. Perfis da aplicação têm acesso à futura operação mediada, conforme seus requisitos, e a tabela fica no schema privado.

Para gravar na transação de negócio, a origem deve chamar a guarda antes de adquirir travas de documento ou saldo, usando a data de competência da operação. A guarda obtém uma trava compartilhada de transação pela chave de unidade/mês e consulta o último evento depois de adquirir a trava. Fechamento e reabertura devem obter a mesma chave em modo exclusivo, revalidar estado/permissão e gravar o evento na mesma transação. A leitura após a espera requer READ COMMITTED. O protocolo cobre meses ainda sem evento.

No teste isolado, mês sem evento aceita, fechamento bloqueia, mês seguinte segue disponível e reabertura libera. Usuários autenticados comuns não executam a guarda diretamente. O teste nativo usa duas conexões para comprovar que a primeira verificação de um lançamento aguarda o fechamento e lê o estado após o commit.

A guarda é interna e as origens vigentes ainda não a chamam. As próximas etapas são a operação de fechamento e reabertura com autorização, a integração por data de competência e o uso na baixa de perdas. A permissão para fechar e o tratamento de documentos pendentes permanecem em revisão. A reabertura é do gestor central conforme RN-027.
