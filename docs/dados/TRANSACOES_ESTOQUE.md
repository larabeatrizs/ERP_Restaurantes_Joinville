# Contratos transacionais propostos — estoque

Parte da fase B / SPEC-001. Fontes: RN-004–011/015/020/022/025–027/033/034/037, RNF-010, RF-012–017 e CA-005–014/021–024/026. **Não implementado.** Operações abaixo não são rotas existentes.

## Invariantes comuns

Toda escrita crítica deve validar identidade/ação/unidade, estado inicial, período aberto, origem e quantidade. Uma transação grava documento/transição, saldo/reserva, livro, auditoria e resultado idempotente juntos. Falha em qualquer parte não pode deixar efeito parcial.

Locks seguem ordem fixa: período/unidade → documento → saldos ordenados por `(unidade,lote,camara)` → demais projeções. Operações de fechamento/reabertura seguem a mesma trava de período, inclusive se ainda não há linha de fechamento (criar/chave única ou protocolo equivalente). Testar a concorrência de primeira gravação, não só linha já existente.

Um item repetido do mesmo lote/local é agregado antes da verificação de disponibilidade, ou rejeitado com erro claro; validar linhas isoladamente permite saldo negativo no total. Em operações multi-lote, bloquear todos os saldos relevantes e só então revalidar disponibilidade e aplicar deltas. Limitar transação ao banco, sem email/Storage/rede externa dentro do lock; notificação ocorre depois do commit com mecanismo idempotente próprio.

Idempotência proposta: chave por ator, unidade e operação, vinculada ao hash canônico do conteúdo. Reenvio idêntico retorna o resultado original, inclusive se o documento já mudou de estado; reutilização com conteúdo diferente dá conflito. Duas requisições simultâneas da mesma chave precisam convergir por UNIQUE/lock. Retenção e armazenamento de erros serão especificados antes de produção.

## Estados e efeitos

| Operação | Transição proposta | Momento de alteração de saldo |
| --- | --- | --- |
| Entrada | RASCUNHO → CONFIRMADA; estorno autorizado registra nova operação | Confirmar cria lote/local e crédito apenas para itens aceitos; documento original fica imutável |
| Saída Prévia | PENDENTE → APROVADA ou REJEITADA | Aprovar debita; rejeitar não debita; reserva S pode reduzir disponível antes da aprovação |
| Saída Posterior | Registro confirmado → REGISTRADA → CONFERIDA ou CONTESTADA | Registro debita uma vez; conferência/contestação não debita de novo nem devolve saldo automaticamente |
| Perda RP1 | PENDENTE → APROVADA ou REJEITADA | Só aprovação debita qualquer quantidade; autoridade exata depende da conciliação SEC-001 |
| Inventário | Contagem → análise → aprovação/encerramento | Aprovação grava somente diferença aprovada, nunca substituição silenciosa do livro |
| Transferência | Fluxo de aprovação ainda em conflito | Operação efetiva produz débito/crédito no mesmo lote e unidade, total zero; sem execução até decisão |
| Estorno | Solicitação → aprovação distinta → contabilização | Novo conjunto inverso de movimentos, com motivo; não apagar o original |

Rascunhos podem ser editados conforme perfil. Confirmado/aprovado/registrado não permite reescrever quantidades, lotes, modo ou unidade. Mudanças de conferência são eventos autorizados, não edição dos movimentos.

## Entrada e origem

Compra exige NF e fornecedor ativo; a dupla fornecedor/documento não pode ser duplicada por corrida entre unidades. O contrato de série/chave e identificação do doador será fechado antes da migration. Recebimento de doação exige documento de recebimento, sem NF fictícia; preço pode ser desconhecido. Produto recusado mantém registro de recusa/motivo e não cria saldo. Perecível exige lote/validade não anterior à data de entrada. A validade da regra é verificada contra o produto atual dentro da operação.

Valor desconhecido não vira zero: prejuízo/estoque valorizado ficam incompletos quando não existe base monetária. Doação não participa do cálculo de economia potencial ou comparação de compra.

## Saída, FEFO e reserva

FEFO usa somente lotes válidos com saldo disponível na unidade/local, ordenados por validade e desempate estável. Lote sem validade em item não perecível não recebe data fictícia; posição relativa deve ser definida no contrato antes do teste de ordenação. Troca manual exige justificativa. A validade é revalidada no instante em que o saldo é efetivamente debitado, inclusive após espera pela aprovação.

No modo Prévia, se reserva S for implementada, disponível = saldo físico menos reservas ativas. A aprovação consome a própria reserva e debita físico uma vez; rejeição libera uma vez. Se a opção S ficar fora do primeiro recorte, revalidar saldo na aprovação e informar indisponibilidade sem criar saldo negativo.

No modo Posterior do RP1, guardar o modo usado no documento para preservar a semântica mesmo se o parâmetro da unidade mudar depois. Contestação exige motivo e gera pendência de correção por fluxo de ajuste/estorno; não desfaz a retirada fisicamente já ocorrida por simples clique.

