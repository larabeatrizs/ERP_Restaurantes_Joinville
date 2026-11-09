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
