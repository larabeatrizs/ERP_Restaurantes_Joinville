# CAD-007 — Calendário e refeições por unidade

**16/11/2026 — especificação proposta, issue [#39](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/39).** Continuidade D1 após CAD-006/PR #38. Sem implementação, migration, seed ou implantação neste registro. Decisões pendentes não são aceite institucional.

## Fonte e evidência atual

DRS 2.1, seção 7.1/RF-006 (M), RN-012/016/022, CA-003/011 e RNF-002/003/008/010/015. CONFIG-001 já separa calendário/refeições dos parâmetros de estoque e exige dados estruturados. DATA-001/DICIONARIO prevê `refeicao_habilitada`, `calendario_semanal` e `calendario_excecao`, ainda como desenho de solução. O Style Guide não tem frame específico de calendário: compor com seus componentes sem alterar o HTML mestre.

Consulta readonly do schema em 16/11 confirmou `erp.unidade(id,codigo,nome,status)` e ausência de tabela de calendário. Seleção/vínculos de unidade, Auth, configurações e estoque já existem; não representam refeições/feriados implementados. Não há issue anterior específica de RF-006; #31/#37 mencionam a pendência.

## Recorte proposto e decisão pendente

Primeiro incremento: consultar/configurar funcionamento das unidades existentes, sem criar/inativar unidade nem gerenciar usuários/vínculos. Esses atos administrativos permanecem em RF-008/#19 e precisam de autorização própria. A identificação atual da unidade é somente leitura; endereço/bairro e demais campos cadastrais faltantes de RF-006 continuam no recorte administrativo, sem inventar valores.

Foi solicitada à responsável a escolha entre gestor editar sozinho ou também permitir edição à nutricionista, sempre em unidades vinculadas. Demais perfis autorizados consultam; ADMIN de acompanhamento mantém consulta, sem promoção automática. Também foi proposta precedência de exceção por data sobre a grade semanal, com fechamento ou refeições/horários especiais. **Resposta ainda pendente.** Não escolher política de escrita, conceder capacidade ou publicar comportamento dependente antes da decisão. A consulta administrativa não concede acesso operacional universal.

Proposta detalhada para revisão:

- Grade semanal por unidade e dias 0–6, de domingo a sábado; refeições habilitadas por tipo (café da manhã, almoço, jantar), início/fim e capacidade opcional positiva. Intervalos deste recorte começam/terminam no mesmo dia; virada de meia-noite não está especificada no DRS.
- Registro manual de feriados e exceções por data, com descrição. Feriado que segue a rotina considera os dias da semana e a opção de atender feriados; essa opção não cria um dia semanal novo. Fechamento explícito retorna nenhuma refeição. Regime especial substitui os dias/refeições/horários regulares apenas naquela data. Não buscar calendário externo ou presumir feriados legais.
- Uma exceção consolidada por unidade/data evita prioridades escondidas entre registros sobrepostos. Refeições especiais têm a mesma validação de horário/capacidade. A data volta à rotina quando a exceção é removida, com auditoria; exclusão de configuração não apaga operação histórica.
- Calendário ausente é **não configurado**, sem inventar refeições ou horários. Permitir consultar esse estado. Uma configuração sem dias/refeições indica indisponibilidade no planejamento, sem inativar a própria unidade ou modificar estoque.
- Modelos explícitos do DRS podem preencher uma prévia: Bucarein, café 07–09/almoço 11–14/jantar 17–19, sete dias e feriados; Adhemar Garcia, almoço 11–14, segunda a sexta sem feriados. Aplicação depende da escolha do operador/revisão/salvamento; não mapear automaticamente códigos ou nomes das unidades sintéticas para restaurantes reais.

Esses detalhes são proposta verificável; a resposta sobre o recorte e o registro da decisão antecedem o contrato definitivo. Conflitos ou ajustes da responsável devem atualizar esta seção antes de gerar migrations.

## Dados e interfaces propostos

Header de configuração por unidade com revisão; relações para semana, refeições regulares, exceções por data e respectivas refeições especiais. PK/FKs compostas por unidade, unicidade de dia/tipo/data, checks de limites e RLS em todas as tabelas expostas. Sem chaves arbitrárias, scripts ou JSON livre como persistência de regras. DTO JSON apenas como transporte de uma configuração validada/atômica.

View `CalendarPanel` → `CalendarApi` → Controller → Service/resolvedor → Repository → RPC privada com executor restrito/wrapper invoker, conforme padrões existentes. Tipos/validação em `packages/contracts`. Nomes de componentes, tabelas e rotas são propostas até implementação. Preservar os argumentos posicionais já existentes de `createApp`; acrescentar eventual fábrica ao final.

Proposta HTTP: GET `/api/unidades/:id/calendario` para configuração/identificação e capacidade efetiva; PUT no mesmo recurso para substituição validada com revisão esperada, motivo e auditoria; GET `/api/unidades/:id/calendario/funcionamento?data=YYYY-MM-DD` para resolução da configuração atual. Nenhum endpoint aceita ator, perfil ou unidade pelo corpo para sobrepor a sessão/rota. Datas ISO válidas, IDs/revisões bigint textuais, horários HH:mm e capacidades inteiras/limites estritos.

Salvar o agregado em uma transação, revalidar ator/unidade/permissão/revisão após espera por lock e preservar edição local em conflito (412). Falha de auditoria reverte header/filhos. Rejeitar payload extra/coerção e DML direto. A resolução por data retorna origem (rotina/feriado/fechamento/especial/não configurado), refeições e revisão; não é snapshot histórico de operação. Planejamento futuro deve consumir esse serviço no backend e registrar a revisão utilizada, conforme RN-016; até esse consumidor existir, não anunciar bloqueio de cardápios implementado.

## Interface e verificação planejadas

Tela própria em Operação, com unidade/nome visíveis, grade semanal, refeições, datas especiais e consulta por data. Reutilizar componentes visuais e proteção de navegação por edição/salvamento. Fluxo editar → revisar antes/depois/motivo → salvar; consulta não recebe controles de escrita habilitados. Estados não configurado, carregando, negado, erro/retry, salvando, sucesso e conflito; nenhum calendário vazio fictício durante fetch. Busca/ordenação/paginação/CSV de datas devem ser definidos no contrato do incremento sem fingir cadastro completo de unidades.

Casos a executar após decisão: modelos RP1/RP2, fim de semana, feriado seguindo rotina, fechamento/horário especial, capacidade null/limite, data impossível, duplicidade, tipos inválidos, revisão/concorrência, revogação durante lock e rollback de auditoria. HTTP/SDK/RLS: ausência de sessão, unidade alheia, leitor, DML/helper direto e metadados de ator indevidos. UI: escolha/troca de unidade, preview/motivo, falha preservando edição, confirmação de descarte, teclado e 360/768/1280 px.

Staging futuro somente com identidades/unidades sintéticas já autorizadas; comparar previamente usuários/vínculos/capacidades ADMIN, produtos, recebimentos, saldos e movimentos. Não resetar banco, importar dados reais ou provisionar outro ambiente. AMB-001, SMTP geral, skeleton e importação final continuam nas etapas decididas.

## Verificação executada deste registro

Leitura do DRS/CONFIG-001/DATA-001/DICIONARIO/SEC-001/plano, busca de issues e consulta readonly dos nomes/colunas do schema. Revisão documental, sem teste funcional novo: não há calendário implementado a validar. A pergunta permanece pendente; o próximo trabalho dependente é registrar a resposta e fechar os contratos de acesso/precedência antes de implementar.
