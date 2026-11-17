# ADM-002/C2 — Registro privado de login e auditoria

Iniciado em 16/11/2026, continuidade em 17/11/2026. Continuidade do [contrato de cadastro](ADM-002-CONTRATO-USUARIOS.md), [ADM-001](ADM-001-ADMINISTRACAO.md) e [issues #19](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/19)/[#31](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/31). DRS RF-008, seções 4.1/4.2 e 7.1, RN-012/RN-022, RNF-002/003/007/008/009/011. Escopo: estrutura C2 de identidade, rotina interna de escrita testada e melhoria pequena de foco no workspace existente.

## Decisão confirmada pela responsável

Em 16/11, a responsável adotou explicitamente: **administrador gerencia usuários e vínculos de todas as unidades; gestor central e auditor apenas consultam; operações seguem as unidades autorizadas do usuário**. A conta `admin` atual receberá gestão somente após os controles testados, sem mudança de senha. Trata-se de refinamento autorizado para implementação, sem equivaler a aceite institucional ou dispensar a entrada administrativa restrita prevista em ADM-001.

A decisão define o alcance dos próximos endpoints/painel. Este incremento não atribui capacidades aos perfis, não promove a conta atual e não torna um código de perfil suficiente para administrar o sistema.

## Modelo e operação interna

Migration nova `identidade_login_administrativa`, sem alterar migrations aplicadas. Dois objetos privados, ambos com RLS e sem grants a anon/authenticated:

- `erp_private.usuario_login`: um login canônico único por usuário de domínio, revisão bigint e data de alteração. FK restritiva preserva a identidade/histórico; não contém email, senha ou hash de senha.
- `erp_private.auditoria_login`: ator/alvo, revisão, login anterior/novo, motivo e data. Inserção atômica com o cadastro. O escritor não possui UPDATE/DELETE da auditoria nem DELETE do registro de login. A presença de login/motivo exige tratamento de dados pessoais; o motivo não deve conter credenciais.

`erp_private.usuario_login_salvar(uuid,text,bigint,text)` é interna: sem wrapper exposto em erp e sem EXECUTE a anon/authenticated. A role proprietária `erp_identity_writer` não tem LOGIN, SUPERUSER, BYPASSRLS, criação de roles/bancos, acesso a auth.users ou poder de alterar usuários/perfis/vínculos do domínio; authenticated não é seu membro. Somente a fronteira privilegiada futura, revisada e limitada poderá chamar a rotina; não adicionar credencial administrativa ao Worker comum.

Além da restrição de execução, a rotina exige ator Auth de domínio ativo, perfil ADMIN e capacidade USUARIO_GERIR atuais, conferidos depois do lock por alvo. Não confia em metadados/JWT de perfil. Requer login já canônico conforme o DTO; a normalização fica no contrato compartilhado. Rejeita formato inválido, revisão obsoleta, motivo inválido, alvo inexistente e login usado por outro usuário. SQL mantém strings de revisão sem perda de precisão na resposta. Escrita sem mudança não incrementa revisão nem duplica evento; criação exige revisão null, edição exige a revisão atual.

O índice único é global, independente da unidade, pois login identifica a conta. A revisão e o lock serializam alterações do mesmo alvo. Falha de auditoria desfaz toda a operação. As capacidades USUARIO_LER/USUARIO_GERIR/USUARIO_CICLO_VIDA são admitidas no catálogo existente, **sem concessão automática**; as permissões operacionais anteriores são preservadas.

## Interface limpa e acessibilidade

Diretriz expressa da responsável nesta continuidade: simplicidade visual, facilidade de uso/acesso e retorno dinâmico. O ajuste mantém a composição do Style Guide, sem modificar seu HTML mestre: o main pode receber foco pelo atalho existente “Ir para o conteúdo”; ao navegar entre páginas do workspace, o foco acompanha o conteúdo novo. O contorno de teclado usa o bordô/3 px já definido pela referência e aparece somente com foco visível. Não acrescenta novas barras/cards ou animações.

Não é uma declaração de conformidade WCAG integral. Labels, contraste, ordem de foco, estados de carregamento/vazio/erro e responsividade continuam critérios para cada tela nova. Skeleton permanece na pendência de aperfeiçoamento #24, conforme decisão anterior.

## Verificação e limites

Local: `npm run check` aprovado (102 API; configurações 38/40 no PGlite, com duas omissões de concorrência; estoque 50/57, com sete omissões; legado/provisionamento 3+3; lint, tipos e builds/dry-run). Sete cenários novos de identidade cobrem criação/edição/idempotência, unicidade, revisão, ator/capacidade/perfil/status, grants e rollback de auditoria. Um cenário adicional com duas conexões exige PostgreSQL nativo: testa revisão obsoleta e revogação da capacidade durante espera pelo lock. O inventário de funções privilegiadas foi atualizado para exigir o novo proprietário restrito. O aviso existente de chunk maior que 500 kB permanece.

O teste de teclado passou localmente no Edge, cobrindo atalho e mudanças entre Início, Meu acesso e Configurações. Capturas locais com dublês sintéticos em [1280 px](../evidencias/adm-002/foco-conteudo-1280.png) e [360 px](../evidencias/adm-002/foco-conteudo-360.png), inspecionadas: bordô/contorno de foco coerentes com o Style Guide, conteúdo legível e sem overflow horizontal. O menu vertical móvel atual ainda é extenso; refinamento de composição permanece separado, sem alegar interface integralmente aperfeiçoada. A suíte completa/CI, aplicação da migration, preservação de dados e publicação serão registradas com seus resultados efetivos nas evidências e discussão da PR; não são antecipadas neste ponto do registro.

Não houve migração do diretório privado atual para essa tabela nem mudança do fluxo de autenticação: o login existente continua funcionando. O registro de login começa vazio. Não há lookup anônimo de emails, convite, envio SMTP, criação/reset de conta ou painel administrativo novo neste recorte. C3/C4 seguem: leitura/gestão autorizadas conforme decisão acima, frontend, adaptação do login persistido por fronteira mínima e provisionamento retomável. Controles de sessão/tentativas/primeiro acesso e acesso administrativo restrito permanecem próprios; RF-008 e as issues não estão concluídos.
