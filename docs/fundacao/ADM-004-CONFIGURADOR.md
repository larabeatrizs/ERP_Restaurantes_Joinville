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

Estado inicial deste registro: implementação em preparação, não afirmar publicação ou CI até registrar os resultados. Rollback exige restaurar **as duas entradas compatíveis**; reabrir somente a API antiga restabeleceria um caminho administrativo na origem operacional. Sem rollback de banco, pois não há mudança de schema.
