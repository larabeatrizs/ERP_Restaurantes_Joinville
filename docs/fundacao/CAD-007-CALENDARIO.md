# CAD-007 — Calendário e refeições por unidade

**16/11/2026 — contrato definido pela responsável; implementação em verificação local, issue [#39](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/39).** Continuidade D1 após CAD-006/PR #38. O snapshot documental da PR #40 era proposta; a resposta posterior autorizou também a nutricionista a editar. Implantação/evidências hospedadas ainda pendentes neste snapshot. Decisão do produto não equivale a aceite institucional.

## Fonte e evidência atual

DRS 2.1, seção 7.1/RF-006 (M), RN-012/016/022, CA-003/011 e RNF-002/003/008/010/015. CONFIG-001 já separa calendário/refeições dos parâmetros de estoque e exige dados estruturados. DATA-001/DICIONARIO prevê `refeicao_habilitada`, `calendario_semanal` e `calendario_excecao`, ainda como desenho de solução. O Style Guide não tem frame específico de calendário: compor com seus componentes sem alterar o HTML mestre.

Consulta readonly do schema em 16/11 confirmou `erp.unidade(id,codigo,nome,status)` e ausência de tabela de calendário. Seleção/vínculos de unidade, Auth, configurações e estoque já existem; não representam refeições/feriados implementados. Não há issue anterior específica de RF-006; #31/#37 mencionam a pendência.

## Recorte e decisão da responsável

Primeiro incremento: consultar/configurar funcionamento das unidades existentes, sem criar/inativar unidade nem gerenciar usuários/vínculos. Esses atos administrativos permanecem em RF-008/#19 e precisam de autorização própria. A identificação atual da unidade é somente leitura; endereço/bairro e demais campos cadastrais faltantes de RF-006 continuam no recorte administrativo, sem inventar valores.

Em resposta à escolha solicitada, a responsável adotou em 16/11 **permitir edição também à nutricionista**, além do gestor, sempre nas unidades vinculadas. Demais perfis com leitura autorizada consultam; ADMIN de acompanhamento mantém consulta, sem promoção automática. Exceção por data substitui a grade semanal, permitindo fechamento ou refeições/horários especiais. Criação/inativação de unidades continuam na administração RF-008. A consulta administrativa não concede acesso operacional universal.

Contrato detalhado do incremento:

- Grade semanal por unidade e dias 0–6, de domingo a sábado; refeições habilitadas por tipo (café da manhã, almoço, jantar), início/fim e capacidade opcional positiva. Intervalos deste recorte começam/terminam no mesmo dia; virada de meia-noite não está especificada no DRS.
- Registro manual de feriados e exceções por data, com descrição. Feriado que segue a rotina considera os dias da semana e a opção de atender feriados; essa opção não cria um dia semanal novo. Fechamento explícito retorna nenhuma refeição. Regime especial substitui os dias/refeições/horários regulares apenas naquela data. Não buscar calendário externo ou presumir feriados legais.
- Uma exceção consolidada por unidade/data evita prioridades escondidas entre registros sobrepostos. Refeições especiais têm a mesma validação de horário/capacidade. A data volta à rotina quando a exceção é removida, com auditoria; exclusão de configuração não apaga operação histórica.
- Calendário ausente é **não configurado**, sem inventar refeições ou horários. Permitir consultar esse estado. Uma configuração sem dias/refeições indica indisponibilidade no planejamento, sem inativar a própria unidade ou modificar estoque.
- Modelos explícitos do DRS podem preencher uma prévia: Bucarein, café 07–09/almoço 11–14/jantar 17–19, sete dias e feriados; Adhemar Garcia, almoço 11–14, segunda a sexta sem feriados. Aplicação depende da escolha do operador/revisão/salvamento; não mapear automaticamente códigos ou nomes das unidades sintéticas para restaurantes reais.

O acesso usa `CONFIGURACAO_LER` para consulta e `CALENDARIO_EDITAR` para edição/leitura do editor. Fixture opt-in prepara somente GESTOR_UNIDADE/NUTRICIONISTA sintéticos; a migration não promove perfis ou usuários. O perfil NUTRICIONISTA pode ser preparado sem conta Auth; vincular futuros usuários permanece responsabilidade de RF-008.

## Dados e interfaces

`calendario_unidade` guarda revisão/atendimento em feriados; `calendario_semanal`, `refeicao_habilitada`, `calendario_excecao` e `calendario_refeicao_especial` guardam os filhos estruturados. PK/FKs por unidade, unicidade de dia/tipo/data e checks de limites; a FK composta impede refeição especial ligada a regime não ESPECIAL. RLS em todas as tabelas. Sem JSON livre para persistência. DTO JSON é transporte validado/atômico. Limites técnicos: até 200 datas, três refeições por grade/data e corpo HTTP de 64 KiB; falha não salva parcialmente.

View `CalendarPanel` → `CalendarApi` → CalendarController → CalendarService → CalendarRepository → RPC privada `calendario_operacao` com executor restrito/wrapper invoker. Tipos/validação/resolução em `packages/contracts/src/calendar.ts`; Controller consulta dados autorizados antes de resolver por data. Fábrica acrescentada ao final de `createApp`, preservando posições anteriores. Calendário não depende de permissão de leitura de estoque para abrir sua tela.

HTTP: GET `/api/unidades/:id/calendario` para configuração/identificação/capacidade; PUT no mesmo recurso com revisão esperada (`null` somente para criação), motivo e auditoria; GET `/api/unidades/:id/calendario/funcionamento?data=YYYY-MM-DD` para resolução atual. Nenhum endpoint aceita ator/perfil/unidade pelo corpo. Datas ISO válidas, IDs/revisões bigint textuais, horários HH:mm, capacidades inteiras positivas ou null. Uma transação usa lock consultivo por unidade, espera limitada a cinco segundos e revisão para evitar duas criações/salvamentos concorrentes.

Salvar o agregado em uma transação, revalidar ator/unidade/permissão/revisão após espera por lock e preservar edição local em conflito (412). Falha de auditoria reverte header/filhos. Rejeitar payload extra/coerção e DML direto. A resolução por data retorna origem (rotina/feriado/fechamento/especial/não configurado), refeições e revisão; não é snapshot histórico de operação. Planejamento futuro deve consumir esse serviço no backend e registrar a revisão utilizada, conforme RN-016; até esse consumidor existir, não anunciar bloqueio de cardápios implementado.

## Interface e verificação

Tela própria, com unidade/nome visíveis, grade semanal, refeições, datas especiais e consulta por data. Reutiliza componentes e proteção de navegação por edição/salvamento. Fluxo editar → revisar antes/depois/motivo → salvar; consulta não recebe escrita habilitada. Estados não configurado, carregando, negado, erro/retry, salvando, sucesso e conflito. Datas têm busca por texto/data ISO, ordenação, páginas de dez e CSV das datas salvas, filtrado/protegido contra fórmulas. O CSV e a consulta por data usam a configuração persistida; a prévia da revisão mostra a edição. Remover exceção requer confirmação e só volta à rotina depois de salvar.

Casos: modelos RP1/RP2, fim de semana, feriado seguindo rotina, fechamento/horário especial, capacidade null/limite, data impossível, duplicidade, tipos inválidos, revisão/concorrência, revogação durante lock e rollback. HTTP/SDK/RLS: sem sessão, unidade alheia, leitor, DML/helper direto e ator indevido. UI: troca de unidade, prévia/motivo, falha preservando edição, confirmação de descarte e 360/768/1280 px. Evidências executadas abaixo; não inferir consumidor de planejamento já implantado.

Staging futuro somente com identidades/unidades sintéticas já autorizadas; comparar previamente usuários/vínculos/capacidades ADMIN, produtos, recebimentos, saldos e movimentos. Não resetar banco, importar dados reais ou provisionar outro ambiente. AMB-001, SMTP geral, skeleton e importação final continuam nas etapas decididas.

## Verificações locais em 16/11

`npm run check` passou (lint/tipos, 96 API, 32 configurações/56 estoque em PGlite com skips dos concorrentes, legado/provisionamento e build/dry-run). PostgreSQL 17.11 descartável em loopback executou **56 testes de estoque sem skips**, incluindo nutricionista/gestor, revisão e permissão revogada durante lock. Suíte completa no Edge: **65 testes passaram**, incluindo cinco jornadas novas de calendário (modelo explícito, especial por data/API, erro preservando motivo/rascunho, leitor/CSV/paginação/troca de unidade e responsividade). CI e staging em verificação neste snapshot. Laboratório nativo encerrado após os testes.

As primeiras execuções corrigiram a contagem de tabelas de 20 para 25 e o allowlist de RPCs no verificador; rótulos estáveis foram acrescentados a select/textarea controlados após o teste de conflito. Nenhum teste falho foi contado como sucesso. Build mantém aviso anterior de chunk principal acima de 500 kB (510,65 kB; calendário separado em chunk lazy de 13,89 kB). Laboratório/CI não constitui ambiente permanente; não houve alteração do banco hospedado nessas verificações locais.
