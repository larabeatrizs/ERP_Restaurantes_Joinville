# Matriz de investigação e rastreabilidade — FND-000

Fonte: [DRS v1.3 e adendo](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), baseline `a53059b`. IDs com espaços de extração foram normalizados somente neste índice; a fonte não foi editada. RF: seções 7–11; RN: seção 6; RNF: seção 12; CA: seção 14. Títulos abaixo são resumos, não substitutos dos contratos.

**Todos os componentes, modelos e testes abaixo são propostos e não implementados.** Um grupo indica o caminho de investigação até UI/camadas/dados/testes. O desenho físico, endpoints e permissões detalhadas precisam ser especificados na fase B. Nenhuma associação significa conformidade demonstrada. Cada linha herda a lacuna comum: sem nova implementação, sem teste executado e sem snapshot remoto atual. As lacunas específicas estão em [FND-000](FND-000.md), [UI](UI.md) e [DADOS](DADOS.md).

<a id="g01"></a>

## G01 — Cadastros e parâmetros

- UI/estados: Produtos/Cadastro de produto; demais telas sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: CadastrosController → CadastrosService → modelos de cadastro → CadastrosRepository.
- Schema e autorização a especificar: cadastros, parâmetros produto/unidade, calendário e conversões; políticas de gestão/leitura conforme perfil.
- Casos de teste a especificar: CRUD, unicidade normalizada, exclusão vinculada, conversões incompatíveis e histórico.

<a id="g02"></a>

## G02 — Identidade e autorização

- UI/estados: Login; gestão de usuários sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: AuthController → AcessoService → Perfil/VinculoUnidade → AcessoRepository.
- Schema e autorização a especificar: identidade e vínculos; isolamento por unidade, permissões e estado ativo.
- Casos de teste a especificar: login/logout/expiração, bloqueio, usuário inativo e negação entre unidades.

<a id="g03"></a>

## G03 — Importação

- UI/estados: Sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: ImportacaoController → ImportacaoService → Importacao/Linha → ImportacaoRepository.
- Schema e autorização a especificar: lotes de abertura e histórico de importação; autorização por unidade e aprovação do saldo inicial.
- Casos de teste a especificar: prévia sem gravar, duplicidade/linhas inválidas, unidade não confirmada e desfazer condicionado.

<a id="g04"></a>

## G04 — Recebimento

- UI/estados: Entrada de materiais. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: EntradasController → RecebimentoService → Entrada/Item/Lote → EstoqueRepository.
- Schema e autorização a especificar: documentos, itens, lotes e locais; transação única; unidade e perfil.
- Casos de teste a especificar: compra com nota, doação com documento, recusa, validade, nota duplicada e estorno.

<a id="g05"></a>

## G05 — Saídas e conferência

- UI/estados: Aprovações; saída/requisição rápida sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: SaidasController → SaidaService → Saida/Conferencia → EstoqueRepository.
- Schema e autorização a especificar: saldo por lote/local e saídas; baixa prévia/posterior; autor distinto de aprovador.
- Casos de teste a especificar: FEFO, lote vencido, saldo concorrente, prévia/posterior, autoaprovação e requisição rápida.

<a id="g06"></a>

## G06 — Perdas, inventário e locais

- UI/estados: Aprovações; perda/inventário/transferência sem frames nomeados. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: EstoqueController → AjusteService → Perda/Inventario/Transferencia → EstoqueRepository.
- Schema e autorização a especificar: perdas, inventário, locais e estornos; unidade e aprovação conforme contrato.
- Casos de teste a especificar: perda de qualquer quantidade no RP1, ajuste, janela de descongelamento e total conservado.

<a id="g07"></a>

## G07 — Planejamento, ficha e custos

- UI/estados: Cardápio; ficha/previsão sem frames nomeados. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: PlanejamentoController → PlanejamentoService → Ficha/Cardapio/Previsao → PlanejamentoRepository.
- Schema e autorização a especificar: fichas versionadas, calendário, cardápio e opções; unidade e publicação.
- Casos de teste a especificar: versão histórica, calendário habilitado, 26,25 kg, alternativas e indiretos.

<a id="g08"></a>

## G08 — Cotação e compras sugeridas

- UI/estados: Sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: ComprasController → CotacaoService → Cotacao/Comparativo → ComprasRepository.
- Schema e autorização a especificar: cotações, apresentações e histórico; responsável e unidade conforme contrato a definir.
- Casos de teste a especificar: preço por unidade-base, vigência, sem cotação, economia potencial e doação excluída.

