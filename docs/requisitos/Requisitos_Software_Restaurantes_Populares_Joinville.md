<!-- Página 1 do PDF original -->
Documento de Requisitos de Software — Sistema de Gestão dos Restaurantes Populares de Joinville

# Documento de Requisitos de Software —


# Sistema de Gestão dos Restaurantes


# Populares de Joinville

Oct 6, 2026 · @duda Este documento especifica o sistema web que controla estoque, movimentações e planejamento de refeições dos dois Restaurantes Populares de Joinville, e serve de base direta para o desenvolvimento.

## 1. Introdução

Este Documento de Requisitos de Software (DRS) descreve o que o sistema deve fazer e as regras que deve respeitar, sem prescrever a tecnologia de implementação, para que a equipe de desenvolvimento construa, teste e valide o produto sem depender de interpretações verbais.
Público-alvo: equipe de desenvolvimento, docentes e orientadores da disciplina de Vivências de Extensão, nutricionistas, gestores e equipe de assistência social dos Restaurantes Populares.
Inspiração funcional: a organização por módulos (cadastros, estoque, planejamento e relatórios) segue a lógica de ERPs de mercado como o TOTVS Protheus, adaptada à realidade onde uma unidade de segurança alimentar pública, de menor porte e sem fins lucrativos.
Convenções de identificação

