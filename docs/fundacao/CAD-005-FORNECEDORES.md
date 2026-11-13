# CAD-005 — Fornecedores compartilhados

Especificação de 13/11/2026, antes da implementação. [Issue #33](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/33). Fontes: RF-004/seção 7.1 e refinamentos v1.2; RN-001/002/003/012/022, RNF-002/003/007/008/009/010/011/015, seção 4.2 e DOM-002. Catálogo global compartilhado; operações/estoque continuam por unidade. Reusar shell/Style Guide sem mudar o HTML mestre.

## Contrato

Razão social (200), CPF/CNPJ obrigatório/único/validado; nome fantasia (200), contato (200), telefone (40), email (254), endereço (500), observações (2000), tipo de fornecedor (100), condição de pagamento (200) opcionais. Limites entre parênteses são limites técnicos de caracteres. Tipo é texto livre: os exemplos do DRS não autorizam enum fechado. Prazo de entrega é inteiro não negativo até o limite int32 ou null; pedido mínimo é decimal string não negativo com 12 inteiros/6 decimais ou null. Agricultura familiar exige escolha explícita sim/não em criação/edição; canal preferido EMAIL/WHATSAPP ou null. Nenhum envio de mensagem/cotação.

O DRS não explicita a unidade de `pedido_minimo`. O formulário e CSV mantêm o rótulo neutro, sem acrescentar R$ ou unidade de produto por inferência. Definir sua interpretação comercial no consumidor RF-033 antes de usar o valor em comparação/cálculo; este cadastro somente o armazena, sem conversão automática.

CPF numérico de 11 posições; CNPJ numérico ou alfanumérico com 12 posições ASCII A–Z/0–9 e dois DVs numéricos, conforme [manual Receita/Serpro](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf). Normalizar somente máscara/pontuação/espaços e caixa; rejeitar outros caracteres. Validar DVs no contrato e SQL. Não consultar situação cadastral nem afirmar que DV válido comprova existência/regularidade fiscal. RN-003 conserva unicidade normalizada da razão social e documento canônico.

Consulta PRODUTO_LER; incluir/editar FORNECEDOR_EDITAR; ativar/inativar/excluir FORNECEDOR_CICLO_VIDA. Conforme seção 4.2, gestor/nutricionista I/X, estoquista I sem X, ADMIN/consulta somente C. Nenhuma promoção automática do ADMIN de acompanhamento. Fixture de integração separada habilita apenas perfis sintéticos previamente conferidos.

API `/api/unidades/{id}/fornecedores`: GET/POST; `/{fornecedorId}` PATCH/DELETE; `/{id}/status` POST; `/exportar` GET. q/status/ordem/offset estritos; busca normalizada por razão/nome fantasia/documento, ordem razão/ID, página 50, CSV integral até 10000 (413 acima, sem truncar). CSV com BOM/semicolon/aspas/fórmulas neutralizadas, sem Auth IDs ou auditoria. DTOs com bigint/decimais string e campos explícitos, sem propriedades internas. Criação ATIVO; edição comum não recebe status; revisão obrigatória para editar/status/excluir.

MVC com Controller/Service/Repository próprios e RPC estreita. Executor privado restrito, sem chave administrativa no runtime/DML direto; locks compatíveis com SHARE dos recebimentos, revalidação de vínculo/capacidade após espera e auditoria atômica. 401 sem sessão; 404 unidade/registro indisponível; 403 capacidade; 409 duplicidade/vínculo; 412 revisão antiga; 422 campo inválido. Mensagens sem SQL ou dados de outra unidade.

RN-002 bloqueia exclusão se existir qualquer entrada vinculada, inclusive rascunho/outra unidade. FK permanece como defesa; futuras cotações/produto_fornecedor deverão ampliar a verificação antes de serem integradas. Inativação preserva histórico e retira de novas seleções; recebimento já revalida fornecedor ativo ao criar/confirmar. Não alterar movimentos nem reinterpretar recebimentos antigos.

## Compatibilidade e verificação

Consulta readonly de 13/11: um fornecedor sintético, nenhum documento vazio, seis recebimentos/movimentos. Não publicar seu documento/contatos como inventário nem inventar novos valores. Migration aditiva: revisão=1 e campos novos null; agricultura familiar null significa ainda não informado em registro anterior, nunca false por inferência. Exibir essa ausência claramente; edição exige escolha explícita. Nenhuma alteração de dados históricos para preencher campos, sem carga de planilhas agora. Fixture isolada e testes usarão exemplos sintéticos; nenhum dado pessoal/contato real em logs/capturas.

Validar CPF/CNPJ numérico/alfanumérico, máscaras, inválidos/duplicatas/zero/null/precisão, unicidade normalizada, autorização/I versus X, revisão, inativo, vínculo global, rollback e concorrência/revogação em PostgreSQL. API/SDK validam Auth antes da RPC e DTO sem dados internos. UI cobre formulário/erros preservados/412/consulta/confirmação, filtro/página/CSV e 360/768/1280. Após CI: preflight/advisor, migration isolada, deploy no mesmo staging e jornada sintética real/nova sessão; comparar produtos/saldos/usuários/vínculos/capacidades ADMIN antes/depois e guardar evidência sanitizada.

Retorno por desativação de novas rotas/RPC sem DROP/reset, preservando fornecedor/auditoria; integrações de estoque atuais continuam compatíveis. Não encerra RF-008, RNF-004, FND_READY ou aceite institucional. SMTP geral adiado, importação RF-036 no final e AMB-001 congelada; relatórios completos, exclusão de produtos e skeleton permanecem nas issues próprias.
