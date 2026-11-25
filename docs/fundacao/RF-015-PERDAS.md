# RF-015 — Perdas por lote

23/11/2026. [Issue #79](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/79), Entrega 1, fases B/C1. DRS RF-015, RN-004/008/012/015/020/022/027, CA-007 e CA-022.

| Comportamento | Camada e verificação |
| --- | --- |
| Quantidade positiva até o saldo do lote no local e valoração pelo custo unitário do lote | O contrato compartilhado usa decimais exatos. Testes cobrem 5 × R$ 8,00 = R$ 40,00, quantidades mínimas, saldo insuficiente e entradas inválidas. |
| Pendência e aprovação em Bucarein | Limite zero conforme RN-020. Nutricionista titular e gestor somente como substituto configurado, conforme confirmação da responsável. A decisão deve ser aplicada pelo servidor a vínculos ativos e pela validação de autoria. |
| Baixa e trilha | Na fase C2, revalidar o saldo do lote/local sob lock, aplicar a baixa uma vez e registrar motivo, ator e valor do lote. Rejeição conserva saldo. Exercitar concorrência, reenvio e falha de auditoria em banco descartável. O extrato RF-017 e o relatório RF-023 devem reconhecer a origem depois da baixa aprovada. |

O primeiro recorte é uma função de valoração e validação de entrada, sem uso em fluxo operacional. Para completar a gravação, especificar a política de período aberto e os motivos parametrizados que exigem evidência. A configuração de Adhemar Garcia precisa de regra própria. Lançamento em lote, anexo e aprovação são etapas da entrega funcional.

## Decisão testável de Bucarein em 24/11/2026

O contrato compartilhado passou a avaliar uma revisão usando fatos carregados pelo servidor. A avaliação exige vínculo ativo na unidade, nutricionista ou gestor substituto configurado, autor diferente do revisor (RN-009) e perda pendente. Uma rejeição produz somente o estado REJEITADA. Uma aprovação requer período aberto e saldo suficiente no lote/local e devolve a quantidade e o custo a registrar na baixa. Os testes cobrem aprovação, rejeição e negações por autoria, perfil, unidade, estado, período e saldo.

Na transação, o servidor deve resolver perfil, configuração de substituição, estado do período, documento e saldo persistido. Adquirir as travas na ordem [período/unidade → documento → saldo](../dados/TRANSACOES_ESTOQUE.md). A função de contrato avalia um snapshot. A idempotência do comando e a persistência da baixa são responsabilidades da C2. O [fechamento RN-027](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/81) acompanha o pré-requisito que impede baixas em competência fechada. O contrato vigente permanece restrito à política confirmada de Bucarein.

## Registro pendente interno

A migration adiciona catálogo privado de motivos e registro por lote, local e competência. A função interna modela o cenário do estoquista de Bucarein previsto no CA-022. Valida vínculo ativo, competência aberta, motivo ativo sem exigência de anexo e saldo suficiente. Persiste o custo histórico unitário e o produto exato da quantidade pelo custo. O estado inicial é PENDENTE.

O comando aceita reenvio idêntico pela mesma chave e recusa a mesma chave com outros dados. Registro e auditoria são atômicos, com saldo e livro inalterados. O fechamento consulta as perdas pendentes sob a trava mensal. A migration deixa o catálogo sem dados iniciais. A disponibilidade operacional depende da configuração de motivos e permissões no Configurador e da implementação de aprovação, rejeição, baixa e anexos.

O teste descartável registra 5 kg a R$ 8,00 com prejuízo de R$ 40,00, confirma reenvio sem duplicação, recusa saldo insuficiente e motivo que exige anexo e demonstra o bloqueio do fechamento pela perda pendente.

## Revisão interna em Bucarein

A migration de revisão permite que a nutricionista vinculada à unidade ou o gestor vinculado e designado como substituto revise uma perda de outra pessoa. A designação fica em uma tabela privada por unidade, inicialmente vazia. O comando interno serializa a decisão sob a trava mensal. Na aprovação, revalida a competência e o saldo e grava a baixa com o custo original. A rejeição resolve a pendência e preserva o saldo. O reenvio da mesma decisão pelo mesmo revisor devolve o resultado anterior.

O extrato RF-017 apresenta a baixa como **Perda aprovada**, inclusive no filtro e na exportação. O teste descartável verifica a baixa de 5 kg a R$ 8,00, o saldo final de 15 kg, a segregação por autor e perfil, o reenvio, a rejeição e o rollback quando a auditoria falha.

## Painel de revisão

A tela **Perdas de estoque** lista em Bucarein até 50 pendências elegíveis, da mais antiga à mais recente, e permite aprovar ou rejeitar após confirmação. A lista inclui lote, local, motivo, justificativa, quantidade e prejuízo. O servidor valida a unidade e a identidade autenticada, exclui da fila as perdas lançadas pela própria pessoa e reaplica as verificações da transação ao decidir. A tela atualiza a fila após cada decisão.

## Registro por lote

O estoquista de Bucarein registra uma perda na tela **Perdas de estoque**, selecionando uma posição com saldo, data, quantidade e motivo ativo. A tela estima o prejuízo com o custo do lote. A API chama a transação de registro, que revalida os dados e grava a perda pendente. Se a resposta ficar incerta, a tela permite reenviar o mesmo pedido com a chave original.

## Configuração de motivos e substituto

No Configurador, o perfil ADMIN ativo com a capacidade de gestão `USUARIO_GERIR` pode criar, editar e inativar motivos e indicar se exigem anexo. A designação de substituto permite escolher ou remover um gestor ativo vinculado a Bucarein. Cada alteração efetiva registra ator, horário e valores anteriores e posteriores. A revisão impede sobrescrever uma configuração alterada por outra sessão.

## Foto da perda

Motivos ativos com exigência de anexo pedem uma foto JPEG ou PNG de até 2 MiB. O banco valida o tipo, a assinatura inicial e o tamanho e grava os bytes em uma tabela privada na mesma transação da perda. O reenvio verifica o hash do arquivo e a trilha registra apenas o hash e a presença da foto. O painel permite ao revisor autorizado baixar o arquivo pela API autenticada, sem URL pública.

## Registro de vários lotes

O estoquista de Bucarein pode selecionar de 2 a 20 lotes de uma câmara, informar a quantidade de cada lote e enviar uma data, um motivo, uma justificativa e, quando aplicável, uma foto em comum. A API cria uma perda pendente por lote, com custo e revisão individuais. O limite de 20 itens é técnico e mantém o tamanho de cada transação limitado. A foto acompanha cada perda para consulta individual.

Se qualquer item for recusado, a transação desfaz todo o lançamento. Reenviar a mesma chave e os mesmos dados devolve as perdas originais, inclusive se a ordem dos lotes mudar. Nenhum saldo é movimentado no registro.

## Perdas aprovadas no relatório RF-023

A consulta em **Saldo** usa a data de registro da perda como competência. Exibe o total aprovado do mês ou ano, o total do período anterior e o detalhamento por motivo, lote, produto e categoria do período selecionado. O cálculo usa o prejuízo histórico de cada perda. Descrições e categorias vêm dos cadastros atuais. A visão exige vínculo na unidade e capacidade `ESTOQUE_LER`. O relatório pode ser exportado em CSV ou impresso como PDF pelo navegador.

Os filtros opcionais de produto, categoria, lote, fornecedor e motivo combinam trechos de texto sem distinção entre maiúsculas e minúsculas. O mesmo recorte vale para os itens e os totais dos dois períodos. A prévia e as linhas do CSV identificam os filtros aplicados.

A opção de consolidar unidades vinculadas está disponível para Admin, Gestor Central e Auditor com capacidade `ESTOQUE_LER`. O banco inclui somente unidades ativas vinculadas à conta e identifica a unidade de cada lote. O consolidado usa os mesmos filtros e a mesma competência da consulta por unidade.

O percentual sobre o valor consumido segue pendente no RF-023. O catálogo depende do cadastramento de motivos pela administração. A política de Adhemar Garcia e a validação hospedada permanecem pendentes.

## Base do percentual no RF-023

**Decisão confirmada pela responsável em 25/11/2026:** somente consumo vinculado a refeições compõe o valor consumido. Nas requisições rápidas, entram as parcelas conciliadas com refeições. Retiradas sem vínculo e parcelas ainda não alocadas ficam fora do cálculo.

O DRS §11.2 pede o percentual do prejuízo sobre o valor consumido no período. O RF-013 usa o dia do consumo e distingue consumo de refeição, uso interno ou limpeza e outras saídas. O RN-034 permite a retirada antes de existir vínculo com refeição. A [decisão DOM-05](../decisoes/DOM-001-PROPOSTAS.md) permite conciliar cada item com uma ou mais refeições, até o limite retirado e sem nova movimentação no estoque.

A implementação depende de refeições de cardápio persistidas, das saídas de consumo RF-013 e da conciliação [EST-002](EST-002-REQUISICAO-RAPIDA.md#contrato-de-conciliação-c1), acompanhada na [issue #52](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/52). As migrations atuais têm calendário e requisições rápidas, mas ainda carecem de refeições de cardápio e dos vínculos de consumo. O relatório existente segue com totais de prejuízo e comparação entre períodos.

Para validar o cálculo, verificar que a seleção de unidades e o intervalo da consulta valem para numerador e denominador. Em períodos consolidados, a proposta é dividir a soma dos prejuízos pela soma dos valores consumidos. Ainda precisam de definição os efeitos dos filtros de lote, fornecedor e motivo, o tratamento de contestações, devoluções e alocações em outro mês, e a exibição com denominador zero ou indisponível.

| Cenário para teste | Evidência esperada após definição |
| --- | --- |
| R$ 40,00 de perda aprovada e R$ 200,00 de consumo elegível | 20,00% na competência correspondente. |
| Uma retirada distribuída em duas refeições | O custo da mesma quantidade aparece uma vez. A soma das frações permanece limitada à retirada. |
| Retirada sem conciliação ou com alocação parcial | Apenas a fração vinculada entra no denominador. |
| Refeição em competência diferente da retirada | O teste usa a data de referência que vier a ser definida para esse cenário. |
| Denominador zero ou sem fonte de dados | Estado definido no contrato, distinto de prejuízo zero com consumo positivo. |
