# DB-004 — Aplicação aditiva da fundação no staging

Especificação: 09/11/2026. Continuidade SEC-003; RNF-002/003/008/010/011, contratos DB-001/CONFIG-002/API-001. O usuário autorizou continuar o plano no staging compartilhado e integrar as alterações verificadas à main. AMB-001 permanece congelada.

## Escopo e pré-condições

Aplicar somente as duas migrations já versionadas e testadas: `20261106201235_configuracoes_identidade_base.sql` e `20261106202428_configuracoes_salvamento_mediado.sql`. Não provisionar identidades, perfis/capacidades/unidades, não mudar Auth/Storage/Vault/exposição Data API, não executar fixtures/bootstrap de testes, não criar ambientes nem apagar objetos/dados.

Projeto confirmado: rp-joinville-db / vpowsedoajpdbeckimuv, operacionalmente staging conforme ADR-002, apesar do rótulo production da CLI. Preflight readonly confirmou auth.uid() existente e erp/erp_private/erp_config_writer ausentes. A contenção de public deve ser revalidada antes/depois; cópia restrita SEC-003 e manifesto permanecem privados e não são backup completo da plataforma.

O dry-run da CLI 3.0.0 com destino explícito e `--skip-vault` retornou exatamente os dois arquivos, sem seeds/roles extras. Não usar include-all, repair ou reset para acomodar divergência. Cada migration é transacional; a sequência não é atômica entre arquivos. Se a segunda falhar, inventariar o incremento já aplicado e corrigir por migration revisada, sem excluir a primeira ou reparar histórico por inferência.

## Retorno não destrutivo

[desativar-fundacao.sql](../../scripts/staging/desativar-fundacao.sql) suspende USAGE de authenticated nos schemas novos, privilégios nas tabelas/sequências erp e EXECUTE nos dois entrypoints de salvamento, se existirem. A revogação de privilégios das relações complementa USAGE para sessões que já resolveram objetos. Um bloco DO fornece atomicidade inclusive quando apenas a primeira migration tiver sido concluída. Preserva dados, trilha, schemas, função interna, papel executor, public e histórico de migrations. Não equivale a retornar fisicamente ao schema anterior: é isolamento por desativação até correção aditiva revisada.

Se necessário, suspender também consumo na aplicação/exposição nova conforme o destino realmente configurado; neste recorte nada disso foi habilitado. Não reabrir acesso de aplicação ao public legado como fallback. Reativação demanda correção/verificação e grants revisados; não será automática. Usuários administrativos continuam responsáveis por preservar o estado para diagnóstico.

## Aplicação e aceite técnico

Depois de testar retorno/verificadores e publicar o recorte revisável, usar `supabase db push --remote=vpowsedoajpdbeckimuv --skip-vault --yes`. A confirmação CLI corresponde à autorização vigente; não amplia o escopo. Guardar resultado/histórico sanitizados, conferir grants/default privileges efetivos do Supabase e rodar advisors após a aplicação. Se grants hospedados diferirem do laboratório, corrigir por migration própria/testada antes de expor dados.

[verificar-fundacao.sql](../../scripts/staging/verificar-fundacao.sql) deve confirmar sete tabelas vazias com RLS, anon sem acesso, authenticated sem DML direto, papel escritor restrito e sem associação a authenticated, função privilegiada somente em erp_private com owner/search_path corretos e wrapper invoker. Reexecutar verificar-contencao.sql: 14 tabelas public ainda vazias e protegidas. Nenhum teste com claims simuladas será apresentado como login real.

O gate desta entrega é persistência/segurança estrutural hospedada, não jornada operacional. Próximo recorte: configurar exposição somente de erp após essa validação, preparar identidades/vínculos/capacidades sintéticos por administração de Auth e verificar a jornada real. Banco completo, demais módulos e RNF-004 continuam pendentes.

## Verificação local antes da aplicação

`npm run check` passou: lint/tipos, 27 HTTP/adaptador, laboratório de configuração e 3 casos de contenção, builds/dry-run. Os dois novos casos de verificação/retorno passaram em PGlite; a suíte SQL passa a 31 casos (30 aprovados e 1 concorrente omitido localmente). O CI PostgreSQL 17 deve confirmar os 31, incluindo duas conexões reais. Retorno testa negação de SELECT/RPC e preservação das revisões; não é ensaio de desastre ou backup completo. Nenhum dado de fixture será inserido no staging por esses testes.

## Execução hospedada e evidências

Em 09/11/2026, após CI do commit `f42b807` [42629430123](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42629430123) com success nos três jobs, as duas migrations foram aplicadas pela CLI no projeto confirmado, com `--skip-vault --yes`. O comando terminou com as duas versões esperadas, sem seeds/roles extras. A segunda migration criou seu papel executor como parte do SQL revisado; roles=[] na CLI significa que não houve arquivo de roles extra.

[Evidência sanitizada posterior](../evidencias/db-004/staging-after.json), produzida por consultas readonly e listagem de histórico:

- Sete tabelas erp vazias com RLS; anon sem USAGE/SELECT e sem EXECUTE nas funções do recorte; authenticated sem DML direto.
- erp_config_writer sem LOGIN, SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, CREATE no schema interno ou associação a authenticated. Uma função definer, em erp_private, owned por esse papel com search_path vazio; wrapper erp invoker.
- As 14 tabelas public permaneceram vazias e contidas, com RLS e sem acesso de aplicação às tabelas/sequências. Nenhum acesso ao legado foi reaberto.
- Histórico local/remoto coincide em 20261106201235 e 20261106202428. Os horários exibidos na listagem pertencem aos identificadores das migrations, não à data desta aplicação.
- Advisor de segurança após a aplicação: zero achados. Novo dry-run retornou upToDate=true, migrations=[], seeds=[] e roles=[].

O plano de desativação não precisou ser executado no staging. Não houve reset/drop, provisionamento de usuários/unidades/capacidades, alteração de dados Auth/Storage, deploy ou mudança de configuração de exposição da Data API. Não afirmar que os schemas foram testados via HTTP/JWT real: o próximo recorte verificará/configurará a exposição e as identidades sintéticas. Estas evidências não encerram FND_READY nem RNF-004. Documentação posterior exige seu próprio CI antes de merge.
