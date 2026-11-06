# Dicionário lógico e físico proposto

Complemento de [DATA-001](DATA-001.md). **Proposta da fase B; não é um schema instalado ou DDL pronto para execução.** Campos indicados são obrigatórios, salvo `?`. Colunas técnicas comuns são herdadas das convenções abaixo. Regras que cruzam linhas exigem contrato transacional, não apenas um CHECK.

## Convenções físicas

- Chaves de negócio: `bigint generated always as identity`, coerente com o tipo inteiro dos cadastros do DRS. Identidade de usuário: `uuid` vinculado a `auth.users.id`; nenhum `senha_hash` próprio. FKs usam o mesmo tipo do destino.
- Instantes: `timestamptz`; dias de operação/validade: `date`; horários de funcionamento: `time`. Fuso de apresentação e fechamento: America/Sao_Paulo. Timestamp UTC não determina sozinho a data de operação.
- Quantidades/fatores/preços unitários: proposta `numeric(18,6)`; totais monetários exibidos em centavos e arredondamento somente na fronteira definida pelo cálculo. Valores JSON decimais devem ser strings no contrato de API para evitar perda de precisão. Exatidão/range final precisa de casos-limite antes da migration.
- Estados: `text` com CHECK de valores permitidos, sem estado livre. `NOT NULL` explícito onde exigido. Cadastro comum tem `status` ATIVO/INATIVO; usuário inclui BLOQUEADO. Documentos têm seus próprios estados e não herdam ATIVO/INATIVO.
- Metadados comuns de negócio: `criado_em`, `criado_por` (usuario), `alterado_em`, `alterado_por`. Em trilhas/livro imutáveis, metadados de alteração não autorizam edição; apenas evento inicial. Seeds de sistema exigem ator técnico identificado, sem inserir UUID aleatório.
- Entidades marcadas **U** carregam `unidade_id NOT NULL`, UNIQUE `(unidade_id,id)` e FKs compostas para qualquer pai U. Assim, item de uma unidade não pode apontar lote/câmara/documento de outra. Filho herda unidade e RLS, mesmo se o pai também tiver.
- **G** é catálogo global, **I** identidade, **T** registro técnico com escopo explícito. Não usar `unidade_id NULL` como sinal de acesso administrativo. Relatórios consolidados exigem permissão própria.
- Exclusão RESTRICT/NO ACTION para registros vinculados; sem cascata em livro/documentos confirmados. Cadastros sem vínculos podem ser excluídos conforme RN-002; caso contrário, inativar. Exclusão de identidade não apaga história operacional.
- Indexar FKs com prefixo compatível e medir planos na C2. PK/UNIQUE já cobrem parte dos casos; não duplicar índices automaticamente. Índices propostos abaixo não são evidência de desempenho.

## Organização, identidade e cadastros

| Tabela / escopo | Campos específicos e vínculos | Integridade e índices propostos |
| --- | --- | --- |
| unidade / G | nome, endereço, bairro, status | Descrição normalizada única; não excluir unidade com operação |
| perfil / I | codigo, nome | Oito códigos correspondentes à seção 4; unique(codigo) |
| usuario / I | id uuid, perfil_id, nome, status | FK id→auth.users; email autoritativo em Auth, não duplicar senha |
| usuario_unidade / I | usuario_id uuid, unidade_id bigint | PK composta; vínculo não é autorização para qualquer ação |
| refeicao_habilitada / U | tipo_refeicao, inicio time, fim time, capacidade? | Unique(unidade,tipo); capacidade positiva; calendário separado |
| calendario_semanal / U | dia_semana smallint, atende boolean | Unique(unidade,dia); 0–6; relação com refeições permitidas |
| calendario_excecao / U | data, atende boolean, motivo, tipo_refeicao? | Regra determinística de feriado/exceção sobre rotina; sobreposição deve ser validada |
| parametro_unidade / U | modo_saida, margem, dias_validade, janela_descongelamento, limite_perda, periodicidade_inventario, prazo_amostra, referencia_preco | Unique(unidade); valores tipados/checks; sem JSON livre para regras críticas; valores do DRS 15.4 na futura seed |
| parametro_categoria_unidade / U | categoria_id, margem_previsao, dias_validade? | Unique(unidade,categoria); herança explícita categoria/unidade/padrão |
| unidade_medida / G | sigla, descricao, grandeza, fator_base?, status | Unique descricao normalizada; fator >0 quando presente; conversão entre grandezas negada |
| categoria / G | descricao, tipo_item, armazenamento_padrao, dias_alerta_validade?, status | Unique descrição normalizada; tipo alimento/limpeza/descartável; dias >=0 |
| produto / G | descricao, descricao_complementar?, codigo_interno?, unidade_medida_id, categoria_id, perecivel, armazenamento, fator_correcao, apresentacao_compra, quantidade_apresentacao, status | Unique(descricao_normalizada,complemento_normalizado), complemento ausente normalizado como vazio; FC/apresentação >0; unidade-base imutável após movimento |
| produto_alergeno / G | produto_id, alergeno text | PK(produto,alergeno); lista controlada; não misturar dados de pessoa |
| produto_conversao / G | produto_id, unidade_origem_id, fator_para_base | Unique(produto,origem); fator >0 e mesma grandeza; snapshot do fator em documento confirmado |
| produto_unidade / U | produto_id, minimo, maximo?, ponto_reposicao? | Unique(unidade,produto); >=0 e maximo>=minimo se informado |
| fornecedor / G | razao_social, nome_fantasia?, cnpj_cpf, contatos?, endereço?, tipo, agricultura_familiar, canal_preferido?, prazo_entrega_dias?, pedido_minimo?, condicao_pagamento?, status | Unicidade normalizada e documento obrigatório/validado conforme RF-004; doador não comercial pode ser identificado no documento de entrada sem criar fornecedor fictício |
| produto_fornecedor / G | produto_id, fornecedor_id | PK composta; fornecedores habituais |
| camara / U | nome, tipo, temperatura_min?, temperatura_max?, status | Unique(unidade,nome_normalizado); tipos seca/resfriada/congelada; limites coerentes |
| motivo_perda / G | descricao, exige_anexo, status | Unique descrição normalizada; motivos do DRS como seed futura |

