# ADM-006 — Ativação e inativação de usuários

Data: 17/11/2026. [Issue #50](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/50), continuidade de [ADM-005](ADM-005-CONSULTA-E-EDICAO.md)/#19/#31. DRS 4.2 (ADMIN I/X, gestor central/auditor C), 7.1 (ativar/inativar), RF-008, RN-012/RN-022 e RNF-003/007/008/009/011. Fases B/C2/C3/C4 + integração do staging compartilhado ADR-002.

## Contrato do recorte

No Configurador, **Usuários → Situação** abre o nome e a situação atuais. Para contas que concluíram o primeiro acesso, ADMIN com capacidade **USUARIO_CICLO_VIDA** pode alternar **ATIVO ↔ INATIVO**, com revisão atual, motivo obrigatório e confirmação identificando a pessoa. Capacidade X já reservada em ADM-002, concedida somente ao perfil ADMIN conforme DRS; USUARIO_GERIR (I) sozinho não permite ciclo de vida. Consulta de gestor central/auditor preservada; não recebem a capacidade X. Nenhuma capacidade operacional adicional.

O recorte mantém a proteção conservadora do próprio acesso: outro administrador deve alterar sua situação. O último ADMIN ativo deve permanecer; o mesmo lock usado na edição protege corridas entre alteração de perfil e inativação. Essas barreiras técnicas não são aceite institucional nem ampliam a decisão anterior sobre autogestão. Nome, perfil, unidades, login, email e senha não mudam nesta ação. Reativar restabelece o acesso com perfil/vínculos atuais; não devolve vínculos retirados nem cria outros. Vínculos indisponíveis continuam sendo tratados pela seleção de unidade/cadastro.

**BLOQUEADO e primeiro acesso não são inativação.** Contas pendentes ou bloqueadas não podem ser liberadas nem canceladas por esta ação, mesmo que o campo de status esteja inconsistente com o marcador de primeiro acesso. A View explica o fluxo próprio e não oferece botão de ativação. Cancelamento de convite, desbloqueio de segurança e exclusão de identidade permanecem próprios, sem redefinição/remoção de credenciais ou histórico.

## Segurança, dados e comportamento de sessão

`GET/PATCH /api/admin/usuarios/:id/situacao` existe somente no Configurador; a origem ERP mantém todo namespace administrativo bloqueado. DTO estrito aceita somente status ATIVO/INATIVO, revisão positiva em texto bigint e motivo de 3–500 caracteres sem controles. Status BLOQUEADO, identidade/ator, perfil, vínculos e credenciais são recusados. API valida identidade no Auth; a RPC `erp.admin_usuario_situacao` é invoker com EXECUTE somente service_role e delega ao definer privado de owner `erp_user_admin` (NOLOGIN/NOBYPASSRLS/search_path vazio), sem novos grants de tabela ao owner.

Escrita usa o lock global `erp.admin_edicao` e bloqueia ator/alvo em ordem antes de conferir status/capacidades atuais. Mudança de status, incremento da revisão compartilhada e evento **ALTERAR_SITUACAO** com antes/depois/motivo são atômicos. Revisão obsoleta retorna 412; no-op com revisão atual não gera novo evento. Falha de auditoria desfaz a mudança. A mesma revisão impede que a edição ignore uma alteração de situação concorrente. A única concessão de perfil nova é ADMIN/USUARIO_CICLO_VIDA, idempotente e baseada em código, sem IDs gerados ou seed de contas.

Inativação nega o login do ERP e novas operações autorizadas por domínio/RLS mesmo com token anterior. **Não exclui/revoga o JWT no Supabase Auth** nem promete apagar dados já mostrados/baixados no navegador. Auth permanece a identidade; a situação atual do domínio governa as operações. [Referência de identidade/usuários](https://supabase.com/docs/guides/auth/managing-user-data). Expiração por inatividade, bloqueio por tentativas e controles integrais de sessão continuam próprios de RF-008.

View independente da edição: campos do cadastro não são perdidos por trocar de formulário, pois as ações concorrentes ficam indisponíveis. Motivo e erro são preservados no conflito/falha; recarregar/fechar exige confirmação de descarte. Nome atual aparece antes de confirmar; foco vai ao motivo; carregamento/salvamento/readonly/pendência possuem feedback. Shell e estilos existentes são reutilizados, sem novo frame institucional nem mudanças no HTML mestre.

## Rastreabilidade e verificação

| Fonte | Artefato | Evidência exigida |
| --- | --- | --- |
| DRS 4.2/7.1/RF-008 | capacidade X, `UserStatusPanel`, DTO/RPC | I sem X negado, consulta readonly, confirmação/motivo |
| RN-012/RNF-003 | ator corrente/lock compartilhado | autogestão, pendente/bloqueado, token anterior, concorrência mista e revogação |
| RN-022/RNF-008/010 | revisão/evento atômico | 412/no-op e rollback após falha na auditoria |
| RNF-007/009/011 | campos limitados e View existente | sem Auth Admin/reset; acessibilidade/erros/360/768/1280 |

## Resultado executado em 17/11

**Publicado/verificado** no [Configurador](https://erp-joinville-configurador.erp-restaurantes-joinville.workers.dev), [PR #51](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/51). Usar o login/senha atuais; em **Usuários → Situação**, informar motivo e confirmar Inativar/Reativar. Contas próprias, pendentes e BLOQUEADAS exibem explicação sem liberar a ação; edição/cadastro/CSV anteriores preservados.

Runtime `e305421bcaa8c89d807c59ae5e8d2be69a0c98e7`, [CI do runtime com quatro jobs aprovados](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/44145088853): **130 Node**, **84 navegador**, **59 configurações e 57 estoque no PostgreSQL nativo**. Local: `npm run check` aprovado, 130 Node, configurações 54 aprovados/5 omissões concorrentes e estoque 50/7 no PGlite, legado/provisionamento 3+3, lint/tipos/builds; **18 testes da tela** aprovados no Edge. Concorrência nativa cobre inativação cruzada, edição versus inativação e retirada de X durante espera. Avisos existentes de chunk acima de 500 kB e atualização disponível do Wrangler mantidos, sem atualização de dependências.

Migration **`20261117181642_situacao_administrativa_usuarios`**, MD5 local/conectado **`9d0243d3ed23d75b09436e7441f4a806`**. Arquivo local renomeado para o timestamp realmente aplicado, mantendo o corpo imutável. [Verificação de banco](../evidencias/adm-006/verificacao-banco.json): 15→16 migrations; 25 tabelas ERP/cinco privadas com RLS. Oito usuários, campos anteriores exceto revisão, vínculos, contatos e logins preservados por comparação de hashes. **Única concessão:** ADMIN/USUARIO_CICLO_VIDA, sem remoção ou capacidade operacional adicional. Owner sem LOGIN/SUPERUSER/BYPASSRLS/CREATE/membership de authenticated; RPC invoker apenas service_role, anon/authenticated sem EXECUTE.

[Jornada real sem mocks](../evidencias/adm-006/jornada-hospedada.json): View inativou e reativou somente o operador sintético reservado. Token anterior continuou válido no Auth, mas estoque foi negado com 404 e login ERP com 401 enquanto inativo; após reativação, o mesmo token voltou a ler estoque e a senha anterior continuou válida. Ator sem capacidade/revisão obsoleta recusados. A consulta própria não oferece a ação e a tentativa sem retirar acesso foi negada; autoinativação efetiva e proteção de ADMIN também foram exercitadas no laboratório/CI. Nenhuma conta pessoal foi fixture.

Dois eventos ALTERAR_SITUACAO preservados, auditoria **11→13**, seis eventos EDITAR anteriores intactos; revisão da fixture **7→9**, sem reset. Nome/perfil/unidades/identidade/senha não mudaram. [360 px](../evidencias/adm-006/situacao-hospedada-360.png) e [1280 px](../evidencias/adm-006/situacao-hospedada-1280.png) são imagens **do staging, exclusivamente sintéticas**, inspecionadas; foco e ausência de overflow também verificados em 768 px. Não representam aceite visual institucional.

Versões Cloudflare: identidade privada `8286fc62-1a19-4af1-a089-dd3b9df9d4cd`, Configurador `9e44e295-a051-40d2-bdac-cf50ab6c1409`, ERP `297e253a-72b0-499c-b103-100b9633eb7c`. Key administrativa continua somente no serviço privado. Advisor pós-DDL mantém INFO das [14 tabelas legadas contidas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e WARN de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sem nova categoria; não declarar zero avisos.

Rollback de runtime conserva schema/auditoria aditivos e não apaga os eventos. Cancelamento de convite, desbloqueio, identidade, exclusão elegível, filtros/ordenação adicionais, SMTP, rede/VPN/Access e segurança integral RF-008 permanecem próprios. Skeleton, carga real final e AMB-001 mantêm decisões vigentes. CI do commit final e sincronização/merge são registrados na PR; nenhuma issue é fechada automaticamente nem merge equivale a aceite operacional.
