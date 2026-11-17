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

Estado inicial: implementado localmente, verificações/CI/migration/deploy/jornada serão registrados após executar. A jornada real deve inativar e reativar somente o operador sintético reservado, preservando os registros de auditoria/revisão; nunca usar a conta pessoal. Rollback de runtime conserva schema/auditoria aditivos. SMTP, rede/VPN/Access, segurança integral RF-008, skeleton, carga real final e AMB-001 mantêm decisões vigentes. Não fechar issues automaticamente nem tratar merge como aceite operacional.