| Prefixo | Significado | Exemplo |
| --- | --- | --- |
| RN-xxx | Regra de negócio, vale para qualquer tela ou módulo | RN-004 |
| RF-xxx | Requisito funcional, o que o sistema faz | RF-021 |
| RNF-xxx | Requisito não funcional, como o sistema se comporta | RNF-007 |
| CA-xxx | Critério de aceitação, como se verifica um requisito | CA-003 |
| M / S / C / W | Prioridade MoSCoW: Deve (Must), Deveria (Should), Poderia (Could), Não nesta versão (Won't) | M |


<!-- Página 2 do PDF original -->
Os verbos seguem este padrão: deve = obrigatório; deveria = recomendado; poderá = opcional.
Controle de versão

| Versão | Data | Descrição |
| --- | --- | --- |
| 1.0 | 06/10/2026 | Primeira versão consolidada a partir do levantamento inicial (RF-001 a RF-015 e RNF-001 a RNF-004), com revisão de regras, lacunas e melhorias |
| 1.1 | 07/10/2026 | Incorporada a análise dos documentos do restaurante (lista de insumos e cardápio do café da manhã): seção 2.4, RF-031 a RF-036, RN-028 a RN- 032 e ajustes nos RF-002, RF-003, RF-004, RF-005, RF-009, RF-011, RF-012, RF-019 e RF-025 |
| 1.2 | 04/11/2026 | Incorporadas as respostas do questionário de validação do RP1 (27/10/2026): nova seção 2.5, situação das 23 perguntas da seção 17.2, ajustes nas regras RN-006, RN-009, RN-011 e RN-020, novas regras RN-033 a RN-037, refinamentos nos RF-004, RF-009, RF-010, RF-012, RF-013, RF-015, RF- 016, RF-018, RF-019 e RF-032, novo RF-037 e critérios de aceitação CA-021 a CA-026 |
| 1.3 | 04/11/2026 | Versão para desenvolvimento: pontos sem resposta do cliente fechados com decisões e premissas (seção 17.2), nova seção 15.4 (implantação e parâmetros iniciais), dois novos riscos, linha de aprovação da AMINC e ajustes nos RN-009, RN-011, RN-031, RF-010, RF-018, RF-019 e RNF-001 |
| 1.3-A (adendo técnico em revisão) | 05/11/2026 | Reconciliação da implementação: MVC em monorepo; Cloudflare para interface/API; Supabase PostgreSQL/Auth em lugar de VPS/Docker. Somente arquitetura/implantação; sem alteração dos RF/RN/CA funcionais ou da UI aprovada. Ver seção 18. |


## 2. Contexto: os Restaurantes Populares de Joinville

Os Restaurantes Populares de Joinville são equipamentos públicos da Secretaria de Assistência Social do município, voltados a garantir alimentação saudável, equilibrada e acessível à população, com prioridade para pessoas em vulnerabilidade social e em
situação de rua. Os cardápios são elaborados por nutricionistas e compõem refeições completas: arroz, feijão, proteína, guarnição, salada e sobremesa ou fruta.

<!-- Página 3 do PDF original -->

### 2.1 Unidades e funcionamento

Característica Restaurante Popular 1 — Herbert Restaurante Popular 2 — José de Souza Zilda Arns Bairro Bucarein Adhemar Garcia Endereço Rua Urussanga, 442 Av. Alwino Hansen, 65 Dias de Todos os dias, incluindo fins de Segunda a sexta, exceto funcionamento
semana e feriados feriados Café da manhã 7h às 9h Não é servido Almoço 11h às 14h 11h às 14h Jantar 17h às 19h Não é servido

### 2.2 Valores e subsídios


| Refeição | Valor máximo (público geral) | Subsidiado ou gratuito |
| --- | --- | --- |
| Café da manhã | até R$ 5,00 | Sim, conforme faixa de renda familiar |
| Almoço | até R$ 12,00 | Sim, conforme faixa de renda familiar |
| Jantar | até R$ 10,00 | Sim, conforme faixa de renda familiar |

Têm direito a valores subsidiados ou à gratuidade os usuários cadastrados no CadÚnico ou acompanhados pelos serviços socioassistenciais (CRAS, CREAS e Centro POP). A avaliação do subsídio é feita por atendimento social agendado diretamente com a equipe
de assistência social, de forma presencial, nas próprias unidades.

### 2.3 Situação atual e problema a resolver

A operação envolve compra e recebimento de insumos perecíveis e não perecíveis, câmaras frias, cardápios que variam por dia e por unidade, e prestação de contas ao poder público. Sem um sistema integrado, o controle de estoque, validade, perdas e consumo
tende a depender de planilhas e anotações, o que dificulta a previsão de compras, a rastreabilidade de lotes e a transparência do uso dos recursos públicos.
Esta seção reproduz as informações fornecidas pela equipe do projeto. Valores, horários e endereços devem ser confirmados com a Secretaria antes da entrega final, pois podem mudar por decreto ou portaria.

<!-- Página 4 do PDF original -->

### 2.4 Processo atual observado nos documentos do restaurante

Dois documentos fornecidos pelo próprio restaurante mostram como o controle é feito hoje: a planilha Lista de Insumos (abas RP1, RP2, Preços Maio, Preços Junho e Preços Julho de 2026) e o Cardápio do Restaurante Popular de julho, café da manhã. Eles descrevem
consumo, compra e custo. Não mostram como são controlados o saldo físico, os lotes, as validades, as notas fiscais, as saídas diárias e as perdas, que precisam ser levantados com a equipe (seção 17.2).
Como o controle funciona hoje 1. Consumo mensal por produto e por unidade. As abas RP1 e RP2 (Restaurante Popular 1 e 2) listam cerca de 55 produtos em três blocos: mercearia (arroz, feijão, óleo, massas, molhos), proteínas (frango, suíno, bovino e miúdos) e laticínios. Cada produto
tem a quantidade consumida por mês, de janeiro a maio, sem lote, validade nem dia.
Ao lado ficam o tipo ou a marca e o tamanho da embalagem (arroz parboilizado de 5 kg, óleo de soja de 900 ml, café Caboclo ou 3 Corações).
2. Cotação mensal de preços. As abas de maio, junho e julho de 2026 registram o preço de cada produto em até seis fornecedores (SOS, Segalas, Taff, Imperatriz, HQ10 e Frangos Canção), incluindo temperos e descartáveis (marmitas EPS 102 e 104, copos, sacolas). Nem todo fornecedor cota todos os itens.
3. Meta de economia. No fim das abas RP1 e RP2 há os campos "Valor gasto a mais" (setembro a dezembro) e "Total em economia que poderia ter", ainda em branco. O objetivo é medir quanto se paga acima da melhor cotação; esse cálculo hoje não está feito.
4. Cardápio com custo e valor nutricional. O cardápio de café da manhã de julho cobre os sete dias, com os grupos panificação, proteína ou acompanhamento, bebida e fruta, a gramatura e o preço de cada item. Mostra o valor nutricional (de 592 a 772 kcal por
dia) e dois totais: de R$ 1,74 a R$ 2,73 só com os alimentos e de R$ 2,02 a R$ 3,01 com os custos indiretos, ambos abaixo do máximo de R$ 5,00 cobrado do público geral.
Como os totais do cardápio foram calculados. A conferência item a item mostra que o segundo valor de cada dia é a soma dos itens com café com leite, a bebida mais cara. O primeiro valor, rotulado "custo direto", soma ainda os custos indiretos: R$ 0,24 da bebida e
R$ 0,041 de cada acompanhamento que tem esse valor, provavelmente copo, tampa e embalagens pequenas (a confirmar). O cálculo fecha em seis dos sete dias; na sexta-feira a soma dá R$ 2,62 e o documento mostra R$ 2,66.
O que isso muda no sistema

<!-- Página 5 do PDF original -->
O que os documentos mostram O que o sistema passa a prever Consumo registrado só por mês, sem lote Mesma visão em matriz produto × mês, nem validade exportável em XLSX, com lote, validade e saldo por trás (RF-025, RF-036) Preços cotados todo mês em planilha
Cotação, comparativo e economia potencial (RF-033 a RF-035); a entrada compara o preço pago com a menor cotação (RF-012) Custo direto e indireto por dia de cardápio Custo da refeição calculado pela ficha técnica e pelos preços (RF-031, RN-029) Valor nutricional por dia
Quilocalorias por prato e soma por refeição (RF-032) Café da manhã com grupos próprios e "café Novos tipos de prato e grupos de opção no preto ou café com leite" cardápio (RF-005, RF-009, RN-030) Marmitas, copos e sacolas na lista de preços Descartáveis como custo indireto e
modalidade marmita no atendimento (RF- 002, RF-005, RF-019) Embalagens e marcas diferentes para o Produto com apresentação e conversão para mesmo produto a unidade-base (RF-003, RN-019, RN-028) Planilhas com erros de digitação e linhas Importação com validação e pré-visualização
incompletas (RF-036, RN-003) Inconsistências encontradas, a tratar na migração e que o sistema deve evitar Descrição trocada de linha: na aba RP1 o feijão preto aparece descrito como "carioca" e o carioca como "preto"; o macarrão parafuso como "espagueti", o espaguete como
"parafuso" e o cabelo de anjo como "yakissoba".
Apresentação que muda: a lentilha foi cotada em 400 g em maio e em 1 kg em junho (R$ 9,10 e R$ 20,50 no mesmo fornecedor), a maionese aparece em 3 kg e 2,7 kg, e a muçarela em 4 kg, em peça de 2 kg e fatiada.
Unidades implícitas: não está escrito se o preço é por kg, litro ou embalagem (R$ 2,16 para o arroz, R$ 149,90 para a manteiga de 5 kg e R$ 162,90 para o óleo de algodão de 15 L), nem se as quantidades consumidas são kg, litros ou embalagens.
Estrutura da planilha: a ordem das colunas de fornecedores muda entre as abas (Segalas vem antes de Taff em maio e depois dele em junho e julho), as abas de junho e julho repetem o título "Preços maio 2026", uma linha da aba RP2 tem valores sem nome de produto e linhas-modelo ficaram vazias ("Cação", "Massa lasanha").

<!-- Página 6 do PDF original -->
PDF do cardápio: os valores usam $ em vez de R$ , o rótulo "custo direto" está no total que inclui custos indiretos, a soma de sexta-feira não confere e o quadro "Custos diretos e indiretos café da manhã" ficou em branco.

### 2.5 Informações confirmadas pelo restaurante

Em 27/10/2026 a nutricionista do RP1 respondeu o questionário de validação. As respostas valem para o RP1 e foram dadas por uma única pessoa: o RP2, o estoque, a gestão e a assistência social ainda não responderam (seção 17.2). Onde uma resposta contradiz uma
premissa anterior deste documento, prevalece a resposta do restaurante.

| Tema | O que foi confirmado |
| --- | --- |
| Operação e contas | A unidade é coordenada pela AMINC (sigla informada pelo restaurante) e presta contas à Prefeitura; formato e frequência não foram informados. Validação do sistema: representante da AMINC (nome informado como Rodrigo; cargo a confirmar). |
| Equipe do RP1 (34 pessoas) | 5 serviços gerais, 2 controladores de acesso, 2 caixas, 1 cozinheira, 2 meio-oficiais, 14 auxiliares de cozinha, 3 nutricionistas, 1 coordenador, 1 auxiliar administrativo, 1 assistente social, 1 estoquista e 1 manutenção. |
| Volume diário no RP1 | Cerca de 600 almoços, 200 cafés da manhã e 200 jantares, registrados em planilha. |
| Estoque | Um único estoquista recebe, confere, anota em planilha, separa os ingredientes do dia seguinte, autoriza as saídas e conta o estoque todos os dias. Produto errado é devolvido ao fornecedor. A regra de uso é o PVPS (primeiro que vence, primeiro que sai). A temperatura das câmaras é anotada em planilha e há um caderno de apoio. |
| Entradas | Toda compra tem nota fiscal. Há doações do PAA (Programa de Aquisição de Alimentos). |
| Compras | As nutricionistas cotam por e-mail e WhatsApp, sempre com fornecedores da agricultura familiar. O critério é menor preço e prazo; a nutricionista decide. O preço do cardápio é a menor cotação, atualizada pela nutricionista. |


<!-- Página 7 do PDF original -->

| Tema | O que foi confirmado |
| --- | --- |
| Café da manhã | Pão congelado é comprado; bolo e doce de frutas são feitos no restaurante; ovos e frutas vêm da agricultura familiar, toda semana, com nota fiscal e controle em caderno. |
| Receitas e cardápio | Os pesos das receitas são brutos (antes de limpar) e levam margem de segurança (percentual não informado). O cardápio é montado todo mês pela responsável técnica e é diferente em cada unidade. As regras de composição estão no contrato (ainda não recebido). |
| Previsão de refeições | Média do mês, ajustada pelo cardápio (peixe atrai menos gente, carne de gado mais) e por fatores como chuva. |
| Perdas e sobras | Qualquer quantidade de perda é registrada e passa pela nutricionista. Motivos citados: chuva (menor fluxo) e alimentos de pouca aceitação. Sobra exposta no buffet é descartada; sobra dos pass- through é armazenada e reaproveitada em outras refeições. |
| Inventário e fiscalização | Inventário toda semana; a diferença é abatida da compra seguinte. A Vigilância Sanitária faz visitas técnicas regulares e o restaurante guarda amostras das refeições por 72 horas. O prazo de guarda dos registros não foi informado. |
| Uso do sistema | Duas pessoas usariam o sistema no RP1 (estoquista e nutricionista), com Wi-Fi próprio. |
| Atendimento | Pagamento em dinheiro; quem tem cadastro com isenção não paga. Existem os perfis 1, 2 e 3. O cadastro usa o CadÚnico e o cadastro no restaurante; os dados vêm do CRAS e ficam sob responsabilidade da assistente social. |
| Maior dificuldade | No estoque, as retiradas acabam sendo feitas sem anotação. |
| Contato | Nutricionista do RP1 (Elizabeth) para dúvidas. |

Os pontos sem resposta foram fechados com decisões e premissas, listadas na seção 17.2, e os valores iniciais estão na seção 15.4.

<!-- Página 8 do PDF original -->

## 3. Objetivo e escopo do sistema

O sistema tem como objetivo geral dar às equipes dos Restaurantes Populares controle confiável sobre o que entra, o que sai e o que sobra no estoque, ligando o planejamento de cardápios à compra e ao consumo real de insumos, com rastreabilidade e transparência.

### 3.1 Objetivos específicos

1. Planejar cardápios por unidade, dia e refeição, e calcular automaticamente a necessidade de insumos a partir das fichas técnicas.
2. Controlar entradas por lote, validade e fornecedor, e baixar o estoque conforme o consumo efetivo, com aprovação da nutricionista ou gestor.
3. Reduzir desperdício e perdas, priorizando o consumo dos lotes que vencem primeiro e registrando o prejuízo de cada descarte.
4. Alertar sobre estoque mínimo, validade próxima e necessidade de descongelamento de proteínas.
5. Garantir rastreabilidade completa entre fornecedor, lote, prato, refeição, dia e unidade, útil em caso de ocorrência sanitária.
6. Produzir relatórios para conferência contábil, prestação de contas e tomada de decisão da Secretaria.
7. Manter dados de cada unidade isolados, com consolidação apenas para a gestão central.
8. Apoiar a compra mais econômica e o controle de custos, comparando as cotações dos fornecedores com o preço pago e calculando o custo direto e indireto de cada refeição.

### 3.2 Dentro do escopo

Cadastros básicos e parâmetros (unidades de medida, categorias, produtos, fornecedores, pratos, câmaras, motivos de perda, unidades do restaurante).
Planejamento de cardápio, previsão de insumos, custo e valor nutricional das refeições, cotação de preços e comparativo entre fornecedores.
Entrada, saída, transferência, perdas e inventário de estoque.
Relatórios operacionais e gerenciais.
Controle de acesso, auditoria, backup e importação de planilhas para a carga inicial.
Registro de refeições servidas por categoria tarifária (módulo 4, proposto).

<!-- Página 9 do PDF original -->

### 3.3 Fora do escopo desta versão

Emissão de nota fiscal ou integração com sistemas fiscais.
Contabilidade, folha de pagamento e controle financeiro completo.
Pedido de compra e licitação (são tratados o recebimento, a cotação de preços e o comparativo entre fornecedores; ver sugestão de módulo futuro na seção 15.3).
Cobrança eletrônica (PIX, cartão) e integração bancária.
Aplicativo móvel nativo (o sistema web é responsivo para tablet).
Integração com CadÚnico ou sistemas da assistência social (apenas registro manual da condição tarifária).

### 3.4 Indicadores de sucesso

Indicador Meta sugerida Divergência entre saldo do sistema e Menor ou igual a 2% por produto contagem física no inventário Perdas por validade vencida sobre o valor Redução contínua; meta inicial a definir com consumido no mês a nutricionista Lançamentos de saída aprovados no mesmo
Maior ou igual a 95% dia Rupturas de estoque que obrigaram Tendência de queda mensal alteração do cardápio Tempo para rastrear o lote de um prato Menor que 2 minutos servido Economia potencial identificada sobre o Acompanhar mês a mês; meta inicial a
total comprado no mês (RF-034) definir com a Secretaria

## 4. Perfis de usuário e permissões

O acesso é controlado por perfil e por unidade (RNF-003 e RN-012). Cada usuário é vinculado a uma ou mais unidades e só enxerga os dados delas, exceto os perfis centrais.

<!-- Página 10 do PDF original -->

| 4.1 Perfis |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Perfil |  | Quem é |  |  |  | Responsabilidade no sistema |  |  |  |  |
| Administrador do sistema |  | Equipe de TI |  |  |  | Gerencia usuários, perfis, parâmetros globais e backups |  |  |  |  |
| Gestor central |  | Secretaria de Assistência Social |  |  |  | Visão consolidada das duas unidades, relatórios gerenciais, aprovações excepcionais |  |  |  |  |
| Gestor da unidade |  | Coordenação do restaurante |  |  |  | Aprova saídas, perdas e inventários; acompanha indicadores da unidade |  |  |  |  |
| Nutricionista |  | Responsável técnica |  |  |  | Cadastra pratos e fichas técnicas, planeja cardápios, aprova perdas e confere as saídas do dia |  |  |  |  |
| Estoquista |  | Almoxarifado |  |  |  | Registra entradas, saídas, transferências e perdas; realiza inventário |  |  |  |  |
| Cozinha |  | Chefe de cozinha e equipe |  |  |  | Consulta cardápio e fichas técnicas; lança consumo e sobras do dia; registra requisição rápida de retirada e amostras de refeição |  |  |  |  |
| Atendimento social |  | Assistente social e atendentes |  |  |  | Cadastra comensais e condição tarifária; registra refeições servidas (módulo 4) |  |  |  |  |
| Auditor / Consulta |  | Controle interno |  |  |  | Somente leitura de dados e trilha de auditoria |  |  |  |  |
| 4.2 Matriz de permissões Legenda: C = consulta, I = inclui ou edita, A = aprova, X = exclui ou inativa, — = sem acesso. |  |  |  |  |  |  |  |  |  |  |
| Funcionalidade | Admin |  | Gestor central | Gestor unidade | Nutricionista |  | Estoquista | Cozinha | Atend. social | Auditor |
| Usuários e perfis | I X |  | C | — | — |  | — | — | — | C |
| Cadastros básicos (produtos, fornecedores) | C |  | C | I X | I X |  | I | C | — | C |
| Pratos e fichas técnicas | C |  | C | C | I A X |  | C | C | — | C |
|  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |


<!-- Página 11 do PDF original -->
Funcionalidade Admin Gestor Gestor Nutricionista Estoquista Cozinha Atend.
Auditor central unidade social Planejamento de C C A I X C C — C cardápio Entrada de C C A C I — — C materiais Saída diária C C A A I I — C Transferência C C C C I I — C entre câmaras Perdas e descartes C C A C I I — C Inventário C C A C I — — C Comensais e
C C C — — — I X C refeições servidas Relatórios da C C C C C — C C unidade Relatórios C C — — — — — C consolidados Trilha de auditoria C C — — — — — C Cotações de preço C C I A C I — — C e comparativo Custo e valor C C C I — C — C nutricional das refeições
Importação de I I I — — — — C planilhas A regra de segregação de funções vale em qualquer perfil: quem lança uma saída, perda ou inventário não pode aprová-la (RN-009).

## 5. Premissas, restrições e glossário


### 5.1 Premissas

Cada unidade possui estoque próprio e fisicamente separado (RNF-002); não há estoque compartilhado entre elas.
As unidades têm acesso à internet estável no almoxarifado e na recepção, ou toleram falhas curtas com reenvio posterior.
A nutricionista fornece as fichas técnicas e os per capitas usados na previsão de insumos.
Os fornecedores entregam produtos com nota fiscal e informação de lote e validade.

<!-- Página 12 do PDF original -->
A Secretaria disponibiliza um responsável para validar as regras de negócio e os requisitos.

### 5.2 Restrições

Sistema 100% web, utilizável em desktop e tablet (RNF-001).
Hospedagem em VPS com backups automáticos (RNF-004).
Dados pessoais de usuários em vulnerabilidade tratados conforme a LGPD (Lei 13.709/2018).
Prazo e equipe limitados pelo calendário da disciplina; por isso a entrega é incremental (seção 15).
Prioridade para software livre e tecnologias de custo zero de licença.

### 5.3 Glossário


| Termo | Definição |
| --- | --- |
| Ficha técnica | Receita padronizada de um prato: insumos, quantidades, rendimento e modo de preparo |
| Per capita | Quantidade de um insumo por pessoa servida |
| Fator de correção | Relação entre peso bruto e peso limpo do insumo, que cobre cascas, ossos e aparas |
| Lote | Conjunto de unidades de um produto recebidas juntas, com mesma validade e origem |
| PEPS / FEFO | Primeiro que Entra, Primeiro que Sai / Primeiro que Vence, Primeiro que Sai |
| Estoque mínimo | Saldo abaixo do qual o sistema alerta a necessidade de reposição |
| Saldo por lote | Quantidade ainda disponível de um lote específico |
| Explosão de insumos | Cálculo da necessidade total de produtos a partir de cardápio, fichas técnicas e refeições estimadas |
| Soft delete | Inativação lógica: o registro some das listas de escolha, mas permanece no histórico |
| Câmara congelada / resfriada | Ambientes de armazenamento a baixa temperatura; a proteína é descongelada na resfriada |


<!-- Página 13 do PDF original -->

| Termo | Definição |
| --- | --- |
| Comensal | Pessoa que consome a refeição servida no restaurante |
| Categoria tarifária | Enquadramento do comensal: público geral, subsidiado ou gratuito |
| CadÚnico | Cadastro Único para Programas Sociais do Governo Federal |
| CRAS / CREAS / Centro POP | Serviços socioassistenciais municipais que acompanham famílias e pessoas em situação de vulnerabilidade |
| LGPD | Lei Geral de Proteção de Dados Pessoais |
| Trilha de auditoria | Registro de quem fez o quê, quando e com quais valores antes e depois |
| Custo direto | Custo dos alimentos usados no preparo de uma refeição, calculado pela ficha técnica |
| Custo indireto | Custo dos itens acessórios do consumo, como descartáveis e embalagens (composição a confirmar com o restaurante) |
| Cotação | Preço de um produto oferecido por um fornecedor em determinado mês, usado para comparar compras |
| Economia potencial | Diferença entre o preço pago e a menor cotação válida do mês, multiplicada pela quantidade comprada |
| Marmita | Refeição servida em embalagem descartável, para consumo fora do restaurante |
| Valor nutricional | Energia (quilocalorias) de um prato ou refeição, informada pela nutricionista |


## 6. Regras de negócio

Estas regras valem para todo o sistema e são referenciadas pelos requisitos funcionais. A coluna Origem indica se a regra veio do levantamento inicial (RNG-001 a RNG-003 e regras embutidas nos RF) ou se é uma adição proposta.

<!-- Página 14 do PDF original -->

|  |  |  |
| --- | --- | --- |
| ID | Regra | Origem |
| RN- 001 | Inativação lógica. Todo cadastro possui status Ativo ou Inativo. Registros inativos não aparecem nas listas de seleção de novos lançamentos, mas permanecem visíveis nos históricos e relatórios. | Original (RNG-001) |
| RN- 002 | Integridade referencial. Registro com movimentação ou vínculo (produto em entrada, prato em cardápio, lote em saída etc.) não pode ser excluído fisicamente; apenas inativado. A exclusão física só é permitida se não houver nenhum vínculo. | Original (RNG-002) |
| RN- 003 | Unicidade. Descrições de unidade de medida, categoria, produto, prato e fornecedor não se repetem, ignorando maiúsculas, acentos e espaços extras. CNPJ de fornecedor é único e validado. | Nova |
| RN- 004 | Isolamento por unidade. Estoque, lotes, cardápios, movimentações e comensais pertencem a uma unidade. Nenhum lançamento mistura unidades; só relatórios consolidados atravessam unidades. | Original (RNF-002), detalhada |
| RN- 005 | Saldo por lote. O saldo de um produto na unidade é a soma dos saldos dos seus lotes. Somente entradas confirmadas e saídas aprovadas alteram saldos. | Original, detalhada |
| RN- 006 | FEFO. Na saída, o sistema sugere primeiro o lote com validade mais próxima que ainda esteja válido. O estoquista pode trocar o lote, informando justificativa. O restaurante chama essa prática de PVPS (primeiro que vence, primeiro que sai) e já a adota. | Nova |
|  |  |  |
|  |  |  |


<!-- Página 15 do PDF original -->
ID Regra Origem RN- Lote vencido. Lote com validade vencida Nova 007 fica bloqueado para saída de consumo;
só pode ser baixado como perda por validade.
RN- Sem estoque negativo. Saída, perda ou Nova 008 transferência maior que o saldo disponível do lote é rejeitada.
RN- Segregação de funções. O usuário que Original (fluxo de aprovação do RF- 009 lança uma saída, perda ou inventário não 008), generalizada pode aprová-lo. Na saída de consumo em modo de conferência posterior (RN-011), quem lançou também não pode conferir.
O conferente é a nutricionista ou o gestor da unidade, e um substitui o outro.
RN- Imutabilidade. Movimentação Nova 010 confirmada ou aprovada não é editada nem excluída. Correções são feitas por estorno ou ajuste, com motivo obrigatório e nova aprovação.
RN- Estados da saída. Saída nasce Pendente Original (RF-008), detalhada 011 de Aprovação; pode ser Aprovada (baixa o saldo) ou Rejeitada (não altera saldo e exige motivo). Cada unidade define o modo de aprovação da saída de consumo: Prévia (comportamento
acima) ou Posterior, em que a saída baixa o saldo ao ser registrada, fica Registrada e depois é marcada como Conferida ou Contestada pela nutricionista ou pelo gestor. Padrão adotado para o RP1:
Posterior, porque há um único estoquista e o maior problema relatado são retiradas sem registro. Perdas, ajustes, inventários e transferências exigem sempre aprovação prévia.

<!-- Página 16 do PDF original -->

| ID | Regra | Origem |
| --- | --- | --- |
| RN- 012 | Acesso por perfil e unidade. Cada usuário só executa as ações do seu perfil nas unidades a que está vinculado (seção 4). | Original (RNF-003), detalhada |
| RN- 013 | Estoque mínimo por unidade. O estoque mínimo é definido por produto e por unidade. Quando o saldo é menor ou igual ao mínimo, o sistema gera alerta. | Original (RF-003), ajustada |
| RN- 014 | Alerta de validade. Lotes com saldo e validade em até N dias (padrão 7, configurável por categoria) geram alerta. | Nova |
| RN- 015 | Valorização. O valor do estoque e das perdas é calculado pelo valor unitário do lote correspondente. | Original (RF-010, RF-012) |
| RN- 016 | Refeições habilitadas. Cada unidade tem calendário de funcionamento e refeições habilitadas: Bucarein (café, almoço e jantar, todos os dias) e Adhemar Garcia (almoço, segunda a sexta, exceto feriados). Planejamento fora desse calendário é bloqueado. | Original (RF-005), detalhada |
| RN- 017 | Ficha técnica válida. Prato ativo exige ao menos um insumo e quantidades maiores que zero na mesma unidade de medida do produto. Alterações geram nova versão; cardápios passados mantêm a versão usada. | Original (RF-004), detalhada |
| RN- 018 | Prato inativo. Prato inativo não entra em novos cardápios; cardápios já planejados ou executados continuam íntegros. | Nova |
| RN- 019 | Conversão de unidades. Produtos com mais de uma unidade (pacote e quilo, por exemplo) usam fator de conversão cadastrado; o saldo é mantido sempre na unidade-base. | Nova |
|  |  |  |
|  |  |  |


<!-- Página 17 do PDF original -->

| ID | Regra | Origem |
| --- | --- | --- |
| RN- 020 | Perdas. Perda exige motivo da lista parametrizada, quantidade e lote; acima de limite parametrizado exige aprovação de quem estiver configurado como aprovador da unidade (nutricionista ou gestor). No RP1 o limite é zero: toda perda, de qualquer quantidade, passa pela nutricionista. | Original (RF-010), detalhada |
| RN- 021 | Descongelamento. A proteína deve ser transferida da câmara congelada para a resfriada de 24 a 48 horas antes da refeição planejada; fora dessa janela o sistema alerta, mas permite com justificativa. | Original (RF-009), detalhada |
| RN- 022 | Auditoria. Criação, alteração, inativação, aprovação, rejeição e estorno registram usuário, data, hora, unidade e valores antes e depois. | Nova |
| RN- 023 | Minimização de dados pessoais. O sistema coleta apenas os dados necessários ao atendimento e ao controle de subsídio; dados sensíveis só podem ser vistos pelos perfis autorizados. | Nova |
| RN- 024 | Cardápio publicado. Cardápio publicado só pode ser alterado com justificativa, gerando nova versão e notificando cozinha e estoque. | Nova |
| RN- 025 | Nota duplicada. Não se aceita a mesma nota fiscal do mesmo fornecedor mais de uma vez. | Nova |
| RN- 026 | Validade obrigatória. Produtos marcados como perecíveis exigem lote e validade na entrada. Validade anterior à data de entrada é rejeitada. | Nova |
|  |  |  |
|  |  |  |


<!-- Página 18 do PDF original -->

| ID | Regra | Origem |
| --- | --- | --- |
| RN- 027 | Fechamento mensal. Após o fechamento, lançamentos com data do período fechado só são aceitos com reabertura autorizada pelo gestor central. | Nova |
| RN- 028 | Preço comparável. Preços de apresentações diferentes são comparados sempre na unidade-base (preço por kg, litro ou unidade), com o fator de conversão do produto (RN-019). Cotação em embalagem diferente da cadastrada é convertida; se não for possível converter, é rejeitada com aviso. | Nova (planilhas de preço) |
| RN- 029 | Custo da refeição. O custo direto soma o custo dos alimentos da ficha técnica das porções servidas; o custo indireto soma os itens marcados como indiretos (descartáveis, embalagens e outros acessórios). O custo total é a soma dos dois, calculado com o preço de referência da RN-031. | Nova (cardápio de julho) |
| RN- 030 | Opção alternativa no cardápio. Um item do cardápio pode ter alternativas (ex.: café preto ou café com leite). O custo e a previsão de insumos usam o percentual de escolha estimado de cada alternativa; sem percentual, usam a alternativa mais cara, como faz o cardápio atual. | Nova (cardápio de julho) |
| RN- 031 | Preço de referência. O custo das refeições e as previsões usam o preço de referência do produto, definido por parâmetro da unidade: menor cotação vigente do mês, último preço pago ou média dos lotes em estoque. Padrão proposto: menor cotação vigente e, na falta dela, o último preço pago (menor cotação confirmada pelo RP1, seção 17.2). | Nova |
|  |  |  |
|  |  |  |


<!-- Página 19 do PDF original -->

| ID | Regra | Origem |
| --- | --- | --- |
| RN- 032 | Cotação vigente. Cada cotação vale para um mês de referência e registra fornecedor, produto, apresentação, preço, data e responsável. Nova cotação do mesmo fornecedor e produto no mesmo mês substitui a anterior, que permanece no histórico. | Nova (planilhas de preço) |
| RN- 033 | Inventário periódico. A periodicidade é parâmetro da unidade (padrão RP1: semanal). A divergência aprovada gera ajuste (RN-010) e entra na sugestão de compra seguinte: o que sobrou a menos é reposto e o que sobrou a mais é abatido, de modo que o saldo real, e não o do sistema, defina o que comprar. | Resposta do RP1 (27/10/2026) |
| RN- 034 | Retirada sempre registrada. Toda retirada de estoque gera lançamento. Quando o estoquista não está, o perfil Cozinha registra requisição rápida (produto, quantidade, quem retirou), que entra na conferência do dia. Diferença recorrente entre saldo e contagem do inventário indica retirada sem registro e aparece no indicador de divergência. | Resposta do RP1 (maior dificuldade) |
| RN- 035 | Sobras e reaproveitamento (poderá). Sobra exposta no buffet é baixada como perda, com motivo próprio. Sobra mantida em pass-through pode ser reaproveitada: o sistema a registra como lote de preparo, com data de produção, validade curta parametrizada e vínculo com o prato de origem. | Resposta do RP1 (27/10/2026) |
| RN- 036 | Amostras de refeição. Cada amostra coletada tem data, refeição, responsável e prazo de descarte (padrão 72 horas, parametrizável). O sistema alerta o descarte e registra quem o fez (RF-037). | Resposta do RP1 (fiscalização) |
|  |  |  |
|  |  |  |


<!-- Página 20 do PDF original -->
ID Regra Origem RN- Origem da entrada. Toda entrada informa Resposta do RP1 (27/10/2026) 037 a origem: Compra, Doação PAA ou Outra doação. Compra exige nota fiscal (RN- 025). Doação é aceita com o documento de recebimento do doador. Doação não entra no comparativo de preços nem no
cálculo de economia; o valor unitário é opcional.

## 7. Módulo 1 — Cadastros básicos e parâmetros

O módulo reúne os dados mestres que alimentam todos os demais. Prioridade: M (deve), S (deveria), C (poderia). Os campos listados são o mínimo; o desenvolvimento pode acrescentar campos técnicos como chave primária, data de criação e usuário de criação.

### 7.1 Padrão de tela CRUD (vale para RF-001 a RF-008)

Todas as telas de cadastro devem oferecer: listagem com busca textual, filtro por status e ordenação; paginação; ações Incluir, Editar, Visualizar, Inativar/Ativar e Excluir (apenas quando elegível, conforme RN-002); confirmação antes de inativar ou excluir; mensagens
de erro claras junto ao campo; indicação visual de campos obrigatórios; registro de auditoria (RN-022); e exportação da listagem em CSV. Quando a exclusão não é permitida, o botão deve explicar o motivo (ex.: "Este produto possui 14 movimentações; inative-o").

<!-- Página 21 do PDF original -->

| RF-001 — Unidades de medida (M) |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- |
| Campo | Tipo |  | Obrigatório |  | Observação |  |
| id unidade medida _ _ | inteiro, chave |  | Sim |  | Gerado pelo sistema |  |
| sigla | texto curto |  | Sim |  | KG, G, L, ML, UN, PCT |  |
| descricao | texto |  | Sim |  | Quilograma, Grama, Litro, Unidade, Pacote |  |
| grandeza | lista |  | Sim |  | Massa, Volume ou Contagem |  |
| fator base _ | decimal |  | Não |  | Conversão para a unidade-base da grandeza (ex.: G = 0,001 KG) |  |
| status | Ativo/Inativo |  | Sim |  | RN-001 |  |
| Regras: RN-001, RN-002, RN-003, RN-019. Só se convertem unidades da mesma grandeza. RF-002 — Categorias de produtos (M) |  |  |  |  |  |  |
| Campo |  | Tipo |  | Obrigatório |  | Observação |
| id categoria _ |  | inteiro, chave |  | Sim |  | Gerado pelo sistema |
| descricao |  | texto |  | Sim |  | Proteína, Laticínio, Hortifrúti, Grãos/Secos, Tempero, Panificação, Material de Limpeza, Descartável e embalagem |
| tipo item _ |  | lista |  | Sim |  | Alimento, Material de limpeza, Descartável |
| armazenamento padrao _ |  | lista |  | Sim |  | Seco, Resfriado ou Congelado |
| dias alerta validade _ _ |  | inteiro |  | Não |  | Substitui o padrão de 7 dias da RN-014 |
| status |  | Ativo/Inativo |  | Sim |  | RN-001 |
| Sugestão: o campo tipo item separa alimentos de material de limpeza, o que evita misturar _ estes itens nos cálculos de cardápio e nos relatórios nutricionais. |  |  |  |  |  |  |


<!-- Página 22 do PDF original -->
Categorias observadas na lista de insumos do restaurante: mercearia (arroz, feijão, óleo, massas, molhos), proteína (frango, suíno, bovino e miúdos), laticínio, tempero e descartável (marmitas EPS 102 e 104, tampa, copos de 100, 180 e 240 ml, sacolas e sacos).
Itens de descartável e embalagem entram com tipo_item = Descartável e podem ser ligados à ficha técnica como custo indireto (RF-005).
RF-003 — Produtos e alimentos (M) Campo Tipo Obrigatório Observação id_produto inteiro, chave Sim Gerado pelo sistema codigo_interno texto Não Código para etiqueta e busca rápida descricao texto Sim Única (RN-003) id_unidade_medida FK Sim Unidade-base do saldo
id_categoria FK Sim perecivel sim/não Sim Se sim, lote e validade são obrigatórios (RN-026) armazenamento lista Sim Herda da categoria, pode ser alterado fator_correcao decimal Não Padrão 1,00; usado na previsão de insumos alergenos multisseleção Não
Glúten, leite, ovo, soja, amendoim, crustáceos, etc.
status Ativo/Inativo Sim
RN-001 Parâmetros por unidade do restaurante (tabela filha, um registro por produto e unidade):

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| id unidade restaurante (FK) _ _ | Sim | Bucarein ou Adhemar Garcia |
| estoque minimo _ | Sim | Base do alerta de reposição (RN-013) |
| estoque maximo _ | Não | Evita compra excessiva |
| ponto reposicao _ | Não | Se vazio, usa o estoque mínimo |

Regras: RN-001, RN-002, RN-013, RN-019, RN-026. A unidade de medida não pode ser alterada depois da primeira movimentação.

<!-- Página 23 do PDF original -->
Campos acrescentados a partir da lista de insumos do restaurante, que traz, ao lado de cada produto, o tipo ou a marca e o tamanho da embalagem:
Campo Obrigatório Observação descricao_complementar Não Tipo ou marca, ex.: parboilizado tipo 1, Caboclo ou 3 Corações, Heinig apresentacao_compra Sim Embalagem em que o produto é comprado, ex.:
pacote de 5 kg, frasco de 900 ml, lata de 2,6 kg, galão de 15 L quantidade_apresentacao Sim Conteúdo da embalagem na unidade-base (5 kg, 0,9 L), usado na conversão da RN-019 e na comparação de preços da RN-028 fornecedores_habituais Não Fornecedores que costumam cotar o produto
(RF-004, RF-033) A unicidade da RN-003 considera descrição e descrição complementar juntas, para evitar duplicidades como "feijão preto" e "feijão preto Urbano". Variedades do mesmo item, como feijão preto e feijão carioca, continuam cadastros separados.
RF-004 — Fornecedores (M) O levantamento inicial usava id_fornecedor na entrada de materiais, mas não previa o cadastro. Este requisito fecha a lacuna.

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| id fornecedor _ | inteiro, chave | Sim |  |
| razao social _ | texto | Sim |  |
| nome fantasia _ | texto | Não |  |
| cnpj cpf _ | texto | Sim | Validado e único (RN-003) |
| contato, telefone, email | texto | Não |  |
| endereco | texto | Não |  |
| observacoes | texto | Não | Ex.: prazo de entrega, condições |
| status | Ativo/Inativo | Sim | RN-001 |


<!-- Página 24 do PDF original -->
Carga inicial sugerida: os seis fornecedores que aparecem nas planilhas de preços de maio a julho de 2026 (SOS, Segalas, Taff, Imperatriz, HQ10 e Frangos Canção), com os nomes como estão na planilha; razão social e CNPJ precisam ser confirmados. Campos
acrescentados: tipo_fornecedor (mercearia ou atacado, frigorífico ou proteínas, descartáveis, hortifrúti), prazo_entrega_dias, pedido_minimo e condicao_pagamento, usados na comparação de cotações (RF-033).
Refinamento v1.2. O fornecedor ganha o campo agricultura_familiar (sim ou não), porque o RP1 cota apenas com esse tipo de fornecedor, e o canal preferido de contato (e-mail ou WhatsApp). A cotação continua sendo digitada pela nutricionista a partir das respostas
recebidas; nesta versão o sistema não envia pedidos de cotação.
RF-005 — Pratos e fichas técnicas (M) Cabeçalho Campo Tipo Obrigatório Observação id_prato inteiro, Sim chave descricao_prato texto Sim Ex.: Estrogonofe de Frango, Arroz Branco tipo_prato lista Sim Arroz, Feijão, Proteína, Guarnição, Salada, Sobremesa/Fruta, Bebida
rendimento_porcoes inteiro Sim Quantas porções a receita rende peso_porcao_g decimal Não Peso de referência da porção modo_preparo texto longo Não versao inteiro Sim Incrementa em cada alteração (RN- 017) status Ativo/Inativo Sim
RN-001 Itens da ficha técnica

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| id produto (FK) _ | Sim | Somente produtos ativos do tipo Alimento |
| quantidade receita _ | Sim | Quantidade total na receita inteira, na unidade do produto |


<!-- Página 25 do PDF original -->

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| fator correcao _ | Não | Herdado do produto, editável |
| observacao | Não | Ex.: cortado em cubos |

O levantamento inicial usava o campo quantidade_por_porcao_ou_receita, que mistura dois significados. A especificação passa a guardar sempre a quantidade da receita inteira, e o sistema calcula a quantidade por porção (quantidade da receita ÷ rendimento)
e o custo estimado por porção a partir do valor unitário dos lotes em estoque.
Exemplo: o prato Estrogonofe de Frango (rendimento de 100 porções) vincula Peito de Frango, Creme de Leite, Ketchup e Mostarda com as quantidades totais da receita. Para 250 refeições, o sistema multiplica por 2,5.
Regras: RN-017, RN-018. Prato com alterações de ficha técnica mantém as versões anteriores consultáveis (S).
Acréscimos a partir do cardápio de café da manhã de julho 1. Tipos de prato adicionais: Panificação, Acompanhamento (manteiga, queijo, patê, doce de fruta), Bebida, Fruta e Bolo ou doce. O café da manhã não segue a composição arroz, feijão e proteína.
2. Custo indireto na ficha técnica: cada item da ficha técnica tem a marcação custo_indireto (sim ou não). Alimentos são custo direto; descartáveis e embalagens (copo e tampa da bebida, copinho da manteiga ou do doce) são custo indireto (RN- 029).
3. Valor nutricional: campo kcal_porcao por prato, informado pela nutricionista (RF-032).
4. Unidade da porção: unidade_porcao em gramas (manteiga 10 g, omelete 25 g, queijo 20 g, patê 25 g, doce de fruta 40 g), unidades (2 pães) ou pedaços (banana assada, 4 pedaços).
5. Itens comprados inteiros: frutas e outros itens comprados por peça ou por peso total (no cardápio, "melão (18 kg)") usam o fator de correção e as porções por unidade comprada (porcoes_por_unidade_compra) para chegar ao custo por porção.
6. Preparos usados em outros (C): omelete, patê de frango e patê de ovo podem ser cadastrados como prato e, opcionalmente, ser item da ficha técnica de outro prato (subreceita).
RF-006 — Unidades do restaurante e calendário de funcionamento (M) O levantamento tratava as unidades como filiais, sem cadastro. Este requisito torna as regras de funcionamento parametrizáveis em vez de fixas no código.

<!-- Página 26 do PDF original -->

| Campo | Observação |
| --- | --- |
| id unidade restaurante _ _ | Chave |
| nome, endereco, bairro | Ex.: Restaurante Popular 1 — Herbert José de Souza, Bucarein |
| refeicoes habilitadas _ | Café da manhã, Almoço, Jantar, cada uma com horário de início e fim |
| dias funcionamento _ | Dias da semana e se atende em feriados |
| capacidade refeicao _ | Opcional: máximo de comensais por refeição |
| calendario feriados _ | Datas em que a unidade não funciona ou funciona em regime especial |
| status | Ativo/Inativo |

Carga inicial: Bucarein com café (7h–9h), almoço (11h–14h) e jantar (17h–19h) todos os dias, inclusive feriados; Adhemar Garcia com almoço (11h–14h) de segunda a sexta, exceto feriados (RN-016).
RF-007 — Parâmetros gerais (S) Câmaras de armazenamento: id_camara, unidade, nome, tipo (congelada, resfriada, seca), faixa de temperatura, status. Necessário para o RF-014.
Motivos de perda: lista parametrizável (lote estragado, queda de energia ou temperatura, validade vencida, avaria no transporte, erro de preparo, outros), com indicação de motivo que exige foto ou anexo.
Alertas: dias de antecedência para validade, janela de descongelamento (24 a 48 h) e limite de perda que exige aprovação do gestor (RN-014, RN-020, RN-021).
Fechamento mensal: dia de corte e reabertura (RN-027).
RF-008 — Usuários, perfis e acesso (M)

| Campo | Observação |
| --- | --- |
| id usuario, nome, email _ | Email único, usado no login |
| perfil | Um dos perfis da seção 4 |
| unidades vinculadas _ | Uma ou mais unidades (RN-012) |
| status | Ativo, Inativo ou Bloqueado |


<!-- Página 27 do PDF original -->
Funcionalidades: criação por administrador; senha inicial temporária com troca obrigatória no primeiro acesso; política de senha forte; bloqueio após 5 tentativas inválidas;
recuperação de senha por email; encerramento automático de sessão por inatividade (30 minutos, parametrizável); e opção de autenticação em dois fatores para perfis de aprovação (C).
RF-036 — Importação de planilhas e carga inicial (S) O restaurante já mantém consumo mensal e cotações de preços em planilhas; o sistema deve importar esses dados em vez de exigir nova digitação.
1. Modelos de importação em XLSX e CSV para produtos, fornecedores, saldo inicial por lote (inventário de abertura), consumo mensal histórico (produto × mês) e cotações (produto × fornecedor × mês).
2. Pré-visualização com validação linha a linha antes de gravar, apontando erros como produto sem nome, unidade não reconhecida, valor negativo ou duplicidade; nada é gravado até o usuário corrigir ou aprovar.
3. Reconhecimento de produtos por nome, ignorando maiúsculas, acentos e espaços (RN-003), com sugestão de vínculo para nomes parecidos (por exemplo, "Catchup" e "Ketchup") e revisão manual.
4. Registro de cada importação (arquivo, usuário, data, linhas aceitas e rejeitadas) e possibilidade de desfazer enquanto nenhum dado dependente tiver sido usado.
5. Consumo e cotações históricos alimentam relatórios e previsões (RF-010, RF-025, RF- 034) sem gerar movimentação de estoque. O saldo inicial gera lotes de abertura, que o gestor da unidade aprova.
6. Na primeira importação, o sistema pergunta a unidade das quantidades (kg, litros ou embalagens) e a unidade dos preços (por unidade-base ou por embalagem), porque as planilhas atuais não dizem (seção 2.4).
Regras: RN-003, RN-019, RN-022, RN-028.
RF-037 — Registro de amostras de refeição O RP1 guarda amostras das refeições por 72 horas por causa da fiscalização da Vigilância Sanitária. O sistema deve (S) registrar cada coleta e controlar o descarte:
1. A cozinha ou a nutricionista registra a amostra: unidade, data e hora, refeição, prato, local de guarda e responsável.
2. O sistema calcula o prazo de descarte (padrão 72 horas, parâmetro da unidade) e gera alerta quando ele vence.
3. Ao descartar, o responsável registra data e hora; amostra vencida e não descartada aparece no painel de alertas.

<!-- Página 28 do PDF original -->
4. O histórico de amostras pode ser consultado e exportado para a fiscalização.
Regras: RN-036 e RN-022.

## 8. Módulo 2 — Planejamento de cardápios, custos e cotação de

preços A nutricionista monta o cardápio; o sistema transforma esse plano em necessidade de insumos e a compara com o estoque, fechando o ciclo entre planejamento e abastecimento.
RF-009 — Planejamento de cardápio semanal ou mensal (M) Estrutura de dados. O levantamento inicial guardava data e unidade no mesmo registro de cardápio. Para permitir versões, estados e vínculo preciso com a saída, a estrutura passa a ter três níveis:

| Nível | Campos principais |
| --- | --- |
| Cardápio (período) | id cardapio, id unidade restaurante (FK), _ _ _ tipo periodo (semanal ou mensal), data inicio, _ _ data fim, versao, status, id nutricionista (FK _ _ usuário) |
| Dia do cardápio | id cardapio dia, data planejamento, dia semana _ _ _ _ (calculado), observacao |
| Refeição do dia | id cardapio refeicao, tipo refeicao (café da _ _ _ manhã, almoço, jantar), refeicoes estimadas, _ status; pratos vinculados (id prato, ordem, _ grupo opcao, percentual escolha, observacao) _ _ |

Estados do cardápio: Rascunho → Em validação (opcional, para o gestor) → Publicado → Encerrado, com a possibilidade de Cancelado. Só cardápio Publicado alimenta a previsão de insumos e a saída diária (RN-024).
Funcionalidades 1. Visão de calendário mensal e grade semanal, com arrastar e soltar de pratos entre dias e refeições.
2. Seleção de unidade; só aparecem os dias e refeições habilitados para ela (RN-016): em Adhemar Garcia, apenas almoço, de segunda a sexta e fora de feriados; em Bucarein, café da manhã, almoço e jantar todos os dias.
3. Busca de pratos ativos do RF-005 por nome, tipo ou ingrediente.

<!-- Página 29 do PDF original -->
4. Copiar dia, semana ou mês para outro período, e salvar cardápio-modelo reutilizável (S).
5. Informar o número estimado de refeições por refeição do dia; sugerir o valor com base na média das mesmas refeições nas últimas semanas, quando houver histórico (S).
6. Validação de composição: alerta quando o almoço ou o jantar não tem arroz, feijão, proteína, guarnição, salada ou sobremesa/fruta, conforme o padrão descrito pela Secretaria. No café da manhã, alerta quando faltar panificação, proteína ou acompanhamento, bebida ou fruta, como no cardápio praticado hoje (S).
7. Alerta de repetição: o mesmo prato de proteína em dias seguidos, ou repetição acima de limite parametrizável (C).
8. Alerta de alérgenos presentes no dia, para sinalização ao público (C).
9. Alerta de disponibilidade: ao publicar, indica os produtos cujo saldo projetado não cobre o cardápio (liga com o RF-010).
10. Publicação, versionamento e histórico de mudanças com justificativa (RN-024).
11. Impressão ou exportação em PDF do cardápio da semana em duas versões: pública, para divulgação na unidade, e interna, com custo e valor nutricional por dia, como o documento atual (S).
Refinamento v1.2. O RP1 monta o cardápio todo mês, sem ciclo fixo, e cada unidade tem cardápio próprio; quem monta é a responsável técnica. O sistema deve permitir copiar um cardápio de mês anterior como ponto de partida (S). As regras de composição (itens
obrigatórios e gramaturas por refeição) estão no contrato do restaurante, ainda não recebido; até lá a validação de composição é apenas um aviso e nunca bloqueia a publicação.
RF-010 — Previsão de insumos (explosão de insumos) (M) Para cada produto, o sistema calcula a quantidade teórica necessária no período, somando todos os pratos de todas as refeições do cardápio publicado.
N_{p} = \sum_{r} \sum_{i \in prato(r)} \frac{Q_{i,p}}{R_{i}} \times E_{r} \times FC_{p} \times (1 + M) onde: N = necessidade do produto p; Q = quantidade do produto na receita inteira do prato i (RF-005); R = rendimento em porções do prato; E = refeições estimadas da refeição
r; FC = fator de correção do produto (padrão 1,00); M = margem de segurança parametrizável (padrão 5%).
Saída da tela (por unidade e período):

<!-- Página 30 do PDF original -->

| Coluna | Descrição |
| --- | --- |
| Produto, categoria, unidade | Identificação |
| Necessidade total | Resultado da fórmula acima, com detalhe por dia e por prato |
| Saldo atual | Soma dos lotes válidos na unidade |
| Saldo projetado | Saldo atual menos necessidade de cardápios anteriores ainda não consumidos |
| Déficit ou sobra | Projetado menos necessidade; vermelho quando negativo |
| Estoque mínimo | Para comparar com o ponto de reposição |

Regras: a previsão é uma estimativa teórica, não baixa estoque (apenas o RF-013 baixa);
sempre usa a versão da ficha técnica vigente na publicação (RN-017); recalcula quando o cardápio muda; pode ser exportada em PDF ou CSV.
Hipótese a validar: o sistema considera que a quantidade da ficha técnica é líquida (peso limpo) e aplica o fator de correção para chegar ao bruto. Se a nutricionista já registra pesos brutos, basta deixar o fator em 1,00 (ver seção 17).
Refinamento v1.2. As quantidades das receitas do RP1 são brutas (antes de limpar), o que substitui a hipótese anterior de quantidade líquida. Por isso o fator de correção FC padrão é 1,00, para não contar duas vezes a perda de limpeza; o campo FC continua disponível
para pratos cuja receita venha em peso líquido. A margem de segurança M existe na prática do restaurante, mas o percentual não foi informado: é parâmetro por unidade, com valor inicial de 5%, ajustável pela nutricionista por categoria de alimento. A estimativa de
refeições E é sugerida pela média do mês da mesma refeição (hoje, no RP1, cerca de 600 almoços, 200 cafés e 200 jantares por dia), com ajuste manual da nutricionista conforme a proteína do cardápio (peixe atrai menos gente, carne de gado mais) e fatores como chuva.
O sistema guarda os ajustes para melhorar a sugestão nos meses seguintes.
RF-011 — Sugestão de necessidade de compra (S) A partir do déficit do RF-010, o sistema monta uma lista de compras sugerida, agrupada por categoria e pelo fornecedor de menor cotação vigente (RF-033) ou, na falta dela, pelo fornecedor habitual do produto. A lista é apenas uma sugestão exportável; o processo de
compra e licitação está fora do escopo (seção 3.3). Campos: produto, quantidade sugerida (déficit arredondado à embalagem padrão), data limite de chegada (um dia antes da primeira refeição que usa o produto, menos o prazo de entrega informado) e observações.

<!-- Página 31 do PDF original -->
Critério de projeto: proteínas congeladas precisam ainda considerar a janela de descongelamento do RF-014, de modo que a data limite de chegada fica 48 horas antes do uso, no mínimo.
RF-031 — Custo da refeição, direto e indireto (S) O sistema calcula quanto custa servir cada prato, refeição e dia do cardápio, como o restaurante faz hoje à mão no cardápio de café da manhã.
C_{r} = \sum_{i \in r} \sum_{p \in ficha(i)} \frac{Q_{i,p}}{R_{i}} \times PR_{p} onde C é o custo por comensal da refeição r; Q e R são a quantidade na receita e o rendimento do prato i (RF-005); e PR é o preço de referência do produto p na unidade- base (RN-031). A soma dos itens alimentares dá o custo direto; a soma dos itens marcados
como custo indireto dá o custo indireto (RN-029).
1. O custo aparece por prato (por porção), por refeição do dia (por comensal) e por dia; o total do período é o custo por comensal vezes as refeições estimadas.
2. Itens com alternativa (café preto ou café com leite) usam o percentual de escolha de cada alternativa; sem percentual, usam a mais cara, como o cardápio atual (RN-030).
3. A tela mostra o custo total ao lado do valor máximo cobrado do público geral na refeição (café da manhã R$ 5,00, almoço R$ 12,00 e jantar R$ 10,00) e a diferença entre os dois.
4. Com o módulo 4 ativo, o custo realizado é o custo por comensal vezes as refeições servidas (RF-020), por refeição e unidade, para a prestação de contas.
5. Itens sem preço de referência são destacados e o custo do dia fica marcado como incompleto.
6. Os itens de custo indireto entram na previsão de insumos (RF-010), de modo que copos, tampas e marmitas também têm necessidade calculada.
7. O cardápio impresso (RF-009) tem versão interna, com custo e valor nutricional por dia, e versão pública, sem eles.
Exemplo conferido com o cardápio de segunda-feira de julho: 2 pães (R$ 0,99), manteiga de 10 g (R$ 0,29), omelete de 25 g (R$ 0,64), maçã (R$ 0,36) e café com leite (R$ 0,45) somam R$ 2,73 de custo direto. Os indiretos (R$ 0,041 da manteiga e R$ 0,24 da bebida)
somam R$ 0,281, e o total é R$ 3,01.

<!-- Página 32 do PDF original -->
RF-032 — Valor nutricional das refeições (S) Cada prato guarda a energia por porção (kcal_porcao), informada pela nutricionista (RF- 005), e o sistema soma por refeição e por dia: no café da manhã de julho, de 592 a 772 kcal.
A nutricionista pode definir uma faixa mínima e máxima de quilocalorias por tipo de refeição; fora dela, o planejamento mostra um alerta, sem bloquear. Campos opcionais por prato: carboidratos, proteínas, gorduras e sódio. O cálculo automático a partir de tabelas
de composição de alimentos fica para versões futuras (seção 15.3).
Refinamento v1.2. O RP1 usa a tabela TACO e não mantém controle sistemático. A versão 1 apenas registra o valor informado pela nutricionista para cada prato; o cálculo automático pela TACO fica como melhoria futura (C).
RF-033 — Cotação de preços por fornecedor (S) Registra os preços que os fornecedores oferecem a cada mês, hoje mantidos nas abas Preços Maio, Junho e Julho da planilha.
Campo Obrigatório Observação id_cotacao Sim Gerado pelo sistema mes_referencia Sim Mês a que a cotação se refere (RN- 032) data_cotacao Sim Data em que o preço foi obtido id_fornecedor (FK) Sim
RF-004 id_produto (FK) Sim
RF-003 apresentacao e Sim Embalagem cotada, ex.: lentilha de quantidade_apresentacao 400 g ou de 1 kg; se diferir da cadastrada, o sistema converte preco Sim Preço da embalagem cotada preco_unidade_base Calculado Preço por kg, litro ou unidade (RN- 028)
observacao Não Ex.: tampa já vem com a marmita, prazo de entrega, pedido mínimo anexo Não Proposta ou foto da tabela de preços id_usuario Sim Quem lançou

<!-- Página 33 do PDF original -->
Funcionalidades: lançamento em grade produto × fornecedor, como na planilha; cópia das cotações do mês anterior para ajuste; importação da planilha (RF-036); histórico de preços por produto e fornecedor; destaque do menor preço de cada produto no mês.
Regras: RN-028 e RN-032.
RF-034 — Comparativo de preços e economia potencial (S) Mostra, por mês e unidade, quanto se pagou acima da menor cotação. É o que as planilhas chamam de "Valor gasto a mais" e "Total em economia que poderia ter".
E_{m} = \sum_{p} \max\left(0,\; PP_{p,m} - PC_{p,m}\right) \times Q_{p,m} onde PP é o preço pago médio do produto p no mês m, tirado das entradas confirmadas (RF-012); PC é a menor cotação válida do mês, na unidade-base; e Q é a quantidade comprada.
Saída por produto: quantidade comprada, preço pago médio, menor cotação e fornecedor, diferença e economia potencial, com subtotais por categoria, total do mês e acumulado do ano, e ranking dos fornecedores por número de itens com menor preço. Regras: só entram
produtos comparáveis (mesma unidade-base, RN-028); produto sem cotação no mês aparece como "sem cotação" e fica fora do total; a economia é potencial, pois não considera prazo de entrega, pedido mínimo nem qualidade, e o relatório mostra as observações da cotação.
RF-035 — Alerta de variação de preço (C) O sistema alerta a nutricionista e o gestor da unidade quando a cotação de um produto sobe mais que o limite parametrizável (padrão 15%) sobre a cotação anterior do mesmo fornecedor, ou quando o preço pago em uma entrada passa da menor cotação vigente em
mais que o limite (padrão 10%). Casos reais da planilha: feijão preto do fornecedor SOS de R$ 3,59 em maio para R$ 5,29 em junho (alta de 47%) e feijão carioca de R$ 6,39 para R$ 9,89 (alta de 55%). A comparação é feita na unidade-base (RN-028), para não confundir
mudança de embalagem com mudança de preço.

## 9. Módulo 3 — Movimentações de estoque

Toda movimentação é registrada por unidade (RN-004), por produto e por lote (RN-005), com usuário, data e hora (RN-022). O saldo é mantido por lote e por local de armazenamento (câmara ou almoxarifado seco), o que sustenta o RF-014 e o RF-017.

<!-- Página 34 do PDF original -->

|  |  |  |  |  |
| --- | --- | --- | --- | --- |
| Movimentação | Efeito no saldo |  |  | Requer aprovação |
| Entrada (RF-012) | Aumenta, ao confirmar |  |  | Confirmação pelo estoquista; gestor se divergir da nota |
| Saída (RF-013) | Diminui, ao aprovar |  |  | Sim, nutricionista ou gestor |
| Transferência entre câmaras (RF-014) | Move o saldo entre locais, sem alterar o total |  |  | Não |
| Perda (RF-015) | Diminui, ao aprovar |  |  | Sim, conforme limite (RN-020) |
| Ajuste de inventário (RF- 016) | Aumenta ou diminui, ao aprovar |  |  | Sim, gestor da unidade |
| Estorno (RN-010) | Reverte uma movimentação |  |  | Sim, gestor da unidade |
| RF-012 — Entrada de materiais e recebimento de notas (M) Cabeçalho |  |  |  |  |
| Campo |  | Obrigatório | Observação |  |
| id entrada _ |  | Sim |  |  |
| id unidade restaurante _ _ (FK) |  | Sim | Unidade que recebe (RN-004) |  |
| data entrada _ |  | Sim | Não pode ser futura |  |
| id fornecedor (FK) _ |  | Sim | Fornecedor ativo (RF-004) |  |
| numero nota fiscal _ _ |  | Não | Se informado, único por fornecedor (RN-025); série e chave de acesso opcionais |  |
| valor total nota _ _ |  | Não | Compara com a soma dos itens e alerta divergência |  |
| anexo |  | Não | Foto ou PDF da nota |  |
| observacoes |  | Não |  |  |
| status |  | Sim | Rascunho, Confirmada ou Estornada |  |
| Itens da entrada |  |  |  |  |


<!-- Página 35 do PDF original -->
Campo Obrigatório Observação id_produto (FK) Sim Produto ativo quantidade_recebida Sim Maior que zero, na unidade-base ou convertida (RN-019) valor_unitario Sim valor_total Calculado Quantidade × valor unitário numero_lote Sim para perecíveis Se vazio, o sistema gera um
identificador único data_validade Sim para perecíveis
RN-026 temperatura_recebimento Para resfriados e Registro de conformidade do congelados recebimento conformidade Sim Conforme, Aceito com ressalva ou Recusado, com motivo id_camara_destino (FK) Sim Onde o lote será armazenado observacoes_item Não Regra principal: ao confirmar, o sistema cria um lote por item, incrementa o saldo da
unidade no local indicado e trava a edição (RN-010). Itens recusados não geram saldo. O recebimento deve permitir o registro de temperatura e de aspecto da embalagem, em linha com as boas práticas para serviços de alimentação (por exemplo, a RDC 216/2004 da
Anvisa).
Comparação com a cotação: ao informar o valor unitário de um item, o sistema mostra a menor cotação vigente do mês e o fornecedor (RF-033). Se o valor pago passar da menor cotação em mais que o limite parametrizável, pede uma justificativa (por exemplo, prazo
de entrega, pedido mínimo ou falta do produto no fornecedor mais barato). O preço pago das entradas confirmadas alimenta o RF-034.
Refinamento v1.2. A nota fiscal é obrigatória em toda compra (confirmado no RP1). O RP1 também recebe doações do PAA, por isso toda entrada informa a origem: Compra, Doação PAA ou Outra doação (RN-037); doação é aceita sem nota fiscal, com o número do
documento de recebimento. Na entrada o estoquista registra a conferência (peso, temperatura, validade e aspecto). Produto fora do padrão é recusado e devolvido ao fornecedor: o sistema registra a recusa com motivo e não altera o saldo (S).

<!-- Página 36 do PDF original -->
RF-013 — Saída diária operacional (consumo das refeições) (M) Cabeçalho

| Campo | Observação |
| --- | --- |
| id saida _ | Chave |
| id unidade restaurante (FK) _ _ | RN-004 |
| data movimento _ | Dia do consumo |
| tipo saida _ | Consumo de refeição, Uso interno ou limpeza, Outras |
| id cardapio refeicao (FK) _ _ | Obrigatório quando o tipo é consumo de refeição |
| id solicitante, id aprovador _ _ | Usuários distintos (RN-009) |
| status | Pendente de Aprovação, Aprovada ou Rejeitada (RN-011) |
| motivo rejeicao _ | Obrigatório ao rejeitar |

Itens da saída: id_produto (FK), id_lote (FK), id_camara_origem (FK), quantidade_saida e observacao.
Fluxo 1. O estoquista abre a saída do dia; o sistema pré-preenche os insumos do cardápio publicado com a quantidade prevista (RF-010) para as refeições estimadas.
2. O estoquista ou a cozinha ajusta as quantidades reais e confirma os lotes sugeridos por FEFO (RN-006); troca de lote exige justificativa.
3. Ao enviar, a saída fica Pendente de Aprovação, sem alterar o saldo. O sistema reserva a quantidade para evitar que outra saída use o mesmo saldo (S).
4. A nutricionista ou o gestor confere e aprova ou rejeita, com motivo. A aprovação baixa os lotes; a rejeição libera a reserva e devolve ao solicitante para correção.
5. Quando a quantidade lançada diverge da prevista em mais de um limite parametrizável (padrão 10%), a justificativa é obrigatória.
6. Sobras não utilizadas podem ser devolvidas ao estoque por lançamento de devolução, ligado à mesma saída (S).
Pendências com mais de 24 horas aparecem em destaque no painel do aprovador (RF- 029). O sistema bloqueia lote vencido (RN-007) e saldo insuficiente (RN-008).

<!-- Página 37 do PDF original -->
Refinamento v1.2. (1) O RP1 tem um único estoquista, que hoje também autoriza as saídas.
Por isso o modo de aprovação da saída de consumo é parâmetro da unidade (RN-011); no modo Posterior, adotado como padrão no RP1, a saída baixa o saldo ao ser registrada e a nutricionista ou o gestor a confere no mesmo dia ou no seguinte. (2) Para atacar as
retiradas sem anotação, o perfil Cozinha pode registrar uma requisição rápida (produto, quantidade e quem retirou) a qualquer hora, inclusive sem o estoquista (RN-034). (3) A tela de saída deve funcionar bem em celular ou tablet, pois o registro precisa ser feito no
ato da retirada. (4) O relatório de conferência diária lista as saídas Registradas ainda sem conferência e as Contestadas.
RF-014 — Transferência interna de proteínas entre câmaras (M) Registra o descongelamento seguro da proteína, movendo o lote da câmara congelada para a resfriada.
Campo Observação id_transferencia, Chaves id_unidade_restaurante id_produto, id_lote (FK) Somente produtos de armazenamento Congelado id_camara_origem, id_camara_destino Congelada para resfriada quantidade Não excede o saldo na origem (RN-008) data_hora_transferencia
Início do descongelamento id_cardapio_refeicao_previsto (FK) Refeição em que será usada, opcional data_limite_uso Calculada: prazo máximo de uso após descongelar, parametrizável por produto responsavel, observacoes Regras: o sistema indica a janela de 24 a 48 horas antes da refeição (RN-021); a tela "A
descongelar hoje" lista as proteínas dos cardápios das próximas 24 a 48 horas e ainda não transferidas; descongelamento fora da janela gera alerta e pede justificativa; proteína descongelada e não usada até a data limite gera alerta para uso prioritário ou descarte
(RF-015).

<!-- Página 38 do PDF original -->
RF-015 — Gestão de perdas, avarias e descartes (M) Campo Obrigatório Observação id_perda, Sim id_unidade_restaurante data_registro Sim Pode ser anterior à data atual, dentro do período aberto (RN-027) id_produto, id_lote (FK) Sim Lote com saldo id_camara (FK)
Sim Local da perda quantidade_perda Sim Não excede o saldo do lote (RN-008) id_motivo_perda (FK) Sim Lista parametrizada (RF-007) justificativa e anexo Conforme o Foto exigida em motivos configurados motivo valor_prejuizo Calculado Quantidade × valor unitário do lote
(RN-015) status Sim Pendente, Aprovada ou Rejeitada;
baixa o saldo na aprovação acao_corretiva Não Ex.: manutenção da câmara Perda em lote de itens: para eventos como queda de energia, o usuário seleciona uma câmara e marca todos os lotes afetados num único lançamento, com um motivo e uma justificativa, gerando uma perda por lote. Esta funcionalidade é complementar e evita
lançamentos repetidos.
Refinamento v1.2. No RP1 toda perda, de qualquer quantidade, passa pela nutricionista (RN-020). A lista de motivos (RF-007) recebe como valores iniciais: validade vencida, queda de energia ou falha de câmara, baixa aceitação, menor fluxo de pessoas (chuva),
sobra de buffet (descarte) e avaria no transporte. O reaproveitamento de sobra mantida em pass-through segue a RN-035 (C).
RF-016 — Inventário e ajustes de estoque (S) Ausente no levantamento inicial, é a forma de reconciliar o saldo do sistema com o estoque físico.
1. O gestor abre um inventário geral ou parcial (por categoria ou câmara) e define a data de corte.

<!-- Página 39 do PDF original -->
2. O estoquista lança a contagem por produto e lote; a tela pode ocultar o saldo do sistema para evitar viés (contagem cega).
3. O sistema calcula as divergências em quantidade e valor.
4. O gestor da unidade analisa, aprova e o sistema gera automaticamente ajustes de entrada ou saída com motivo Inventário.
5. O inventário é encerrado e fica consultável; a divergência alimenta o indicador da seção 3.4.
Refinamento v1.2. A periodicidade padrão do RP1 é semanal (RN-033). Como o estoquista também confere o estoque todos os dias, o sistema deve permitir inventário parcial rápido (por categoria ou câmara) além do geral. A divergência aprovada aumenta ou reduz a
sugestão de compra seguinte (RF-011).
RF-017 — Consulta de saldo e extrato de movimentação (kardex) (M) Consulta de saldo por produto, lote, local e validade, e extrato cronológico de todas as movimentações de um produto ou lote, com saldo corrente, filtro por período e tipo e exportação em CSV. Serve de base para os relatórios do módulo 5.

## 10. Módulo 4 — Atendimento e comensais (proposto)

O levantamento inicial cobria estoque e cardápio, mas não registrava quantas refeições foram servidas e a quem. Sem esse dado, o número de refeições estimadas do RF-009 é um palpite, a sobra não é medida e a Secretaria não presta contas do subsídio. Este
módulo é uma proposta de prioridade S e pode ser entregue depois do núcleo (seção 15).
Ele precisa ser validado com a equipe de assistência social antes do desenvolvimento.
RF-018 — Cadastro de comensais e categoria tarifária (S) Campo Obrigatório Observação id_comensal Sim Identificador interno nome ou nome social Sim documento (CPF, RG ou Não O atendimento não pode ser outro) negado por falta de documento; o sistema aceita cadastro sem
documento numero_nis_cadunico Não Informação usada na verificação do subsídio

<!-- Página 40 do PDF original -->
Campo Obrigatório Observação categoria_tarifaria Sim Público geral, Subsidiado ou Gratuito validade_enquadramento Sim para subsidiado e Data para reavaliação pela gratuito assistência social servico_encaminhador Não CRAS, CREAS, Centro POP ou outro unidade_referencia
Não Unidade onde costuma comer ciencia_lgpd Sim Registro de que a pessoa foi informada sobre o uso dos dados status Sim Ativo ou Inativo Regras: o enquadramento é definido e alterado apenas pelo perfil de atendimento social (RN-012). O sistema não armazena dados de saúde, renda detalhada ou situação
socioeconômica além da categoria tarifária (RN-023). Enquadramento vencido volta para a categoria Público geral e gera aviso ao atendimento social.
Refinamento v1.2 (decisão adotada na seção 17.2). No RP1 os dados dos comensais vêm do CRAS, o cadastro é feito com base no CadÚnico e fica sob responsabilidade da assistente social. Pela RN-023 o sistema não duplica esse cadastro: guarda apenas o perfil
de atendimento (1, 2 ou 3) e um código interno, para o caixa saber se a refeição é paga ou gratuita. Se a assistente social preferir manter tudo fora do sistema, o módulo fica só com a contagem de refeições por perfil.
RF-019 — Tabela de valores e registro de refeições servidas (S) Tabela de valores (parametrizável por refeição e categoria, com vigência): a Secretaria define o valor de cada combinação; o sistema impede cadastro acima do teto informado para o público geral (café da manhã R$ 5,00, almoço R$ 12,00 e jantar R$ 10,00) e preserva
o histórico de valores.
Registro de refeições servidas. Para não criar fila, o sistema oferece dois modos de operação:
Modo Quando usar Dados registrados Contagem rápida Horário de pico, sem Quantidade por categoria identificação tarifária, refeição e unidade

<!-- Página 41 do PDF original -->
Modo Quando usar Dados registrados Atendimento Comensal cadastrado ou com Comensal, categoria, valor identificado benefício a conferir devido, data e hora Campos de cada registro: id_unidade_restaurante, data, tipo_refeicao, categoria_tarifaria, valor_cobrado, id_comensal (opcional) e usuário. O sistema calcula o valor arrecadado por
refeição e a gratuidade concedida, mas não processa pagamentos (seção 3.3).
Modalidade de consumo: cada refeição servida é registrada como consumo no local ou marmita (para viagem). As marmitas usam descartáveis da ficha técnica (marmita EPS 102 ou 104, tampa, copo e sacola), cujas quantidades entram na saída diária pré-preenchida
(RF-013) e no custo indireto (RF-031). A lista de preços do restaurante traz esses descartáveis; a proporção de refeições em marmita e as regras de acesso devem ser confirmadas (seção 17.2).
Refinamento v1.2. No RP1 o pagamento é em dinheiro e quem tem cadastro com isenção não paga. Existem três perfis (1, 2 e 3), mas o restaurante não informou o valor nem a regra de cada um: a tabela de valores é parametrizável por perfil e por refeição, com bloqueio de
valor acima do teto ao público geral (café R$ 5, almoço R$ 12 e jantar R$ 10); o gestor central cadastra os valores antes do uso. O sistema não processa pagamento: o caixa registra a refeição e o valor recebido, e o gestor da unidade confere o fechamento de caixa
por turno (seção 17.2).
RF-020 — Refeições previstas versus servidas e sobras (S) Compara, por unidade e refeição, o número estimado do cardápio com o número efetivamente servido e registra a sobra de preparo (quantidade de comida preparada e não servida, em porções ou quilos). Alimenta três pontos do sistema: a sugestão de
refeições estimadas do RF-009 (média móvel das últimas semanas), o indicador de desperdício e o relatório RF-026.
Fora desta versão: agendamento do atendimento social, emissão de cartão do comensal e integração com o CadÚnico.

## 11. Módulo 5 — Relatórios, alertas e indicadores


### 11.1 Requisitos comuns a todos os relatórios

Filtros mínimos: unidade (ou consolidado, para perfis centrais), período e, quando fizer sentido, produto, categoria, fornecedor e lote.
Exportação em PDF para impressão e em CSV para planilha; cabeçalho com nome da unidade, período, usuário e data de emissão.

<!-- Página 42 do PDF original -->

| Valores monetários em reais com duas casas decimais; datas no formato dd/mm/aaaa. Destaques de cor sempre acompanhados de ícone ou texto, para atender a acessibilidade (RNF-009). Resultados respeitam o perfil e as unidades do usuário (RN-012). 11.2 Relatórios |  |  |  |
| --- | --- | --- | --- |
| ID | Relatório | Conteúdo e regras | Prior. |
| RF- 021 | Posição de estoque e estoque mínimo | Saldo atual por produto, lote, local e validade. Produtos com saldo menor ou igual ao estoque mínimo ficam destacados em vermelho, com o ícone de alerta e a coluna Falta para o mínimo (RN-013). | M |
| RF- 022 | Valor imobilizado em estoque | Valor total em reais dos saldos atuais, calculado por lote (saldo × valor unitário, RN-015), com subtotais por categoria e por unidade. | M |
| RF- 023 | Perdas e descartes | Prejuízo por motivo, lote, produto, categoria e período (mensal e anual), com percentual sobre o valor consumido no período e comparação com o período anterior. | M |
| RF- 024 | Rastreabilidade (cardápio × lote × fornecedor) | Dado um prato, refeição, dia e unidade, lista os lotes consumidos, o fornecedor e a nota de entrada; faz também o caminho inverso, partindo de um lote e listando as refeições onde foi usado. Crítico para ocorrência sanitária. | M |
| RF- 025 | Consolidado mensal de consumo | Por produto: saldo inicial, entradas, saídas, perdas, ajustes e saldo final do mês, com valores. Conferência contábil e orçamentária; trava com o fechamento (RN-027). Pode ser exportado em XLSX como matriz produto × mês (um mês por coluna), igual à planilha usada hoje. | M |
|  |  |  |  |
|  |  |  |  |


<!-- Página 43 do PDF original -->

| ID | Relatório |  | Conteúdo e regras |  | Prior. |
| --- | --- | --- | --- | --- | --- |
| RF- 026 | Consumo previsto × realizado |  | Compara a necessidade teórica do RF-010 com a saída aprovada do RF- 013, por produto, e indica as maiores variações; alimenta ajustes nas fichas técnicas. |  | S |
| RF- 027 | Validade e vencimentos |  | Lotes vencidos e a vencer nos próximos N dias (RN-014), com saldo e valor em risco, ordenados por data. |  | M |
| RF- 028 | Painel de indicadores (dashboard) |  | Cartões e gráficos: itens abaixo do mínimo, lotes a vencer, saídas pendentes de aprovação, perdas do mês, valor em estoque, refeições servidas versus previstas (se o módulo 4 estiver ativo). |  | S |
| RF- 029 | Central de alertas e notificações |  | Lista única e priorizada dos alertas: estoque mínimo, validade, saída pendente há mais de 24 h, proteína a descongelar, proteína descongelada perto do limite, divergência de nota e inventário em aberto. Notificação dentro do sistema e por e-mail para os perfis responsáveis (e-mail: C). |  | M |
| RF- 030 | Consulta à trilha de auditoria |  | Pesquisa por usuário, ação, entidade e período, com valores antes e depois (RN-022). Somente administrador, gestor central e auditor. |  | S |
| 11.3 Alertas automáticos |  |  |  |  |  |
| Alerta |  | Gatilho |  | Destinatário |  |
| Estoque no mínimo |  | Saldo menor ou igual ao mínimo da unidade |  | Estoquista e nutricionista |  |
| Lote a vencer |  | Validade em até N dias com saldo |  | Estoquista e gestor da unidade |  |
| Lote vencido com saldo |  | Validade passada e saldo maior que zero |  | Gestor da unidade |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |


<!-- Página 44 do PDF original -->

| Alerta |  | Gatilho |  | Destinatário |  |
| --- | --- | --- | --- | --- | --- |
| Saída pendente |  | Mais de 24 horas sem aprovação |  | Aprovadores |  |
| Descongelar proteína |  | Refeição planejada em 24 a 48 horas com proteína ainda congelada |  | Estoquista e cozinha |  |
| Proteína descongelada |  | Data limite de uso próxima ou vencida |  | Cozinha e gestor da unidade |  |
| Divergência na entrada |  | Soma dos itens diferente do valor da nota |  | Gestor da unidade |  |
| Saldo projetado insuficiente |  | Déficit no RF-010 para cardápio publicado |  | Nutricionista e estoquista |  |
| Enquadramento vencido |  | Validade da categoria tarifária expirada |  | Atendimento social |  |
| Variação de preço |  | Cotação com alta acima do limite sobre a anterior, ou preço pago acima da menor cotação vigente |  | Nutricionista e gestor da unidade |  |
| 12. Requisitos não funcionais Os requisitos abaixo foram escritos de forma mensurável para que possam ser testados. Os números de dimensionamento (usuários, tempos) são propostas iniciais a confirmar com a Secretaria. |  |  |  |  |  |
| ID | Requisito |  | Especificação |  | Prior. |
| RNF- 001 | Plataforma web e responsividade |  | Sistema 100% web, sem instalação. Layout adaptável a desktop e tablet (a partir de 768 px de largura; as telas de saída e de requisição rápida também em celular, a partir de 360 px), com botões e campos próprios para toque na tela do almoxarifado. Navegadores: duas últimas versões estáveis de Chrome, Edge, Firefox e Safari. |  | M |
|  |  |  |  |  |  |
|  |  |  |  |  |  |


<!-- Página 45 do PDF original -->

| ID | Requisito | Especificação | Prior. |
| --- | --- | --- | --- |
| RNF- 002 | Multiunidade | Modelo de dados com identificador de unidade em todas as tabelas de estoque, cardápio e movimentação, isolando Bucarein e Adhemar Garcia. A inclusão de uma nova unidade ocorre por cadastro, sem alteração de código (RF- 006). | M |
| RNF- 003 | Segurança de acesso | Comunicação por HTTPS com TLS 1.2 ou superior; VPN quando houver acesso administrativo remoto; autenticação por usuário e senha com armazenamento em hash forte e salgado (bcrypt ou argon2); perfis e permissões da seção 4; sessão expira por inatividade; proteção contra as vulnerabilidades do OWASP Top 10 (injeção de SQL, XSS, CSRF, controle de acesso quebrado); segundo fator opcional para aprovadores. | M |
| RNF- 004 | Backup e recuperação | Backup completo diário e automático do banco de dados na VPS, com cópia em local externo à VPS; retenção de 30 backups diários e 12 mensais; teste de restauração documentado a cada trimestre; meta de perda máxima de dados (RPO) de 24 horas e de tempo de restauração (RTO) de 4 horas. | M |
| RNF- 005 | Desempenho | Até 20 usuários simultâneos. Telas de cadastro e consulta respondem em até 2 segundos em 95% das requisições; relatórios com até 12 meses de dados em até 10 segundos; cálculo da previsão de insumos de um mês em até 5 segundos. | S |
| RNF- 006 | Disponibilidade | 99% de disponibilidade mensal entre 6h e 20h, horário de operação das unidades; manutenções programadas fora desse horário e avisadas com antecedência. | S |
|  |  |  |  |
|  |  |  |  |


<!-- Página 46 do PDF original -->
ID Requisito Especificação Prior.
RNF- Proteção de dados (LGPD) Conformidade com a Lei 13.709/2018:
M 007 coleta mínima; finalidade e base legal documentadas (provavelmente execução de políticas públicas, art. 7º, III, e art. 11, II, b, a confirmar com o encarregado de dados do município); acesso aos dados de comensais restrito ao atendimento social e à gestão; mascaramento de
documentos nas telas e relatórios;
anonimização de dados em relatórios estatísticos; política de retenção e eliminação; atendimento a pedidos de titulares.
RNF- Auditoria Trilha de auditoria imutável das ações da M 008
RN-022, retida por no mínimo 5 anos;
consulta restrita (RF-030).
RNF- Acessibilidade e usabilidade Conformidade com WCAG 2.1 nível AA:
M 009 contraste mínimo, navegação por teclado, rótulos de campos, texto alternativo, nenhuma informação transmitida apenas por cor. Linguagem simples em português do Brasil, mensagens de erro que dizem como corrigir, e fluxos frequentes (saída diária, entrada) concluídos em poucos
passos, com padrões de preenchimento automático.
RNF- Integridade dos dados Operações de estoque em transação M 010 única (tudo ou nada); chaves estrangeiras e restrições no banco;
controle de concorrência para impedir que dois usuários baixem o mesmo saldo;
todo saldo recalculável a partir das movimentações.

<!-- Página 47 do PDF original -->

| ID | Requisito | Especificação | Prior. |
| --- | --- | --- | --- |
| RNF- 011 | Manutenibilidade | Arquitetura em camadas com separação entre apresentação, regras de negócio e acesso a dados; código versionado em repositório; migrações de banco versionadas; testes automatizados cobrindo no mínimo 70% das regras de negócio da seção 6; documentação das APIs. | S |
| RNF- 012 | Tolerância a falhas de rede | Rascunho de formulários longos (entrada, saída, inventário) preservado no navegador em caso de queda de conexão, com aviso claro; reenvio manual quando a rede voltar. | C |
| RNF- 013 | Monitoramento e registro técnico | Logs de aplicação e erros centralizados, sem dados pessoais; alerta ao administrador em caso de falha de backup ou indisponibilidade. | S |
| RNF- 014 | Interoperabilidade e planilhas | Importação e exportação em XLSX e CSV, com modelos compatíveis com as planilhas atuais do restaurante; exportação em PDF; API REST documentada para futuras integrações com sistemas da Secretaria. | S |
| RNF- 015 | Localização | Interface em português do Brasil; fuso horário America/Sao Paulo; formatos de _ data, número e moeda do Brasil. | M |
| 13. Modelo de dados conceitual O modelo abaixo orienta a modelagem lógica do banco; nomes de tabelas e tipos podem ser ajustados pela equipe. A decisão central é registrar toda movimentação em um livro único (movimento estoque), do qual saldos, kardex e relatórios são derivados e _ conferíveis (RNF-010). |  |  |  |


<!-- Página 48 do PDF original -->

|  |  |  |
| --- | --- | --- |
| Entidade | Papel | Relacionamentos principais |
| unidade restaurante _ | Cada restaurante | 1:N com refeicao habilitada, _ camara, cardapio, entrada, saida, perda, inventario |
| refeicao habilitada _ | Refeição, horário e dias de cada unidade | N:1 com unidade restaurante _ |
| usuario, perfil, usuario unidade _ | Acesso e permissões | N:N usuário e unidade; N:1 usuário e perfil |
| unidade medida _ | Unidades e conversões | 1:N com produto |
| categoria | Agrupamento de produtos | 1:N com produto |
| produto | Insumo ou material | N:1 com unidade medida e _ categoria; 1:N com produto unidade, lote e _ prato item _ |
| produto unidade _ | Estoque mínimo e máximo por unidade | N:1 com produto e unidade restaurante _ |
| fornecedor | Quem fornece | 1:N com entrada |
| camara | Local de armazenamento | N:1 com unidade restaurante; _ usada em saldo lote local _ _ |
| prato, prato versao, _ prato item _ | Ficha técnica versionada | prato 1:N versões; versão 1:N itens; item N:1 produto, com marcação custo indireto; _ kcal porcao na versão _ |
| cardapio, cardapio dia, _ cardapio refeicao _ | Planejamento | cardápio 1:N dias; dia 1:N refeições; refeição N:N com prato versao, com _ grupo opcao e _ percentual escolha _ |
| entrada, entrada item _ | Recebimento | entrada N:1 fornecedor; item N:1 produto; item 1:1 lote |
| lote | Lote de um produto | N:1 produto; 1:N saldo lote local e _ _ movimento estoque _ |
|  |  |  |
|  |  |  |


<!-- Página 49 do PDF original -->

| Entidade | Papel | Relacionamentos principais |
| --- | --- | --- |
| saldo lote local _ _ | Saldo de cada lote em cada local | N:1 lote; N:1 camara |
| saida, saida item _ | Consumo diário | saída N:1 cardapio refeicao; _ item N:1 lote |
| transferencia | Mudança entre câmaras | N:1 lote; origem e destino em camara |
| motivo perda, perda _ | Perdas e descartes | perda N:1 lote e motivo perda _ |
| inventario, inventario item _ | Contagem física e ajustes | item N:1 lote |
| movimento estoque _ | Livro único de movimentações | N:1 lote; referência à origem (entrada, saída, perda, ajuste, transferência, estorno) |
| comensal, tabela valor, _ refeicao servida _ | Atendimento (módulo 4) | refeição servida N:1 comensal (opcional), unidade e tabela valor _ |
| fechamento periodo _ | Controle de períodos fechados | N:1 unidade restaurante _ |
| auditoria | Trilha de ações | N:1 usuário; referência genérica à entidade alterada |
| cotacao | Preço ofertado por um fornecedor em um mês | N:1 produto e fornecedor; base do comparativo de preços e da menor cotação vigente |
| importacao, importacao linha _ | Registro das cargas de planilha | N:1 usuário; importação 1:N linhas, cada uma com status e erro |
| Todas as tabelas de negócio carregam status, criado em, criado por, alterado em e _ _ _ alterado por. Tabelas de movimento nunca sofrem exclusão física (RN-010). _ 14. Critérios de aceitação Os cenários abaixo seguem o formato Dado, Quando, Então e cobrem os requisitos críticos. Eles são a base dos testes de aceitação com a nutricionista e o gestor. |  |  |


<!-- Página 50 do PDF original -->

|  |  |  |
| --- | --- | --- |
| ID | Requisitos e regras | Cenário |
| CA- 001 | RF-001 a RF-008, RN-001, RN-002 | Dado um produto com uma entrada registrada, quando o usuário tenta excluí-lo, então o sistema bloqueia a exclusão, explica o motivo e oferece a inativação; o produto inativo não aparece ao criar nova entrada, mas aparece no histórico. |
| CA- 002 | RF-005, RN-017 | Dado o prato Estrogonofe com rendimento de 100 porções e 10 kg de peito de frango, quando o usuário consulta a ficha, então o sistema mostra 0,1 kg por porção. Quando altera a quantidade e salva, então é criada a versão 2 e os cardápios já publicados continuam com a versão 1. |
| CA- 003 | RF-009, RN-016 | Dado o planejamento do Restaurante Popular 2 (Adhemar Garcia), quando a nutricionista tenta adicionar jantar ou um sábado, então o sistema não oferece essas opções. No Restaurante Popular 1 (Bucarein), as três refeições estão disponíveis todos os dias. |
| CA- 004 | RF-010 | Dado um almoço publicado com 250 refeições estimadas e o Estrogonofe (100 porções, 10 kg de frango, FC 1,00, margem 5%), quando o usuário abre a previsão, então a necessidade de frango é 26,25 kg (10 ÷ 100 × 250 × 1,05). |
| CA- 005 | RF-012, RN-005, RN-025, RN-026 | Dado uma entrada com 20 kg de arroz e validade informada, quando o estoquista confirma, então é criado um lote, o saldo da unidade sobe 20 kg e a entrada não pode mais ser editada. Uma segunda entrada com o mesmo fornecedor e o mesmo número de nota é rejeitada. Item perecível sem validade é rejeitado. |
|  |  |  |
|  |  |  |


<!-- Página 51 do PDF original -->

| ID | Requisitos e regras | Cenário |
| --- | --- | --- |
| CA- 006 | RF-013, RN-006, RN-008, RN-009, RN-011 | Dado dois lotes do mesmo produto com validades diferentes, quando o estoquista cria a saída, então o sistema sugere o lote que vence primeiro. A saída fica Pendente e o saldo não muda. Quando o próprio solicitante tenta aprovar, então a ação é negada. Quando a nutricionista aprova, então o saldo do lote é reduzido. Saída maior que o saldo é rejeitada. |
| CA- 007 | RF-015, RN-015, RN-020 | Dado um lote com valor unitário de R$ 8,00 e 5 kg perdidos por queda de energia, quando a perda é aprovada, então o saldo do lote cai 5 kg e o prejuízo registrado é R$ 40,00, que aparece no RF-023 no motivo informado. |
| CA- 008 | RF-014, RN-021 | Dado a refeição de quinta-feira com frango congelado, quando é quarta-feira, então a tela A descongelar hoje lista o frango. A transferência para a câmara resfriada move o saldo entre as câmaras sem alterar o total do lote. Uma transferência fora da janela de 24 a 48 horas pede justificativa. |
| CA- 009 | RF-016 | Dado um inventário com contagem de 18 kg para um saldo de sistema de 20 kg, quando o gestor aprova, então é gerado um ajuste de saída de 2 kg com motivo Inventário e a divergência de 10% aparece no relatório. |
| CA- 010 | RF-024 | Dado uma refeição servida há 30 dias, quando o gestor consulta a rastreabilidade, então vê os lotes, o fornecedor e a nota de cada insumo em menos de 2 minutos; partindo de um lote, vê todas as refeições em que ele foi usado. |
| CA-011 | RN-004, RN-012 | Dado um estoquista vinculado apenas a Adhemar Garcia, quando ele consulta o estoque ou tenta lançar movimentação em Bucarein, então o sistema não mostra os dados nem permite o lançamento. |
|  |  |  |
|  |  |  |


<!-- Página 52 do PDF original -->
ID Requisitos e regras Cenário CA-
RF-021, RF-029, RN-013, RN-014 Dado um produto com estoque mínimo de 10 012 kg, quando o saldo chega a 10 kg, então o produto aparece em vermelho com ícone no
RF-021 e um alerta é enviado ao estoquista.
Um lote que vence em até 7 dias também gera alerta.
CA-
RNF-004 Dado o sistema em produção, quando passa 013 a meia-noite, então o backup diário é gerado e copiado para fora da VPS; o administrador é avisado em caso de falha; a restauração em ambiente de teste é feita em até 4 horas.
CA-
RN-010, RN-022, RNF-008 Dado qualquer movimentação aprovada, 014 quando alguém tenta alterá-la ou excluí-la, então o sistema só permite estorno com motivo e nova aprovação; a trilha mostra usuário, data, hora e valores antes e depois.
CA-
RF-018, RF-019, RN-023 Dado uma pessoa sem documento, quando 015 o atendimento social a cadastra com nome social e categoria Gratuito, então o cadastro é aceito e o registro de refeição calcula valor devido zero; o perfil de estoque não consegue ver esses dados.
CA-
RF-031, RN-029, RN-030 Dado o cardápio de segunda-feira com 2 016 pães (R$ 0,99), manteiga de 10 g (R$ 0,29), omelete de 25 g (R$ 0,64), maçã (R$ 0,36) e café com leite (R$ 0,45), e custos indiretos de R$ 0,041 na manteiga e R$ 0,24 na bebida, quando o usuário abre o custo da refeição,
então o sistema mostra custo direto de R$ 2,73, custo indireto de R$ 0,28 e total de R$ 3,01. Sem percentual de escolha informado para café preto ou café com leite, o cálculo usa o café com leite, a alternativa mais cara.

<!-- Página 53 do PDF original -->

| ID | Requisitos e regras | Cenário |
| --- | --- | --- |
| CA- 017 | RF-033, RN-028 | Dado que a lentilha de um fornecedor foi cotada a R$ 9,10 por 400 g em maio e a R$ 20,50 por 1 kg em junho, quando o usuário compara os meses, então o sistema mostra R$ 22,75 por kg em maio e R$ 20,50 por kg em junho, uma queda de cerca de 10%, e não uma alta de 125%. |
| CA- 018 | RF-034 | Dado a compra de 1.910 kg de arroz a R$ 2,61 por kg (exemplo numérico) e a menor cotação válida do mês de R$ 2,16 por kg, quando se gera o comparativo, então a economia potencial do arroz é R$ 859,50. Um produto sem cotação no mês aparece como sem cotação e fica fora do total. |
| CA- 019 | RF-036, RN-003 | Dado uma planilha com o mesmo produto em duas linhas e uma linha com quantidades sem nome de produto, quando o usuário importa, então a pré-visualização aponta as duas inconsistências, nenhuma linha é gravada antes da correção ou aprovação, e a importação fica registrada com usuário, data e linhas aceitas e rejeitadas. |
| CA- 020 | RF-012, RF-035 | Dado a menor cotação vigente de feijão preto de R$ 5,29 por kg e o limite de 10%, quando o estoquista lança uma entrada a R$ 5,99 por kg (13% acima), então o sistema pede justificativa antes de confirmar e o valor entra no comparativo de preços. |
| CA- 021 | RN-033, RF-016 | Dado o inventário semanal com 38 kg de arroz contados e saldo de 40 kg no sistema, quando o gestor aprova a divergência, então o sistema gera um ajuste de saída de 2 kg com motivo Inventário e a próxima sugestão de compra parte de 38 kg. |
| CA- 022 | RN-020, RF-015 | Dado o limite de perda do RP1 igual a zero, quando o estoquista registra a perda de 1 kg de qualquer produto, então a perda fica Pendente e só baixa o saldo depois da aprovação da nutricionista. |
|  |  |  |
|  |  |  |


<!-- Página 54 do PDF original -->

| ID | Requisitos e regras |  | Cenário |  |
| --- | --- | --- | --- | --- |
| CA- 023 | RN-009, RN-011, RF-013 |  | Dado o RP1 em modo de conferência posterior, quando o estoquista registra a saída de 30 kg de arroz, então o saldo baixa na hora, a saída fica Registrada e só a nutricionista ou o gestor pode marcá-la como Conferida ou Contestada; o estoquista não vê essa ação. |  |
| CA- 024 | RN-034, RF-013 |  | Dado que o estoquista não está presente, quando um usuário da Cozinha registra a requisição rápida de 5 kg de frango, então o saldo baixa, o lote segue o PVPS e a retirada aparece na conferência do dia com o nome de quem retirou. |  |
| CA- 025 | RN-036, RF-037 |  | Dado uma amostra do almoço coletada às 12h de segunda-feira com prazo padrão de 72 horas, quando chegam as 12h de quinta- feira, então o sistema alerta o descarte e, ao descartar, registra quem o fez e quando. |  |
| CA- 026 | RN-037, RF-012 |  | Dado uma entrada de abóbora com origem Doação PAA e sem nota fiscal, quando o estoquista informa o documento de recebimento do doador e confirma, então o sistema aceita a entrada e não a inclui no comparativo de preços. |  |
| 15. Priorização e proposta de entregas 15.1 Priorização MoSCoW Prioridade Requisitos funcionais M — Deve RF-001 a RF-006, RF-008, RF-009, RF-010, RF-012 a RF-015, RF-017, RF-021 a RF-025, RF-027, RF-029 S — Deveria RF-007, RF-011, RF-016, RF-018 a RF-020, RF-026, RF-028, RF-030, RF-031 a RF-034, RF-036 |  |  |  |  |
|  |  |  |  |  |


| Prioridade | Requisitos funcionais |
| --- | --- |
| M — Deve | RF-001 a RF-006, RF-008, RF-009, RF-010, RF-012 a RF-015, RF-017, RF-021 a RF-025, RF-027, RF-029 |
| S — Deveria | RF-007, RF-011, RF-016, RF-018 a RF-020, RF-026, RF-028, RF-030, RF-031 a RF-034, RF-036 |


<!-- Página 55 do PDF original -->

| Prioridade | Requisitos funcionais |
| --- | --- |
| C — Poderia | Alerta de variação de preço (RF-035), autenticação em dois fatores, alerta por e-mail, cardápio-modelo, alerta de repetição de proteína, alerta de alérgenos, rascunho offline (RNF-012) |
| W — Não nesta versão | Veja a seção 15.3 |


### 15.2 Entregas incrementais sugeridas

A divisão abaixo permite colocar o sistema em uso cedo e validar com a equipe a cada etapa. A ordem pode ser ajustada à prioridade da Secretaria e ao calendário da disciplina.

| Entrega | Conteúdo | Valor para o restaurante | Saída (critérios) |
| --- | --- | --- | --- |
| 1 — Fundação e estoque | Cadastros e carga inicial por planilha (RF- 001 a RF-008, RF-036), entrada, saída com aprovação, perdas e consulta de saldo (RF- 012, RF-013, RF-015, RF-017), posição de estoque, valor imobilizado e vencimentos (RF-021, RF-022, RF-027), alertas básicos (RF- 029), segurança, auditoria e backup | Saldo confiável por lote e validade; fim do controle em papel e planilha | CA-001, CA-005, CA-006, CA-007, CA-011, CA-012, CA- 013, CA-014, CA-019 |
|  |  |  |  |
|  |  |  | Page 55 of 71 |


<!-- Página 56 do PDF original -->
Entrega Conteúdo Valor para o Saída (critérios) restaurante 2 — Planejamento Fichas técnicas Compra baseada em
CA-002, CA-003, e rastreabilidade versionadas, cardápio; rastreio
CA-004, CA-008, planejamento de de lotes;
CA-009, CA-010, cardápio e previsão de fechamento mensal
CA-016 insumos (RF-009, RF- 010), custo da refeição e valor nutricional (RF- 031, RF-032), transferência de proteínas (RF-014), rastreabilidade, perdas consolidadas e consolidado mensal (RF-023 a RF-025), inventário (RF-016) 3 — Gestão e Lista de compras
Indicadores para a
CA-015, CA-017, CA- atendimento sugerida (RF-011), Secretaria;
018, CA-020 e cotação, comparativo prestação de contas revisão dos de preços e economia do subsídio indicadores da potencial (RF-033 a seção 3.4
RF-035), previsto versus realizado (RF- 026), painel e auditoria (RF-028, RF-030), módulo de atendimento e comensais (RF-018 a
RF-020)

### 15.3 Sugestões para versões futuras (fora do escopo atual)

Entrada por doação: tipo de entrada sem fornecedor comercial e com valor zero ou estimado, comum em equipamentos públicos de alimentação.
Transferência entre as duas unidades: movimentação entre Bucarein e Adhemar Garcia com saída e entrada ligadas.
Importação do XML da NF-e e leitura de código de barras ou QR Code para agilizar o recebimento e a saída.
Etiqueta de lote impressa com código, validade e data de abertura ou descongelamento.

<!-- Página 57 do PDF original -->
Análise nutricional automática dos cardápios (calorias, macronutrientes, per capita), apoiada em tabelas oficiais de composição de alimentos; o valor nutricional informado pela nutricionista já está no escopo (RF-032).
Módulo de compras com requisição, pedido e acompanhamento da entrega (a cotação de preços já está no escopo, RF-033 a RF-035).
Monitoramento de temperatura das câmaras com sensores e alerta automático.
Pesquisa de satisfação dos comensais e registro de sugestões.
Previsão de demanda com base no histórico de refeições servidas, no dia da semana e em feriados.
Integração com o CadÚnico e sistemas socioassistenciais, mediante autorização formal da Secretaria.

### 15.4 Implantação e parâmetros iniciais

A implantação recomendada começa pelo RP1, que já validou as regras de estoque, e só depois segue para o RP2, que adota os mesmos parâmetros até a equipe ajustá-los.
Recomenda-se duas semanas de uso em paralelo com as planilhas atuais antes de abandoná-las. A carga inicial tem cinco partes:
1. Produtos: os cerca de 55 itens da planilha Lista de Insumos, com a unidade-base confirmada na importação (RF-036).
2. Fornecedores: os seis da planilha (SOS, Segalas, Taff, Imperatriz, HQ10 e Frangos Canção) e os da agricultura familiar que a nutricionista cadastrar.
3. Fichas técnicas e cardápios: preenchidos pela nutricionista em modelo de planilha (prato, ingrediente, quantidade bruta e rendimento).
4. Saldo inicial: inventário de abertura feito pelo estoquista no dia anterior ao início.
5. Usuários: estoquista e nutricionista do RP1, além do gestor da unidade e da Cozinha.
Parâmetros com os valores iniciais adotados (todos editáveis pelo perfil indicado na seção 4):
Parâmetro Valor inicial Referência Margem de segurança da previsão 5%
RF-010 Fator de correção 1,00
RF-010 Modo de aprovação da saída de consumo Posterior
RN-011 Limite de perda sem aprovação Zero (toda perda)
RN-020 Divergência da saída contra o previsto 10%
RF-013

<!-- Página 58 do PDF original -->

| Parâmetro |  | Valor inicial |  | Referência |  |
| --- | --- | --- | --- | --- | --- |
| Divergência de preço na entrada |  | 10% |  | RF-012, CA- 020 |  |
| Alerta de validade |  | 7 dias |  | RN-014 |  |
| Periodicidade do inventário |  | Semanal |  | RN-033 |  |
| Prazo de descarte de amostra |  | 72 horas |  | RN-036 |  |
| Retenção da trilha de auditoria |  | 5 anos |  | RNF-008 |  |
| Preço de referência |  | Menor cotação vigente |  | RN-031 |  |
| Tetos ao público geral |  | Café R$ 5, almoço R$ 12, jantar R$ 10 |  | RF-019 |  |
| Limite de marmitas por pessoa |  | Sem limite |  | RF-019 |  |
| Limite de compra sem aprovação do gestor central |  | Desligado |  | RF-033 |  |
| 16. Melhorias aplicadas ao levantamento original O levantamento inicial já cobria bem o núcleo de estoque e cardápio. A análise encontrou lacunas e ambiguidades que gerariam retrabalho no desenvolvimento; elas foram corrigidas conforme a tabela 16.1, a tabela 16.2 mostra como a numeração antiga corresponde à nova e a tabela 16.3 reúne o que mudou na versão 1.1 depois da análise dos documentos do restaurante. 16.1 Lacunas e correções |  |  |  |  |  |
| Tema | Situação no levantamento |  | Melhoria aplicada |  | Onde |
| Fornecedor | A entrada usava id fornecedor, mas _ não havia cadastro |  | Novo cadastro de fornecedores com CNPJ validado |  | RF-004 |
|  |  |  |  |  |  |
|  |  |  |  |  |  |


<!-- Página 59 do PDF original -->

| Tema | Situação no levantamento | Melhoria aplicada | Onde |
| --- | --- | --- | --- |
| Ficha técnica | O campo quantidade por porcao ou receita _ _ _ _ admitia dois sentidos | Passa a guardar a quantidade da receita inteira, com rendimento, versão e cálculo da porção e do custo | RF-005, RN- 017 |
| Estoque mínimo | Um único valor por produto, apesar de duas unidades com realidades diferentes | Mínimo, máximo e ponto de reposição por produto e por unidade | RF-003, RN- 013 |
| Unidades do restaurante | Citadas como chave estrangeira, sem cadastro nem regras de funcionamento | Cadastro com refeições, horários, dias e feriados parametrizáveis | RF-006, RN- 016 |
| Estrutura do cardápio | Um único nível com data e unidade | Cardápio, dia e refeição, com versão, estados e publicação | RF-009, RN- 024 |
| Origem do número de refeições | A previsão dependia de um número "estimado" sem definir a fonte | Informado pela nutricionista, com sugestão pela média histórica quando houver dado | RF-009, RF- 020 |
| Fórmula de previsão | Descrita em texto, sem fórmula | Fórmula explícita com rendimento, fator de correção e margem de segurança | RF-010 |
|  |  |  |  |
|  |  |  |  |


<!-- Página 60 do PDF original -->

| Tema | Situação no levantamento | Melhoria aplicada | Onde |
| --- | --- | --- | --- |
| Saída diária | Campos por linha, sem cabeçalho nem estado de rejeição | Cabeçalho e itens, estados Pendente, Aprovada e Rejeitada, tipos de saída e justificativa de divergência | RF-013, RN- 011 |
| Ordem de consumo | Nada definia qual lote sai primeiro | FEFO e bloqueio de lote vencido | RN-006, RN-007 |
| Estoque negativo | Não tratado | Proibido, com controle de concorrência | RN-008, RNF-010 |
| Local de armazenamento | A transferência entre câmaras não tinha cadastro nem saldo por local | Cadastro de câmaras e saldo por lote e local | RF-007, RF- 014 |
| Perdas | Sem aprovação nem anexo | Aprovação por limite, foto e perda em lote de itens | RF-015, RN- 020 |
| Reconciliação | Sem inventário, ajuste ou estorno | Inventário, ajustes aprovados e estorno com motivo | RF-016, RN- 010 |
| Controle de acesso | Citado apenas como "perfis de utilizador" | Perfis, matriz de permissões, segregação de funções e vínculo por unidade | Seção 4, RF- 008, RN- 009, RN-012 |
| Auditoria | Não previsto | Trilha imutável e relatório de consulta | RN-022, RF- 030, RNF- 008 |
| Proteção de dados | Não previsto | Requisito de LGPD, minimização e acesso restrito | RN-023, RNF-007 |
|  |  |  |  |
|  |  |  |  |


<!-- Página 61 do PDF original -->

| Tema | Situação no levantamento |  | Melhoria aplicada |  | Onde |
| --- | --- | --- | --- | --- | --- |
| Alertas | Apenas o alerta de estoque mínimo |  | Central de alertas com nove gatilhos |  | RF-029, seção 11.3 |
| Fechamento | Relatório mensal sem fechamento do período |  | Fechamento mensal com reabertura controlada |  | RN-027, RF- 025 |
| Atendimento e subsídio | O público atendido e a tarifa não eram registrados |  | Módulo proposto de comensais, tabela de valores e refeições servidas |  | RF-018 a RF- 020 |
| Requisitos não funcionais | Quatro itens sem métricas |  | Quinze itens com valores mensuráveis |  | Seção 12 |
| Redação | "Bucaren", "utilizador", "respetivas" e referência a um "levantamento inicial" externo |  | Nome correto Bucarein e português do Brasil; documento autocontido |  | Todo o documento |
| 16.2 Correspondência de numeração |  |  |  |  |  |
| Levantamento original |  | Neste documento |  | Observação |  |
| RNG-001, RNG-002, RNG-003 |  | RN-001, RN-002 e seção 7.1 |  | Regras de cadastro mantidas e detalhadas |  |
| RF-001 Unidades de medida |  | RF-001 |  | Acrescidos sigla, grandeza e conversão |  |
| RF-002 Categorias |  | RF-002 |  | Acrescidos tipo de item e armazenamento |  |
| RF-003 Produtos |  | RF-003 |  | Acrescidos perecível, fator de correção, alérgenos e mínimo por unidade |  |
| RF-004 Pratos |  | RF-005 |  | Reorganizado com versão e rendimento |  |
|  |  |  |  |  |  |


<!-- Página 62 do PDF original -->

| Levantamento original |  | Neste documento |  | Observação |  |
| --- | --- | --- | --- | --- | --- |
| RF-005 Cardápio |  | RF-009 |  | Três níveis, estados e validações |  |
| RF-006 Explosão de insumos |  | RF-010 |  | Com fórmula e saldo projetado |  |
| RF-007 Entrada de materiais |  | RF-012 |  | Com conformidade e local de armazenamento |  |
| RF-008 Saída diária |  | RF-013 |  | Com cabeçalho, estados e FEFO |  |
| RF-009 Transferência de proteínas |  | RF-014 |  | Com janela e data limite de uso |  |
| RF-010 Perdas |  | RF-015 |  | Com aprovação e perda em lote de itens |  |
| RF-011 Posição e estoque mínimo |  | RF-021 |  |  |  |
| RF-012 Valor imobilizado |  | RF-022 |  |  |  |
| RF-013 Perdas e descartes |  | RF-023 |  |  |  |
| RF-014 Rastreabilidade |  | RF-024 |  | Com consulta em ambos os sentidos |  |
| RF-015 Consumo mensal |  | RF-025 |  | Com saldo inicial e fechamento |  |
| RNF-001 a RNF-004 |  | RNF-001 a RNF-004 |  | Mantidos, com métricas; RNF- 005 a RNF-015 são novos |  |
| (novos) |  | RF-004, RF-006, RF-007, RF- 008, RF-011, RF-016 a RF-020, RF-026 a RF-030, RF-031 a RF-036 |  |  |  |
| 16.3 Melhorias decorrentes dos documentos do restaurante (versão 1.1) |  |  |  |  |  |
| Tema | O que os documentos mostram |  | O que mudou |  | Onde |
| Consumo mensal | Abas RP1 e RP2, de janeiro a maio |  | Relatório em matriz produto × mês e importação do histórico |  | RF-025, RF- 036 |
|  |  |  |  |  |  |
|  |  |  |  |  | Page 62 of 71 |


<!-- Página 63 do PDF original -->

| Tema | O que os documentos mostram |  |  | O que mudou |  | Onde |
| --- | --- | --- | --- | --- | --- | --- |
| Compra e economia | Abas de preços e campos "Valor gasto a mais" |  |  | Cotações, comparativo e economia potencial |  | RF-033 a RF- 035, RN-028, RN-032 |
| Custo da refeição | Totais por dia no cardápio de julho |  |  | Custo direto e indireto por prato, refeição e dia |  | RF-031, RN- 029, RN-031 |
| Valor nutricional | Quilocalorias por dia |  |  | kcal por prato e soma por refeição |  | RF-032 |
| Opção de bebida | "Café preto ou café com leite" |  |  | Grupo de opção com percentual de escolha |  | RF-009, RN- 030 |
| Café da manhã | Panificação, proteína, bebida e fruta |  |  | Tipos de prato e validação de composição |  | RF-005, RF- 009 |
| Descartáveis e marmitas | Marmitas EPS, copos e sacolas na lista de preços |  |  | Categoria de descartável, custo indireto e modalidade marmita |  | RF-002, RF- 005, RF-019 |
| Apresentações e marcas | Colunas de descrição e de quantidade unitária |  |  | Produto com apresentação e quantidade |  | RF-003 |
| Fornecedores | Seis fornecedores nas abas de preço |  |  | Carga inicial sugerida |  | RF-004 |
| Qualidade dos dados | Descrições trocadas, linhas sem nome, unidades implícitas |  |  | Importação com validação e pré- visualização |  | RF-036, RN- 003 |
| 17. Riscos e pontos em aberto 17.1 Riscos |  |  |  |  |  |  |
| Risco |  | Prob. | Impacto |  | Mitigação |  |
| Baixa adesão da equipe, com lançamentos feitos no papel e digitados depois |  | Média | Alto |  | Telas curtas para tablet, treinamento prático, acompanhamento nas primeiras semanas e entrega incremental |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |


<!-- Página 64 do PDF original -->

| Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- |
| Dados mestres incompletos (fichas técnicas, saldo inicial) atrasam a entrada em operação | Alta | Alto | Planejar carga inicial e inventário de abertura antes da entrega 1; começar pelos 30 a 50 produtos mais usados |
| Rotina de aprovação vira gargalo e as saídas ficam pendentes | Média | Médio | Alerta de 24 horas, aprovação pelo tablet e possibilidade de aprovador substituto |
| Internet instável no almoxarifado | Média | Médio | Rascunho local (RNF-012) e telas leves |
| Tratamento inadequado de dados de pessoas em vulnerabilidade | Baixa | Muito alto | RNF-007, RN-023, acesso mínimo, parecer do encarregado de dados |
| Regras de funcionamento e valores mudam por decreto | Média | Médio | Parâmetros configuráveis (RF-006, RF-019) em vez de regras fixas no código |
| Escopo maior que o prazo da disciplina | Alta | Alto | Priorização MoSCoW e entregas incrementais (seção 15) |
| Perda de dados por falha da VPS | Baixa | Muito alto | RNF-004 com cópia externa e teste de restauração |
| Dados históricos inconsistentes nas planilhas (descrições trocadas, unidades implícitas) contaminam a carga inicial | Alta | Médio | Importação com pré-visualização e validação (RF-036), revisão pela nutricionista e carga dos produtos principais primeiro |
| Comparativo de preços vira o único critério de compra e ignora prazo, qualidade e pedido mínimo | Média | Médio | Economia apresentada como potencial, com as observações da cotação (RF-033, RF-034) |
| Estoquista único concentra o registro e a autorização das saídas, e as retiradas sem anotação geram saldo falso | Alta | Alto | Conferência posterior (RN-011), requisição rápida da cozinha (RN- 034), inventário semanal (RN-033) e indicador de divergência |
| Premissas adotadas sem resposta do cliente (itens marcados na seção 17.2) não refletem a rotina real | Média | Médio | Todas são parâmetros ou cadastros (seção 15.4); validação no piloto do RP1 antes de replicar no RP2 |
|  |  |  |  |


<!-- Página 65 do PDF original -->

| 17.2 Respostas do cliente e decisões adotadas O cliente não responderá às perguntas restantes. Para fechar a versão destinada ao desenvolvimento, cada ponto sem resposta recebeu a prática recomendada e está marcado como Premissa. Todas as premissas são parâmetros, cadastros ou regras de configuração, e podem ser trocadas depois sem mudar o desenho do sistema. Os valores iniciais estão na seção 15.4 e a validação ocorre no piloto do RP1. |  |  |  |  |
| --- | --- | --- | --- | --- |
| N.º | Pergunta | Resposta do RP1 (27/10/2026) | Decisão adotada | Situação |
| 1 | A quantidade da ficha técnica é bruta ou líquida? | Bruta, antes de limpar. | Quantidade bruta; fator de correção padrão 1,00 (RF-005, RF-010). | Confirmada |
| 2 | Qual margem de segurança padrão na previsão de insumos? | Existe margem, sem percentual. | Padrão de 5%, ajustável pela nutricionista por categoria de alimento (RF-010). | Premissa |
| 3 | Quem pode aprovar saídas e há aprovador substituto? | O estoquista conta, anota e autoriza as saídas. | O estoquista registra; a nutricionista (há 3 no RP1) ou o gestor da unidade confere, e um substitui o outro (RN-009, RN-011). | Premissa |
| 4 | Qual o limite de perda que exige aprovação? | Qualquer quantidade, pela nutricionista. | Limite zero (RN-020, RF-015). | Confirmada |
| 5 | A nota fiscal é sempre obrigatória? Como tratar doações? | Toda compra tem nota; há doações do PAA. | Compra exige nota; doação é aceita com documento de recebimento e valor opcional (RN-037, RF- 012). | Confirmada e premissa |
|  |  |  |  |  |
|  |  |  |  | Page 65 of 71 |


<!-- Página 66 do PDF original -->

| N.º | Pergunta | Resposta do RP1 (27/10/2026) | Decisão adotada | Situação |
| --- | --- | --- | --- | --- |
| 6 | Quem cobra e como é a prestação de contas da arrecadação? | Cobrança em dinheiro; isentos não pagam. | O sistema não processa pagamento: o caixa registra a refeição e o valor recebido, e o gestor confere o fechamento de caixa por turno. O repasse do dinheiro fica fora do sistema (RF-019). | Premissa |
| 7 | Quais dados dos comensais podem ser registrados e qual a base legal? | Os dados vêm do CRAS e ficam com a assistente social. | O sistema guarda só o perfil de atendimento e um código interno. Base legal prevista: art. 7º, III, da LGPD (política pública), a confirmar com o encarregado de dados do município antes da produção (RF-018, RNF-007). | Premissa |
| 8 | Quais as faixas de renda e valores de subsídio por categoria? | Existem os perfis 1, 2 e 3; valores não informados. | Valores parametrizáveis por perfil e refeição, com bloqueio acima do teto ao público geral (café R$ 5, almoço R$ 12, jantar R$ 10). O gestor central cadastra os valores antes do uso (RF- 019). | Premissa |
| 9 | Material de limpeza e descartáveis ficam no estoque dos alimentos? | Sem resposta. | Mesmo sistema, mas em categorias e locais separados dos alimentos, com relatórios próprios (RF-002, RF-013). | Premissa |
|  |  |  |  |  |
|  |  |  |  | Page 66 of 71 |


<!-- Página 67 do PDF original -->

| N.º | Pergunta | Resposta do RP1 (27/10/2026) | Decisão adotada | Situação |
| --- | --- | --- | --- | --- |
| 10 | Qual a periodicidade do inventário? | Semanal; a diferença é abatida da compra seguinte. | Semanal (RN-033, RF- 016). | Confirmada |
| 11 | Há exigência de retenção de dados por órgão de controle? | Vigilância Sanitária visita; amostras ficam 72 horas. | Registros de movimentação e auditoria retidos por 5 anos, ajustável pelo jurídico (RNF-008); amostras conforme RN-036 e RF-037. | Premissa |
| 12 | Quantos usuários, dispositivos e que internet há em cada unidade? | RP1: dois usuários e Wi-Fi próprio. | Dimensionar para 20 usuários simultâneos (RNF-005); telas para computador, tablet e celular (RNF-001); sem modo offline na versão 1, apenas rascunho local (RNF- 012). | Premissa |
| 13 | O cardápio segue ciclo fixo? | Não: montado todo mês e diferente em cada unidade. | Copiar cardápio de mês anterior (RF- 009). | Confirmada |
|  |  |  |  |  |
|  |  |  |  | Page 67 of 71 |


<!-- Página 68 do PDF original -->

| N.º | Pergunta | Resposta do RP1 (27/10/2026) | Decisão adotada | Situação |
| --- | --- | --- | --- | --- |
| 14 | As quantidades das abas RP1 e RP2 estão em kg ou em embalagens? | Sem resposta. | A importação pede confirmação da unidade de cada produto e rejeita linhas sem confirmação. Verificação pelos dados: 1.910 kg de arroz em maio dão cerca de 80 a 105 g por refeição (RP1 serve cerca de 800 almoços e jantares por dia), compatível com o consumo real; em pacotes de 5 kg seriam de 400 a 530 g, inviável (RF-036, RN- 019). | Premissa |
| 15 | Os preços das abas são por kg ou por embalagem? Quem cota e com que critério? | Nutricionistas cotam, só com agricultura familiar, por e-mail e WhatsApp; menor preço e prazo; a nutricionista decide. | Todo preço é cadastrado com a apresentação e convertido para a unidade-base; preço sem apresentação identificável vai para revisão manual na importação. Limite de compra sem aprovação do gestor central é parâmetro, inicialmente desligado (RF-004, RF-033, RN-028). | Confirmada e premissa |
|  |  |  |  |  |
|  |  |  |  | Page 68 of 71 |


<!-- Página 69 do PDF original -->

| N.º | Pergunta | Resposta do RP1 (27/10/2026) | Decisão adotada | Situação |
| --- | --- | --- | --- | --- |
| 16 | Como são comprados e controlados pães, ovos, bolo, doce e frutas? | Pão comprado; bolo e doce feitos no restaurante; ovos e frutas da agricultura familiar, semanais, com nota. | Itens comprados entram como insumos; bolo e doce de frutas viram preparos com ficha técnica (RF-002, RF- 005). | Confirmada e premissa |
| 17 | O que compõe o custo indireto do cardápio? | Sem resposta. | Custo indireto = itens marcados como indiretos (descartáveis, embalagens, acessórios) por porção; gás, energia e mão de obra ficam fora do custo da refeição na versão 1. Os valores R$ 0,24 e R$ 0,041 entram como itens indiretos editáveis (RN-029). | Premissa |
| 18 | Qual regra gera o total de sexta-feira e qual preço de referência o cardápio usa? | Referência: menor cotação, atualizada pela nutricionista. | Referência: menor cotação vigente (RN- 031). O total do dia é sempre a soma calculada dos itens; a diferença de R$ 0,04 na sexta (R$ 2,66 impresso contra R$ 2,62 calculado) é tratada como inconsistência da fonte. | Confirmada e premissa |
|  |  |  |  |  |
|  |  |  |  | Page 69 of 71 |


<!-- Página 70 do PDF original -->

| N.º | Pergunta | Resposta do RP1 (27/10/2026) | Decisão adotada | Situação |
| --- | --- | --- | --- | --- |
| 19 | A nutricionista pode enviar cardápios e fichas técnicas de almoço e jantar? | Não enviou. | A carga inicial usa um modelo de planilha que a nutricionista preenche; os testes usam receitas fictícias marcadas como exemplo (RF- 005, RF-009, seção 15.4). | Premissa |
| 20 | Como o valor nutricional é calculado? | Tabela TACO, sem controle sistemático. | O sistema só registra o valor informado (RF-032). | Confirmada |
| 21 | Quem opera as unidades e a quem se presta contas? | A AMINC coordena; presta contas à Prefeitura. | A Secretaria ou a Prefeitura é a titular dos dados; a AMINC atua como operadora, com perfil de gestor da unidade. O gestor central é quem a Prefeitura indicar (seção 4, RF-030). | Premissa |
| 22 | Qual a proporção de marmitas e quais as regras? | Sem resposta. | Marmita é uma modalidade registrada por refeição; os descartáveis entram como itens indiretos da ficha; limite por pessoa é parâmetro opcional, sem limite inicial (RF-019, RN- 029). | Premissa |
| 23 | Como se controlam hoje saldo, validade, notas e saídas? | Planilhas e caderno; conferência diária; PVPS; retiradas sem anotação. | RF-012, RF-013, RF- 016, RN-006, RN-034, CA-023, CA-024. | Confirmada |
|  |  |  |  |  |


<!-- Página 71 do PDF original -->

### 17.3 Aprovação do documento


| Nome | Papel | Data | Assinatura |
| --- | --- | --- | --- |
|  | Representante da Secretaria de Assistência Social |  |  |
|  | Nutricionista responsável |  |  |
|  | Gestor de unidade |  |  |
|  | Líder da equipe de desenvolvimento |  |  |
|  | Docente orientador da disciplina |  |  |
|  | Representante da AMINC (operadora do RP1) |  |  |


---

## 18. Adendo técnico de reconciliação arquitetural — 05/11/2026 (em revisão)

**Natureza e autoridade:** este adendo registra a decisão técnica comunicada pela responsável pelo projeto em 05/11/2026. É uma **proposta documental pendente de revisão/integração do PR**, sem assinatura institucional ou evidência de funcionamento. A versão 1.3 permanece baseline funcional e os identificadores/prioridades do DRS são preservados. A documentação de projeto em [`docs/PROJETO.md`](../PROJETO.md) e o detalhamento em [`docs/arquitetura/MVC_MONOREPO.md`](../arquitetura/MVC_MONOREPO.md) são referências técnicas complementares; o [Style Guide](../wireframe/Style%20Guide%20Restaurante%20Popular.html) permanece inegociável, salvo exceção aprovada.

### 18.1 Decisões de implementação

| Aspecto | Premissa legada | Decisão atual | Efeito sobre o contrato |
| --- | --- | --- | --- |
| Organização do código | Diretórios independentes de protótipo | **Monorepo** GitHub, com estrutura-alvo `apps/web`, `apps/api`, `packages/contracts` e `supabase/migrations` | Sem mudança funcional |
| Arquitetura | Camadas não formalizadas no código | **MVC adaptado a aplicação web/API**, com View (React), Controller (API), Model (domínio), Service e Repository | Preserva RNF-011 |
| Interface | React/Vite e Docker | React/Vite hospedado na **Cloudflare** | Preserva RNF-001 e Style Guide |
| API | Node/Express de longa duração em contêiner/VPS | API na **Cloudflare Workers**; Express poderá ser reaproveitado somente após teste de compatibilidade | Preserva contratos e segurança |
| Dados | PostgreSQL em VPS e `database/init.sql` | **Supabase PostgreSQL** e migrations versionadas | Preserva RNF-002/010 e modelo conceitual |
| Autenticação | `usuario.senha_hash` / JWT próprio no protótipo | **Supabase Auth**, com perfis e unidades em dados de aplicação e RLS | Preserva matriz de permissões e RNF-003 |
| Operação | `docker-compose.yml` e cópia externa à VPS | **Cloudflare + Supabase + GitHub CI/CD**, com backup/restauração verificados | Preserva metas de RNF-004, RNF-006 e RNF-013 |

### 18.2 Reconciliação de referências antigas

**Seção 5.2 — Hospedagem:** a frase "Hospedagem em VPS com backups automáticos (RNF-004)" é **substituída tecnicamente**, apenas para implementação, por: "Hospedagem de frontend e API na Cloudflare; PostgreSQL e autenticação no Supabase; backups automáticos, recuperação e observabilidade conforme RNF-004, condicionados à validação de plano, configuração, custo e testes." O texto original é mantido para rastreabilidade histórica até a aprovação do PR.

**RNF-004 — Backup e recuperação:** as expressões "na VPS" e "local externo à VPS" passam a referir-se ao **banco gerenciado no Supabase e à cópia independente do ambiente primário**. Permanecem as metas: backups diários, retenção de **30 cópias diárias e 12 mensais**, restauração testada trimestralmente, **RPO 24 horas** e **RTO 4 horas**. Tais metas não estão comprovadas na infraestrutura atual; será necessário escolher e demonstrar mecanismo compatível e custos. Backup do banco não substitui eventual backup de objetos no Storage.

**CA-013 — Cenário de aceitação:** a menção a "cópia para fora da VPS" deve ser interpretada como cópia em destino independente do banco de produção, com evidência de agendamento, alerta de falha e restauração de teste em até 4 horas, mantendo o sentido original do critério. Os IDs não são renumerados.

**Seção 17.1 — Risco:** "Perda de dados por falha da VPS" passa a ser tratado como "Perda de dados por falha do banco gerenciado, erro de configuração, exclusão acidental ou falha do processo de backup", mitigado por cópias independentes, monitoramento e testes de restauração.

**Legado e escopo:** `docker-compose.yml`, Dockerfiles e `database/init.sql` permanecem no histórico do repositório como protótipo; não são a documentação vigente de deploy. A execução local com Docker pode ser opcional no futuro, mas não é pré-requisito de produção.

### 18.3 Segurança e decisões que bloqueiam produção

- Definir a relação `auth.users` com perfis/unidades, concessão e remoção de acesso e segregação de funções. RLS deve ser habilitada com políticas adequadas e teste de bloqueio entre RP1/RP2. O diagnóstico inicial encontrou 14 tabelas `public` com RLS desabilitada; revalidar antes de agir, **não executar SQL automaticamente**.
- Implementar baixa de estoque, aprovação e auditoria de forma atômica, testável e idempotente; nunca usar chaves administrativas expostas ao navegador.
- Separar staging e produção; registrar orçamento, localização dos dados, privacidade/LGPD, backups e responsável pela aprovação institucional antes de operar com dados reais.
- Validar comportamento de API/Worker, armazenamento de anexos e estados não cobertos pela UI; nenhuma lacuna autoriza modificar as telas aprovadas.

### 18.4 Reconstrução do produto e metodologia

A responsável determinou que os diretórios `frontend/`, `backend/`, `database/` e `escr/` fossem arquivados em `legacy/`, incluindo o Compose do protótipo. **O código legado serve somente como referência histórica e não é base de implementação.** Os novos schemas, frontend, backend e regras de negócio serão criados nas etapas adequadas com base neste DRS, no Style Guide e nas decisões de arquitetura, sem presumir que o SQL anterior representa o contrato completo.

A organização do trabalho utilizará desenvolvimento orientado por especificações (*Spec-Driven Development — SDD*) como interpretação operacional provisória de “driven development”, com documentação e templates de issues/PRs em [Plano de reconstrução e fluxo SDD](../planejamento/RECONSTRUCAO_SDD.md). A nomeação da prática deve ser confirmada antes do desenvolvimento funcional. Critérios `CA-*` e controles de qualidade deste DRS permanecem obrigatórios; testes automatizados (TDD/BDD quando apropriado) complementam, mas não substituem o contrato.

A recriação do schema ocorrerá primeiro em banco isolado, versionado por migrations, com segurança RLS e testes. **Este adendo não autoriza apagar/reinicializar o projeto Supabase conectado.** Não ocorre aqui mudança funcional, alteração da UI aprovada, deploy ou liberação com dados reais.

### 18.5 Aceite deste adendo

**Revisão técnica:** pendente de aprovação do PR. **Aprovação da instituição (seção 17.3):** não comprovada. **Implantação Cloudflare/Supabase:** não comprovada. Este adendo não substitui os aceites formais do piloto e da produção.
