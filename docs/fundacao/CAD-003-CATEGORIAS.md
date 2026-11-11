# CAD-003 — Cadastro de categorias

**Estado em 11/11/2026:** implementação local em validação na [issue #27](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/27), ainda sem implantação neste ponto. [CI-001](CI-001-NAVEGADOR.md) aprovado na main; sucede o vínculo de catálogo [CAD-002](CAD-002-VINCULO-PRODUTO.md).

## Objetivo, fontes e alcance

Permitir manter categorias pela aplicação, em vez de depender do bootstrap sintético. Fontes: DRS RF-002 e seção 7.1; RN-001/002/003/012/014/022; RNF-002/003/008/009/010/011/015. Preservar os IDs do [DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) e a precedência do [projeto](../PROJETO.md).

Incluir listagem com busca, status, ordenação e paginação; visualização, inclusão, edição, ativação/inativação, exclusão elegível e CSV. Categoria é global compartilhada, conforme o catálogo já adotado, e não deve ser duplicada por unidade. A unidade selecionada delimita a autorização e o registro da ação, não a propriedade exclusiva da categoria.

## Contrato funcional a implementar

| Campo | Origem e validação |
| --- | --- |
| Descrição | Obrigatória; unicidade normalizada de caixa/acentos/espaços, inclusive entre registros inativos (RN-003). Limite técnico existente de 200 caracteres |
| Tipo de item | Alimento, Material de limpeza ou Descartável; valores existentes ALIMENTO/LIMPEZA/DESCARTAVEL |
| Armazenamento padrão | Seco, Resfriado ou Congelado; obrigatório |
| Dias de alerta de validade | Inteiro opcional não negativo. Zero é valor válido, não ausência; null deixa de substituir o padrão. Resolver herança conforme CONFIG-001, sem codificar nova precedência |
| Status | Ativo/Inativo; separado da edição comum para não conceder X implicitamente |
| ID e revisão | Técnicos; IDs/revisões bigint como strings. Acrescentar revisão por migration aditiva para edição concorrente |

Atualizar o padrão da categoria não altera o armazenamento explicitamente persistido dos produtos, parâmetros locais, lotes ou saldos. Históricos não são reescritos. A execução do motor de alertas RN-014 permanece um fluxo próprio; cadastrar dias não comprova alertas funcionando.

RN-001: inativo não aparece na seleção de novos produtos; continua consultável no histórico. Não inativar produtos em cascata. RN-002: qualquer produto vinculado, mesmo inativo ou de outra unidade, impede exclusão física da categoria. A checagem é global, sem revelar dados ou unidades de terceiros; a mensagem explica que há vínculos e oferece inativação a quem pode executá-la. A FK e a transação devem garantir a regra também sob concorrência.

## Autorização e integração propostas

Consolidar capacidades próprias de categoria para leitura, inclusão/edição e ciclo de vida antes de escrever migrations/API. A matriz da seção 4 distingue I de X: estoquista não ganha inativação/exclusão pelo simples acesso à edição; gestor/nutricionista podem receber as capacidades correspondentes dentro do contrato. ADMIN de acompanhamento continua consulta, sem concessões automáticas pelo nome do perfil. [SEC-001](../seguranca/SEC-001.md) preserva a matriz conferida e os limites das concessões.

Proposta de cadeia: View de categorias no shell existente → cliente HTTP → Controller → Service → Repository → RPC estreita mediada. DTOs em packages/contracts, interface em apps/web, API em apps/api. Não ampliar estoque_operacao para CRUD genérico ou aceitar tabela/schema/ator do cliente. Usar sessão real, capacidade e vínculo ativos, revalidados após espera por lock. Escrita e auditoria antes/depois atômicas; sem DML direto, chave administrativa no runtime ou mutation em auth.users.

Rotas propostas sob `/api/unidades/{id}/categorias`: GET com busca/status/ordenação/página, POST de inclusão, PATCH de edição com revisão e ações explícitas de status/exclusão com revisão. Detalhar os corpos e retornos fechados no contrato executável antes do código. Conflito de unicidade/vínculo retorna 409; revisão obsoleta 412; campos inválidos 422, com indicação junto ao campo; sem sessão 401, permissão negada 403 e unidade indisponível 404. Não expor SQL ou identidade Auth nas mensagens.

CSV deve refletir os filtros/ordem da listagem, esclarecer exportação de todos os resultados filtrados e proteger células de texto contra execução de fórmulas. Não exportar IDs de autenticação ou trilha restrita como parte do cadastro.

## Interface e estados

Não há frame de categoria nomeado no [mapa visual](../auditoria/UI.md). Compor com shell, campos, tabela e ações do [Style Guide](../wireframe/Style%20Guide%20Restaurante%20Popular.html), preservando o HTML mestre; registrar comparação visual da nova composição. Mostrar que a categoria é compartilhada e que alterações afetam o catálogo global.

Prever carregando, vazio, erro recuperável, consulta, edição, validação por campo, salvamento, conflito e sucesso. Confirmar inativação/exclusão; proteger edição suja ao navegar ou trocar unidade e bloquear mudança durante salvamento. Preservar campos após erro e não sobrescrever silenciosamente após 412. Respeitar teclado, foco, rótulos e 360/768/1280 px com rolagem local da tabela. Skeleton continua apenas no aperfeiçoamento [UX-002](../planejamento/UX-002-SKELETON.md), sem entrar neste recorte por associação.

## Evidências exigidas antes de declarar entrega

- Banco: unicidade normalizada concorrente, exclusão com/sem vínculos, corrida entre vinculação e exclusão/inativação, revisão otimista, revogação durante espera, rollback por falha de auditoria e DML negado. Laboratório PostgreSQL e CI, sem induzir falhas no hospedado.
- API/DTO: campos/tipos estritos, zero/null, ordenação/paginação determinísticas, leitura/edição/X separados, unidade alheia, erros sanitizados e CSV filtrado seguro.
- UI: cadastrar, buscar, visualizar, editar/reabrir, status/exclusão com confirmação, erro por campo e preservação de entrada, somente consulta, navegação, CSV e responsividade.
- Staging: preflight/histórico/grants/RLS/advisor, migration aditiva após testes, mesmo Worker e jornada sintética real com capturas/resultados sanitizados. Credencial/link da responsável não são fixtures.
- Entrega: especificação/implementação/testes/limites atualizados, CI consultado, PR integrada e main/branch sincronizadas. Registro documental não é prova de implantação ou aceite.

Medidas RF-001 e fornecedores RF-004 continuam próximos recortes próprios. Sem reset/limpeza, alteração de conta pessoal, ambientes permanentes adicionais ou encerramento automático de issues. O retorno da futura migration deve desativar novas rotas/RPC preservando categorias e auditoria; revisar esse roteiro quando existir implementação.

## Contrato técnico consolidado e implementação

A leitura usa `PRODUTO_LER`, já destinado à consulta do catálogo compartilhado; inclusão/edição usam a nova `CATEGORIA_EDITAR`; status e exclusão usam `CATEGORIA_CICLO_VIDA`. As duas capacidades novas são independentes de PRODUTO_GERIR/CONFIGURACAO_EDITAR e não são concedidas pela migration. Nos ensaios sintéticos, estoquista recebe edição e gestor recebe edição/ciclo de vida, conforme I/X da seção 4. O perfil ADMIN de acompanhamento permanece intocado, consultando por sua capacidade existente. A leitura necessária à operação deve ser concedida junto ao perfil, sem presumir poderes pelo nome do papel. Isso concretiza o contrato técnico de staging, sem declarar aceite institucional ou administração RF-008 completa.

Rotas implementadas: GET/POST `/api/unidades/{id}/categorias`; PATCH/DELETE `/{categoriaId}`; POST `/{categoriaId}/status`; GET `/exportar`. GET recebe somente `q` (até 200 caracteres), `status` ATIVO/INATIVO, `ordem` asc/desc e `offset` inteiro; limite 50 e desempate por ID. Retorno `{categorias,total,capacidades:{editar,ciclo_vida}}`. Categoria contém `id,revisao,descricao,tipo_item,armazenamento_padrao,dias_alerta_validade,status,pode_excluir`; sem dados de produtos/unidades alheios. POST aceita exatamente os quatro campos de edição; cria ATIVO. PATCH acrescenta revisão; status não é campo editável por essa rota. Status aceita `{revisao,status}` e DELETE `{revisao}`. Escritas retornam `{categoria}`, exclusão `{excluida:true}`. IDs/revisões strings; dias number inteiro ou null, preservando zero. Sem filtros na escrita, com limite JSON real de 64 KiB compartilhado com estoque.

CSV usa os mesmos filtros/ordem, sempre offset zero, em uma operação de leitura; até 10000 resultados, acima disso recusa com 413 e pede refinar, sem arquivo truncado. Aspas, delimitadores, quebras de linha e fórmulas de planilha tratados; UTF-8/BOM, nomes de colunas em português e download sem cache. Auditoria não é exportada nessa listagem.

Migration aditiva criada pela CLI: `20261111161615_cadastro_categorias.sql`. Acrescenta revisão à categoria e as duas capacidades ao catálogo permitido, sem seed, tabela, role ou permissões atribuídas a usuários. Executor existente recebe somente os direitos adicionais necessários na categoria/sequence; cliente continua sem DML. Uma nova função privada SECURITY DEFINER, owner erp_stock_writer/search_path vazio, com wrapper invoker, ações fechadas e sem EXECUTE público/anon; helper JSON invoker privado. Locks de categoria conflitam com SHARE já usado em cadastro/vínculo de produtos; checagem de vínculos é global. Revisão e autorização revalidadas após espera; também após escrita que possa aguardar unicidade, antes da auditoria. Falha de auditoria reverte a operação. Repetir status idêntico com revisão atual não cria nova revisão/trilha. Exclusão guarda antes e depois JSON null na auditoria, sem cascade.

View CategoryPanel carregada sob demanda no shell atual, cliente CategoryApi, categoryController/CategoryService/CategoryRepository e adaptador Supabase próprios. Parser JSON extraído para helper HTTP compartilhado, sem acoplamento do Controller de categorias ao de estoque. Mensagens de conflito/validação são sanitizadas e a API pode indicar campos inválidos, sem detalhes SQL. Padrões de categoria não reescrevem dados de produtos.

Verificações locais: `npm run check` passou antes do ajuste final de carregamento sob demanda/normalização de resposta, revalidados pelos checks seguintes; 67 testes API, 32 PostgreSQL de estoque (todos aprovados; inclui sete cenários de categorias), 32 configurações em PGlite (uma concorrência omitida) e 35 testes de navegador em validação final ao registrar este ponto. A primeira rodada nativa revelou colisão entre nomes sintéticos de dois testes; fixtures foram separadas e a rodada completa posterior passou. Laboratórios locais encerrados, sem reset do staging. Publicação e jornada real exigem CI aprovado e registro posterior.
