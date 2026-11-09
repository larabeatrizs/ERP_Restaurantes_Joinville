# Revisão da fundação — publicação e evidências

Data: 06/11/2026. As PRs estão em rascunho e encadeadas; nenhuma foi integrada por esta tarefa.

**Atualização posterior:** por autorização expressa para manter main atualizada, PRs #3–#7 foram marcadas prontas e integradas, em ordem, com merge commits. main alcançou `88ec253` antes da API-001. A descrição inicial e a tabela abaixo registram a pilha de revisão histórica, não o estado atual de PR aberta. A política de integração agora segue ADR-002.

| Ordem | PR | Base → branch revisada | Escopo |
| --- | --- | --- | --- |
| 1 | [#3](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/3) | main → docs/fnd-000-auditoria-skills | Auditoria FND-000, skills e governança |
| 2 | [#4](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/4) | docs/fnd-000-auditoria-skills → feat/mono-001-fundacao | Bootstrap, testes HTTP e workflow |
| 3 | [#5](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/5) | feat/mono-001-fundacao → docs/data-001-modelagem | Modelagem, contratos e propostas de decisão |
| 4 | [#6](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/6) | docs/data-001-modelagem → feat/db-001-configuracoes | C2.1: primeira migration de configuração/identidade, RLS e laboratório SQL |
| 5 | [#7](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/7) | feat/db-001-configuracoes → feat/config-002-salvamento | C2.2: salvamento mediado, revisão, auditoria e teste concorrente |

Depois de integrar a primeira PR, conferir a base da seguinte e atualizar para main conforme a estratégia de merge, preservando commits e evitando repetir alterações já integradas. Não usar force-push ou integrar a pilha inteira sem revisão por consequência da publicação.

## CI observado

- Bootstrap `ffb174b`: [execução 42284466740](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42284466740), resultado **success**.
- Modelagem/propostas `cef0e9f`: [execução 42284470353](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42284470353), resultado **success**.
- C2.1 `c45133f`: [execução 42287219801](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42287219801), resultado **success** nos jobs `check` e `database-postgres`; inclui suíte SQL de 16 casos em PostgreSQL 17 descartável, além do laboratório PGlite e checks do monorepo.
- C2.2 `39127bb`: [execução 42288899180](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42288899180), resultado **success** nos dois jobs; 28 casos SQL passaram no PostgreSQL 17, incluindo concorrência real com duas conexões e revisão esperada.

Em ambos, `npm ci` e `npm run check` completaram no runner Linux, incluindo lint, tipos, cinco testes HTTP e builds. Essas execuções comprovam a verificação do bootstrap nos commits indicados. Não validam SQL, policies, estados do ERP, revisão visual, recuperação de backup ou ambiente de produção. Novos commits exigem conferir a execução correspondente antes do merge. A PR de auditoria não introduz workflow próprio.

## Decisões e continuidade

[DOM-001](../decisoes/DOM-001-PROPOSTAS.md) reúne cinco propostas prioritárias. A responsável foi consultada sobre adotar o conjunto ou ajustar itens; até existir resposta explícita, o status continua pendente. A publicação das PRs e o CI verde não aprovam essas regras de produto.

A [issue #2](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/2) continua aberta: não há evidência nova de inspeção visual ou snapshot remoto do banco. Nenhum deploy, mudança de banco, aprovação de produto ou merge ocorreu nesta publicação.

## Continuidade após a pilha inicial

PRs #3–#7 integradas à main sob autorização da responsável, com merge commits e checks existentes verificados; main chegou a `88ec253`. A [PR #8](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/8) entrega API-001 e ADR-002. CI do commit `b29da35`: [42291658272](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42291658272), success. Ao concluir a integração, main e a branch ativa devem ser sincronizadas. A pendência de separar ambientes está congelada na issue #9. As notas anteriores de rascunho/ausência de merge são o histórico da publicação inicial.

Em 09/11/2026, API-001 já está integrada (`cda520f`). A [PR #10](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/10) acrescenta [WEB-001](../fundacao/WEB-001-CONFIGURACOES.md): login e painel por unidade, com revisão, motivo e conflito. CI de `bf0cf13`, [42610596725](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42610596725), success: checks, 28 SQL PostgreSQL 17 e 13 Chromium. Capturas locais foram comparadas com Login/Cadastro do Style Guide. Isso avança a evidência visual, sem encerrar FND-000: snapshot remoto, integração com Auth/RLS hospedados e demais gates continuam pendentes. Não houve deploy, aplicação de migrations hospedadas ou criação de ambientes.
