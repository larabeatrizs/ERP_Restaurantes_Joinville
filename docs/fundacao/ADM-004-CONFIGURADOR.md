# ADM-004 — Configurador em endereço separado

Data: 17/11/2026. [Issue #46](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/46), continuidade de [ADM-001](ADM-001-ADMINISTRACAO.md) e [ADM-003](ADM-003-BASICO-18-11.md). A responsável reafirmou a separação e escolheu endereço da Cloudflare por enquanto. RF-008, RN-012, RNF-003/007/008/009/011; fases B/C3/C4 e integração do mesmo staging (ADR-002).

## Contrato do recorte

Endereço previsto: `https://erp-joinville-configurador.erp-restaurantes-joinville.workers.dev`. É outra origem web do mesmo staging, com builds próprios e o mesmo Auth, banco e serviço privado de identidade. Não é novo ambiente permanente. Sem novas contas/senhas, migrations, concessões, importação ou limpeza de dados.

O Configurador pede nome de usuário e a senha existente. Após o login, consulta a identidade e só mostra gestão a quem possui acesso administrativo. ADMIN cadastra; gestor central/auditor continuam consultando conforme o contrato já implementado. Listagem e escrita revalidam sessão/capacidades server-side no serviço privado e no banco. A interface não decide autorização. Contas operacionais recebem acesso restrito; erro de rede permite nova tentativa/sair. Não exige unidade operacional: ao cadastrar, a administração escolhe explicitamente os vínculos, sem filial marcada por inferência. Preserva carregamento, erros, campos, confirmação de descarte, foco e responsividade de ADM-003.

O ERP mantém a seleção de unidade e os cadastros/estoque por vínculos. Remove Usuários da navegação e responde 404 JSON para `/api/admin` e descendentes, mesmo com Bearer. O Configurador só expõe login, identificação e endpoints administrativos implementados; nega APIs operacionais. Nenhum link para a origem administrativa na aplicação operacional. Recuperação/primeiro acesso retornam ao ERP já autorizado no Auth; a senha definida serve às duas origens. Sessões do navegador são independentes por origem.

Configurações existentes no ERP são **parâmetros operacionais por unidade** (modo de saída, margem, alertas etc.), não gestão de identidades. Permanecem ali com permissões atuais. Parâmetros globais e gestão integral de perfis/unidades/usuários pertencem à continuidade de RF-007/008; não apresentar editores ou botões sem implementação.

## Segurança e limites explícitos

HTML e assets recebem `X-Robots-Tag: noindex, nofollow`; HTML também possui meta robots. Previews desabilitados nas duas publicações; serviço de identidade continua sem workers.dev/preview/rota pública. As APIs autenticadas não liberam CORS nem cache e a chave administrativa continua exclusivamente no serviço privado. `run_worker_first: true` aplica cabeçalhos também aos assets, sem permitir fallback HTML para APIs desconhecidas.

URL separada, ausência de links e noindex **não tornam o endereço secreto nem bloqueiam rastreadores que ignorem a diretiva**. A tela pública de login pode ser descoberta; dados/ações exigem Auth/RBAC. Cloudflare documenta [proteção adicional de workers.dev com Access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/); essa proteção não foi provisionada neste recorte. VPN para administração remota exigida por RNF-003 permanece pendência de ADM-001 antes de liberação operacional, assim como tentativas/inatividade/MFA e hardening integral. Separação de origem não é evidência desses controles nem aceite institucional.

## Rastreabilidade e verificação

| Contrato | Implementação | Evidência prevista |
| --- | --- | --- |
| Entrada administrativa separada, sem unidade | modo Vite configurador, `Configurator.tsx`, `wrangler.configurator.jsonc` | build próprio, navegador e consulta hospedada |
| ERP não permite contornar entrada | `staging.ts` bloqueia namespace administrativo | métodos, Bearer e headers forjados em `configurator.test.ts`; HTTP hospedado |
| Configurador não serve operações | allowlist em `configurator.ts` | negações de rotas/métodos no teste e HTTP real |
| Permissões preservadas | `/api/me`, API/serviço privado/SQL existentes | testes privados existentes + ADMIN/conta operacional sintéticos no hospedado |
| Acessibilidade e integridade de formulário | `UsersPanel` reaproveitado, Configurator protege saída/recarga | `usuarios.spec.mjs`, 360/1280 px, foco, consulta e erros |

Rollback exige restaurar **as duas entradas compatíveis**; reabrir somente a API antiga restabeleceria um caminho administrativo na origem operacional. Sem rollback de banco, pois não há mudança de schema.

## Resultado executado em 17/11

**Publicado e verificado**: [Configurador](https://erp-joinville-configurador.erp-restaurantes-joinville.workers.dev) e [ERP](https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev), [PR #47](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/47). No Configurador, entrar com `admin` e a senha atual, usar **Usuários → Novo usuário**, escolher as filiais e entregar o link privado. No ERP, o mesmo login continua exigindo a unidade e permite os quatro cadastros já autorizados. Não foi adicionada tela de autocadastro nem senha nova neste incremento; auditoria integral do signUp do provedor continua própria.

Runtime `42e4a5fc3b440edef5179b8f3a5e4a14eda007d9`; versões Cloudflare ERP `3c4e3a10-19be-488d-85d4-264634ec622e` e Configurador `eaa1694f-172b-422c-9f69-4d8468428f41`. Serviço privado de identidade não foi republicado. [Jornada hospedada sanitizada](../evidencias/adm-004/jornada-hospedada.json): ADMIN sintético existente acessa listagem/cadastro; conta operacional recebe HTTP 403; ERP responde 404 administrativo inclusive com Bearer válido; APIs de operação ausentes do Configurador; HTML/assets com noindex; seleção de unidade no ERP preservada; foco e ausência de overflow em 360/768/1280. Nenhum mock ou uso de credencial pessoal. Não houve criação, reemissão, troca de senha ou escrita de domínio nessa jornada; a prova de escrita ADM-003 permanece histórica para o formulário/serviço reaproveitado.

`npm run check` aprovado: lint/tipos, **116 API/identidade**, configurações 45 aprovados/3 concorrentes omitidos no PGlite, estoque 50/7, legado/provisionamento 3+3, builds/dry-runs de ERP/identidade/Configurador. **72 testes de navegador** aprovados localmente no Edge. [CI do runtime](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/44109295018): quatro jobs concluídos com sucesso; PostgreSQL nativo cobre os 48/57 cenários sem as omissões locais. Builds mantêm aviso de chunk acima de 500 kB e atualização disponível do Wrangler, sem atualização de dependências neste recorte.

Inspeção visual de [360 px](../evidencias/adm-004/formulario-local-360.png) e [1280 px](../evidencias/adm-004/formulario-local-1280.png): screenshots **locais com transporte simulado**, dados sintéticos e shell/tipografia/componentes existentes derivados do Style Guide; não são screenshots do banco hospedado nem aceite visual institucional. Não há frame administrativo aprovado específico. Sem migration, alteração de permissões ou limpeza; não foi executada nova auditoria integral do banco/advisor para esta mudança de rotas. Limites de rede/SMTP/RF-008 acima permanecem abertos em #19/#31; #46 não é fechamento automático.
