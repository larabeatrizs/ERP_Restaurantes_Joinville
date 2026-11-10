# CAD-002 — Produto compartilhado e vínculo por unidade

Data: 10/11/2026. Continuidade D1 de [EST-001](EST-001-PRIMEIRO-FLUXO.md), [PROJETO](../PROJETO.md) e [plano](../planejamento/PLANO-ATE-10-11.md). [Issue #22](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/22). Estado atual: implementado, migration aplicada e jornada API/UI hospedada aprovada. Não encerra RF-003 ou D1 integrais. Especificação inicial e limites preservados abaixo.

## Fonte, problema e escopo

[DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), RF-003, seção 7.1, RN-001/003/012/013/019/022 e RNF-002/003/008/010/011/015. RF-003 separa produto global de parâmetros filhos por unidade. O contrato de catálogo compartilhado/permissões específicas foi confirmado em EST-001. Hoje, criar o mesmo produto em outra unidade falha por unicidade global, e a busca local não oferece vínculo ao cadastro existente.

Entregar busca de produtos ativos ainda sem vínculo, seleção e parâmetros locais, sem copiar cadastro ou saldo. Não entrega CRUD integral de RF-001/002/003/004, exportação/exclusão, desvinculação, administração privilegiada, recebimentos novos ou transferência entre unidades. A responsável confirmou nesta conversa que seu acesso pessoal funcionou; sua conta de acompanhamento mantém somente consulta e não participa dos testes de escrita.

## Contrato observável

- A unidade selecionada é o destino. Ator ativo/vínculo ativo são obrigatórios; PRODUTO_LER permite busca, PRODUTO_GERIR permite vínculo. Não conceder ação por ADMIN, CONFIGURACAO_EDITAR ou parâmetro da tela.
- Busca textual normalizada em descrição/complemento, ordenada por descrição/ID, páginas de 50, offset inteiro limitado. Somente produto, categoria e medida ativos, ainda sem produto_unidade no destino. Não retornar origem do vínculo, mínimo/máximo/reposição, lotes, preços ou saldo de outra unidade.
- Seleção mostra nome/complemento, categoria, unidade-base e apresentação. Estoque mínimo obrigatório >=0; máximo opcional >=mínimo; reposição opcional >=0. Decimais e IDs continuam strings, sem arredondamento em Number.
- Salvar exige a revisão global selecionada. Produto alterado desde a seleção retorna 412, sem vínculo. Não modificar descrição, unidade-base, status, revisão ou parâmetros de outra unidade.
- Vínculo e auditoria antes/depois na mesma transação. Não criar lote, saldo ou movimento. Repetição com revisão/parâmetros idênticos retorna o vínculo atual sem nova auditoria; parâmetros diferentes em vínculo já existente retornam 409. Edição posterior usa o fluxo existente, não sobrescrita implícita do vínculo.
- Serializar pelo produto e conferir revisão/status/capacidade novamente após espera. Bloquear medida/categoria antes do produto, na ordem já usada por edição, sem upgrade de lock ao inserir FK. Revogação/inativação durante a espera nega a escrita. Falha de auditoria desfaz o vínculo.

## DTOs e rotas

GET `/api/unidades/{id}/produtos/disponiveis?q=...&offset=0`: resposta `{produtos,total}`. Produto disponível contém somente `id,revisao,descricao,complemento,unidade_sigla,categoria_descricao,apresentacao_compra,armazenamento`. Não possui parâmetros locais fictícios.

POST `/api/unidades/{id}/produtos/{produtoId}/vinculo`: corpo exato `{revisao,estoque_minimo,estoque_maximo,ponto_reposicao}`; resposta 200 `{produto}` com o DTO Product existente e ETag forte, no-store/no-transform. Sem sessão 401; ação negada 403; unidade/produto indisponível 404; vínculo conflitante 409; revisão antiga 412; valores inválidos 422. Rejeitar campos globais, ator/unidade no corpo e filtros desconhecidos.

Cadeia: ProductPanel → ProductLinkPanel → StockApi → stockController → StockService → StockRepository → adaptador Supabase → RPC `erp.catalogo_unidade` → função privada de mesmo nome. A View não consulta tabelas nem decide autorização. Contratos em packages/contracts; DTO disponível distinto do cadastro local.

## Banco e fronteira de autorização

Migration aditiva criada pela CLI originalmente como `20261110174242_catalogo_vinculo_unidade.sql`; aplicação pelo conector registrada como `20261110175800`, alinhada no [arquivo atual](../../supabase/migrations/20261110175800_catalogo_vinculo_unidade.sql) somente por renomeação. Nenhuma migration anterior alterada, tabela/role nova ou seed. Reusar produto_unidade, auditoria_estoque e o executor erp_stock_writer sem login/bypass/USAGE auth. Nova função privada estreita com SECURITY DEFINER, search_path vazio e EXECUTE negado a PUBLIC/anon; wrapper exposto SECURITY INVOKER. Não liberar DML direto. Atualizar allowlist de funções privilegiadas e validar advisor.

O helper recebe somente ações `disponiveis` e `vincular`, deriva ator da sessão e valida a capacidade da unidade. Não vira motor genérico de CRUD nem aceita ator, schema ou SQL do cliente. Link audita `produto_vincular`/`produto_unidade` com antes nulo e depois somente dados do destino. Validação JSON estrita também no banco protege chamadas RPC diretas.

Retorno: desativar/revogar novas rotas/RPC, mantendo vínculos e auditoria; o runtime anterior continua consultando os produtos já vinculados. Não reverter por DELETE/reset. Staging compartilhado conforme ADR-002, AMB-001 congelada.

## Interface e estados

Compor com shell, campos, tabela e botões existentes; não alterar HTML mestre do Style Guide. Em Produtos, botão **Vincular produto existente** para quem pode escrever. Fluxo: buscar no catálogo → selecionar → informar parâmetros da unidade → salvar → voltar à lista local com confirmação. Não pedir IDs técnicos, duplicar campos globais editáveis ou sugerir saldo compartilhado.

Estados: carregando, vazio, acesso somente consulta, selecionado, validação, salvando, sucesso, falha recuperável e conflito. Preservar os parâmetros após erro; avisar antes de descartar edição ou mudar unidade. Durante salvamento bloquear navegação. Recriar estado ao mudar unidade. Página de 360 px sem overflow global; tabela com rolagem local/teclado.

## Verificação planejada

SQL em PGlite/PostgreSQL 17: produto único, dois parâmetros independentes, revisão e saldo preservados; repetição/concorrência sem duplicação; 412/409; inválidos/inativos; ator alheio/readonly/revogado; DML negado; falha de auditoria atômica. Concorrência real e revogação durante espera precisam de duas conexões PostgreSQL, não inferir aprovação por PGlite.

HTTP/adaptador: rotas/IDs/corpo estritos, Bearer, erros SQLSTATE, retorno sem dados locais de outra unidade e ETag. Navegador: busca/seleção, mínimo/máximo, erro preserva entrada, reabertura, consulta sem escrita e responsividade. CI deve passar antes de aplicar no staging.

Integração real opt-in: usar editor A/B e leitor sintéticos; criar produto de demonstração em A, vincular a B e verificar nova sessão e saldos/livro sem mudanças. Conta pessoal não é fixture; não ler/resetar sua senha ou usar seu link. Conferir histórico/grants/advisor antes/depois, publicar no mesmo Worker e registrar evidências sem emails, UUIDs Auth, JWTs ou segredos. Evidência planejada não encerra a issue.

Referências técnicas: [funções de banco e privilégios](https://supabase.com/docs/guides/database/functions), [locks no PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html).

## Implementação e validação local

Camadas e contratos implementados, com ProductLinkPanel carregado sob demanda. A nova função privada usa o executor existente e passou na allowlist de funções privilegiadas, sem DML de cliente ou ampliação de capacidades. A notificação de reload do schema PostgREST é emitida na migration, sem recriar serviços.

Verificações locais: lint/tipos/build e `npm run check` aprovados; 59 testes HTTP/adaptadores, 25 de estoque no PostgreSQL 17.11 (todos aprovados, incluindo duas conexões/revogação durante espera), 32 de configurações em PGlite (31 aprovados/uma concorrência omitida), contenção/provisionamento e 31 de navegador. As três jornadas novas de vínculo foram revalidadas após separar o chunk da tela. O laboratório PostgreSQL em loopback foi encerrado; nenhuma alteração no banco hospedado até este ponto. CI, aplicação da migration, deploy e jornada hospedada ainda pendentes.

## Publicação e resultado hospedado

Após a etapa local acima, o [CI 42870027881](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42870027881) aprovou os quatro jobs, incluindo 25 casos de estoque no PostgreSQL e 31 de navegador. O inventário confirmou quatro migrations anteriores coincidentes, nova RPC ausente, 20 tabelas RLS, seis produtos/vínculos/movimentos e 21 eventos. Somente então foi aplicada a migration nova pelo conector. SHA-256 do arquivo antes/depois da renomeação: `3faf7dfeecb7efc546bf86d46bb0b4d6ead65ff8e258d484e0b0506be79c8609`; corpo SQL preservado.

Runtime `b8edce570c2111a1bd05e158adcb5a8c174439f6`, versão Cloudflare `57520357-122d-4b67-a149-b901d706c36e`, na [mesma URL do staging](https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev). Build refez o bundle após as alterações; somente URL/chave publicável no Worker, sem chave administrativa. Os registros locais anteriores são históricos, não evidência de hospedagem.

`npm run test:staging:catalog` completou seis cenários reais, sem mocks/traces: dois produtos sintéticos criados em A, um vinculado por API e outro pela UI em B; consulta sem dados locais da origem; reenvio idêntico, 409/412; negações sem sessão/readonly/unidade alheia/DML/campos globais; nova sessão e saldos preservados. [Resultado](../evidencias/cad-002/jornada-hospedada.json), [catálogo móvel](../evidencias/cad-002/catalogo-360.png) e [parâmetros reabertos](../evidencias/cad-002/parametros-1280.png). Capturas inspecionadas, sem identidade Auth, email ou credencial. Conta pessoal da responsável não foi usada; sua confirmação de acesso permanece em ADM-001.

[Pós-condições](../evidencias/cad-002/verificacao-banco.json): oito produtos, dez vínculos (dois em B), seis recebimentos/lotes/movimentos preservados, 25 eventos de estoque (21 anteriores + dois cadastros + dois vínculos), nenhuma divergência livro/saldo e nenhum saldo em B. Existem cinco migrations, 20 tabelas erp com RLS e três funções privadas privilegiadas conhecidas. Executor e grants novos verificados: sem USAGE auth/CREATE/membership do cliente, wrapper invoker, implementação owned por erp_stock_writer e anon sem EXECUTE. Advisor mantém 14 INFO do legado contido e WARN de senhas vazadas, sem achado adicional.

Concorrência/revogação durante lock e falha induzida de auditoria foram exercitadas no PostgreSQL local/CI, não induzidas no banco hospedado. Evidência não significa CRUD integral, transferência de estoque, fim de D1, encerramento automático da issue ou produção. Próximas dependências continuam os cadastros auxiliares de medidas/categorias/fornecedores e os demais contratos D1, preservando o acompanhamento pessoal e AMB-001 congelada.
