# Plano acelerado até 10/11/2026

Solicitado pela responsável em 09/11/2026. **Meta aceita: versão utilizável de demonstração, publicada na Cloudflare, com o primeiro fluxo de estoque: produto → recebimento de compra → lote → consulta de saldo.** Prazo pretendido: **10/11/2026 às 23:59, America/Sao_Paulo**, antes de 11/11. A demonstração técnica foi publicada e verificada em 10/11, conforme as evidências na continuidade abaixo; aceite institucional e ERP integral permanecem próprios.

O ERP integral permanece fora desse prazo. As faixas da [estimativa inicial](ESTIMATIVA-2026-11-09.md) continuam como planejamento revisável: 6–10 semanas para D1 pronta para piloto, 8–12 com duas semanas de piloto acompanhado e 16–24 no total para as três entregas e preparação operacional final. A meta acelerada é um recorte menor e não substitui automaticamente essas estimativas.

## Estado inicial e condições

- [INT-003](../fundacao/INT-003-JORNADA-REAL.md) demonstrou login/configurações com View/Worker locais e Supabase real, usando três contas e duas unidades sintéticas. Isso não comprova produtos, recebimentos ou saldo.
- **Cloudflare:** login inicial por callback expirou; autenticação por dispositivo concluída em 09/11. Inventário da conta confirmou ausência de Workers antes da primeira publicação. Registrar deploy/smoke antes de afirmar hospedagem pronta.
- Produto, entrada, lote, livro e saldo estão descritos como propostas em [DATA-001](../dados/DATA-001.md), no [dicionário](../dados/DICIONARIO.md) e nas [transações](../dados/TRANSACOES_ESTOQUE.md); sua presença documental não é implementação.
- Usar somente dados e contas sintéticas de demonstração. O [ADR-002](../decisoes/ADR-002-STAGING-COMPARTILHADO.md) mantém staging compartilhado e AMB-001 congelada até o encerramento funcional, sem novos ambientes permanentes ou reset por inferência. Publicar a aplicação de staging não libera produção ou dados reais.

## Prioridades e resultado verificável

As prioridades abaixo são a sequência de construção da meta aceita; P1 ou P2 isoladas não demonstram o fluxo completo de estoque.

| Prioridade | Recorte | Condição de saída |
| --- | --- | --- |
| P1 — Cloudflare | Publicar a View e o Worker existentes no mesmo staging, com Auth/API reais | URL HTTPS acessível; login, leitura e salvamento autorizado de configurações funcionam no endereço hospedado; leitor e unidade não vinculada continuam sem escrita/acesso indevido |
| P2 — CAD-001 | Produtos persistidos, RF-003 parcial, com medidas/categorias sintéticas preparadas e parâmetros por unidade | Usuário autorizado cadastra, pesquisa, reabre e edita um produto real no banco; nova sessão recupera os valores; validações, autorização e auditoria são demonstradas |
| P3 — Primeiro estoque | Compra em unidade-base, confirmação de recebimento, lote e saldo por unidade/lote/local, RF-012/RF-017 parciais | Confirmar 20 kg credita exatamente 20 kg no local correto; consulta mostra o lote; confirmação repetida e nota duplicada não duplicam o crédito; documento confirmado fica imutável |

