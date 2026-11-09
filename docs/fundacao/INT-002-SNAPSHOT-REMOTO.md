# INT-002 — Inventário remoto após autenticação

Data: 09/11/2026. Continuidade de INT-001. A responsável concluiu `supabase login` no terminal local; o acesso CLI funcionou. Projeto identificado: `rp-joinville-db`, referência `vpowsedoajpdbeckimuv`, região us-east-1, status ACTIVE_HEALTHY, PostgreSQL 17.11. A CLI rotula o destino como production; a classificação operacional continua **staging compartilhado**, conforme decisão expressa/ADR-002. Nenhuma infraestrutura nova foi criada.

## Evidência atual

[Resumo sanitizado das consultas](../evidencias/int-002/snapshot-2026-11-09.json). Metadados, contagens e advisors foram coletados sequencialmente no mesmo projeto; não constituem snapshot transacional único nem backup. As respostas completas ficaram locais, fora do controle de versão. Nenhuma linha de usuário, senha, token ou corpo de função foi publicado.

| Verificação | Resultado observado | Limite |
| --- | --- | --- |
| Schemas do recorte | Somente public; erp/erp_private ausentes | Outros schemas internos do Supabase não são o escopo desta consulta |
| Histórico de migrations | supabase_migrations.schema_migrations ausente | Não comprova ausência de alterações manuais anteriores |
| Legado | 14 tabelas public; RLS desabilitada em todas | Inventário não executa correções |
| Contagem real | Zero linhas em cada uma das 14 tabelas | Não afirma que Auth/Storage/outros schemas estejam vazios |
| Acesso efetivo de anon | USAGE public e SELECT nas 14; INSERT/UPDATE/DELETE com pelo menos um privilégio de escrita em todas | Não foi enviada requisição REST de escrita ou ensaio de exploração |
| authenticated | SELECT nas 14 | Perfil do domínio novo ainda não provisionado |
| Advisor de segurança | 14 erros rls_disabled_in_public | Retrato do instante consultado, não certificação completa |
| Backups | API listou zero backups; PITR desabilitado, WAL-G habilitado | Não comprova disponibilidade de uma restauração; nenhuma restauração testada |

## Correção verificada no coletor

A primeira tentativa com `db query --read-only --file scripts/staging/inventario.sql` foi negada pela CLI v3, pois o arquivo começava com BEGIN. Nenhuma escrita foi realizada. Remover `--read-only` não foi usado como contorno.

O coletor passou a conter somente SELECT; a CLI fornece a transação readonly. Executado novamente no projeto confirmado com sucesso, retornando `somente_leitura = on`. Uso em SQL Editor/MCP requer wrapper READ ONLY/ROLLBACK externo, conforme o cabeçalho. O teste de laboratório usa esse wrapper e verifica compatibilidade do arquivo, RLS/owner e preservação de revisões/auditoria. Não há migration nova ou alteração na View.

## Decisões de continuidade

O bloqueio de autenticação foi resolvido. **Os pré-requisitos de segurança e retorno da INT-001 ainda não foram satisfeitos**: backup restaurável não demonstrado e exposição/permissões do legado precisam de tratamento revisado. Não aplicar migrations ou provisionar dados de teste como se esses gates estivessem concluídos.

Próximo recorte concreto:

1. Inventariar consumidores/origens do public legado e suas dependências; verificar configuração de Data API e preparar contenção de acesso anon/authenticated que preserve os consumidores válidos. Definir/testar a alteração versionada antes de executá-la. Não copiar permissões permissivas para erp.
2. Preparar backup lógico privado e procedimento de retorno, incluindo schema/roles/grants e escopo Auth/configuração necessário; demonstrar que o artefato permite reconstrução antes de usá-lo como salvaguarda. Backups vazios na API não autorizam contratar serviços pagos ou presumir RPO/RTO atendidos.
3. Conferir dry-run explícito com skip-vault e aplicar apenas as duas migrations esperadas no momento adequado, sem reset/drop ou dados pessoais. Validar grants/RLS/advisors novamente; só então expor erp e provisionar identidades/vínculos sintéticos controlados.
4. Validar a jornada real WEB/API/Auth/RPC e os cenários de negação/concorrência da INT-001. Deploy Cloudflare, preset RP1 Posterior e demais políticas permanecem sujeitos ao respectivo plano.

Nenhum desses passos de escrita foi executado neste inventário. AMB-001/issue #9 continua congelada ao final. FND-000 recebe nova evidência para a revisão de seus critérios, sem fechamento automático ou declaração FND_READY. O inventário atual substitui a necessidade de presumir que o snapshot histórico ainda vale; não altera o DRS nem encerra DOM-001.

## Verificações

CLI autenticada: projects list, inventário readonly, contagens readonly, privilégios efetivos readonly, advisors security e backups list no destino explícito. Laboratório SQL: 28 testes passaram e o concorrente foi omitido no PGlite; CI deve confirmar 29 em PostgreSQL 17. A coleta remota é leitura real, mas não demonstra login funcional da aplicação nem salvamento hospedado.
