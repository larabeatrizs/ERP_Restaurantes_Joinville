# UX-002 — Skeleton e estados de carregamento

**Estado em 11/11/2026:** melhoria futura solicitada pela responsável, registrada na [issue #24](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/24). Somente planejamento; sem implementação neste incremento. Não interrompe os cadastros e fluxos D1 em andamento.

## Objetivo e referências

Tornar a espera por dados mais agradável e compreensível, com placeholders que preservem a estrutura visual e reduzam deslocamentos de conteúdo. Compor com os componentes e tokens do [Style Guide](../wireframe/Style%20Guide%20Restaurante%20Popular.html), sem alterar sua referência mestre. Relaciona-se à fase C4 do [plano SDD](RECONSTRUCAO_SDD.md) e à acessibilidade RNF-009 do [DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md). Os detalhes abaixo são proposta técnica para o incremento futuro, sem criar novos RF/CA nem presumir aceite institucional.

## Telas e estados a inventariar

| Área | Tratamento proposto |
| --- | --- |
| Inicialização de sessão e unidade | Estrutura neutra enquanto a sessão/capacidades são verificadas; sem antecipar dados ou controles privilegiados |
| Configurações | Placeholders das seções/campos no primeiro carregamento, antes de permitir edição |
| Produtos e catálogo compartilhado | Estrutura de busca e linhas/cartões; resultados reais substituem os placeholders |
| Recebimentos e saldos | Estrutura da lista e detalhes, com quantidade de placeholders limitada e dimensões responsivas |
| Atualização de dados já carregados | Manter conteúdo válido e sinalizar atualização; não cobrir formulário alterado nem apagar valores |

Carregamento inicial, atualização, lista vazia, falha recuperável e salvamento devem ter estados distintos. Ao terminar sem dados, mostrar o estado vazio; ao falhar, mensagem e nova tentativa. Salvamento mantém feedback próprio e bloqueios já previstos no contrato, sem substituir o formulário por skeleton. Definir em especificação um limiar para evitar flashes em respostas rápidas, sem impor atrasos artificiais.

## Integração proposta

- Criar componentes visuais reutilizáveis em `apps/web`, com variantes compatíveis com as telas existentes. A View recebe o estado de carregamento; serviços/API e regras de negócio permanecem com as responsabilidades atuais.
- Preservar shell, títulos e dimensões aproximadas. Evitar overflow global em telas pequenas; tabelas mantêm rolagem local.
- Só liberar ações com dados, sessão, unidade e capacidade válidos. Placeholder não representa saldo, valor real ou autorização concedida.
- Em troca de unidade, impedir apresentação de dados da unidade anterior como atuais; respeitar o isolamento existente.
- Identificar a região com `aria-busy`, fornecer um único anúncio de estado adequado e marcar formas decorativas com `aria-hidden`. Evitar anúncios repetidos por linha.
- Respeitar `prefers-reduced-motion`, contraste e navegação por teclado; animação discreta e dispensável. Não usar somente cor para informar estado.
- Não incluir dados pessoais fictícios ou reais nos placeholders. Não acrescentar dependência antes de avaliar os recursos já disponíveis.

## Critérios para o incremento futuro

- [ ] Inventário e composição visual por tela revisados contra o Style Guide.
- [ ] Estados inicial/atualização/vazio/erro/sucesso/salvamento observáveis e coerentes.
- [ ] Rede lenta e falha não apagam edição, não duplicam requisições de escrita nem habilitam ações indevidas.
- [ ] Navegação entre unidades preserva isolamento e não apresenta conteúdo anterior como atual.
- [ ] Verificação em 360, 768 e 1280 px, teclado, leitor de tela e movimento reduzido; sem deslocamentos relevantes ou overflow global.
- [ ] Testes de interface proporcionais aos estados novos e evidências de revisão visual/acessível registrados em branch/PR próprios.

Sem alteração atual de código/CSS, API, banco ou permissões. Não exige ambientes permanentes adicionais. A fila operacional e a execução futura pertencem à issue vinculada; este documento detalha o escopo e não declara entrega.
