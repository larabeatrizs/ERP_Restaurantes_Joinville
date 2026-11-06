# MONO-001 — Bootstrap técnico da fundação

Data: 06/11/2026. Branch de trabalho: `feat/mono-001-fundacao`. Base: commit da auditoria `e6d30de`. Autorização: iniciar a execução da fundação após registrar a auditoria. Escopo técnico referente a RNF-011 (camadas, versionamento e testes), RNF-014 (contrato HTTP) e RNF-015 (documento pt-BR). Não é implementação funcional do ERP nem ratificação institucional da arquitetura.

## Especificação do recorte antes da implementação

- npm workspaces com `apps/web`, `apps/api` e `packages/contracts`; módulos ESM/TypeScript estrito. Dependências diretas fixadas e lockfile único, sem import ou extensão de `legacy/`.
- Node 24 LTS, versão 24.22.2 publicada em 27/10/2026, obtida pelo índice oficial e checksum SHA256 do arquivo oficial conferido. Nesta máquina, executável portátil no perfil do usuário, sem instalação global ou mudança de PATH permanente.
- React/Vite monta a raiz, sem criar telas alternativas à referência. O bootstrap renderiza vazio; implementar a UI aprovada pertence a WEB-001.
- API nova como Worker com Web APIs nativas. Express não é reaproveitado. Rotas de negócio, autenticação e banco ainda não existem.
- GET `/api/health`: 200 JSON `{status:"ok",service:"erp-api",version:"0.1.0"}`, sem cache. HEAD: mesmos status/headers sem corpo. Outros métodos: 405 com `Allow: GET, HEAD`. Rotas desconhecidas: 404; HEAD sem corpo.
- Health é liveness da API; não comprova prontidão de banco, Auth, staging ou produção. Nenhuma credencial/configuração de ambiente entra na resposta.
- Proxy local Vite `/api` → `127.0.0.1:8787`; sem CORS aberto ou endpoints privilegiados. Definição de origens de produção pertence ao recorte de integração.
- Build da API usa Wrangler em dry-run. Não há comando de deploy automático nem acesso a conta Cloudflare ou Supabase neste recorte.

## Decisões técnicas deste bootstrap

ARQ-001 parcialmente concretizada por npm workspaces/TypeScript e contrato Controller → Service. Model/Repository não têm arquivos fictícios: serão criados com os contratos reais. TypeScript 5.9.3 escolhido dentro da faixa de compatibilidade declarada pelo typescript-eslint consultado no registro npm; não instalar versão incompatível apenas por ser a mais recente. O versionamento de contratos começa em 0.1.0.

A instalação inicial apontou nove achados moderados, todos derivados de minimatch 10.2.6 nas ferramentas de lint. Foi aplicado override explícito para minimatch 11.0.1, versão corrigida segundo [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), com nova instalação e verificação de lint/tipos/build. Rever o override quando as dependências upstream adotarem a correção. Não foi usado `audit fix --force`.

MET-001 e as ambiguidades funcionais permanecem para a primeira implementação de negócio. A FND-000 ainda requer revisão visual e snapshot de leitura do banco; este bootstrap independente não declara sua conclusão nem a conclusão global da fase B.

## Critérios e verificações

1. Instalação limpa por `npm ci`.
2. Lint e typecheck de todos os workspaces.
3. Testes do contrato HTTP cobrindo GET/HEAD/405/404 e ausência de dados extras no health.
4. Build da View e bundle do Worker em dry-run; emissão das declarações dos contratos.
5. Workflow de PR sem segredos nem deploy, com permissões somente leitura.
6. Evidências reais e limitações registradas ao concluir o recorte. CI remoto só é considerado validado depois de executar no GitHub.

## Próximos recortes

Fase B / DATA-001: **modelagem conceitual, lógica e física nova, do zero a partir do DRS**, incluindo permissões/transações. Fase C2: migrations, Auth, RLS e testes em ambiente isolado. Em paralelo aos contratos estáveis, WEB-001 extrai componentes/tokens da referência e API-001 especifica rotas reais. Nenhum reset ou mudança de banco conectado é parte deste bootstrap.

## Evidências da execução local — 06/11/2026

Ambiente: Windows, Node 24.22.2 portátil e npm 11.19.1; `NODE_USE_SYSTEM_CA=1` para confiar na cadeia corporativa já reconhecida pelo Windows, sem desativar TLS.

| Verificação | Resultado observado |
| --- | --- |
| npm ci | Sucesso; reinstalação a partir do lockfile; auditoria reportou zero vulnerabilidades após override |
| npm run lint | Sucesso, incluindo restrição de imports de legacy e outros apps |
| npm run typecheck | Sucesso nos três workspaces |
| npm test | Cinco testes passaram: GET, HEAD, método negado, rota desconhecida e HEAD 404 |
| npm run build | View gerada, Worker empacotado em dry-run e declarações dos contratos emitidas |
| Wrangler dev local | Runtime iniciou em 127.0.0.1:8787; GET health 200, HEAD 200 sem corpo, POST 405 |
| Vite e proxy | Documento HTML 200 em 127.0.0.1:5173; /api/health retornou JSON da API pelo proxy |

Servidores de verificação encerrados após os testes. Workflow preparado mas não executado no GitHub; nenhum deploy, acesso ao banco ou teste de tela foi realizado. O App vazio é intencional neste recorte e não representa a UI entregue. O npm avisou que os scripts de instalação de esbuild/workerd ainda não têm allowlist explícita; os postinstalls executaram e os builds foram verificados. A política de dependências será revisada antes de instalar pacotes adicionais.

**Resultado:** bootstrap local de MONO-001 implementado e verificado neste ambiente. CI remoto, proteção de branch, revisão de PR, tokens visuais, contratos funcionais, banco, Auth/RLS, staging e recuperação continuam pendentes. **FND_READY permanece não atingido.**

## Referências consultadas

- https://nodejs.org/dist/index.json e https://nodejs.org/dist/v24.22.2/SHASUMS256.txt
- https://vite.dev/guide/
- https://developers.cloudflare.com/workers/wrangler/commands/
- Metadados do registro oficial npm para versões e engines/peerDependencies das dependências.