<a id="g09"></a>

## G09 — Atendimento

- UI/estados: Sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: AtendimentoController → AtendimentoService → Comensal/Refeicao/Caixa → AtendimentoRepository.
- Schema e autorização a especificar: dados mínimos, tarifas, refeições e caixa; acesso restrito por papel/unidade.
- Casos de teste a especificar: gratuidade, documento ausente, teto tarifário e negação ao estoque.

<a id="g10"></a>

## G10 — Consultas, alertas e auditoria

- UI/estados: Painel; consultas específicas sem frames nomeados. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: ConsultasController → RelatoriosService → Saldo/Alerta/Auditoria → ConsultasRepository.
- Schema e autorização a especificar: consultas por lote/unidade, rastreio, trilha imutável e alertas; consolidação privilegiada.
- Casos de teste a especificar: saldo recalculado, mínimo/validade, caminho lote/refeição, trilha antes/depois e exportação.

<a id="g11"></a>

## G11 — Amostras

- UI/estados: Sem frame nomeado. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: AmostrasController → AmostrasService → Amostra/Descarte → AmostrasRepository.
- Schema e autorização a especificar: coleta, prazo e descarte por unidade; cozinha/nutricionista conforme DRS.
- Casos de teste a especificar: prazo de 72h, alerta de vencimento e autor/data do descarte.

<a id="g12"></a>

## G12 — Qualidade e operação

- UI/estados: Transversal; estados/responsividade por comprovar. Estados não comprovados detalhados no mapa de UI.
- Camadas propostas: View/Controller/Service/Model/Repository e operação conforme RNF.
- Schema e autorização a especificar: integridade, isolamento, logs e recuperação; sem dados reais nos testes.
- Casos de teste a especificar: segurança, acessibilidade, desempenho, backup/restauração, contratos e localização.

## Requisitos funcionais — 37 IDs

Prioridades conforme seção 15.1; RF-037 tem S no texto específico e alocação pendente. Subitens podem ter prioridades próprias: o resumo não promove opcionais a obrigatórios.

