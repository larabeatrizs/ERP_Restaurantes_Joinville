# CAD-006 — Ciclo de vida de Produtos

**16/11/2026 — especificação/implementação em preparação, issue [#37](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/37), continuidade de #31/D1.** Fontes: seção 7.1/RF-003, RN-001/002/022, CA-001, matriz 4.2 e RNF-002/003/008/010. Não conclui RF-003 integral nem representa aceite institucional.

## Decisão da responsável

Em 16/11 a responsável confirmou: excluir definitivamente somente produto nunca usado e vinculado apenas à unidade atual; remover seus parâmetros locais na mesma transação. Vínculo em outra filial, entrada (inclusive rascunho/recusa), lote ou movimentação impede exclusão; oferecer inativação global. Não implementar desvinculação local. Este esclarecimento trata os parâmetros da própria unidade como parte do cadastro e preserva RN-002 para referências externas/histórico. Cadastros continuam compartilhados e inativação afeta todas as unidades.

## Contrato técnico

`PRODUTO_GERIR` mantém I; nova capacidade `PRODUTO_CICLO_VIDA` controla X. Estoquista edita sem inativar/excluir; gestor de unidade/nutricionista podem receber X segundo a matriz, sem concessão automática a ADMIN. Leitura existente mantém acesso. Evitar bypass pela criação/edição antiga com `status`: mudança exige X, inclusive criação já inativa.

Lista/retorno de Produto inclui `pode_excluir` e `motivo_exclusao` genérico, sem identificar filial alheia, notas, quantidades ou atores. Contexto informa `produto_ciclo_vida`. POST `/api/unidades/:unidade/produtos/:id/status` recebe apenas revisão e status; DELETE `/api/unidades/:unidade/produtos/:id` apenas revisão. Rejeitar campos extras/coerções, autenticar antes do acesso e revalidar unidade/capacidade/revisão após locks. Revisão obsoleta retorna 412; vínculo/histórico retorna 409; usuário sem X 403, unidade/produto indisponível 404.

RPC privada com escritor restrito, wrapper invoker, RLS e DML direto negado. Produto é bloqueado FOR UPDATE, compatível com recebimento/vínculo; reavaliar elegibilidade sob lock e manter FKs como defesa. Remover somente parâmetros locais elegíveis/produto e gravar antes/depois em auditoria atomicamente. Falha na auditoria reverte também exclusão/inativação. Não alterar migrations anteriores.

RLS operacional esconde referências de filiais alheias; uma consulta feita só pelo escritor atual produziria elegibilidade incorreta. Helper privado devolve somente motivo genérico, com executor próprio NOLOGIN/NOBYPASSRLS, SELECT apenas em vínculos/itens/lotes e políticas próprias de leitura. Somente o escritor pode executá-lo; o cliente não pode chamar o helper ou assumir o papel. Autorização de unidade/produto ocorre na RPC externa antes de utilizá-lo. Não ampliar a leitura operacional de authenticated/estoquista. Testar particularmente vínculo de outra filial sem conceder acesso a ela.

## Verificação e limites

Testar API/SDK estritos e permissões; PostgreSQL: exclusão com parâmetros locais, bloqueio de outra filial/rascunho/lote/movimento, X separado de I, bypass de status na edição, revisão, rollback/auditoria, DML/helper direto negado e espera por locks com revogação/novo vínculo/recebimento. UI: confirmar/cancelar, explicar impedimento/inativação global, readonly, erro com dados preservados, 360/768/1280 px e relatório existente.

Staging usará somente contas sintéticas reservadas e novos produtos isolados; não excluir demonstrações anteriores, resetar banco, alterar conta pessoal ou capacidades ADMIN. Fixtures concedem X apenas a perfis sintéticos GESTOR_UNIDADE verificados. Evidências e resultados serão preenchidos após execução. SMTP geral, importação final, skeleton, RF-006/RF-008 integral e AMB-001 permanecem próprios.

## Evidências locais — 16/11

`npm run check` passou: lint/tipos, 91 API, 32 configurações (31 passaram/1 concorrente ignorado no PGlite), 50 estoque (44 passaram/6 concorrentes ignorados no PGlite), legado/provisionamento e build/dry-run. O laboratório PostgreSQL 17.11 em loopback executou separadamente os **50 testes de estoque sem skips**, incluindo concorrência de revogação de X, novo vínculo e recebimento durante a espera. Laboratório descartável em `.git/pg-cad006`, sem novo ambiente permanente ou acesso ao banco hospedado nesses testes. Helper e executor de referências tiveram ACL, search_path e grants de SELECT limitados às três tabelas conferidos no laboratório. CI nativo e jornada hospedada ainda serão registrados.

As primeiras execuções apontaram ajustes de fixtures/expectativas para a nova permissão e o allowlist dos dois helpers, seletor acessível do status e unidade explícita no novo teste de vínculo. Uma rodada de navegador coincidiu com o build e recarregou o Vite; a rodada final roda separadamente. Não tratar tentativas interrompidas/falhas como evidência de sucesso. Build mantém aviso de chunk principal acima de 500 kB, pendência de desempenho existente.
