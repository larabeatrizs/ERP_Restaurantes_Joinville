# DOM-002 — Ajustes solicitados em 12/11/2026

Fonte: mensagem explícita da responsável, com prints de Início, Produtos e Movimentações. A direção abaixo revisa o planejamento anterior; não equivale a aceite institucional de implantação. [Issue #31](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/31). Preservar o DRS e seus IDs; detalhar os novos contratos por incremento.

| Pedido | Contrato/destino | Estado inicial |
| --- | --- | --- |
| Senha de 8 caracteres com letra, número e especial | Interpretar como **mínimo de 8**, aceitando maiúscula OU minúscula, número e símbolo; manter senhas maiores | View implementada; Auth com 8/letra/número, símbolo server-side pendente por limitação dos presets; sem reset automático |
| Ver senha e recuperar por link | Mostrar/ocultar no login/definição; recuperação no login e preferências. Mensagem neutra, limite do provedor, retorno seguro ao fluxo de definição | Implementado localmente; envio geral de email explicitamente adiado pela responsável |
| Usuário em vez de email | Nome de login único distinto do nome de exibição e email. Resolver somente no servidor, sem expor emails por consulta anônima. Primeiro acesso via convite, sem senha seed | UX-003/A implementa adaptador com diretório privado no servidor; administração persistida/convite pendentes em ADM-002 |
| Unidade após autenticação | Exibir somente vínculos autorizados, exigir escolha antes do workspace, manter unidade/nome visíveis e impedir navegação que use dados da unidade anterior como atuais | Implementado/testado localmente em UX-003/A |
| Tela Início | Entrada principal com saudação e indicadores disponíveis, usando os prints como direção visual; não mostrar contagens fictícias de refeições ou fluxos ainda inexistentes | Implementado/testado localmente; parâmetros continuam separados |
| Explicar Configurações | Painel por unidade: modo de saída, margem de previsão, validade, prazo de amostras, inventário e referência de preço. Valores persistem com revisão/motivo/auditoria; nem todos os consumidores estão implementados | Explicação fornecida; acrescentar orientação na interface |
| Separação de filiais | Operações/saldos separados; produtos, categorias, medidas e fornecedores compartilhados | **Confirmado pela responsável em 12/11:** cadastros compartilhados; operações e estoque separados |
| Perfil e unidades permitidas | Cadastro administrativo com login/nome/email, perfil e filiais autorizadas; controles de backend/RLS e convite por email | ADM-001/ADM-002, sem escalada automática de privilégios |
| Saldos: pesquisa e CSV | Buscar produto/lote/local nos saldos da unidade e exportar os resultados filtrados, preservando precisão e protegendo fórmulas | Implementado/testado localmente em UX-003/A |
| Relatórios e filtros | Produtos/Recebimentos/Saldos: relatórios; filtros por data, produto e categoria em incremento posterior, conforme pedido | Planejado, não declarar concluído com um CSV simples |
| Produtos editar/excluir | Edição já existe para perfis autorizados. Exclusão física somente sem vínculos; oferecer inativação e explicar impedimento conforme RN-002 | Exclusão a implementar |
| Planilhas do cliente | Importação no final (RF-036): inventário de arquivos, mapa de colunas, validação/duplicidades, prévia e autorização de abertura de saldo | Adiada explicitamente; não importar dados reais agora |

## Limites de implementação

Não transformar o formulário simplificado de Movimentações dos prints em lançamento sem lote/local/origem/aprovação ou alteração direta de saldo. Os contratos de integridade, segregação e imutabilidade continuam obrigatórios. Não substituir o Style Guide mestre; registrar composição das novas telas e revisão visual.

Preservar o trabalho CAD-004 já testado em sua branch/PR #30. A confirmação do catálogo compartilhado em 12/11 removeu a pendência de escopo; sua migration/publicação exige a verificação própria após atualizar a branch com a main. [UX-003/A](../fundacao/UX-003-ACESSO-INICIO.md) registra acesso, navegação e consultas, seus testes e limites. Staging continua compartilhado conforme ADR-002; sem provisão permanente de outros ambientes ou limpeza do banco.

Login por nome de usuário exige implementação de identidade no backend/provedor; um campo cosmético que ainda envie o valor como email não atende ao pedido. Não publicar lookup anônimo de emails, nem usar user_metadata como fonte de autorização, senha no banco de domínio ou chave administrativa no runtime. A escolha da adaptação deve ser validada antes de migrar o acesso pessoal existente.
