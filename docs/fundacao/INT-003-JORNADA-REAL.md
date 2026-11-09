# INT-003 — Jornada real de configurações

Especificação: 09/11/2026, após DB-004. RNF-002/003/008/010/011, RF-008 parcial, CONFIG-001/002, API-001 e WEB-001. A responsável autorizou prosseguir no staging compartilhado; AMB-001 continua congelada.

## Escopo e configuração

Projeto existente rp-joinville-db / vpowsedoajpdbeckimuv. Configuração API inicial: public e graphql_public. Patch parcial [config.toml](../../scripts/staging/int003-config/supabase/config.toml) declara somente api.schemas=[erp]. Conferir config diff: apenas esse update declarado; diferenças remote_only não devem ser publicadas pela CLI v3. Preservar Auth/MFA/email/redirects/Storage/pooler e demais opções. Não expor erp_private; não conceder grants genéricos ou reabrir public. Guardar valor anterior para retorno de configuração se necessário; não reabrir acesso de dados ao legado.

## Identidades e dados sintéticos

Criar três identidades reais por Auth Admin createUser com email_confirm=true, emails reservados example.invalid e senhas aleatórias privadas. Não usar signUp, inviteUserByEmail, recuperação ou envio de mensagens. Chave administrativa somente no bootstrap local privado; nunca em frontend/Worker/fixtures/CI/logs. Runtime recebe apenas URL/chave publicável. Não alterar a confirmação de email global.

Casos: editor A e leitor A vinculados exclusivamente à unidade sintética A; editor B exclusivamente à unidade B. Duas unidades com códigos STG-INT003-A/B e nomes explícitos de demonstração. Perfis técnicos GESTOR_UNIDADE (CONFIGURACAO_LER/EDITAR) e AUDITOR (somente LER), para estes usuários sintéticos, não representam aceite institucional das permissões de pessoas reais. Sem ADMIN universal, HISTORICO ou domínio de atendimento. Antes do provisionamento, exigir fundação vazia; não sobrescrever usuários/perfis/unidades existentes.

Criar usuários de domínio/vínculos/capacidades em transação administrativa explícita. Configurações iniciais usam modo POSTERIOR e demais referências documentadas; trilha inicial identifica provisionamento administrativo. Os IDs Auth devem vir de contas realmente criadas e autenticadas; atribuição de ator no bootstrap SQL é contexto administrativo, não evidência de jornada HTTP. Não importar bootstrap/fixtures dos testes SQL nem escrever diretamente em auth.users.

Credenciais/IDs/tokens ficam em diretório local fora do checkout, com ACL do usuário. Contas/unidades/trilha sintéticas permanecem identificadas para a limpeza planejada ao fim; não apagar trilha para esconder testes. Se houver falha, preservar estado e desativar apenas as contas/vínculos deste recorte, sem alterar identidades preexistentes. Tokens já emitidos não devem ser considerados revogados só porque houve alteração de sessão: RLS/estado de domínio precisam negar acesso imediatamente.

## Verificação planejada

Executar Worker local com código real e variáveis publicáveis, conectado ao Supabase staging real. Testes opt-in separados do CI sintético, sem mocks de Auth/Data API:

1. Login por senha/getUser e listagem/configuração da unidade vinculada; editor/read-only informados pelo servidor.
2. PATCH parcial com If-Match/motivo e revisão/auditoria; duas requisições concorrentes com mesma revisão dão um sucesso e um 412.
3. Leitor não escreve; editor A não lê/edita B; anon e schema interno não acessam dados protegidos.
4. Revogar vínculo/inativar ator preservando token existente deve negar novas operações; restaurar estado de demonstração somente em bloco controlado.
5. Navegador local autentica e lê/edita/revisa pela View/API reais; leitor recebe somente consulta. Sem publicar emails, senhas, JWTs ou IDs Auth em evidências/capturas/traces.

Depois verificar auditoria/contagens sem exportar dados pessoais, configuração API final, advisor e contenção do legado. Não afirmar deploy Cloudflare: servidores locais com serviços remotos reais são integração real em execução local, não hospedagem da aplicação. Não declarar RF-008 completo (recuperação, senha temporária, inatividade, bloqueio e MFA são recortes próprios) ou RNF-004 atendido.

## Achado na primeira integração e correção aditiva

Login/getUser, consulta e isolamento por unidade passaram com identidades/JWTs reais. O salvamento autorizado retornou 403. A chamada RPC direta diagnosticou SQLSTATE 42501, permission denied for schema auth; a verificação efetiva mostrou erp_config_writer com EXECUTE auth.uid() mas sem USAGE no schema auth hospedado. O laboratório anterior tinha esse USAGE, portanto não reproduzia essa fronteira efetiva. Não foi atribuída uma causa administrativa não observada para a diferença de grants.

A migration `20261109142946_ator_auth_sem_lookup_privilegiado.sql` cria `erp_private.ator_autenticado()` como SQL STABLE SECURITY INVOKER, com corpo BEGIN ATOMIC resolvido na criação e search_path vazio. Ela continua chamando o auth.uid() oficial; não replica claims/JWT nem cria função privilegiada adicional. Funções internas existentes passam a chamar esse helper. Schema auth não é aberto ao escritor, privilégios de dados/perfis não são ampliados e as migrations já aplicadas permanecem intactas. Função definer continua owned por erp_config_writer; associação administrativa temporária é removida ao fim.

Regressão: revogar USAGE auth do escritor no laboratório, salvar via RPC como editor autorizado e conferir UID real da trilha; helper invoker/corpo pré-analisado também verificados. Passou no PGlite e no PostgreSQL 17 do CI antes da aplicação. [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html) documenta análise na criação/dependências do corpo SQL padrão.

