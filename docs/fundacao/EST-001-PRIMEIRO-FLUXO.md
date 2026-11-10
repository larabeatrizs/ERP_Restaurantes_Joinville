# EST-001 — Primeiro fluxo de estoque no staging

09/11/2026. [Issue #16](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/16). Meta solicitada e delimitada pela responsável: versão utilizável com primeiro fluxo de estoque antes de 11/11 (até 10/11, America/Sao_Paulo). Fonte: DRS RF-003/RF-012/RF-017 parciais, RN-003/004/005/010/019/022/025/026/037, RNF-002/003/008/010/015, DATA-001 e TRANSACOES_ESTOQUE. Não encerra D1 ou autoriza dados reais/produção. Referência visual: frames Produtos/Cadastro de produto/Entrada de materiais; consulta de saldo é estado complementar identificado neste recorte, usando os mesmos tokens/componentes sem alterar o Style Guide.

## Decisão confirmada na conversa

A responsável adotou para o staging: catálogo compartilhado com escrita específica para gestor/nutricionista/estoquista; recebimento confirmado pelo estoquista; NF única por fornecedor+número inclusive entre unidades; gestor aprova divergências. Contas/fornecedores sintéticos. Capacidades separadas de CONFIGURACAO_EDITAR; vínculo/unidade/ator ativos revalidados por ação. Aprovação de divergência exige ator distinto do lançador. Série/chave não compõem a unicidade neste recorte; não há exceção entre unidades.

## Contrato coordenado de implementação

API base `/api/unidades/{unidade}`; Bearer real obrigatório, Cache-Control no-store, números decimais e bigint serializados como strings. IDs/dados inválidos retornam 422/400; falta de ação 403; contexto de unidade não autorizado 404; conflito/duplicidade 409; revisão de produto vencida 412. Escrita não aceita ator/perfil do cliente. Corpo limitado e JSON estrito. HTTP encaminha DTOs validados ao serviço/repositório; o banco confirma invariantes atomicamente.

RPC única `erp.estoque_operacao(p_unidade bigint,p_acao text,p_dados jsonb)` retorna jsonb, wrapper invoker e executor interno restrito, sem BYPASSRLS; sem DML de aplicação em livro/saldo/documento. Ações: contexto, produtos, produto_salvar, entradas, entrada_criar, entrada_confirmar, entrada_aprovar_divergencia, saldos.

| HTTP | Ação RPC | Dados |
| --- | --- | --- |
| GET /estoque/contexto | contexto | {} |
| GET /produtos?q=&status=ATIVO&offset=0 | produtos | {q,status,offset}; até 50 por página |
| POST /produtos | produto_salvar | ProdutoInput |
| PATCH /produtos/{id} | produto_salvar | ProdutoInput + id + revisao |
| GET /entradas | entradas | {}; últimas 50 com itens |
| POST /entradas | entrada_criar | EntradaInput |
| POST /entradas/{id}/confirmar | entrada_confirmar | {id,chave}; chave UUID idempotente |
| POST /entradas/{id}/aprovar-divergencia | entrada_aprovar_divergencia | {id,motivo} |
| GET /estoque/saldos | saldos | {} |

ProdutoInput: descricao, complemento (vazio permitido), unidade_medida_id, categoria_id, perecivel boolean, armazenamento SECO/RESFRIADO/CONGELADO, fator_correcao decimal positivo, apresentacao_compra, quantidade_apresentacao decimal positivo, estoque_minimo decimal >=0, estoque_maximo nullable, ponto_reposicao nullable e status ATIVO/INATIVO. Produto retorna esses campos, id/revisao string, unidade_sigla e categoria_descricao; escritas retornam {produto}. Unicidade global normalizada por descrição+complemento; parâmetros locais por unidade. Neste recorte a listagem mostra apenas produtos já configurados na unidade, com mínimo obrigatório; vincular um produto global preexistente a outra unidade terá fluxo próprio. Unidade-base imutável após movimento; cadastros ativos exigidos. Sem saldo editável no produto.

EntradaInput: data_entrada ISO, fornecedor_id, numero_nf, total_nota decimal nullable, observacoes e itens (1–50). Cada item: produto_id, quantidade decimal >0, valor_unitario decimal >=0, numero_lote nullable, validade ISO nullable, camara_id, temperatura decimal assinado nullable, aspecto_embalagem, conformidade CONFORME/RESSALVA/RECUSADO, motivo (obrigatório em ressalva/recusa). Origem COMPRA neste recorte. Quantidades em unidade-base; não inferir conversão/apresentação. Resfriado/congelado exige temperatura; perecível exige validade >= entrada e lote informado ou gerado de forma determinística. Data de entrada não futura em America/Sao_Paulo. Total divergente bloqueia confirmação até aprovação distinta do gestor; aprovação não credita estoque. Confirmar cria lote/movimento/saldo somente para itens aceitos, documento imutável e auditoria na mesma transação. Reenvio com mesma chave não duplica; outra chave em confirmado também não credita novamente. Corrida de NF/fornecedor entre unidades converge por constraint global. Livro e auditoria imutáveis.

Contexto retorna medidas [{id,sigla,descricao}], categorias [{id,descricao,armazenamento_padrao}], fornecedores [{id,razao_social}], locais [{id,nome,tipo}], capacidades {produto_escrever,recebimento_escrever,divergencia_aprovar}. Produtos retorna {produtos,total}; entradas retorna {entradas}, cada entrada com id,unidade_id,data_entrada,fornecedor_id,fornecedor,numero_nf,total_nota,total_itens,observacoes,estado,divergencia_aprovada boolean,itens. Saldos retorna {saldos:[{produto_id,produto,unidade_medida,lote_id,lote,validade,camara_id,local,quantidade,valor_unitario}]}. Decimais e IDs sempre strings; contagem total integer.

## Verificação e limites

Testar criação/busca/edição de produto e duplicidade normalizada; compra de 20 kg → 20 kg no lote/local esperado; nova sessão preserva dados; recusa não credita; confirmação repetida/concorrente e NF cruzada não duplicam; erro de item/auditoria reverte o conjunto; leitura/escrita cruzada, inativo, revogado e leitor negados; DML direto e mutação de confirmado negados. Usar PostgreSQL 17 e Auth/API/UI hospedados reais antes de declarar o fluxo concluído. Dados sintéticos preservam trilha para a limpeza final planejada.

CRUD integral/carga inicial de catálogos, exclusão/exportação, doações, cotações, estorno, saídas, perdas e inventário continuam nos seus recortes. AMB-001 permanece congelada; não provisionar ambientes permanentes adicionais. Este documento fixa o recorte técnico autorizado para implementação, sem ratificar DOM-001 em bloco ou inventar aceite institucional. Resultados, CI, commit e URL serão acrescentados após execução.

## Implementação e verificação local

Migration criada pela CLI como `20261109175928_primeiro_fluxo_estoque.sql`, testada no commit 4a6d2cc; conector hospedado registrou a versão `20261110114252`, alinhada no arquivo [atual](../../supabase/migrations/20261110114252_primeiro_fluxo_estoque.sql) por renomeação. Corpo SQL preservado. São 13 tabelas novas, total de 20 tabelas erp com RLS. Executor `erp_stock_writer` NOLOGIN/NOBYPASSRLS e sem USAGE auth; helper oficial da identidade preservado. Duas funções internas privilegiadas conhecidas no conjunto do produto, cada qual com executor próprio; não há DML de aplicação sobre documentos/livro/saldo/auditoria. Nenhuma permissão operacional é concedida a usuários reais por esta migration.

`npm run check` passou: lint/tipos/build integrado, 56 testes HTTP/adaptadores, 32 de configurações (31+1 omitido PGlite), 19 de estoque (18+1 omitido PGlite) e cinco de contenção/provisionamento. Os 19 testes de estoque passaram também no PostgreSQL 17.11 local, incluindo confirmações concorrentes com chaves distintas, NF concorrente entre unidades e revogação durante espera por lock. O servidor descartável em loopback foi encerrado; nenhum ambiente permanente foi criado. CI acrescenta job PostgreSQL de estoque próprio e efêmero, isolado da suíte de configurações.

Revisão independente encontrou e corrigiu upgrade de lock por FK da idempotência, ordem dos locks do catálogo, snapshot de unidade-base no item e revalidação da capacidade após espera. Entradas guardam a unidade da quantidade do rascunho e rejeitam confirmação se o catálogo mudou; não reinterpretam 20 kg como outra unidade. A lista por unidade inclui apenas produtos já configurados, conforme limitação explícita acima.

Bootstrap: quarta conta Auth sintética (estoquista A) criada/confirmada/autenticada por Auth Admin, sem email solicitado e sem escrita SQL em auth.users. Credenciais/estado ficam fora do checkout em `%LOCALAPPDATA%/CodexSecrets/ERP_Restaurantes_Joinville/int003/stock-identidades.json`. [Gerador administrativo](../../scripts/staging/estoque-sintetico.mjs) exige IDs/unidades verificadas e novos catálogos vazios; produz SQL privado, não o executa. Cria medidas/categorias/locais/fornecedor de demonstração e capacidades específicas para os perfis sintéticos existentes. Documento numérico do fornecedor é sintético, sem validação fiscal real ou alegação de RF-004 completo. Não repetir sobre catálogos preenchidos nem aplicar fixtures de laboratório ao Supabase.

Verificadores reais separados do CI: `ERP_STOCK_TEST_STATE` aponta ao arquivo privado, `ERP_STAGING_URL` ao endereço exato confirmado no deploy, `npm run test:staging:stock` e `npm run test:staging:stock:web`. Guardas recusam outro projeto ou domínio genérico, mas a propriedade da conta é confirmada pelo deploy, não apenas pela regex de hostname. Testes mantêm auditoria e geram novas demonstrações identificadas. Sem mocks/traces; capturas apenas após login e resultados privados com completed distinguem interrupção de sucesso. Revisar e sanitizar antes de publicar. Resultados local e hospedado são registrados separadamente abaixo.

## Resultado real em 10/11

CI [42672947023, tentativa 2](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/42672947023/attempts/2) aprovou os quatro jobs, incluindo PostgreSQL de configurações/estoque e navegador. A tentativa inicial ocorreu durante [incidente de Actions/Checks](https://www.githubstatus.com/incidents/tp8cghg7tlc4) e exibiu apenas dois jobs; sua falha não foi tratada como aprovação. Reexecução completa preservou o gate. Correção móvel posterior passou 23 testes de navegador localmente e requer o CI do próximo commit.

A CLI local ficou aguardando conexão durante o dry-run, antes da escrita; a execução foi interrompida e o histórico conferido ainda tinha três versões. O conector Supabase aplicou o mesmo SQL aprovado e registrou `20261110114252`. [Verificação](../evidencias/est-001/verificacao-banco.json) confirma quatro versões, 20 RLS e executor sem privilégios ampliados. SHA-256 do corpo normalizado: `d3de54bcd7b4439d832016644d46d7635eed77289d8d8099bae9aa688bbfeb8e`; comparação com 4a6d2cc confirmou preservação do corpo. Migrations anteriores intactas.

Bootstrap administrativo executado somente sobre os catálogos vazios da fundação sintética: quatro usuários, duas medidas, duas categorias, um fornecedor e três locais. [Jornada local real](../evidencias/est-001/jornada-local.json): seis cenários HTTP e cinco fluxos de navegador completos, sem mocks, incluindo duas compras de 20 kg (API e UI), nova sessão, leitura sem escrita, concorrência/reenvio/NF e DML direto negados. Pós-condições: dois produtos/entradas confirmadas/lotes/movimentos, sete eventos de auditoria, saldo de 20 kg em cada lote e nenhuma divergência entre livro e saldo. Registros/trilha preservados.

Capturas revisadas: [produtos](../evidencias/est-001/produtos-local-1280.png), [recebimento](../evidencias/est-001/recebimento-local-1280.png), [saldo móvel corrigido](../evidencias/est-001/saldo-local-360.png). A revisão real encontrou quebra de texto letra a letra apesar de a página não ter overflow; tabela ganhou largura mínima, colunas legíveis e rolagem local por toque/teclado. Regressão verifica rolagem, largura/altura de células e página de 360 px; consulta real após rebuild passou sem novas escritas.

Advisor posterior mantém os avisos já conhecidos: 14 INFO do public intencionalmente contido e WARN de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Sem alteração global de Auth/contratação de plano neste recorte. O 403 de publicação foi resolvido com a autorização efetivamente confirmada; o resultado hospedado posterior está registrado a seguir.

## Resultado hospedado em 10/11

[Staging online](https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev), com [OPS-001](OPS-001-PUBLICACAO.md) e [evidências](../evidencias/ops-001/jornada-hospedada.json). Runtime final 31bfcf6, versão `66a6571d-a228-41cf-9c6b-88125818e0af`, após CI dos quatro jobs. Os seis cenários HTTP e cinco fluxos UI de estoque passaram no endereço exato retornado pelo deploy, com Auth/Data API reais e sem mocks. Configurações também passaram após correção do transporte de ETag na Cloudflare.

O produto, a compra de 20 kg, a confirmação única, a consulta de lote/local/saldo e a recuperação em nova sessão foram demonstrados; negações por ação/unidade, NF duplicada e DML direto foram verificadas. Capturas desktop/móvel em OPS-001. As rodadas adicionais conservaram trilha e produziram um acumulado de seis produtos/entradas/lotes/movimentos, 21 eventos de estoque e nenhum desvio livro/saldo. Os dois registros do snapshot local anterior permanecem históricos, não foram sobrescritos ou removidos. A margem de demonstração foi restaurada a 5,00 após verificação de configurações; revisão/trilha continuaram monotônicas.

Atende à demonstração técnica do primeiro fluxo publicada antes de 11/11; mantém os limites de CRUD auxiliar, vinculação global entre unidades, outras origens/movimentações e operação real descritos neste documento. Não usar esse aceite técnico como fechamento automático de D1 ou dos gates de fundação.
