# ADM-001 — Administração restrita e primeiro administrador

Data: 10/11/2026. Solicitação expressa da responsável: mapear painel administrativo separado, gestão de usuários/perfis, parâmetros e cadastro futuro do primeiro administrador. **Estado: levantamento e plano; painel e administrador não provisionados.** Backlog e critérios de implementação: [issue #19](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/19).

## Fontes e situação observada

Fontes: [DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), seção 4.1/4.2, RF-008 (M), RF-007, RN-012/RN-022 e RNF-002/003/007/008/011; [SEC-001](../seguranca/SEC-001.md), [CONFIG-001](CONFIG-001.md) e [plano SDD](../planejamento/RECONSTRUCAO_SDD.md). RF-008 integra D1; a área administrativa não é um requisito novo descoberto após o login.

| Pergunta | Evidência em 10/11/2026 | Resultado / lacuna |
| --- | --- | --- |
| Cadastro aberto no login? | DRS RF-008 determina criação pelo administrador; [App.tsx](../../apps/web/src/views/App.tsx) usa signInWithPassword | Ausência de botão de autocadastro é compatível com o contrato. Bloqueio de signUp no provedor ainda precisa ser conferido; esconder botão não o comprova |
| Existe painel administrativo separado? | [Workspace.tsx](../../apps/web/src/views/Workspace.tsx) contém Configurações, Produtos, Recebimentos e Saldo; [rotas da API](../../apps/api/src/index.ts) não incluem gestão de usuários | Não implementado na aplicação nova. Configurações por unidade já funcionam; não equivalem a administração global |
| Existe subdomínio administrativo implantado? | [wrangler.staging.jsonc](../../wrangler.staging.jsonc) publica um Worker workers.dev, sem domínio/rota administrativa dedicada | Não consta da implantação versionada. Não foi feita uma auditoria de todos os domínios/DNS externos à aplicação |
| ADMIN está modelado? | [Migration inicial](../../supabase/migrations/20261106201235_configuracoes_identidade_base.sql) admite ADMIN entre os oito códigos e vincula usuario.id a auth.users.id | Código permitido não cria perfil nem permissões. Capacidades de gestão administrativa ainda precisam de contrato/migration |
| Existe seed/admin real? | Consulta readonly ao Auth e a erp.usuario/perfil: destinatário solicitado ausente, zero perfis ADMIN, zero usuários ADMIN | Não cadastrado. Quatro usuários de domínio sintéticos: dois GESTOR_UNIDADE, um AUDITOR e um ESTOQUISTA |
| Bootstrap atual cobre administrador? | [INT-003](INT-003-JORNADA-REAL.md) e scripts de identidades sintéticas | Não: provisionamento técnico de demonstração, sem ADMIN e sem usuários reais. Não reutilizar seu bootstrap de fundação vazia para a base atual |

A consulta remota devolveu apenas existência/contagens/códigos, sem exportar emails, UUIDs Auth ou senhas. Não houve criação de conta, autenticação com a senha fornecida, alteração de configuração Auth, migration ou mudança DNS neste levantamento.

## Acesso e organização propostos

Proposta para revisão na fase B: `painel.<dominio-controlado>` como entrada administrativa, sem link na navegação pública, com barreira de acesso e autenticação da aplicação. O nome definitivo depende de domínio sob controle do projeto; `painel.erp` é somente exemplo, não endereço existente nem domínio reservado.

DNS, certificados, links e varreduras podem revelar um endereço. `noindex` orienta buscadores cooperantes e não é controle de acesso. O staging já envia `X-Robots-Tag: noindex, nofollow` no [Worker](../../apps/api/src/staging.ts); isso não torna o login privado. Não usar robots.txt como cofre de caminhos administrativos.

Para impedir acesso público, avaliar rede privada/VPN e uma barreira como Cloudflare Access com política explícita. RNF-003 exige VPN no acesso administrativo remoto: Access de aplicação, sozinho, não demonstra atendimento dessa exigência; definir a topologia privada compatível ou registrar revisão formal antes da liberação. A proposta não provisiona serviço, domínio, plano pago nem ambiente permanente adicional. [ADR-002](../decisoes/ADR-002-STAGING-COMPARTILHADO.md) continua vigente.

Dentro dessa barreira, Supabase Auth identifica o usuário; o backend verifica status, capacidade e escopo em cada chamada, reforçados por grants/RLS. Proteger também APIs, rotas alternativas, domínio workers.dev e URLs de preview contra acesso que contorne a barreira. Host, Origin e esconder menus não substituem autorização. Uma sessão comum autenticada não recebe acesso administrativo.

## Interface e integração de baixa complexidade

Usar o shell e os componentes existentes em apps/web, com navegação administrativa condicionada às capacidades efetivas. Não há frame administrativo aprovado no Style Guide: especificar e revisar seus estados usando a referência existente, sem modificar o HTML mestre por inferência.

| Área proposta | Comportamento | Fonte e limite |
| --- | --- | --- |
| Acesso administrativo | Login, sem cadastro aberto; mensagens sem revelar existência de conta | RF-008; não criar um segundo banco de senhas |
| Usuários | Busca/lista, criação, edição, perfil, unidades, status e inativação; distinguir bloqueio de segurança de inativação | RF-008, seção 4; impedir escalada por campos livres ou user_metadata |
| Perfis e vínculos | Aplicar os oito perfis e capacidades especificadas; consulta restrita de gestor central/auditor conforme matriz | Não criar editor irrestrito de roles SQL ou permissões arbitrárias |
| Parâmetros | Reutilizar painel por unidade; acrescentar escopo global e políticas ainda pendentes em CONFIG-001 | Configurar não concede permissão para lançar/aprovar; segredo não é parâmetro de negócio |
| Auditoria e operação | Rastrear mudanças administrativas com ator, motivo e antes/depois minimizados | RN-022/RNF-008; RF-030 e backup seguem seus recortes, sem exibir chaves ou prometer restauração já implementada |

Estados a especificar: carregando, vazio, acesso negado, cadastro/edição, email duplicado, vínculo inválido, conflito de revisão, salvando, sucesso e falha recuperável. Senha temporária/troca inicial, recuperação, cinco tentativas inválidas e inatividade padrão de 30 minutos continuam pendentes de RF-008; MFA opcional conforme o DRS. Não anunciar esses controles como presentes no login básico.

Cadeia proposta, ainda sem implementação: View administrativa → rotas `/api/admin/...` → AdminController → AdminService → interfaces AdminRepository/IdentityProvisioner → adaptadores de domínio e Auth. DTOs públicos em packages/contracts. Reaproveitar SettingsService/Repository para parâmetros existentes; globais têm contrato e autorização próprios. Não duplicar regras de estoque nem criar um ERP separado.

Rotas propostas incluem consulta/criação/alteração de usuários, vínculos e configurações globais; não estão publicadas. Não permitir excluir identidade com história referenciada nem editar auditoria. Definir controles de autogestão, proteção contra perda do último administrador e recuperação operacional na especificação antes dos endpoints.

Auth Admin exige privilégio server-side. Se necessário à futura criação de contas pelo painel, revisar uma fronteira privilegiada mínima: autorização administrativa independente e atual antes da chamada, operações fixas, secrets isolados e auditoria/compensação. Isso não autoriza adicionar service_role ao Worker atual ou usar chave administrativa para consultas comuns e contornar RLS. A View, evidências, CI e respostas nunca recebem essas chaves.

## SEED / provisionamento de ADMIN_INICIAL

**Pendente, sem conta criada.** A responsável indicou o destinatário nesta conversa. Seu email fica no registro privado local `admin-inicial-planejado.json`, sob a pasta int003 de `%LOCALAPPDATA%/CodexSecrets/ERP_Restaurantes_Joinville/`, fora do checkout e com acesso restrito ao usuário do Windows. Documentação, issue e futuros testes usam somente o alias **ADMIN_INICIAL**. A senha recebida não é armazenada nem incorporada a seed; definir outra por entrada segura no momento da execução.

Separar dois artefatos: migrations/seed sintética reproduzível com dados reservados para testes; provisionamento real opt-in com destinatário obtido de fonte privada. Não gravar senha/hash em tabela do ERP, SQL, fixture, argumento de terminal, log, frontend ou pipeline. Credencial permanece responsabilidade do Auth, conforme a arquitetura vigente.

Momento no plano:

1. **B / ADM-001:** revisar escopos/permissões, campos, UI e entrada privada; definir tratamento do primeiro acesso e falhas entre Auth e domínio.
2. **C2:** migrations de capacidades, RLS/grants e auditoria administrativa; ensaiar bootstrap/retomada com identidade sintética, sem alterar migrations antigas.
3. **C3/C4:** APIs, gestão de usuários e configuração global; comprovar os controles RF-008, sem confundir senha temporária com troca obrigatória efetiva.
4. **Integração D1, antes de usuários reais/piloto:** somente após os controles e o acesso restrito verificados, confirmar destinatário e escopo na fonte privada, definir nova credencial temporária e executar o provisionamento controlado. A solicitação atual mapeia a conta futura; não antecipa esse cadastro nem o aceite institucional. MFA mantém prioridade do DRS, salvo decisão posterior registrada.

Procedimento futuro deve verificar existência por email normalizado, conferir identidade sem divulgar resultado publicamente e criar via API Auth administrativa, nunca INSERT direto em auth.users. Se a conta já existir, interromper para conciliação; não resetar senha/promover automaticamente. Usar o ID retornado/verificado ao criar usuário de domínio, perfil ADMIN e somente os vínculos/capacidades especificados; ADMIN não significa acesso operacional universal ou aprovação automática.

Auth e PostgreSQL não compartilham uma transação única: registrar estado privado mínimo de provisionamento e implementar retomada/compensação. Falha no domínio deve deixar a identidade sem acesso e permitir revisão; não apagar automaticamente conta preexistente. Nova execução de uma operação concluída verifica a associação e não duplica conta, redefine senha ou amplia permissões. Auditoria identifica o operador/bootstrap, sem UUID fictício para preencher campos obrigatórios e sem credencial no evento.

Verificar troca obrigatória no primeiro acesso e negação das demais ações até concluí-la; sessão/inativação/revogação devem ter comportamento demonstrado com token já emitido. Dados do administrador inicial não participam da limpeza futura das demonstrações por inferência; AMB-001 deverá planejar a preservação/recriação autorizada dessa identidade.

## Evidência e próximos critérios

Levantamento: leitura do DRS/documentos/código/configuração e consulta remota readonly em 10/11. Nenhum teste novo de painel administrativo foi executado, pois ele não existe. [Issue #19](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/19) mantém os critérios observáveis de UI, autorização, bootstrap idempotente, falhas parciais e jornada de staging; permanece aberta. Documentar não encerra RF-008.

Referências oficiais consultadas em 10/11/2026: [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Cloudflare Access para aplicações web](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/) e [limites do noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing). A escolha final de topologia e as configurações do provedor ainda precisam de implementação e evidência próprias.
