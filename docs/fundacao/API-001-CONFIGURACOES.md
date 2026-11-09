# API-001 — Configurações HTTP e autenticação

Data: 06/11/2026. Recorte C3 sobre CONFIG-002. Staging e fluxo Git conforme ADR-002. Especificação antes da implementação.

- GET `/api/unidades/{id}/configuracoes`: Bearer obrigatório; valida identidade no Supabase Auth com getUser(token), depois consulta com o mesmo token para preservar RLS. Retorna DTO sem segredos, capacidades de edição para UX e ETag forte com unidade/revisão.
- PATCH na mesma rota: Bearer, application/json e If-Match obrigatório; corpo `{campos, motivo}`, sem chaves extras. Atualização mediada pela RPC CONFIG-002. Retorna configuração e nova ETag. Payload limitado a 16 KiB; IDs/revisões decimais tratados como strings de inteiros bigint positivos, sem conversão com perda de precisão.
- ETag proposta: `"cfg-{unidade}-{revisao}"`; não aceitar wildcard, lista ou ETag fraca. ETag de outra unidade recebe conflito. Campo de autoria, modo de aprovação de perdas ou outros recursos não implementados não podem entrar no corpo.
- Controller trata HTTP; SettingsService coordena caso de uso; repository tem interface independente de SDK; adaptador Supabase utiliza cliente por requisição, chave publicável e Bearer, sem service_role/secret key e sem sessão persistida. DTOs públicos ficam em packages/contracts.
- Sem credenciais de runtime: 503 nas rotas protegidas, mantendo liveness público. Sem Bearer: 401. Supabase indisponível: 503; token inválido: 401. RLS sem linha visível: 404 genérico. RPC 42501: 403; PT412/PT428/PT422/PT404 mantêm semântica HTTP. Nenhum erro devolve SQL, token ou URL interna.
- Respostas privadas usam no-store; sem CORS permissivo. O proxy local já usa mesma origem. Configuração futura de origem HTTPS do staging deve ser restrita ao destino real.

Variáveis: SUPABASE_URL (HTTPS do projeto) e SUPABASE_PUBLISHABLE_KEY (somente chave publicável; não usar credencial administrativa). Configurar exposição do schema erp no Data API somente após migrations/grants revisados; não expor erp_private. Nenhuma variável real, conta, migration hospedada ou deploy é criada por este contrato.

Testes previstos: roteamento/status, corpo/limites, If-Match, autorização, conflitos, isolamento do token por request e tradução sanitizada de erros; testes do adaptador usam respostas HTTP simuladas do SDK real. Não apresentar mocks como login verificado contra o staging. Suite SQL existente continua cobrindo RLS/RPC, inclusive concorrência em PostgreSQL 17 real. A validação ponta a ponta contra Supabase staging depende de configuração/acesso reais e fica explicitamente registrada se não executada.

## Implementação e evidências locais

Contratos em packages/contracts; SettingsController, SettingsService, interface SettingsRepository e adaptador Supabase em apps/api. Supabase JS 2.119.0 fixado no lockfile. Cliente por request com sessão não persistida, chave publicável e timeout de cinco segundos por chamada de transporte. Não há fallback de login fictício: sem configuração, a rota protegida retorna 503. Leitura e RPC projetam bigint/decimal como texto para impedir arredondamento de IDs/revisões.

Passaram localmente **25 testes HTTP/adaptador** e os checks de lint/tipos/build. No laboratório SQL, 27 casos passaram e o concorrente foi omitido, como esperado no PGlite; o CI executa os 28 em PostgreSQL 17. No runtime Worker local, health respondeu 200 e a rota de configurações sem Bearer respondeu 401. Servidor de verificação encerrado após o teste.

O adaptador utiliza o SDK real sobre transporte HTTP simulado nos testes: foram conferidos getUser, Bearer por requisição, schema erp, RPC com revisão string, erros sanitizados, expiração entre Auth/Data API e integração completa do roteamento com esse transporte. Isso **não comprova login nem persistência no staging remoto**. Não há ferramentas de Supabase expostas nesta sessão, valores reais configurados pelo agente ou deploy Cloudflare; a verificação ponta a ponta continua pendente, sem exigir ambiente permanente adicional.

Não foi realizada mudança de schema ou limpeza no staging. O painel ainda não foi implementado. Endpoints globais e histórico HTTP ficam para recortes próprios. FND_READY/produção continuam pendentes; AMB-001 permanece congelada ao fim do projeto conforme ADR-002.

Fontes consultadas: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [inicialização de cliente](https://supabase.com/docs/reference/javascript/initializing), [schemas customizados](https://supabase.com/docs/guides/api/using-custom-schemas) e changelog Supabase. A exposição necessária é somente de erp, com os grants/RLS já versionados; erp_private permanece fora do Data API.

## Publicação e CI

Continuidade WEB-001 (09/11/2026): acrescentado GET `/api/unidades`, autenticado, sem cache, retornando `{unidades:[{id,codigo,nome}]}` somente das unidades ativas visíveis por RLS. Apenas GET é aceito; outros métodos retornam 405/Allow. IDs são strings. A suíte passou de 25 para 27 testes HTTP/adaptador. O [primeiro painel](WEB-001-CONFIGURACOES.md) utiliza esse endpoint e os contratos de configuração acima; as observações anteriores de ausência de View são históricas. Sem mudança adicional de schema, grants ou banco hospedado.

PR [#8](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/8), commit `b29da35`, [execução 42291658272](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42291658272): success. O workflow executou os checks do monorepo e o laboratório PostgreSQL 17, sem deploy. Testes HTTP/adaptador usam transporte simulado; o job SQL valida banco real descartável com bootstrap de identidade simulado, não o Supabase hospedado. A integração à main é autorizada pela responsável após os checks, e os novos commits devem ser conferidos antes de merge.

A separação de ambientes foi registrada como [AMB-001 / issue #9](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/9), congelada ao fim do projeto. Não bloqueia este recorte nem exige criar ambiente permanente adicional.
