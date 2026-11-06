# ADR-002 — Staging compartilhado durante a construção

Data: 06/11/2026. **Decisão expressa da responsável do projeto nesta conversa.** Substitui a exigência de provisionar ambientes permanentes separados durante a construção; não altera requisitos funcionais nem declara produção liberada.

## Decisão

O ambiente existente é tratado como **staging compartilhado para desenvolvimento e testes**. Não provisionar por enquanto ambientes permanentes adicionais de desenvolvimento/testes/produção. As alterações de trabalho devem ser commitadas, verificadas e integradas à main; main é a linha de integração do staging, não sinônimo de produção pronta.

Branches continuam úteis para alterações revisáveis. Publicar PR, conferir os checks e integrar; depois atualizar main e a branch ativa para incluir a integração. Não deixar a pilha de PRs em rascunho indefinidamente depois de um recorte verificado. Merge técnico não fecha issue incompleta, aprova todos os presets nem comprova deploy.

Testes locais em memória e serviços PostgreSQL descartáveis do CI continuam permitidos: são execuções temporárias, não ambientes permanentes a provisionar. Não congelar RLS, testes negativos, auditoria, secrets ou validação de integridade. A classificação como staging não elimina as regras de acesso do sistema.

## Pendência técnica congelada: AMB-001

**Estado: congelada até o encerramento funcional do projeto**, por determinação da responsável. Escopo: provisionar e separar os ambientes permanentes de produção e desenvolvimento/testes, configurar credenciais distintas, destinos de pipeline, domínios/origens e procedimentos de promoção.

Backlog oficial: [issue #9 — AMB-001 congelada](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/9). O registro é uma pendência futura, sem criação de recursos nesta etapa.

No encerramento, executar plano revisável de limpeza do staging, reconstrução por migrations, validação de integridade e carga inicial necessária; depois preparar e validar os ambientes separados antes da entrada em produção. A instrução atual define a etapa futura, **não autoriza um DROP/TRUNCATE/reset imediato** nem presume que todos os registros devam ser descartados sem inventário.

Critérios para descongelar: recortes funcionais concluídos/revisados; inventário dos dados e dependências; plano de backup/retorno e de limpeza; testes de reconstrução e autorização; responsáveis e destinos confirmados. Nenhuma limpeza foi executada por este ADR.

## Consequências no plano

- C2/C3/C4 podem avançar no staging compartilhado, sem exigir a criação de outro ambiente permanente como gate de desenvolvimento.
- Requisitos de isolamento por **unidade de restaurante** continuam obrigatórios; não se confundem com isolamento entre ambientes de hospedagem.
- Gates de separação de ambientes e promoção para produção passam para AMB-001 ao fim; não marcar o projeto pronto para produção antes deles.
- Migrations, seeds sintéticos, testes efêmeros, logs sem segredos e trilha de alterações continuam versionados. Reset do banco não é usado como substituto de correções reproduzíveis.
- Identidade, configuração e acesso do staging remoto ainda devem ser conferidos pelas ferramentas disponíveis antes de operações remotas. O rótulo de staging foi definido pela responsável, não por uma auditoria técnica da conta nesta tarefa.
