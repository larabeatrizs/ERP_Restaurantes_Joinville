---
name: erp-entregas
description: "Preparar incrementos SDD, revisar entregas, PRs e critérios de fechamento de issues do ERP Restaurantes Populares de Joinville. Use para rastreabilidade e evidências de entrega, sem impor o processo a outros repositórios."
---

# Entregas do ERP Joinville

Confirme a raiz e o produto pelo `docs/PROJETO.md`. Caminhos abaixo são relativos ao repositório, mesmo se a skill estiver no perfil do usuário. Leia `docs/planejamento/RECONSTRUCAO_SDD.md`, a issue e a seção do DRS correspondente ao recorte.

## Preparar o incremento

Identifique objetivo, fora de escopo, IDs RF/RN/RNF/CA, tela/estado, dependências e condição de saída. Siga os templates existentes em `.github/`. SDD é a interpretação operacional documentada; verifique sua ratificação antes da primeira implementação funcional, sem presumir nova decisão.

Considere a ordem B → C1 → C2/C3/C4 conforme contratos estáveis, depois integração e operação. Não exigir a implementação de todos os módulos para validar uma jornada. Preservar o escopo e prioridades da seção 15.2 do DRS.

Use branch e PR conforme autorização existente. Confira alterações locais antes de trocar branch e não substitua trabalho do usuário. Artefatos novos pertencem a `apps/web`, `apps/api`, `packages/contracts` e migrations próprias; `legacy/` permanece histórico.

## Verificar e reportar

Compare cada critério da issue com evidência concreta, preferindo arquivo/linha, commit, resultado de comando ou teste e ambiente/data. Um teste planejado não é teste executado. Merge não comprova deploy, e deploy não comprova aceite operacional.

Escolha verificações proporcionais à mudança: revisão de links/consistência para documentação; build e testes de regras para código; cenários negativos de perfil/unidade para autorização; rollback/concorrência para estoque quando pertinente. Não declarar CI verde se não foi consultada.

Snapshot de banco antigo deve ser rotulado como histórico. Não afirmar que grants, policies ou dados atuais coincidem com SQL versionado sem consulta pertinente. Nunca publicar segredos, dados pessoais ou tokens como evidência.

## Fechamento

Monte tabela critério → evidência → limite. Feche uma issue somente quando os critérios estiverem demonstrados e o usuário tiver autorizado o fechamento. Se faltar evidência, mantenha aberta e informe o trabalho restante, sem confundir decisões abertas permitidas pelo escopo com falha de implementação. Para FND-000, consulte `docs/auditoria/FND-000.md`; fechamento não significa FND_READY.

Publicação de comentário, issue, PR, push ou merge depende da autorização da conversa. A skill não a concede e não exige repetir autorização já recebida. Recursos pagos, alterações destrutivas e produção continuam sujeitos ao escopo autorizado e às condições documentadas.

Entregue o resultado com commit/PR quando existirem, verificações reais, limitações e dependências. Se executor ou integração falhar, preserve arquivos revisáveis e informe precisamente o que não foi publicado ou validado.
