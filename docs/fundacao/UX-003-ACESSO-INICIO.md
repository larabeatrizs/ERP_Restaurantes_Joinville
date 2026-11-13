# UX-003/A — Acesso por usuário e unidade, Início e saldos

Data: 12/11/2026. [Issue #31](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/31); decisão [DOM-002](../decisoes/DOM-002-AJUSTES-12-11.md); [PR #32](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/pull/32). Estado: **publicado e verificado no staging**. [Evidência sanitizada](../evidencias/ux-003/jornada-hospedada.json).

## Contrato do recorte

RF-008/RNF-003 (acesso), RN-012/RNF-002 (unidades), RF-017/021/022 e RNF-015 (consulta/valor/localização). A responsável revisou expressamente o login por email de RF-008 para nome de usuário, e a senha temporária para convite com definição de senha; o convite administrativo integral depende de ADM-001/ADM-002. Os prints autorizam a composição do Início, preservando fontes, cores e acessibilidade do Style Guide.

- Nome de login: 3–40 caracteres, letras ASCII, números, ponto, hífen ou sublinhado; começa por letra/número, sem distinguir caixa. Nome de exibição continua no perfil de domínio. Email permanece na identidade Auth para recuperação/avisos.
- `POST /api/auth/login` recebe somente login/senha. Controller valida o corpo; adaptador resolve o email privadamente e autentica no Supabase usando chave publicável. Devolve somente access/refresh token com `no-store`; erros de usuário desconhecido/senha incorreta são iguais. A View entrega a sessão ao SDK. Nenhum lookup público de email ou chave administrativa.
- Adaptação transitória do staging: `AUTH_LOGIN_DIRECTORY` é um Worker Secret com mapa login→email, sem senhas, criado fora do checkout. Inclui as quatro contas sintéticas existentes e alias `admin` para a identidade de acompanhamento. Não recria contas, não muda senhas nem amplia capacidades. O cadastro administrativo futuro substituirá esse adaptador por persistência/provisionamento auditados; editar o mapa não é gestão RF-008 integral. Não colocar esse segredo em variáveis VITE, logs, CI, issues ou evidências.
- Depois de autenticar, exigir escolha explícita entre vínculos ativos antes de buscar dados operacionais. Nome obtido por `GET /api/me` consulta apenas o próprio ator autenticado ativo e devolve somente `nome`. Workspace mostra nome e unidade; sair remove a seleção. A API/RLS continua controlando cada requisição, independentemente da seleção visual.
- Início é a entrada padrão: saudação, produtos ativos, lotes com saldo e valor dos lotes da unidade. Somente dados reais disponíveis; falha usa estado indisponível, sem zero fictício. Valor calculado com decimal exato, arredondando o total exibido a centavos. Sem indicadores/gráficos de módulos ainda ausentes.
- Configurações permanece separada: modo de saída, margem de previsão, prazo de amostras, alerta de validade, periodicidade de inventário, referência de preço e preferência de email. Persiste valores com revisão/motivo/auditoria; consumidores ainda não construídos não passam a existir por configurar um parâmetro.
- Saldo: pesquisa por produto/lote/local, sem distinguir acentos/caixa. CSV contém somente resultados da unidade selecionada e da pesquisa, precisão preservada, BOM/`;`/aspas e neutralização de fórmulas. Uma exportação de saldo não conclui todos os relatórios solicitados.

## Senha e email

View: mínimo de 8 caracteres, pelo menos uma letra maiúscula **ou** minúscula, um número e um símbolo. Mostrar/ocultar no login e definição, confirmação, recuperação por email e opção em Meu acesso. Senhas existentes continuam válidas, sem reset automático. Links inválidos não abrem o workspace; fragmento de convite/recovery é processado pelo SDK e direciona à definição. A marca visual de primeiro acesso não é uma autorização server-side.

Supabase Management API aceita apenas presets de caracteres. Em 12/11, a tentativa de combinar qualquer caixa+número+símbolo foi recusada. Preset configurado e relido: **mínimo 8, letra de qualquer caixa e número**; símbolo obrigatório está na View e **ainda não é imposto em chamadas diretas ao Auth**. Fechar essa lacuna com validação server-side compatível permanece em ADM-002; não exigir ambas as caixas contrariando o pedido. Site URL corrigida para staging e autocadastro público desabilitado; nenhuma senha existente alterada.

A responsável decidiu manter **envio geral de email pendente**. Sem SMTP próprio, não afirmar entrega de convites/reset a todos os destinatários. Interface e transporte testáveis não comprovam entrega de email. Não enviar emails de teste à conta pessoal. Bloqueio após cinco tentativas, inatividade e demais controles completos de RF-008 continuam na administração/hardening, além dos limites atuais do provedor.

## Verificação e continuidade

- `npm run check`: lint/tipos/build e testes locais. API: 75; testes de banco em PGlite não cobrem os cenários concorrentes omitidos sem PostgreSQL nativo. Nenhuma migration ou escrita de estoque nesta entrega.
- Navegador: 42 cenários locais no Edge, incluindo escolha obrigatória antes de dados, troca de unidade, nome, Início real/indisponível, responsividade 360/768/1280, pesquisa/CSV, mostrar senha, recuperação neutra/limites, Meu acesso e definição com senha de oito caracteres. Inclui consulta lenta de vínculos: não mostrar vazio nem indicadores antes da unidade. Dublês não comprovam Auth/RLS hospedados ou entrega de email.
- Verificador hospedado: `scripts/staging/verificar-acesso-unidade.mjs`, opt-in com estado privado fora do checkout; somente contas sintéticas existentes, leitura e CSV. Completou cinco cenários em Auth/API/UI reais. [Início desktop](../evidencias/ux-003/inicio-1280.png) e [saldos móvel](../evidencias/ux-003/saldos-360.png) contêm apenas contas/dados sintéticos. Não disparou email nem trocou senha.
- Verificadores ativos de categorias, vínculo, configurações e estoque ajustados à nova entrada. O antigo `verificar-acesso-admin.mjs` é histórico de bootstrap: depende de credencial removida e **não deve ser reexecutado para testar esta entrega**.

Decisão confirmada em 12/11: **cadastros compartilhados; estoque/operações separados por filial**. Isso remove a dúvida que mantinha CAD-004/PR #30 em draft; preservar seu recorte e atualizar com a main antes de continuar a verificação/publicação própria. Nenhuma migration de medidas foi aplicada por esta entrega de UX.

Pendências da issue #31: gestão administrativa de login/nome/email/perfil/filiais e convite, imposição integral da política de senha no servidor, exclusão elegível de produtos (edição já existe por permissão), relatórios de Produtos/Recebimentos/Saldos e filtros posteriores. RF-036/importação fica no final com prévia/validação, conforme pedido; skeleton continua futuro na issue #24. SMTP geral explicitamente adiado. AMB-001 congelada; sem novo ambiente permanente ou reset.

## Publicação e pós-condições

Runtime `b6bd081fb81c9df443a57bc97b5b4079b988a5be`, Cloudflare `c3362da7-252b-469b-a460-e66d7f9cb61f`, [CI 43295104085](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/actions/runs/43295104085) com os quatro jobs concluídos em sucesso (inclui PostgreSQL nativo e navegador). A comparação visual identificou um vazio prematuro durante a consulta dos vínculos; esse runtime aguarda o carregamento antes de montar o resumo. O verificador respeita o 404 de unidade não autorizada e obtém nova sessão após Sair global para conferir persistência.

Consulta readonly posterior confirmou: cinco usuários de domínio, oito produtos, dez vínculos, quatro categorias, seis recebimentos/lotes/movimentos, 34 eventos de estoque, 20 tabelas erp com RLS, seis migrations e três capacidades ADMIN. Nenhuma migration deste recorte; saldo comparado antes/depois em nova sessão. A conta de acompanhamento usa login **`admin` com a senha já definida**, sem nova credencial, reset ou ampliação de privilégios. Acesso pessoal não foi usado como fixture. Confirmação de deploy não equivale a aceite institucional ou liberação de produção.