CAD-001 identifica o cadastro parcial, incluído no recorte [EST-001](../fundacao/EST-001-PRIMEIRO-FLUXO.md). Backlog operacional: [issue #16](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/16). Manter branches/PRs e registrar critérios, commit, CI, ambiente e limitações.

## Contratos mínimos para implementação

### Produto — P2

Fonte: [DRS, seção 7.1 e RF-001/RF-002/RF-003](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), RN-001/002/003/013/019/026. Referência visual: frames **3 · Produtos** e **4 · Cadastro de produto** do [Style Guide](../wireframe/Style%20Guide%20Restaurante%20Popular.html); [mapa de UI](../auditoria/UI.md). Inspecionar os frames e seus estados antes de implementar; não alterar o HTML mestre.

- Obrigatórios de RF-003: descrição, unidade-base, categoria, perecível, armazenamento, apresentação de compra, quantidade da apresentação e status. Quantidade da apresentação deve ser positiva; fator de correção usa a referência 1,00 quando omitido.
- Código interno, descrição complementar, alérgenos e fornecedores habituais são opcionais. A unicidade considera descrição e complemento juntos, ignorando caixa, acentos e espaços extras, conforme RN-003/refinamento de RF-003.
- Estoque mínimo é obrigatório por produto/unidade; máximo e ponto de reposição são opcionais. Esses parâmetros não são saldo e não geram movimento. Medida/categoria inativa não entra em novo cadastro. Unidade-base não muda após a primeira movimentação.
- Preparar medidas/categorias sintéticas identificadas sem declarar RF-001/RF-002 completos. Cadastro, busca, reabertura e edição persistentes são o recorte mínimo; o padrão CRUD integral da seção 7.1, incluindo exportação e demais ações/estados ainda não implementados, continua rastreado como pendência.

### Recebimento e saldo — P3

Fonte: [DRS, seção 9, RF-012/RF-017, CA-005/CA-011/CA-014](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md); RN-004/005/010/012/015/022/025/026/037 e RNF-002/003/008/010. Aplicar os refinamentos: compra exige NF, embora a tabela antiga a marque como opcional. Referência visual: frame **5 · Entrada de materiais**; consulta de saldo precisa de contrato/estado explícito, sem inferir tela aprovada ausente.

- Primeiro caminho: origem **Compra**, unidade autorizada, data não futura, fornecedor ativo e NF; produto ativo, quantidade positiva na unidade-base, valor unitário e local de destino da mesma unidade. Fornecedor/local sintéticos podem ser preparados antes, sem declarar seus CRUDs completos.
- Registrar conformidade; resfriados/congelados exigem temperatura e conferência aplicável. Perecível exige lote/validade, rejeitando validade anterior à entrada. Itens recusados não geram saldo. Identificação automática de lote segue RF-012; não criar datas ou fornecedores fictícios para contornar validação.
- Confirmar grava documento, lote, livro, saldo e auditoria na mesma transação; falha reverte o conjunto. Reenvio idêntico não duplica efeitos. Unicidade fornecedor/NF deve impedir corrida inclusive entre unidades, conforme RN-025 e o contrato de identificação a consolidar.
- Confirmado não permite editar/excluir. Saldo é derivado de movimentos por lote/local; não criar campo de saldo manualmente editável no produto. Consulta mostra somente a unidade autorizada e identifica limitações do recorte.
- Doações, anexos opcionais, comparação completa de cotações, estorno, saídas/perdas/aprovações, inventário e carga inicial de saldo não são prometidos neste prazo. Não expor ações incompletas como disponíveis; esses requisitos mantêm escopo e prioridade no DRS.

### Perfis e decisões materiais

Fonte: [DRS, seção 4.2](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) e [SEC-001](../seguranca/SEC-001.md). A matriz registra cadastros básicos como IX para gestor da unidade/nutricionista, I para estoquista; entrada como I para estoquista e A para gestor da unidade. Preservar as demais células e a segregação aplicável. A legenda não resolve sozinha toda leitura implícita em I/A/X.

Contrato confirmado pela responsável na conversa em 09/11: catálogo compartilhado com escrita específica para gestor/nutricionista/estoquista; recebimento confirmado pelo estoquista; NF única por fornecedor+número inclusive entre unidades; gestor aprova divergências. Usar contas/fornecedores sintéticos. [EST-001](../fundacao/EST-001-PRIMEIRO-FLUXO.md) detalha DTOs, capacidades e invariantes. Os pontos abaixo foram levantados para essa decisão; não continuam como bloqueio genérico após a confirmação:

1. **Catálogos:** quem pode consultar/criar/editar o catálogo compartilhado e qual o alcance sobre as outras unidades? Como separar esse poder da manutenção dos parâmetros locais de produto? Não transformar vínculo local em administração global por inferência.
2. **Nota fiscal:** qual identificação canônica será usada para fornecedor/NF, e como série/chave opcionais participam da unicidade? A escolha deve preservar RN-025, sem aceitar duplicidade por unidade ou inventar exceção fiscal.
3. **Capacidades do recorte:** registrar as ações permitidas às contas sintéticas e a leitura necessária para o fluxo. `CONFIGURACAO_EDITAR` não concede cadastro de produto ou recebimento. Configuração, lançamento e aprovação são poderes distintos.

Registrar decisão, fonte, impacto e responsável; não considerar [DOM-001](../decisoes/DOM-001-PROPOSTAS.md) aprovado em bloco. Escolhas técnicas de normalização, precisão decimal e concorrência devem cumprir o contrato e ter testes. Conferir o registro existente da ratificação metodológica SDD; este plano não inventa sua ocorrência nem reabre uma autorização já dada.

## Execução em paralelo e gates

Seguir o [plano SDD](RECONSTRUCAO_SDD.md): especificação rastreável → migrations/segurança → API/domínio e View → integração/evidência. Não é preciso terminar todos os módulos para verificar uma jornada.

- A trilha Cloudflare pode avançar junto da especificação de CAD-001 e dos recebimentos. Banco/API/View podem trabalhar em paralelo após estabilizar DTOs, campos, erros, autorização e transições do respectivo recorte; dependências ainda abertas não viram regras implícitas.
- Reutilizar a estrutura MVC/contratos, identidade e estilos novos. Não importar `legacy/`, credenciais administrativas ou decisões de domínio para a View. Não diminuir isolamento, atomicidade ou auditoria para cumprir o prazo.
- Integrar recortes verificados à main por PR, mantendo a branch ativa atualizada conforme ADR-002. CI verde não substitui teste de Auth/RLS/Data API real e teste da URL hospedada.
- Executar verificações proporcionais: lint/tipos/testes/build, regras e persistência, negações por ação/unidade, idempotência/concorrência/rollback do recebimento, navegação e comparação visual. Conferir CORS/origens e cabeçalhos usados pela aplicação hospedada; secrets ficam fora de navegador, repositório e evidências.

## Aceite técnico da demonstração

Registrar resultados efetivos por critério, com commit, data e ambiente:

1. Abrir a URL Cloudflare e autenticar conta sintética; View e Worker hospedados usam serviços reais, sem mocks.
2. Cadastrar produto com campos/parametrização válidos; pesquisar, editar e reabrir após nova sessão. Duplicidade normalizada e campo obrigatório inválido falham sem gravação parcial.
3. Receber compra de 20 kg com fornecedor/NF/lote/local e confirmar; consultar exatamente 20 kg na unidade/lote/local esperados. Outra unidade não consegue ler ou lançar esse estoque.
4. Repetição/concorrência de confirmação ou de fornecedor/NF não duplica lote/crédito; inválido ou falha de auditoria não deixa movimento parcial. Entrada confirmada não pode ser editada/excluída; perecível sem validade é rejeitado.
5. Sem sessão, ator inativo, vínculo revogado e perfil sem ação são negados. DML direto não contorna operações mediadas. Auditoria conserva ator, unidade, instante e alterações, sem tokens/senhas.
6. Evidência identifica o que passou, o que não foi executado e as limitações. Se P3 não atingir seus critérios até o limite, reportar o incremento efetivamente verificado e a pendência; não declarar primeiro fluxo de estoque concluído apenas porque P1/P2 passaram.

Esses critérios são a condição de uma demonstração técnica com dados sintéticos. Não encerram a Entrega 1, RF-008 integral, RNF-004, o piloto real de duas semanas do DRS 15.4 ou o aceite institucional. O conteúdo das três entregas da seção 15.2 permanece preservado.

## Continuidade em 10/11

EST-001 implementado e verificado com Worker/View locais e Supabase real: produto cadastrado/buscado/editado, compra de 20 kg confirmada, saldo por lote/local, nova sessão e leitor readonly. API real também negou duplicidade/reenvio/NF, outra unidade e DML direto. PostgreSQL validou atomicidade/auditoria, concorrência e revogação; 23 cenários de navegador passaram após correção de legibilidade móvel. [Resultados](../fundacao/EST-001-PRIMEIRO-FLUXO.md) e [evidências locais](../evidencias/est-001/jornada-local.json). Não tratar esse resultado local como deploy.

P1/publicação concluída após confirmação efetiva de workers_scripts:write: [staging online](https://erp-joinville-staging.erp-restaurantes-joinville.workers.dev), mesma conta e Supabase existentes. O primeiro teste de configurações detectou ETag enfraquecida pela compressão Cloudflare; no-transform corrigiu a resposta sem relaxar revisão/autorização. [OPS-001](../fundacao/OPS-001-PUBLICACAO.md) registra deploy, CI, versão, smoke e [jornada hospedada completa](../evidencias/ops-001/jornada-hospedada.json).

P1/P2/P3 foram demonstrados no recorte técnico aceito: login/configurações, produto persistido e compra de 20 kg com lote/local/saldo, nova sessão, leitor readonly e negações da API. HTTPS, assets, headers e quatro jobs de CI verificados; 23 cenários de navegador no CI, mais verificações reais separadas. Nenhum ambiente permanente adicional ou limpeza antecipada. Dados sintéticos e auditoria preservados. Próximas prioridades: completar critérios dos cadastros auxiliares, vínculo global entre unidades e demais contratos D1, mantendo escopo integral/piloto/backup/gates nas etapas próprias.

Continuidade após a demonstração: acesso pessoal confirmado pela responsável em ADM-001/A. [CAD-002](../fundacao/CAD-002-VINCULO-PRODUTO.md) resolveu o vínculo global por unidade com parâmetros próprios; [seis cenários hospedados](../evidencias/cad-002/jornada-hospedada.json) completaram API/UI/nova sessão/negações e preservação dos saldos. CI aprovou 59 testes API, 25 estoque PostgreSQL e 31 navegador. Quinta migration aditiva, sem nova tabela ou ambiente. Os snapshots anteriores permanecem históricos; CRUDs auxiliares e demais contratos D1 continuam como próximas dependências, sem antecipar piloto ou administração privilegiada.
