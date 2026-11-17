# ADM-003 — Básico utilizável até 18/11

Solicitação da responsável em 17/11/2026: acelerar para disponibilizar **até amanhã, 18/11**, pelo menos a inclusão dos cadastros básicos e de usuários; ajustes posteriores. [Issue #44](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/44), continuidade de #19/#31 e [ADM-002](ADM-002-IDENTIDADE-PERSISTIDA.md). RF-008, seções 4.1/4.2 e 7.1, RN-012/RN-022 e RNF-002/003/007/008/009/011. O prazo solicitado é a meta deste recorte; não muda o escopo completo do ERP nem demonstra prontidão de produção.

## Recorte priorizado

- Cadastro de usuários: login, nome de identificação, email, perfil existente e uma ou mais unidades. Administração global conforme decisão anterior; operações pelos vínculos autorizados.
- Listagem com pesquisa global/paginação de 25, estado de primeiro acesso e inclusão com campos preservados em caso de falha. Novo acesso só é liberado após definição da própria senha e autenticação por senha forte.
- Compatibilidade com os cinco acessos anteriores e o diretório privado atual. Novos logins usam o registro persistido; nenhum reset/promoção por email preexistente.
- Cadastros de medidas/categorias/fornecedores/produtos existentes preservados. A edição pela conta pessoal ADMIN depende da escolha abaixo, sem inferir um superusuário operacional do DRS.

**Duas decisões ainda propostas, sem autorização presumida por silêncio:** primeiro link manual privado enquanto SMTP geral permanece adiado; exceção temporária de escrita de cadastros pelo perfil ADMIN no staging ou criação de acesso operacional separado. As perguntas foram apresentadas à responsável. A implementação/testes podem avançar, mas o modo de convites de pessoas e a exceção operacional ficam desabilitados até resposta explícita.

## Fronteira privilegiada

Novo entrypoint `apps/api/src/identity`, Worker privado `erp-joinville-identidade-staging`, sem workers.dev/preview/rota pública, chamado pelo binding `IDENTITY_SERVICE` do Worker da aplicação. Permanece no backend/monorepo existente, com build/deploy próprios. É um componente do **mesmo staging compartilhado**, não um ambiente permanente adicional; ADR-002/AMB-001 permanecem vigentes. Auth Admin existe somente nesse componente; nem View nem Worker comum recebem sua chave. Configuração privada fica fora do Git, com ACL do usuário local. Logs de observabilidade desse serviço estão desabilitados.

Rotas fixas internas: login, consulta/inclusão de usuários e reemissão de primeiro acesso pendente. Administração sempre verifica o token em `Auth.getUser`, recusa usuário anônimo e passa ao SQL o ator validado. A RPC `erp.admin_usuarios_servico` tem EXECUTE somente para service_role; clientes não podem fornecer ator/ação/ID Auth diretamente. A função interna pertence a role NOLOGIN/NOBYPASSRLS, com políticas/grants mínimos e sem acesso a auth.users. Dados de contato/provisionamento/auditoria ficam em tabelas privadas com RLS, sem acesso direto dos clientes ou service_role.

O login público devolve somente tokens; a resolução privada nunca devolve email ao chamador. O serviço mantém fallback para o diretório anterior, verifica status atual do domínio e não usa user_metadata para autorizar.

## Provisionamento e falhas

1. Preparar intenção com ator, payload normalizado e unicidade de login/email. Repetição idêntica pelo mesmo ator retoma a operação; divergência interrompe sem alterar conta existente.
2. Criar Auth **sem senha informada pelo administrador** e sem email automático; registrar o ID retornado na operação. Email já existente interrompe: nunca redefinir/promover/reutilizar outra identidade.
3. Gerar link de recovery apenas para a identidade criada/controlada por essa operação, conferindo seu ID. Não armazenar senha ou token/link no banco, logs ou evidência pública.
4. Revalidar ator, capacidade e unidades e confirmar usuário/vínculos/contato/login/auditorias na mesma transação. Revogação durante espera por lock impede a conclusão; falha de auditoria desfaz o domínio. Conta Auth sem domínio não recebe acesso. A operação mantém o ID para retomada após falha conhecida.
5. Novo usuário começa `BLOQUEADO` com marcador distinto de primeiro acesso, apresentado na UI como **Aguardando primeiro acesso**. Verificação do link/alteração de senha ainda não concede operações. Primeiro login por senha, validado pelo Auth e pela política compartilhada de 8/letra/número/símbolo, ativa somente essa conta pendente e audita. Conta inativa/bloqueada após ativação não é reativada pelo login.

Se a chamada de criação Auth tiver resultado indeterminado antes de registrar seu ID, é necessária conciliação privada; não procurar email e promover/resetar automaticamente. Depois de uma operação concluída, repetir a inclusão não reemite link. Reemissão é ação explícita/confirmada e auditada, permitida apenas para conta nova dessa trilha ainda pendente; contas anteriores/ativadas não são elegíveis. Há nova verificação de elegibilidade antes de devolver o token ao administrador.

**Modo proposto de entrega manual:** link de uso único mascarado na UI e copiado por ação do administrador; desaparece ao sair. Só será ativado para pessoas após resposta. É possível ensaiar com administrador sintético explicitamente listado na configuração privada e destinatários exclusivamente `adm003-…@example.invalid`; esse ensaio não habilita convites reais.

## Interface e verificação

Shell/cores/componentes do Style Guide preservados, sem alterar HTML mestre. Formulário progressivo ao clicar Novo usuário, grupos de identificação/unidades, rótulos, instruções ligadas por aria-describedby, erros recuperáveis, estado de salvamento e bloqueio de repetição/navegação com alterações. Tabela permite rolagem local por teclado. Perfil e filiais são campos de negócio; chave/ID Auth/configuração de infraestrutura não aparecem no produto.

Verificação local atual: `npm run check` aprovado; 112 API/identidade, configurações 45/48 no PGlite (três cenários concorrentes exigem PostgreSQL nativo), estoque 50/57 (sete omissões concorrentes), legado/provisionamento 3+3, lint/tipos/builds/dry-run dos dois entrypoints. Quatro testes novos de navegador aprovados no Edge com inclusão/reamissão/cópia (clipboard simulado), conflito preservando campos, readonly e menu ausente para conta sem capacidade; capturas com dublês sintéticos em [360 px](../evidencias/adm-003/formulario-360.png) e [1280 px](../evidencias/adm-003/formulario-1280.png) revisadas. Não representam a quantidade de contas ou dados do staging. Resultados de CI/staging serão registrados somente depois de executados.

O bootstrap opt-in [preparar-admin-sintetico.mjs](../../scripts/staging/preparar-admin-sintetico.mjs) prepara somente a identidade reservada ADM-003, sem reset se já existir. Estado/credencial/SQL ficam fora do checkout. A seed de capacidades de gestão libera USUARIO_LER/USUARIO_GERIR ao ADMIN e consulta ao auditor/gestor central; não inclui a exceção operacional proposta para ADMIN. A preparação de catálogo da nutricionista segue I/X do DRS 4.2 e o contrato compartilhado já confirmado, sem escrita/aprovação de recebimento. A aplicação efetiva dessas concessões é etapa de integração após testes, com comparação dos demais dados anteriores.

Próximas verificações: CI completo, migration hospedada, serviço privado/binding, ensaio de inclusão → reemissão → senha → login → unidade, negações e comparação de preservação dos dados anteriores. Sem uso das credenciais pessoais nos testes. Branch/PR/main seguem ADR-002. Nenhuma issue ampla é encerrada por este recorte.

Permanecem próprios: SMTP geral, gestão completa/edição/inativação de usuários, cinco tentativas, inatividade parametrizável, MFA opcional, entrada administrativa de rede/VPN antes da liberação operacional, auditoria integral, skeleton, importação real final, ambiente de produção e AMB-001. O primeiro login de contas novas tem símbolo obrigatório na fronteira privada; isso não é imposição retroativa de política a todas as senhas existentes.
