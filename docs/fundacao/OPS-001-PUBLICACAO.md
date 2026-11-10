# OPS-001 — Publicação do staging compartilhado

09/11/2026. Próximo recorte após INT-003, autorizado pelo prosseguimento da responsável. RNF-002/003/008/011/015; View/Controller/Service/Repository já verificados são preservados. Meta de [10/11](../planejamento/PLANO-ATE-10-11.md) prioriza publicação e [primeiro fluxo de estoque](EST-001-PRIMEIRO-FLUXO.md), não o ERP integral.

## Desenho

Um Worker `erp-joinville-staging` serve o build de apps/web e a API no mesmo endereço. [Configuração](../../wrangler.staging.jsonc) aponta exclusivamente apps/web/dist como diretório público; nenhuma pasta do repositório, arquivo privado ou legado é publicado como asset. `/api` e `/api/*` executam o Controller antes do fallback SPA, mantendo erros HTTP JSON. Outros caminhos servem os assets/SPA. Isso elimina configuração CORS entre View/API e usa o mesmo Supabase existente. Nenhum ambiente permanente adicional; AMB-001 permanece congelada.

Previews versionadas e observabilidade com captura de requisições estão desabilitadas. Não registrar Authorization, senha, corpo de login ou dados privados em logs/evidências. Headers de segurança/noindex estão no wrapper API e `_headers` dos assets; não são substituto de autenticação/RLS. O login fica acessível, operações exigem Bearer/perfil/vínculo; staging continua restrito a dados sintéticos.

Somente SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são necessários no Worker; VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY no build da View. Nunca service_role/sb_secret, senha, JWT ou token de deploy no bundle. O arquivo privado de runtime passado por `--secrets-file` contém apenas essas duas variáveis públicas; não passar o arquivo de identidades ou a resposta api-keys --reveal.

## Procedimento verificável

1. Conferir git limpo/commit e CI, build com URL/chave públicas do projeto existente. `npm run build:staging` é dry-run e não publica. Build comum do CI também valida a configuração integrada.
2. Autenticar Wrangler na conta confirmada da responsável; inventariar o nome antes de publicar, sem sobrescrever outro projeto ou contratar plano. Login OAuth inicial por callback expirou; fluxo por dispositivo concluiu com sucesso. Credenciais ficam no perfil local do Wrangler, fora do repositório. Nenhum token deve ser copiado ao chat/PR.
3. Publicar `npm run deploy:staging -- --secrets-file <arquivo-runtime-privado.json>` ou executar Wrangler diretamente com a configuração raiz após build. Registrar commit/versão/URL e variáveis por nome, sem conteúdo privado. Não habilitar produtos pagos, domínio ou outro ambiente por inferência.
4. Verificar HTTPS, HTML/assets, /api/health, API desconhecida 404 JSON, acesso sem Bearer 401 e headers. Executar login/consulta/edição/revisão/retorno e isolamento no endereço hospedado, sem mocks; conferir auditoria remotamente por consulta controlada.
5. Acrescentar resultados efetivos e limitações. CI/merge não comprovam deploy e health não comprova banco/Auth. Preservar credenciais e capturas de login fora do checkout.

Se houver versão anterior deste mesmo Worker, anotar a versão antes do upload e usar rollback oficial caso necessário. Na primeira publicação, retorno é retirar o acesso público do Worker específico se o smoke falhar, sem apagar banco ou identidades. Não executar rollback/reset do Supabase como procedimento de publicação.

Fontes oficiais consultadas: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [roteamento seletivo](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) e [headers](https://developers.cloudflare.com/workers/static-assets/headers/). A separação MVC do código continua vigente mesmo com um único ponto de publicação.

## Resultado

10/11: CI 4a6d2cc aprovado nos quatro jobs; migration/seed de EST-001 aplicados pelo conector e jornada real local de produto/compra/lote/saldo passou. Primeira tentativa de deployment parou antes de upload: `/workers/scripts/erp-joinville-staging/deployments` retornou 403 “No access to the specified resource”. Consulta da conta confirmou zero Workers; o nome não existe (404/10007) e o login contém workers:write, mas não workers_scripts:write. Nova autorização específica foi solicitada pelo fluxo de dispositivo; não presumir concessão pelo relato de conclusão sem confirmação no terminal. Nenhuma URL hospedada comprovada até aqui.

Worker local com os mesmos assets/API está em `http://127.0.0.1:8787`, usando o Supabase hospedado. EST-001 registra duas compras reais sintéticas de 20 kg e evidências locais. Após confirmar o escopo, publicar build do commit aprovado, verificar HTTPS/Auth/API/UI e registrar URL/versão; não criar conta temporária ou outro ambiente para contornar a permissão.