| ID | Resumo | Prioridade | Caminho de investigação |
| --- | --- | --- | --- |
| RF-001 | Unidades de medida | M | [G01](#g01) |
| RF-002 | Categorias de produtos | M | [G01](#g01) |
| RF-003 | Produtos e alimentos | M | [G01](#g01) |
| RF-004 | Fornecedores | M | [G01](#g01) |
| RF-005 | Pratos e fichas técnicas | M | [G07](#g07) |
| RF-006 | Unidades e calendário | M | [G01](#g01) |
| RF-007 | Parâmetros gerais | S | [G01](#g01) |
| RF-008 | Usuários, perfis e acesso | M | [G02](#g02) |
| RF-009 | Planejamento de cardápio | M | [G07](#g07) |
| RF-010 | Previsão de insumos | M | [G07](#g07) |
| RF-011 | Lista de compras sugeridas | S | [G08](#g08) |
| RF-012 | Entrada de materiais | M | [G04](#g04) |
| RF-013 | Saída diária operacional | M | [G05](#g05) |
| RF-014 | Transferência interna de proteínas | M | [G06](#g06) |
| RF-015 | Perdas, avarias e descartes | M | [G06](#g06) |
| RF-016 | Inventário e ajustes | S | [G06](#g06) |
| RF-017 | Saldo e extrato | M | [G10](#g10) |
| RF-018 | Comensais | S | [G09](#g09) |
| RF-019 | Refeições e valores | S | [G09](#g09) |
| RF-020 | Relatórios de atendimento | S | [G09](#g09) |
| RF-021 | Posição de estoque | M | [G10](#g10) |
| RF-022 | Valor imobilizado | M | [G10](#g10) |
| RF-023 | Perdas e descartes consolidados | M | [G10](#g10) |
| RF-024 | Rastreabilidade | M | [G10](#g10) |
| RF-025 | Consolidado mensal | M | [G10](#g10) |
| RF-026 | Previsto × realizado | S | [G10](#g10) |
| RF-027 | Validade e vencimentos | M | [G10](#g10) |
| RF-028 | Painel de indicadores | S | [G10](#g10) |
| RF-029 | Central de alertas | M | [G10](#g10) |
| RF-030 | Consulta de auditoria | S | [G10](#g10) |
| RF-031 | Custo da refeição | S | [G07](#g07) |
| RF-032 | Valor nutricional | S | [G07](#g07) |
| RF-033 | Cotações | S | [G08](#g08) |
| RF-034 | Comparativo e economia | S | [G08](#g08) |
| RF-035 | Variação de preço | C | [G08](#g08) |
| RF-036 | Importação e carga inicial | S | [G03](#g03) |
| RF-037 | Amostras de refeição | S | [G11](#g11) |

## Regras de negócio — 37 IDs

| ID | Resumo | Grupos afetados |
| --- | --- | --- |
| RN-001 | Inativação | [G01](#g01) |
| RN-002 | Integridade referencial | [G01](#g01) |
| RN-003 | Unicidade | [G01](#g01), [G03](#g03) |
| RN-004 | Isolamento por unidade | [G02](#g02), [G04](#g04), [G05](#g05), [G06](#g06), [G07](#g07), [G09](#g09), [G10](#g10), [G11](#g11) |
| RN-005 | Saldo por lote | [G04](#g04), [G05](#g05), [G06](#g06), [G10](#g10) |
| RN-006 | FEFO/PVPS | [G05](#g05) |
| RN-007 | Lote vencido | [G05](#g05), [G06](#g06) |
| RN-008 | Sem saldo negativo | [G05](#g05), [G06](#g06) |
| RN-009 | Segregação de funções | [G05](#g05), [G06](#g06) |
| RN-010 | Imutabilidade | [G04](#g04), [G05](#g05), [G06](#g06), [G10](#g10) |
| RN-011 | Estados e modos da saída | [G05](#g05), [G06](#g06) |
| RN-012 | Perfil e unidade | [G02](#g02) |
| RN-013 | Estoque mínimo | [G01](#g01), [G10](#g10) |
| RN-014 | Validade | [G01](#g01), [G10](#g10) |
| RN-015 | Valorização | [G06](#g06), [G10](#g10) |
| RN-016 | Calendário | [G01](#g01), [G07](#g07) |
| RN-017 | Ficha válida e versionada | [G07](#g07) |
| RN-018 | Prato inativo | [G07](#g07) |
| RN-019 | Conversão | [G01](#g01), [G03](#g03), [G04](#g04), [G08](#g08) |
| RN-020 | Perdas | [G06](#g06) |
| RN-021 | Descongelamento | [G06](#g06) |
| RN-022 | Auditoria | [G01](#g01), [G02](#g02), [G03](#g03), [G04](#g04), [G05](#g05), [G06](#g06), [G07](#g07), [G08](#g08), [G09](#g09), [G10](#g10), [G11](#g11) |
| RN-023 | Minimização | [G09](#g09) |
| RN-024 | Publicação versionada | [G07](#g07) |
| RN-025 | Nota duplicada | [G04](#g04) |
| RN-026 | Validade obrigatória | [G04](#g04) |
| RN-027 | Fechamento mensal | [G04](#g04), [G05](#g05), [G06](#g06), [G10](#g10) |
| RN-028 | Preço comparável | [G03](#g03), [G08](#g08) |
| RN-029 | Custos direto/indireto | [G07](#g07) |
| RN-030 | Opções alternativas | [G07](#g07) |
| RN-031 | Preço de referência | [G07](#g07), [G08](#g08) |
| RN-032 | Cotação vigente | [G08](#g08) |
| RN-033 | Inventário periódico | [G06](#g06), [G08](#g08) |
| RN-034 | Retirada registrada | [G05](#g05) |
| RN-035 | Sobras e reaproveitamento opcional | [G06](#g06) |
| RN-036 | Amostras | [G11](#g11) |
| RN-037 | Origem da entrada | [G04](#g04), [G08](#g08) |

## Requisitos não funcionais — 15 IDs

| ID | Resumo | Caminho e verificação proposta |
| --- | --- | --- |
| RNF-001 | Plataforma e responsividade | [G12](#g12); Breakpoints 768px e 360px nas telas previstas; navegadores do DRS |
| RNF-002 | Multiunidade | [G12](#g12); Negar leitura/escrita em outra unidade, inclusive ID alterado no request |
| RNF-003 | Segurança de acesso | [G12](#g12); Sessão, bloqueio e permissões da seção 4; requisitos de senha e expiração a verificar no provedor |
| RNF-004 | Backup e recuperação | [G12](#g12); Demonstrar RPO/RTO, retenção e restauração em ambiente isolado |
| RNF-005 | Desempenho | [G12](#g12); Medir 20 usuários, p95 de tela e tempos de relatório/previsão do DRS |
| RNF-006 | Disponibilidade | [G12](#g12); Medir disponibilidade na janela do DRS e documentar manutenção |
| RNF-007 | Proteção de dados | [G12](#g12); Validar minimização, mascaramento e acesso; parecer institucional não substituído por teste |
| RNF-008 | Auditoria | [G12](#g12); Testar imutabilidade, restrição de consulta e retenção |
| RNF-009 | Acessibilidade | [G12](#g12); Teclado, foco, rótulos, contraste e mensagens sem depender só de cor |
| RNF-010 | Integridade | [G12](#g12); Concorrência com saldo insuficiente e rollback de falha parcial |
| RNF-011 | Manutenibilidade | [G12](#g12); Camadas, migrations, API documentada e 70% das regras conforme DRS |
| RNF-012 | Rascunho em falha de rede | [G12](#g12); Queda de rede, rascunho e reenvio manual; C, não modo offline completo |
| RNF-013 | Monitoramento | [G12](#g12); Logs sem dados pessoais e alertas de falha/backup |
| RNF-014 | Planilhas e API | [G12](#g12); Roundtrip CSV/XLSX, PDF e contrato REST |
| RNF-015 | Localização | [G12](#g12); Datas/moeda/números pt-BR e fuso do DRS |

## Critérios de aceitação — 26 IDs

Os cenários completos e suas relações RF/RN permanecem na seção 14 do DRS. CA-012–016 têm IDs partidos na extração: conferir o PDF antes de converter em testes. CA-006 é modo Prévia; CA-023/024 cobrem modo Posterior.

| ID | Caso a verificar (não executado) | Caminho de implementação e teste |
| --- | --- | --- |
| CA-001 | Inativar produto com vínculo | [G01](#g01) |
| CA-002 | Ficha v2 preserva versão publicada | [G07](#g07) |
| CA-003 | Refeições e calendário por unidade | [G07](#g07) |
| CA-004 | Previsão de 26,25 kg | [G07](#g07) |
| CA-005 | Entrada, nota e validade | [G04](#g04) |
| CA-006 | Saída prévia, FEFO e autor distinto | [G05](#g05) |
| CA-007 | Perda 5 kg a R$8 = R$40 | [G06](#g06) |
| CA-008 | Descongelamento e locais | [G06](#g06) |
| CA-009 | Ajuste de -2 kg e 10% | [G06](#g06) |
| CA-010 | Rastreio em dois sentidos | [G10](#g10) |
| CA-011 | Negação entre unidades | [G02](#g02) |
| CA-012 | Mínimo 10 kg e validade 7 dias | [G10](#g10) |
| CA-013 | Backup e restauração até 4h | [G12](#g12) |
| CA-014 | Imutabilidade, estorno e trilha | [G10](#g10) |
| CA-015 | Gratuidade e acesso restrito | [G09](#g09) |
| CA-016 | Custo R$3,01 e alternativa mais cara | [G07](#g07) |
| CA-017 | Conversão R$22,75/kg → R$20,50/kg | [G08](#g08) |
| CA-018 | Economia potencial R$859,50 | [G08](#g08) |
| CA-019 | Importação com prévia e duplicidade | [G03](#g03) |
| CA-020 | Preço pago 13% acima pede justificativa | [G04](#g04) |
| CA-021 | Inventário altera base da compra | [G06](#g06) |
| CA-022 | Qualquer perda RP1 pendente | [G06](#g06) |
| CA-023 | Posterior baixa e confere por outro perfil | [G05](#g05) |
| CA-024 | Requisição rápida baixa e segue PVPS | [G05](#g05) |
| CA-025 | Amostra e descarte após 72h | [G11](#g11) |
| CA-026 | Doação sem NF com documento | [G04](#g04) |

## Manutenção

Na fase B, o desenho proposto dos grupos de dados passou a ser detalhado em [DATA-001](../dados/DATA-001.md) e no [dicionário](../dados/DICIONARIO.md). G02 e as restrições de acesso dos demais grupos têm contrato proposto em [SEC-001](../seguranca/SEC-001.md); G04–G06 e a base de G10 têm estados, atomicidade e cenários em [transações de estoque](../dados/TRANSACOES_ESTOQUE.md). Esses links detalham a especificação; não alteram o status de implementação/teste dos grupos.

Ao especificar uma issue, substituir os caminhos conceituais do seu recorte por links de contratos, arquivos, políticas e testes reais. Registrar status separadamente como proposto, implementado, testado e aceito. Não marcar um grupo inteiro concluído por uma única tela. Atualizar somente com evidências e preservar o histórico de decisões.