Para unicidade sem acentos/caixa/espaços, definir na C2 coluna canônica normalizada no banco e índice único. Não marcar `unaccent` como IMMUTABLE artificialmente para forçar um índice. Testar acentos, Unicode, espaços repetidos e concorrência. Sem escolha de extensão/collation aplicada nesta etapa.

## Estoque e documentos

| Tabela / escopo | Campos específicos e vínculos | Integridade e índices propostos |
| --- | --- | --- |
| entrada / U | data_entrada, origem COMPRA/DOACAO_PAA/OUTRA_DOACAO, fornecedor_id?, nome_doador?, documento_recebimento?, numero_nf?, serie_nf?, chave_nf?, total_nota?, observacoes?, estado | Compra exige fornecedor e NF; doação exige documento e identificação do doador; data não futura validada ao confirmar; estado RASCUNHO/CONFIRMADA/ESTORNADA |
| entrada_item / U | entrada_id, produto_id, quantidade, unidade_informada_id, fator_snapshot, valor_unitario?, numero_lote?, validade?, camara_id, temperatura?, aspecto_embalagem?, conformidade, motivo_recusa? | Quantidade>0; custo obrigatório em compra, opcional em doação; perecível exige validade/lote ao confirmar; recusado não gera saldo |
| lote / U | produto_id, entrada_item_id?, importacao_linha_id?, codigo, validade?, valor_unitario?, origem, produzido_em? | Origem RECEBIMENTO/ABERTURA; exatamente um vínculo de origem apropriado; unique entrada_item quando não nulo; recepção não cria lote por item recusado; preparo opcional da RN-035 é extensão futura |
| saldo_lote_local / U | lote_id, camara_id, quantidade, reservado | PK(unidade,lote,camara); quantidade>=0, reservado>=0, reservado<=quantidade; projeção atualizada somente com livro/reserva na mesma transação |
| saida / U | data_operacao, tipo_saida, cardapio_refeicao_id?, solicitante_id, modo_snapshot, estado, justificativa_divergencia?, conferencia_em?, conferente_id?, motivo_contestacao? | Consumo vinculado a refeição publicada; requisição rápida precisa de conciliação descrita em TRANSACOES_ESTOQUE; modo/estado coerentes; autor distinto de conferente/aprovador |
| saida_item / U | saida_id, produto_id, lote_id, camara_id, quantidade, quantidade_prevista?, justificativa_lote?, observacao? | Quantidade>0; produto compatível com lote; saída usa unidade-base; repetição de lote/local agrega ou é negada deterministicamente |
| reserva_saida / U | saida_item_id, lote_id, camara_id, quantidade, estado | Opção S de reserva; UNIQUE reserva ativa por item; lock/saldo disponível; rejeição libera uma vez |
| transferencia / U | lote_id, camara_origem_id, camara_destino_id, quantidade, inicio_descongelamento, limite_uso, refeicao_prevista_id?, justificativa?, estado, solicitante_id, aprovador_id? | Mesma unidade e locais diferentes; origem congelada/destino resfriada em RF-014; contrato de aprovação ainda contraditório; não executar até decisão |
| perda / U | lote_id, camara_id, quantidade, motivo_perda_id, justificativa?, anexo_id?, valor_prejuizo?, estado, solicitante_id, aprovador_id? | Quantidade>0; valor=quantidade×preço do lote, ou incompleto se desconhecido; fluxo RP1 sempre prévio; permissão da nutricionista exige conciliação SEC-001 |
| inventario / U | data_corte timestamptz, escopo_categoria_id?, escopo_camara_id?, estado, solicitante_id, aprovador_id? | Estado ABERTO/EM_ANALISE/APROVADO/ENCERRADO/CANCELADO proposto; definição de corte/contagem em transações |
| inventario_item / U | inventario_id, lote_id, camara_id, saldo_corte, contagem, contado_em, diferenca | Unique(inventario,lote,camara); contagem>=0; diferença assinada; divergência zero não cria movimento |
| operacao_estoque / U | tipo, entrada_id?, saida_id?, perda_id?, transferencia_id?, inventario_id?, estorno_id?, importacao_id?, ator_id, data_operacao | Exatamente uma origem por operação e tipo coerente; FKs reais, sem referência polimórfica textual sem integridade |
| movimento_estoque / U | operacao_id, lote_id, camara_id, quantidade_delta, valor_unitario_snapshot?, sequencia, ocorrido_em | Delta não zero; UNIQUE(operacao,sequencia); append-only; transferência cria par que soma zero; índice(unidade,lote,ocorrido_em,id) |
| estorno / U | operacao_original_id, motivo, solicitante_id, aprovador_id?, estado | Reversão total única por operação neste desenho; suporta estorno de entrada somente se saldo e dependências permitirem; parcial fica para decisão se requerido |
| fechamento_periodo / U | mes date, estado, fechado_em?, fechado_por?, reaberto_em?, reaberto_por?, motivo_reabertura? | Unique(unidade,mes); mês primeiro dia; reabertura só gestor central; mesma trava para escrever e fechar |
| comando_idempotente / T | unidade_id, ator_id uuid, operacao text, chave uuid, hash_payload, resultado?, concluido_em? | UNIQUE(unidade,ator,operacao,chave); mesmo payload repete resultado, diferente conflito; gravação acoplada à transação, retenção definida antes de produção |

