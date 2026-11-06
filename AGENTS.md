# ERP Restaurantes Populares de Joinville

Leia `docs/PROJETO.md` e a seção pertinente do DRS antes de alterar comportamento. O DRS define RF/RN/RNF/CA e prioridades; o Style Guide define a referência visual. Preserve IDs e registre conflitos sem criar regras por inferência. Decisões técnicas não equivalem a aceite institucional.

O código de `legacy/` é somente histórico. A aplicação nova será construída em `apps/web`, `apps/api` e `packages/contracts`, com migrations próprias. Não usar o legado em imports, workspaces ou deploys novos.

Para especificar ou revisar requisitos e documentação, use a skill local `.agents/skills/erp-requisitos/SKILL.md`. Para preparar incrementos, PRs ou verificar fechamento de issues, use `.agents/skills/erp-entregas/SKILL.md`. Leia apenas a skill pertinente; elas também são portáveis para outros assistentes que leiam Markdown.

O índice da auditoria está em `docs/auditoria/FND-000.md`. Diferencie situação histórica, proposta e evidência atual. A matriz é um mapa de investigação, não prova de implementação. O backlog operacional pertence às Issues; os códigos no plano são propostas até haver issue vinculada.

Trabalhe em branch e PR, preservando alterações locais existentes. Registre os testes efetivamente executados e suas limitações. Fechar issue exige comprovar os critérios aplicáveis; merge documental não demonstra implantação.

Este arquivo não amplia a autorização do usuário: nenhuma skill autoriza sozinha gastos, publicação, comunicação externa ou alteração de banco conectado. Considere a autorização já existente na conversa antes de pedir confirmação.
