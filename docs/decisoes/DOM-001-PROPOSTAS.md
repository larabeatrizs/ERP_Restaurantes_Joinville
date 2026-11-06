# DOM-001 — Propostas para consolidar a fase B

Data: 06/11/2026. **Status: propostas pendentes de decisão da responsável do projeto.** A autorização para prosseguir com o trabalho não foi interpretada como aprovação destas regras. Não aplicar permissões ou migrations a partir deste registro enquanto os itens pertinentes ao recorte não forem decididos.

**Direção posterior da responsável:** parametrizar as variações possíveis por painel, com baixo acoplamento e baixa complexidade. O encaminhamento está em [CONFIG-001](../fundacao/CONFIG-001.md). A arquitetura de configuração está definida nesse sentido; as cinco propostas abaixo passam a ser candidatas a presets/políticas, não regras únicas fixas aprovadas em bloco. Isso não torna invariantes de integridade opcionais nem concede aprovação aos valores ainda propostos.

Fontes e evidências: [SEC-001](../seguranca/SEC-001.md), [transações](../dados/TRANSACOES_ESTOQUE.md), [DATA-001](../dados/DATA-001.md) e DRS v1.3. A conferência textual do PDF confirmou que as divergências de permissões estão no documento, não apenas na conversão Markdown.

## Propostas prioritárias

| ID | Recomendação concreta | Alteração/ressalva necessária | Critério a verificar após decisão |
| --- | --- | --- | --- |
| DOM-01 | No RP1, nutricionista aprova qualquer perda; gestor da unidade atua como substituto somente se configurado como tal. Quem lança nunca aprova. | Conciliar a célula C da nutricionista na matriz com RN-020/RF-015/CA-022; confirmar formalmente a substituição, sem presumir que Admin ou Central pode aprovar. | Perda pequena fica pendente; autor e usuário não autorizado são negados; titular/substituto configurado aprova uma vez. |
| DOM-02 | Nutricionista pode consultar, lançar e atualizar cotações; preservar os poderes já descritos de gestor e estoquista até revisão específica. | Adicionar explicitamente escrita da nutricionista na matriz em conformidade com RF-033/refinamentos; não retirar silenciosamente permissões existentes. | Alteração gera revisão/histórico, não muda cotação anterior usada no relatório; papel sem acesso continua negado. |
| DOM-03 | Transferência entre câmaras exige aprovação prévia do gestor da unidade, por pessoa diferente de quem lançou. | Segue RN-011 e requer corrigir a tabela sem aprovação e conceder A ao gestor nessa operação. Esta escolha de aprovador é proposta, não regra já aprovada. | Antes da aprovação não há transferência efetiva; ao aprovar, débito/crédito no mesmo lote/unidade somam zero; falha reverte ambos. |
| DOM-04 | No primeiro recorte de inventário, uma contagem só pode ser aprovada se a referência de movimentos do lote/local não mudou desde o registro; se mudou, exigir nova contagem. Não manter locks durante a contagem humana. | Política conservadora proposta; validar viabilidade operacional. Alternativa: protocolo de contagem com pausa controlada ou reconciliação temporal, a especificar antes de implementar. | Consumo após a referência impede aplicar diferença obsoleta; duas aprovações não duplicam ajuste. |
| DOM-05 | Requisição rápida registra retirada imediatamente no modo Posterior, mesmo sem vínculo inicial com refeição; conciliação posterior registra o destino com trilha e sem novo débito. | Formalizar exceção ao vínculo obrigatório de RF-013; definir se uma retirada pode atender mais de uma refeição antes de fixar a cardinalidade física. Não criar refeição fictícia. | Registro baixa uma vez por lote; conciliação só na mesma unidade; sem dupla contagem nem perda do responsável original. |

A aceitação pode ser por item, com ajuste da proposta. Para cada decisão, registrar responsável, data, texto final, fonte alterada e critério afetado. Um merge técnico de PR documental não substitui essa decisão de produto.

## Questões que não precisam bloquear toda a fundação

- Atendimento/CA-015, perfil de caixa e privacidade: resolver antes de implementar o módulo de atendimento; não coletar dados pessoais antecipadamente.
- Abertura de saldo por importação: resolver autoridade do aprovador antes do endpoint de abertura, distinguindo a carga de cadastros sem efeito de saldo.
- Série/chave da NF, desempate FEFO e alcance de edição de catálogos: especificar antes dos respectivos constraints/contratos executáveis.
- MET-001: ratificar a nomenclatura SDD antes da primeira implementação de negócio; bootstrap técnico e revisão documental não representam essa ratificação.
- Região, staging, orçamento e recuperação: preparar plano operacional; não criar recursos pagos ou modificar produção por consequência desta discussão.

## Sequência de revisão

1. Revisar a PR de auditoria e skills, sem fechar FND-000 por mera integração documental.
2. Revisar a PR do bootstrap e conferir o CI remoto.
3. Revisar a PR de modelagem, decidir os itens do recorte e refletir a conclusão em SEC-001, transações e matriz, preservando histórico do DRS.
4. Implementar migrations e testes da C2 em ambiente isolado somente quando o desenho e os contratos pertinentes estiverem revisados. Os pontos não resolvidos ficam explicitamente fora do recorte, sem serem considerados implementados.