Nota duplicada é negada por fornecedor/documento no alcance da RN-025; o índice único não será limitado por unidade para permitir duplicata entre RP1/RP2. Série/chave e canonicalização precisam de casos de teste para não ampliar ou reduzir a regra sem decisão. Datas relativas ao dia atual, papel e validade cruzada com produto não devem ser CHECKs que consultam outra tabela ou dependem implicitamente do relógio.

## Planejamento, compras sugeridas e atendimento

| Tabela / escopo | Campos específicos e vínculos | Integridade e índices propostos |
| --- | --- | --- |
| prato / G | descricao, tipo_prato, status | Nome normalizado único; inativo não entra em cardápio novo |
| prato_versao / G | prato_id, numero, rendimento, peso_porcao_g?, unidade_porcao?, porcoes_unidade_compra?, modo_preparo?, kcal_porcao?, macros?, criado_por | Unique(prato,numero); rendimento>0; versão usada é imutável |
| prato_item / G | prato_versao_id, produto_id, quantidade_receita, fator_correcao, custo_indireto, observacao? | Quantidade/FC>0; unidade do produto; limpeza não entra em ficha; descartáveis só como indiretos; subreceita opcional do RF-005 não é presumida |
| cardapio / U | inicio date, fim date, tipo_periodo | Fim>=início; identidade estável para histórico |
| cardapio_versao / U | cardapio_id, numero, nutricionista_id, estado, justificativa?, publicado_em? | Unique(cardapio,numero); RASCUNHO/EM_VALIDACAO/PUBLICADO/ENCERRADO/CANCELADO; nova publicação preserva filhos antigos |
| cardapio_dia / U | cardapio_versao_id, data, observacao? | Unique(versao,data); data dentro do período; calendário validado na publicação |
| cardapio_refeicao / U | cardapio_dia_id, tipo_refeicao, estimadas, justificativa_estimativa? | Unique(dia,tipo); estimadas>=0; habilitação por unidade; histórico dos ajustes em auditoria |
| cardapio_prato / U | cardapio_refeicao_id, prato_versao_id, ordem, grupo_opcao?, percentual_escolha? | Fixa versão; percentuais 0–100 e soma do grupo validada em transação; fallback à alternativa mais cara quando não informados |
| cotacao / G | fornecedor_id, produto_id, mes date, revisao, data_cotacao, apresentacao, quantidade_base, preco_embalagem, preco_base, observacao?, anexo_id?, responsavel_id, vigente | Quantidade>0/preço>=0; unique vigente(fornecedor,produto,mes); mês primeiro dia; revisão anterior preservada; alcance global segue seção 13 e precisa conciliação com acesso de unidade |
| comensal / U | codigo_interno, perfil_atendimento, validade_enquadramento?, status | Somente código/perfil no refinamento; sem documento/NIS/renda/saúde; ciência e campos adicionais pendentes de conciliação, sem coleta antecipada |
| tabela_valor / U | perfil_atendimento, categoria_tarifaria, tipo_refeicao, vigencia_inicio, vigencia_fim?, valor | Valor>=0; não sobrepor vigência da combinação; respeitar teto público geral; não assumir qual perfil 1/2/3 é gratuito |
| refeicao_servida / U | data_operacao, ocorrido_em, tipo_refeicao, modalidade, perfil_atendimento, categoria_snapshot, quantidade, comensal_id?, tabela_valor_id, valor_devido_unitario, recebido_total, usuario_id, fechamento_caixa_id? | Quantidade>0; contagem rápida permite agregado e comensal nulo; identificado exige quantidade=1; tarifa e modalidade preservadas; sem processamento de pagamento |
| fechamento_caixa / U | data_operacao, turno, registrado_total, contado_total?, diferenca?, conferente_id?, estado | Conferência pelo gestor, sem modelar repasse bancário; escopo do caixa e permissão precisam de validação |
| producao_refeicao / U | cardapio_refeicao_id, preparado_porcoes?, preparado_kg?, sobra_porcoes?, sobra_kg?, registrado_por | Unidades explícitas, valores>=0 e sobra<=preparado na mesma unidade; não converter peso em porção sem fator aprovado |

