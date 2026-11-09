# INT-001 — Integração no staging compartilhado

Data: 09/11/2026. Recorte de preparação após WEB-001/PR #10, merge `6a05d77`. C2/C3/C4 ainda precisam de evidência conjunta com Auth/RLS/RPC reais. AMB-001/issue #9 permanece congelada; usar somente o projeto existente.

## Evidência disponível e dependência de acesso

| Item verificado nesta sessão | Resultado | Limite |
| --- | --- | --- |
| Ferramentas Supabase MCP expostas | Nenhuma | Não comprova indisponibilidade do serviço nem estado do banco |
| CLI Supabase fixada no lockfile | 3.0.0; help consultado | Comandos v3 usam destino local por padrão; remoto precisa ser explícito |
| `supabase projects list` | AccessTokenRequiredError | Não foi possível identificar/inspecionar o projeto remoto |
| Variáveis Supabase/Cloudflare/Database/VITE no processo e arquivos novos de runtime | Não encontrados `.dev.vars`, `.env.local` ou project-ref na localização esperada | Não houve busca ampla de credenciais pessoais nem leitura de seus valores |
| Migrations e testes versionados | Duas migrations; laboratórios existentes | Não comprova aplicação hospedada |

A autenticação MCP ou `supabase login` local foi solicitada à responsável, sem pedir tokens/senhas no chat. Acesso administrativo ao banco e configuração de Auth/Data API podem exigir permissões adicionais à listagem de projetos. Referência histórica de 14 tabelas public sem RLS não foi revalidada: não tratar o snapshot antigo como estado atual.

## 1. Inventário antes de qualquer escrita

1. Autenticar, listar projetos e confirmar referência/nome/organização do staging existente com o contexto do projeto. Registrar somente identificadores necessários, sem chaves ou dados pessoais. Não criar projeto/branch Supabase adicional.
2. Executar [inventario.sql](../../scripts/staging/inventario.sql) no SQL Editor/MCP do projeto confirmado. O arquivo abre transação READ ONLY, limita duração e termina com ROLLBACK. Exporta metadados de public/erp/erp_private: tabelas/views, RLS, ACLs de relações/funções, políticas, proprietário/search_path de funções e atributos dos papéis técnicos. Não lê linhas de negócio, auth.users, senhas, JWTs ou corpos de funções.
3. Guardar a saída completa em artefato privado/local; revisar antes de publicar resumo. Expressões de políticas podem revelar identificadores internos. `linhas_estimadas` é estatística, não contagem real nem prova de banco vazio; null significa estimativa ausente. ACLs de objeto não cobrem sozinhas privilégios por coluna, herança de papéis ou toda a autorização efetiva: revisar esses casos com consultas específicas.
4. Conferir histórico remoto de migrations, configurações de schemas expostos e grants/default privileges; confirmar se erp/erp_private já existem. Se houver conflito com as duas migrations, parar a aplicação e reconciliar o desenho/histórico, sem marcar versões como aplicadas por inferência e sem usar reset/drop.
5. Rodar advisors no destino confirmado; classificar achados atuais. Inventário não substitui advisors, backup, contagem/revisão autorizada de dados nem teste de acesso via API. Registrar como pendente tudo que a identidade conectada não puder consultar.

## 2. Plano de aplicação controlada

Aplicação somente após inventário atual, comparação dos objetos, backup/retorno viável e plano concreto revisado. A autorização vigente permite continuar a implantação na etapa adequada; não exige repetir confirmação por rotina. Não executar enquanto destino/dados/permissões forem desconhecidos.

- Primeira migration `20261106201235_configuracoes_identidade_base.sql`: cria schemas novos, identidade/vínculos/configurações, grants/RLS e auditoria. Segunda `20261106202428_configuracoes_salvamento_mediado.sql`: acrescenta salvamento mediado, executor restrito e revisão. Cada arquivo é transacional; isso não torna a sequência de dois arquivos uma única transação.
- Fazer dry-run sobre referência explícita e conferir apenas os arquivos esperados. Na CLI v3, usar `--skip-vault` também no dry-run e na aplicação, para não atualizar Vault como efeito lateral. Não incluir seeds, roles extras, `--include-all`, repair, squash, down ou reset para contornar divergência.
- Aplicar somente as migrations pendentes após essa revisão e registrar versões/resultado. Sem copiar bootstrap/fixtures dos testes para o banco hospedado: criam identidades simuladas e não são provisionamento de Auth real.
- Se uma migration falhar, verificar o rollback e histórico antes de repetir. Se a segunda falhar após a primeira, preservar o primeiro incremento e corrigir por migration revisada; não apagar schemas/dados. Suspender exposição/deploy se a fronteira de segurança não estiver demonstrada.
- Conferir RLS/grants/ownership de novo. Expor `erp` somente após revisão; manter `erp_private` fora da Data API. Não copiar GRANT ALL genérico de tutoriais, nem contornar políticas com service_role no cliente.
- Revisar public legado e seus consumidores antes de restringir/remover exposição. A criação de erp seguro não corrige automaticamente tabelas public antigas. Nenhum dado real deve ser conectado enquanto persistirem exposições indevidas.

