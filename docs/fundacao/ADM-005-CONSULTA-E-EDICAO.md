# ADM-005 — CSV de usuários e preparação de edição

Data: 17/11/2026. [Issue #48](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/48), continuidade de [ADM-004](ADM-004-CONFIGURADOR.md), #19/#31. Fontes: DRS 4.1/4.2, **7.1 (CSV para RF-001 a RF-008)**, RF-008, RN-012/RN-022 e RNF-003/007/008/009/011; [contrato ADM-002](ADM-002-CONTRATO-USUARIOS.md). Recorte C4 de consulta e B/C1 de edição. Não altera o DRS nem declara RF-008 integral.

## Consulta independente das decisões de edição

No Configurador, **Usuários → Exportar CSV** percorre a pesquisa **aplicada**, inclusive as outras páginas. Texto digitado ainda não pesquisado não muda o escopo. A geração reutiliza `SettingsApi.adminUsers` e a autorização vigente em cada RPC; ADMIN e perfis consultores já autorizados podem exportar o que consultam. Nenhuma capacidade nova, alteração de banco/usuário/conta/senha ou nova rota. O ERP continua negando administração.

Campos: nome de identificação, login, email de contato quando cadastrado, perfil legível, unidades permitidas, situação, pesquisa, momento da geração em `America/Sao_Paulo` e aviso do escopo de consulta. Não incluir ID Auth, senha, token, chave ou link de primeiro acesso. Contas antigas sem contato/login persistidos recebem indicação explícita, sem inventar dados nem chamar Auth Admin para preencher o relatório. Arquivo gerado somente no navegador, sem upload, envio de email ou registro do conteúdo em logs.

Limite técnico: 10.000 registros por exportação; acima disso, pedir refinamento. Totais variáveis, IDs repetidos, página truncada ou alteração das unidades durante as leituras abortam. Falha/revogação em qualquer página não entrega arquivo parcial. As múltiplas chamadas **não são um snapshot transacional**: uma edição que não altere quantidade/ordem pode não ser detectada; o CSV declara que é consulta durante a geração. Não representa trilha histórica ou aceite de consistência de auditoria. CSV com BOM UTF-8, aspas, separador ponto e vírgula e neutralização de fórmulas pelo utilitário comum.

Botão fica indisponível durante carregamento/cadastro/geração; a geração bloqueia saída/ações concorrentes e mostra resultado ou erro recuperável, preservando pesquisa, rascunho e link de primeiro acesso existente. Componentes/cores/foco/rolagem do Style Guide e de ADM-004 reaproveitados, sem novo frame ou editor sem funcionalidade.

## B/C1 — contrato de edição, sem escrita habilitada

`validateAdminUserEdit` aceita exatamente nome, perfil, unidades, revisão positiva em texto bigint e motivo. Mesmos limites técnicos de nome/perfil/unidades/motivo do cadastro; revisão não admite null nem número com perda de precisão. Produz cópia normalizada, sem modificar o rascunho. Login/email/senha/status/ID Auth/metadados/permissões livres são rejeitados. Validação sintática não concede a capacidade de editar nem efetiva mudança de perfil/unidade.

**Decisão material pendente nesta sessão:** o DRS não define autogestão/proteção do último administrador e ADM-002 pede contrato/testes antes da escrita. Foi enviada a proposta: preservar login/email/senha; impedir que o administrador mude o próprio perfil/unidades (outro administrador faz a alteração); impedir rebaixar o último ADMIN ativo. Não houve resposta no momento desta preparação; não interpretar silêncio como aprovação. Detalhar definição de administrador elegível/concorrência, revisão/revalidação do ator, auditoria de antes/depois, restrições de primeiro acesso e testes de revogação após a decisão. Status/inativação e troca de email/login continuam recortes próprios. Não há botão/endpoint de edição publicado por este DTO.

## Rastreabilidade e condição de saída

| Fonte | Implementação | Verificação |
| --- | --- | --- |
| DRS 7.1/RF-008: CSV | `admin-user-report.ts`, `UsersPanel.tsx`, API de consulta existente | filtro aplicado, 27 registros em duas páginas, consulta sem escrita |
| RNF-003/007: sessão e dados limitados | leituras autorizadas, campos explícitos, CSV comum | revogação/falha sem download; fórmulas/aspas, sem IDs/segredos |
| RNF-009/011: interface | botão/estados no shell existente | feedback, reabilitação após erro, responsividade anterior preservada |
| ADM-002/RN-012/RN-022: rascunho de edição | contrato compartilhado estrito | revisão/bigint, mass assignment, campos faltantes, cópia e controles |

Estado inicial: implementado localmente, testes/CI/deploy/jornada serão registrados após execução. Publicar consulta não autoriza edição. Nenhuma migration, reset, provisão permanente ou uso de senha pessoal. SMTP, VPN/Access, RF-008 integral, skeleton e carga real final permanecem nos seus recortes.