Previsão, custo, sugestão de compra, comparação e indicadores são cálculos/consultas com versão e parâmetros identificáveis. A criação de snapshots persistidos desses cálculos só ocorrerá se exigida para histórico/reprodução; não usar fórmulas para gerar movimentos. Nutrição é informada pela nutricionista, sem integração automática com TACO.

## Importação, amostras, trilha e anexos

| Tabela / escopo | Campos específicos e vínculos | Integridade e índices propostos |
| --- | --- | --- |
| importacao / T | unidade_id?, escopo GLOBAL/UNIDADE, tipo, arquivo_id, hash, usuario_id, estado, resumo | Escopo UNIDADE exige unidade; GLOBAL só cadastros permitidos; dados pessoais não entram em prévia genérica |
| importacao_linha / T | importacao_id, numero, dados_validados jsonb, erros jsonb, estado, unidade_quantidade_confirmada?, unidade_preco_confirmada? | Unique(importacao,numero); staging sem efeitos de negócio antes da confirmação |
| consumo_historico / U | produto_id, mes date, quantidade, importacao_linha_id | Sem lote/local/movimento; fonte histórica identificada; mes primeiro dia |
| amostra / U | data_coleta, tipo_refeicao, prato_versao_id, local_guarda, coletor_id, prazo_horas_snapshot, descarte_previsto, descartado_em?, descartado_por? | Prato obrigatório conforme RF-037; prazo>0; descarte com autor e instante; alerta por prazo vencido |
| alerta / U | tipo, entidade_tipo, entidade_id, chave_deduplicacao, gerado_em, resolvido_em?, estado | Índice(unidade,estado,gerado_em); referência genérica é permitida só para observabilidade, não para contabilizar saldo |
| auditoria / T | unidade_id?, escopo, ator_id uuid, acao, entidade, registro_id, antes jsonb?, depois jsonb?, ocorrido_em, correlacao_id | Append-only; unidade obrigatória para ação local, nula apenas ação global tipada; acesso restrito, retenção >=5 anos conforme DRS; não copiar segredos/dados pessoais desnecessários |
| anexo / T | unidade_id?, escopo, finalidade, storage_key, mime, tamanho, hash, enviado_por, estado | Objeto privado com autorização equivalente ao documento; validar tipo/tamanho; sem URL pública permanente; documentos de atendimento fora da carga genérica |

Campos opcionais indicados como pendentes não autorizam implementar flexibilização. A descrição detalhada de anexos, limites e job de alertas pertence aos contratos de API/operação. Nenhuma extensão PostgreSQL, bucket, função ou tabela foi criada.

Relações entre entidades U e registros técnicos T também devem provar coincidência de escopo/unidade por constraint ou validação transacional protegida. Importação global não pode originar lote local por referência cruzada não validada.

Fundamentação técnica consultada: [constraints PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-constraints.html), [locks PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html) e [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). PostgreSQL 17 é a versão do diagnóstico histórico; confirmar a versão do ambiente de teste antes da C2.