Os testes live ficam em `scripts/staging/verificar-jornada.mjs`, opt-in com ERP_STAGING_TEST_STATE apontando ao arquivo privado, e exigem Worker local/URL do projeto confirmado/contas marcadas como sintéticas. Operações administrativas de inativação/vínculo são restritas ao editor sintético A e à unidade STG-INT003-A, com retorno em finally; não usam chave administrativa no runtime de aplicação. Resultado privado inclui completed para diferenciar passagem completa de execução interrompida; somente execução completa pode gerar evidência pública de aceite.

## Resultado real observado

O patch de Data API foi publicado com CLI 3.0.0 após conferir diff: apenas api.schemas mudou para erp; as 11 propriedades remotas não declaradas permaneceram iguais na comparação posterior. Chamadas com perfis public/erp_private retornaram PGRST106; anon não consultou parâmetros e DML direto de authenticated foi negado.

Foram criadas e autenticadas três contas sintéticas por Auth Admin, sem solicitação de email, e provisionados dois perfis/duas unidades/capacidades/vínculos conforme o contrato acima. Identificadores e credenciais ficaram em `%LOCALAPPDATA%/CodexSecrets/ERP_Restaurantes_Joinville/int003`, com ACL restrita ao usuário. `.dev.vars` e `.env.local` locais contêm somente URL/chave publicável e são ignorados pelo Git. Nenhuma chave administrativa foi usada na View/Worker ou incluída nas evidências.

A migration corretiva foi aplicada após CI do commit `3c2f106`, [42636657457](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42636657457), com sucesso nos três jobs. Não foram alteradas migrations já aplicadas. A verificação hospedada posterior continuou mostrando **writer sem USAGE auth** e helper invoker pré-analisado.

[Resultado sanitizado](../evidencias/int-003/jornada-real.json): 12 cenários HTTP reais completos, sem mocks, confirmaram login/getUser das três identidades, falta de Bearer, listagem vinculada, consulta sem escrita, bloqueio entre unidades, PATCH persistido/revisão, concorrência 200/412, inativação e revogação do vínculo com o mesmo JWT, schemas não expostos, DML direto e anon negados. Estado ativo/vínculos e margem de demonstração foram restaurados; a trilha foi preservada.

A auditoria final contém dois INSERTs administrativos iniciais e sete UPDATEs reais de RPC. Todos os atores coincidem com a unidade esperada; leitor não produziu eventos. Margem de ambas as unidades voltou a 5,00 e modo permaneceu POSTERIOR. As revisões continuaram monotônicas (A=8, B=1); nenhum evento foi removido para desfazer teste.

Navegador Edge real: login, leitura, revisão/motivo/salvamento e retorno via View; leitor readonly, vínculo único e layouts desktop/móvel passaram. Capturas revisadas: [editor desktop](../evidencias/int-003/painel-real-1280.png) e [consulta móvel](../evidencias/int-003/consulta-real-360.png). A inspeção encontrou exibição decimal com ponto após leitura/salvamento; a margem passou a apresentar vírgula conforme RNF-015, com regressão no teste de navegador. Servidores locais usados na verificação foram encerrados.

`npm run check` e os 13 cenários de navegador sintéticos passaram localmente. São 27 HTTP/adaptador, 32 casos de configuração SQL (31 aprovados/1 concorrente omitido em PGlite; 32 no PostgreSQL do CI), 3 contenção e 2 provisionamento. Os testes reais opt-in não usam nem fornecem credenciais ao CI.

## Advisors e pendências de segurança

O advisor CLI retornou um WARN de [proteção contra senhas vazadas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), registrado no resultado sanitizado. Com o conector Supabase disponível, a consulta mais ampla [confirmou esse WARN e registrou](../evidencias/int-003/advisors-mcp.json) 14 INFO rls_enabled_no_policy no public intencionalmente contido. Os INFO não serão silenciados reabrindo acesso ao legado. A proteção de senha exige revisão de disponibilidade/configuração na etapa de hardening de Auth antes de uso real; não houve alteração global de Auth ou contratação de plano nesta entrega. Resultados anteriores sem achados são snapshots históricos, não a situação atual de toda a plataforma.

## Repetição e continuidade

Com o Worker e a View locais iniciados e as variáveis publicáveis configuradas, definir ERP_STAGING_TEST_STATE para o identidades.json privado e executar `npm run test:staging` / `npm run test:staging:web`. Edge instalado pode ser selecionado por PLAYWRIGHT_CHANNEL=msedge. Resultados completos e capturas vão ao diretório privado; revisar antes de publicar. Os testes reais fazem alterações controladas no staging e mantêm auditoria; não apontar para produção ou pessoas reais.

Para uma reconstrução futura autorizada, `provisionar-auth.mjs` exige ERP_STAGING_PRIVATE_DIR fora do checkout e resposta privada da CLI api-keys --reveal do projeto confirmado. Recusa arquivo de identidades já existente; não executar novamente para substituir as contas atuais. `identidades-sinteticas.mjs` produz o bootstrap administrativo somente com UUIDs distintos verificados e fundação vazia. Não versionar arquivo de chaves, estado, SQL com IDs, tokens ou credenciais.

INT-003 comprova a jornada de configurações com serviços remotos reais e aplicação executada localmente. Próximo recorte: publicação controlada do frontend/Worker na Cloudflare do mesmo staging e verificação no endereço hospedado, preservando origem/API e política de ambientes; depois avançar nas jornadas D1 de cadastros/estoque. Permissões operacionais completas/DOM-001, RF-008 integral, RNF-004, dados reais e aceite institucional permanecem próprios. Estimativa solicitada pela responsável em [09/11/2026](../planejamento/ESTIMATIVA-2026-11-09.md), revisável conforme esforço e validação observados.
