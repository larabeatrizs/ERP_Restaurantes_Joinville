# WEB-001 — Primeiro painel de configurações

Especificação iniciada em 06/11/2026; implementação/verificação em 09/11/2026. Recorte C4 sobre API-001/CONFIG-001. Branch `feat/web-001-configuracoes`. Staging compartilhado e integração à main conforme ADR-002; nenhum ambiente permanente novo.

## Especificação antes da implementação

- Login por email/senha com Supabase Auth, usando somente URL/chave publicável no frontend. O token é obtido pelo SDK e enviado à API; sessão local é UX, enquanto getUser/RLS no backend continuam a autoridade. Sem colagem de token, credencial administrativa ou login fictício de fallback.
- GET autenticado `/api/unidades` lista somente unidades ativas vinculadas ao usuário pela RLS. Seleção por nome, sem pedir IDs técnicos. Sem unidades: estado vazio, sem inventar cadastros de produção.
- Painel compõe o shell e componentes do Style Guide; somente Configurações tem navegação funcional neste recorte. Não simular módulos prontos. Tela de Configurações não existe como frame original; é composição nova com padrões existentes, não redesign do HTML mestre.
- Editar apenas parâmetros suportados pela API: modo de saída, margem, validade, prazo de amostra, periodicidade e referência de preço. Preferência de email não será anunciada como envio funcional; aprovações, parâmetros globais e histórico HTTP não terão controles fictícios.
- Revisar diferenças Antes/Depois, exigir motivo e enviar PATCH com If-Match. Cancelar não escreve. Restaurar valores de referência numéricos/preço passa pela revisão; não inventar modo de saída padrão universal nem alterar aprovação obrigatória de perda.
- Erros e conflito mantêm edição. Em 412, obter versão atual, comparar e reaplicar somente os campos alterados pelo usuário, preservando alterações remotas dos demais campos. Exigir nova revisão antes de salvar; nunca sobrescrever silenciosamente.
- Consulta sem capacidade de edição é somente leitura. Troca de unidade e saída com alterações pedem descarte explícito; mudanças não podem vazar entre unidades. Confirmar navegação externa com alterações não salvas.
- Campos com rótulo/ajuda/erro, botões de pelo menos 44 px, foco visível, teclado, mensagens não dependentes só de cor e layout sem rolagem horizontal em 360/768/1280 px.

## Referência verificada

Extração estática dos manifests/templates do HTML original, sem alteração do arquivo. Frames Login e Cadastro de produto têm fundo #FAF7F5, vinho #5B0F1A, texto #1F1517, borda #E6DEDB, foco vinho, fontes DM Sans (títulos) e Manrope (corpo), lateral de 248 px, campos/botões 44 px, cartões raio 12 px e campos raio 8 px. Fontes e logo reutilizados do próprio arquivo, com avisos OFL preservados em public/fonts/OFL-notices.txt. Não usar serviços externos de fontes.

## Verificação planejada e limites

Testes de navegador com respostas Auth/API sintéticas: login, leitura, consulta, edição/revisão/salvamento, erro, conflito/reaplicação, troca de unidade, readonly, formulário inválido e viewport móvel. Testes SQL/API existentes continuam cobrindo autorização e concorrência. Browser descartável/CI não é ambiente permanente adicional.

Uma sessão/API simulada no navegador não comprova integração com o Supabase staging. Sem variáveis reais, a tela deve explicar que o acesso não está configurado, sem pedir chaves ao usuário final. Login inicial não encerra RF-008: senha temporária, recuperação, bloqueio por tentativas, inatividade configurável e MFA continuam exigindo integração/revisão próprias. Configurações globais, regras de aprovação e trilha na UI ficam para próximos recortes.

## Implementação e rastreabilidade

| Fonte / alcance parcial | View e contrato | Backend / dados | Evidência |
| --- | --- | --- | --- |
| RF-006/008, RNF-002/003 | App/Auth e seleção por nome; GET /api/unidades | sessão getUser; unidades ativas sob RLS; IDs bigint textuais | testes HTTP/adaptador de listagem e browser de login/consulta/troca |
| RF-010/013/016/037, RN-014/031/033/036, seção 15.4 | SettingsPanel: margem, modo, referência, dias e prazos | SettingsApi → settingsController → SettingsService → repository → parametro_unidade | revisão/cancelamento, PATCH parcial, validação e restauração sem alterar modo/email |
| RNF-008/010/011 | motivo, revisão, conflito e reaplicação somente do diff local | API-001/CONFIG-002, auditoria/RPC atômicas; nenhuma migration nova | browser de 412, testes SQL existentes de rollback/revisão/concorrência |
| RNF-009/015, Style Guide | rótulos, ajuda, erro, foco, diálogo nativo e decimal com vírgula | regras compartilhadas em packages/contracts | teclado e layouts 360/768/1280 px; capturas revisadas |