**Requisição rápida:** RN-034/CA-024 exigem registro imediato e baixa; o campo de refeição obrigatória no consumo de RF-013 não explica a retirada sem planejamento prévio. Proposta a revisar: documento de requisição rápida com produto/quantidade/quem retirou e modo Posterior, conciliado depois à refeição sem novo débito. Não implementar um `cardapio_refeicao_id` inventado nem bloquear o registro sem decisão de contrato.

## Inventário, data de corte e concorrência

CA-009/021 exigem comparar contagem com saldo e ajustar a diferença aprovada. O desenho deve preservar saldo de referência, instante/marca do livro, autor e contagem. Uma diferença de -2 kg observada num saldo 40 não significa gravar saldo 38 se houve consumo depois da contagem.

A política operacional precisa ser revisada antes de DB-001 implementar inventário: pausa controlada das operações no escopo durante contagem, ou reconciliação dos movimentos entre corte/contagem/aprovação com protocolo de contagem verificável. Não manter lock de banco durante trabalho humano. Como alternativa conservadora para o primeiro recorte, invalidar contagem que teve movimento após a referência e exigir nova contagem, **se aprovada como rotina do produto**. Nenhuma dessas alternativas foi escolhida automaticamente.

Na aprovação, verificar identidade distinta e executar o ajuste atomicamente sob locks; impedir dupla aplicação. Movimentos no período fechado exigem reabertura autorizada. A sugestão de compra seguinte usa o saldo reconciliado, não soma a divergência uma segunda vez.

## Rastreabilidade, estorno e fechamento

Cada delta aponta operação com origem por FK concreta. Saída liga item/lote à refeição efetivamente atendida, não apenas a uma previsão. Relatório RF-024 percorre ambas as direções preservando versões e documento do recebimento; não inferir lotes realmente consumidos a partir da ficha técnica.

Estorno de entrada não pode retirar saldo já consumido nem remover dependências de rastreio. Se o inverso resultar em saldo negativo ou contrariar período fechado, a operação falha e requer caminho de correção aprovado. O desenho inicial propõe estorno total uma única vez; estorno parcial só será adicionado se o contrato do recorte o exigir.

Fechamento e qualquer lançamento competem pela mesma fronteira de período. Uma transação não pode observar “aberto”, aguardar e depois gravar após o fechamento sem revalidar. Reabertura conserva ator, motivo e instante, sem apagar eventos anteriores.

## Plano de testes da C2/C3

| Caso | Resultado exigido | Fonte |
| --- | --- | --- |
| Dois débitos simultâneos de 7 sobre saldo 10 | No máximo um confirma; saldo nunca negativo | RN-008, RNF-010 |
| Dois itens de 7 no mesmo saldo 10 | Total é rejeitado, mesmo que cada item isolado caiba | RN-008 |
| Dois recebimentos com mesma NF/fornecedor | Um confirma, outro recebe conflito; sem lote/crédito duplicado | RN-025, CA-005 |
| Mesma chave idempotente em duas conexões | Um efeito no livro; mesmo resultado; payload divergente rejeitado | Integridade técnica proposta |
| Falha depois do débito, antes da auditoria | Rollback restaura saldo e nenhum documento final/livro parcial fica | RN-022, RNF-010 |
| Troca de unidade no filho | FK/autorização negam sem efeito | RN-004, CA-011 |
| Solicitante aprova/confere sua saída | Negado mesmo que seu perfil também permita aprovar | RN-009, CA-006/023 |
| Prévia versus Posterior | Primeira baixa na aprovação; segunda no registro e nunca na conferência | RN-011, CA-006/023 |
| Lote vence entre solicitação e aprovação | Débito de consumo negado; reserva tratada sem saldo negativo | RN-007 |
| Doação documentada e sem preço | Entrada aceita conforme contrato; valor incompleto; fora da economia | RN-037, CA-026 |
| Perda RP1 pequena | Pendente até aprovação distinta autorizada | RN-020, CA-022 |
| Transferência efetiva | Dois deltas mesmo lote/unidade somam zero; sem saldos negativos | RF-014, CA-008; aprovação pendente |
| Duas aprovações do mesmo inventário | Um ajuste somente | RF-016, CA-009/021 |
| Movimento durante contagem/aprovação | Política revisada evita aplicar diferença obsoleta | RN-033, RNF-010 |
| Corrida fechamento × lançamento | Ordem serializável pelo protocolo; nenhuma gravação indevida no fechado | RN-027 |
| Estorno de entrada consumida | Sem saldo negativo, sem apagar rastreio, sem sucesso parcial | RN-010, CA-014 |
| Histórico de consumo importado | Não gera lote/saldo/movimento | RF-036 |
| Consultar lote/refeição antigos | Fornecedor/documento/versão reais recuperáveis, com autorização | CA-010 |

Todos os casos são **especificações de teste**, ainda sem execução contra PostgreSQL. Testes HTTP de liveness do bootstrap não os substituem.
