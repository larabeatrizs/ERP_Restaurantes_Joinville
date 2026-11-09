# SEC-003 — Contenção do public legado e retorno

Especificação em 09/11/2026, após INT-002. Recorte RNF-002/003/007/008/010. O legado permanece histórico; a contenção não o transforma em dependência da aplicação nova. AMB-001 permanece congelada.

## Contrato antes da execução

Não excluir tabelas/linhas ou alterar Auth, Storage, chaves, perfis e schemas novos. Para as 14 tabelas public identificadas, habilitar RLS sem políticas de acesso e revogar privilégios de anon/authenticated/PUBLIC nas tabelas e sequências associadas. Acesso administrativo/service_role e proprietários não é transformado em acesso de aplicação. Não adicionar políticas permissivas para compensar a restrição. Retorno restaura ACL/RLS originais a partir de artefato privado validado, sem apagar dados.

Aplicação exige inventário revalidado, lista exata de objetos, zero linhas sob bloqueio, ausência de políticas/colunas com grants especiais e teste local positivo/negativo/rollback. Transação e lock_timeout evitam mudança parcial ou espera ilimitada. Divergência aborta; não adaptar silenciosamente o script a outros projetos.

## Consumidores e dependências observados

O backend arquivado só expõe health; o frontend arquivado só consulta health. A aplicação nova usa explicitamente erp, não public. Na consulta remota não foram encontradas relações dependentes em outros schemas, publicações ou triggers customizados sobre public. Não é prova de inexistência de consumidores externos à conta/repositório. A direção vigente é desativar o acesso de aplicação ao legado arquivado; consumidores externos desconhecidos que usem anon/authenticated perderão esse acesso, como efeito deliberado de contenção.

## Salvaguarda de escopo restrito

O dump convencional pela CLI falhou por ausência de Docker/Podman. Os binários oficiais PostgreSQL 17.11 foram obtidos sem instalar serviços permanentes; tentativa pg_dump com TLS verify-full encontrou limitação de autenticação do login temporário no pooler, e outra tentativa CLI informou falta de IPv6.

Alternativa para este recorte: exportar metadados/ACLs de public e comprovar, na mesma consulta readonly, que todas as tabelas estão vazias. Gerador deve rejeitar linhas, tipos/objetos não suportados ou dependências externas. Reconstruir o artefato em PostgreSQL 17 local descartável e comparar objetos/constraints/ACLs; só então usá-lo como salvaguarda da contenção. Guardar conteúdo e SQL de retorno fora do Git; publicar apenas resultado/hash sanitizado.

Isso não é backup completo do projeto Supabase: Auth, Storage, Vault, configuração da plataforma, credenciais e histórico operacional estão fora do escopo. Não declara RNF-004 atendido ou autoriza dados reais. Para aplicar o schema novo, conferir separadamente o plano de retorno do incremento aditivo e as dependências de integração.

## Salvaguarda e operação preparadas

O exportador confirmou 14 tabelas vazias, 12 sequências e dependência uuid-ossp 1.1 no schema extensions. Em PostgreSQL 17.11 local descartável, a reconstrução reproduziu os metadados comparados de tabelas/colunas/defaults/constraints/índices, sequências, ACLs e flags de RLS. A contenção negou leitura a anon; o retorno reproduziu a baseline comparada. A cópia inclui dependência de extensão para reconstrução local, sem alterar a extensão hospedada.

Artefatos privados em `%LOCALAPPDATA%/CodexBackups/ERP_Restaurantes_Joinville/2026-11-09-sec003`, com herança de ACL removida e acesso concedido ao usuário atual: snapshot.json, restore-public.sql, rollback-public.sql, contain-public.sql e resultado de restauração. O [manifesto sanitizado](../evidencias/sec-003/backup-manifest.json) registra nomes/tamanhos/SHA-256, sem conteúdo de tabelas ou credenciais. Não é cópia externa à máquina nem garantia de retenção/RPO/RTO.

O exportador e gerador estão em `scripts/staging/export-public-vazio.sql` e `public-vazio.mjs`; a operação concreta é [conter-public-legado.sql](../../scripts/staging/conter-public-legado.sql). Retorno usa o SQL privado e só aceita objetos esperados e tabelas ainda vazias; com divergência, interromper e preparar retorno específico, sem reabrir acesso a dados inesperados. Operação de contenção é separada das migrations do produto para que reconstruir a aplicação nova não dependa de criar o legado.

Testes automatizados em `tests/database/legado.test.mjs`: rejeição de dados/objetos/colunas/extensões não suportados, negação de SELECT/INSERT por anon/authenticated, acesso administrativo preservado, retorno equivalente e aborto sem efeitos parciais quando há linha ou tabela inesperada. Os três casos passaram em PGlite e PostgreSQL 17.11 local. `npm run check` passou com 27 HTTP, 28 configurações SQL + 1 concorrente omitido no PGlite e 3 casos de contenção, além de lint/tipos/build. O CI verificará também a suíte de configurações no PostgreSQL descartável novo; tentativa de reutilizar o cluster local já com roles criadas foi rejeitada pelo bootstrap dessa suíte, sem mudança em código de produto.

Até esta preparação, nenhuma contenção foi aplicada no Supabase. Executar o SQL versionado somente após checks e conferência de destino/hash; depois repetir inventário, contagens/privilégios e advisor. A confirmação de êxito deve registrar as consultas posteriores, sem equiparar laboratório a operação remota.

Fontes: [backup/restauração Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [PostgreSQL para Windows e binários EDB](https://www.postgresql.org/download/windows/), [pacotes EDB](https://www.enterprisedb.com/download-postgresql-binaries) e [TLS do PostgreSQL no Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement). A CA Supabase foi obtida do bucket de distribuição `supabase-downloads` via HTTPS; verificação TLS não foi desabilitada.