`apps/web/src/services/auth.ts` encapsula o SDK; `services/api.ts` encapsula HTTP e valida retorno/unidade/ETag. A View não consulta tabelas nem calcula autorização administrativa. O token vai à API por Bearer; RLS e o servidor continuam autorizando cada chamada. A sessão usa o armazenamento padrão do SDK, sem guardar senhas próprias. Consulta/edição seguem `pode_editar` para UX e a autorização é novamente exigida no PATCH. Respostas atrasadas ao trocar unidade não substituem a configuração atual.

A restauração prepara valores de referência (5%, 7 dias, 72 h, inventário 7 dias, menor cotação), sem escrever antes da confirmação. Preserva modo de saída e preferência de email. O painel persiste parâmetros; os módulos de estoque/planejamento/alertas que consumirão esses valores ainda não foram implementados. Este recorte não demonstra os CA operacionais desses módulos nem encerra os cinco itens DOM-001.

## Resultados locais

- `npm run check`: lint, tipos, **27 testes HTTP/adaptador**, SQL em PGlite (**27 passaram, 1 concorrente omitido**) e builds passaram. O job PostgreSQL 17 do CI continua sendo a verificação de duas conexões reais. Dry-run do Worker não fez deploy.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:web`: **13 testes passaram** no Edge local. Auth/API têm respostas sintéticas; cobrem login, revisão, cancelamento, PATCH/ETag, 401/403/503, conflito/reaplicação, consulta, lista vazia, validação, descarte negado/confirmado, restauração e teclado/responsividade. O CI acrescenta Chromium descartável; resultado remoto deve ser conferido na PR.
- Comparação visual manual das capturas com Login e Cadastro do Style Guide: cores/fontes/assets, lateral de 248 px, campos/botões de 44 px e raios preservados. O login segue o frame original; Configurações é composição nova. Sem teste automatizado de pixel diff, leitor de tela ou certificação WCAG completa; aceite visual institucional continua pendente.
- Verificação adicional sem variáveis de Auth: mensagem de acesso não configurado, formulário desabilitado e nenhuma chamada remota observada. Servidor local de verificação encerrado após o teste.

Capturas sem dados pessoais: [login implementado](../evidencias/web-001/login-1280.png), [login de referência](../evidencias/web-001/referencia-login.png), [cadastro de referência](../evidencias/web-001/referencia-cadastro.png), [painel desktop](../evidencias/web-001/painel-1280.png) e [painel móvel](../evidencias/web-001/painel-360.png). Referências renderizadas a partir dos templates locais, com scripts removidos e rede externa bloqueada; HTML mestre intacto. `node scripts/extract-styleguide-assets.mjs` reproduz a extração dos assets, preservando seus avisos de licença.

## Continuidade

O rascunho vive na memória da tela: erros HTTP preservam a edição enquanto ela estiver aberta. Logout efetivo, encerramento global da sessão pelo SDK ou recarga não oferecem retomada automática. A confirmação de descarte cobre saída/troca iniciadas pela pessoa; não há promessa de recuperação após encerramento externo da sessão.

Próximo gate: integrar e validar no staging compartilhado existente com inventário/plano de migrations, identidade/vínculos/capacidades e exposição somente de `erp`. Não executar limpeza, usar credencial administrativa no browser ou anunciar login real antes dessa verificação. AMB-001/issue #9 continua congelada. A FND-000 permanece dependente de evidências próprias, incluindo snapshot remoto; este avanço visual não basta para fechar a issue.

Fontes técnicas: [Supabase signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [getSession](https://supabase.com/docs/reference/javascript/auth-getsession) e [Playwright webServer](https://playwright.dev/docs/test-webserver). getSession fornece o token ao cliente e não substitui a validação getUser/RLS no servidor.

## Publicação e CI observado

PR [#10](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/10), implementação `bf0cf13`: [execução 42610596725](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42610596725) concluída com **success** nos jobs check, database-postgres e browser. Logs confirmam **27 testes HTTP/adaptador**, **28 SQL sem omissão no PostgreSQL 17**, incluindo concorrência, e **13 testes Chromium**. Auth do navegador e identidade do laboratório SQL são simuladas; não equivalem ao Supabase hospedado. Commit posterior de documentação exige conferir seu próprio CI antes do merge.
