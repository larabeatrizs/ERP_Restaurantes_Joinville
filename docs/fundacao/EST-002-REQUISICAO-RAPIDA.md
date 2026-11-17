# EST-002 — Requisição rápida e distribuição por refeições

Data: 17/11/2026. [Issue #52](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/52). **Recorte B/C1: contrato e invariante executável; ainda sem migration, endpoint, tela ou baixa no staging.** Continuidade da D1 após recebimentos/saldos EST-001 e administração básica ADM-003–006.

## Fontes e decisão

DRS RF-013 (incluindo refinamento v1.2), RN-006/007/008/009/010/011/034 e CA-024; [transações](../dados/TRANSACOES_ESTOQUE.md), [CONFIG-001](CONFIG-001.md) e DOM-05. A responsável confirmou em 17/11, respondendo à proposta de requisição rápida com baixa imediata no modo Posterior e vínculo posterior sem nova baixa: **“Permitir uma ou mais refeições”**. A pergunta explicitava mesma unidade e distribuição não superior à quantidade retirada.

Esta decisão resolve DOM-05 neste recorte: a requisição rápida pode nascer sem refeição, e cada item retirado poderá ser distribuído em várias refeições reais da mesma unidade. A exceção ao FK inicial obrigatório de RF-013 aplica-se à requisição rápida no modo Posterior; não elimina o vínculo exigido na saída comum de consumo nem aprova DOM-01–04. A fonte DRS é preservada, com esta revisão explícita documentada. Não há aprovação institucional presumida.

## Contrato de conciliação C1

`WithdrawalAllocationInput` contém `revisao` textual e `destinos`, lista de pares `cardapio_refeicao_id`/`quantidade`. É a substituição integral da distribuição de **um item da retirada**, não um incremento sobre a lista anterior. IDs e quantidades permanecem strings: até 12 inteiros e seis decimais, sem arredondamento binário. A lista pode estar vazia (pendência) ou parcial; o total não excede a quantidade original. Uma refeição aparece uma vez por item. Limite técnico de payload: 100 destinos por atualização; não limita o número de refeições do restaurante. A revisão será comparada atomicamente com a persistida em C2; C1 só valida sua representação.

`validateWithdrawalAllocation` exige contexto confiável lido pelo servidor: unidade e quantidade original do item, refeições existentes e suas unidades. Rejeita destinos desconhecidos/de outra unidade e contextos duplicados/ambíguos. Não aceita autoridade, unidade, estado, autor ou quantidade original no payload. Calcula com BigInt em milionésimos; não altera os argumentos. **Não autoriza nem substitui FK/RLS/locks.** Não usa calendário CAD-007 como se fosse uma refeição de cardápio e não cria refeição fictícia.

## Próximas etapas da mesma issue

1. C2: cabeçalho/itens da retirada, vínculo 1:N por item/refeição, revisão, trilha e configuração efetiva (modo/revisão) capturada no registro. Identidade da sessão e pessoa que retirou devem permanecer distinguíveis. Política FEFO, desempate e tratamento de validade ausente precisam de contrato antes de sua implementação.
2. Baixa Posterior atômica: período/unidade → documento → saldos ordenados por unidade/lote/local; agregar itens repetidos antes de validar; revalidar validade, perfil/unidade e saldo após locks. Documento/movimento/saldo/auditoria/resultado idempotente na mesma transação. Falha não deixa débito parcial; dupla submissão não debita duas vezes. Modo Prévia permanece sem baixa imediata e fora desta primeira jornada rápida.
3. Conferência/contestação por nutricionista ou gestor distinto do solicitante, com autorização vigente, motivo ao contestar e sem segunda baixa ou estorno automático. Correções por eventos próprios conforme RN-010; não editar movimento confirmado.
4. C3/C4: API com Repository/Service/Controller próprios e tela simples, acessível em celular/tablet, solicitação e confirmação claras. Integrar sem importar `legacy/`.
5. Consumidor de conciliação após existir refeição real de cardápio: lock/revisão impedem duas distribuições concorrentes de exceder o retirado; substituir lista com auditoria, preservando movimento original. Troca de destino não muda estoque nem solicitante.
6. Jornada sintética no staging com negações de perfil/unidade, validade, concorrência, repetição e rollback; comprovar preservação de dados existentes antes de marcar entrega funcional.

## Rastreabilidade e verificação

| Critério | Artefato atual | Limite |
| --- | --- | --- |
| DOM-05: 1:N e soma limitada | `packages/contracts/src/withdrawals.ts`, `apps/api/src/withdrawals.test.ts` | Invariante pura; não há conciliação persistida |
| RNF-002: unidade do destino | Contexto validado e testes de refeição ausente/outra filial | Não comprova RLS ou autorização HTTP |
| Precisão/excesso/payload | Testes de 0.1+0.2, um milionésimo excedente, máximo decimal, duplicidade e autoridade injetada | Sem banco conectado ou movimento novo |
| RN-008/011: baixa única | Requisitos da próxima C2 acima | Ainda não implementada |

Verificação local em 17/11/2026: `npm run check` aprovado (lint, typecheck, testes e builds/dry-runs). Quatro testes novos de contrato e 130 testes Node existentes passaram; configurações 54 passaram/5 de concorrência nativa omitidos no PGlite, estoque 50 passaram/7 nativos omitidos, legado 3 e provisionamento 3 passaram. `git diff --check` aprovado. Não foi executado novo navegador local, pois não houve alteração na View; CI/PR registram seus resultados próprios. Testes de banco, concorrência e navegador **da saída** só serão evidência quando os consumidores existirem. Nenhuma alteração de dados pessoais, permissões do ADMIN, banco hospedado ou deploy neste recorte.