Comandos abaixo são roteiro, não execução remota realizada. Validar referência pelo acesso autenticado e conferir `--help` da versão fixada antes de uso; não colar credenciais na linha de comando:

```sh
npx --no-install supabase projects list
npx --no-install supabase migration list --remote=$STAGING_PROJECT_REF
npx --no-install supabase db advisors --remote=$STAGING_PROJECT_REF --type security
npx --no-install supabase db push --remote=$STAGING_PROJECT_REF --dry-run --skip-vault
```

A aplicação efetiva é uma etapa separada do dry-run. Não foi adicionada automação que publique migrations a cada push.

## 3. Identidade e jornada real

Preparar duas identidades sintéticas de teste por processo administrativo de Auth, sem cadastro público automático. Vincular a perfis/capacidades mínimos e unidades de demonstração explicitamente identificadas. Não atribuir perfil de administrador universal; não usar pessoas reais ou senhas fixas versionadas. O preset operacional de RP1 é Posterior conforme DRS 15.4; fixtures com Prévia são cenários técnicos, não o preset de implantação.

Configurar URL/chave publicável em `.env.local`/`.dev.vars` ignorados pelo Git. Primeiro validar a aplicação local contra o Supabase staging existente; depois publicar no destino Cloudflare existente confirmado, com mesma origem `/api`, rotas e HTTPS verificados. A conta/destino Cloudflare não foi auditada nesta preparação. Tokens de deploy não vão ao frontend; pipeline atual continua de qualidade, sem deploy automático.

| Cenário | Resultado necessário / evidência sanitizada |
| --- | --- |
| Login real e vínculo | getUser valida identidade; GET unidades/configuração só mostra unidade vinculada |
| Consulta sem edição | UI readonly; PATCH direto é negado pelo servidor/RPC |
| Edição com permissão | PATCH parcial com If-Match e motivo; revisão incrementada e auditoria atômica |
| Duas sessões, mesma revisão | Um salvamento e um 412; reaplicação preserva campos remotos não editados |
| Outra unidade, vínculo revogado, usuário inativo | Negação sem leitura/escrita cruzada, mesmo com token previamente emitido |
| Sem Bearer, anon/Data API e schema interno | Sem acesso às operações protegidas; erp_private não exposto |
| Falha e retorno | Rascunho preservado em erro HTTP; não prometer retomada após logout/reload; não apagar trilha para desfazer teste |

Registros sintéticos usados na validação ficam identificados para o plano de limpeza ao fim; nenhum cleanup destrutivo automático. Registrar ambiente, data, commit, resultado e limites. Não publicar tokens, emails, IDs de usuários ou dumps de linhas como evidência.

## Gate e evidências deste recorte

O script foi executado em PGlite vazio (antes de erp existir) e no laboratório com migrations/fixtures. Teste de regressão verifica transação readonly, metadados de RLS/owner e preservação de revisões/auditoria; CI também o executa no PostgreSQL 17 descartável. Não é inventário remoto. A suite SQL passa a 29 casos (28 + 1 concorrente omitido em PGlite; 29 esperados no PostgreSQL 17).

`npm run check` passou localmente em 09/11/2026: lint, tipos, 27 HTTP/adaptador, 28 SQL aprovados e 1 omitido no PGlite, builds e dry-run sem deploy. Nenhuma alteração na View; a suíte de 13 navegadores/cenários permanece no CI para verificação do commit publicado. O resultado remoto deve ser consultado na PR antes do merge.

O gate real permanece aberto até a tabela de cenários ter resultados hospedados e a fronteira Auth/RLS estar comprovada. FND-000 não foi fechada; AMB-001 não foi descongelada. Depois desse gate, seguir para políticas de aprovação e demais parâmetros CONFIG-001/DOM-001, preservando o DRS e suas decisões ainda abertas.

Fontes consultadas: [CLI v3 e destino explícito](https://supabase.com/changelog/supabase-cli-v3), [migrations e ambientes](https://supabase.com/docs/guides/deployment/managing-environments) e [schemas customizados](https://supabase.com/docs/guides/api/using-custom-schemas). A recomendação genérica de ambientes separados não altera o ADR-002 vigente.
