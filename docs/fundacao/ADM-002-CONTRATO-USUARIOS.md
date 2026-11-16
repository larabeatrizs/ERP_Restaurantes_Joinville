# ADM-002/B — Contrato de cadastro administrativo

Data: 16/11/2026. Continuidade de [ADM-001](ADM-001-ADMINISTRACAO.md), [DOM-002](../decisoes/DOM-002-AJUSTES-12-11.md), [issue #19](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/19) e [issue #31](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/31). Fase B/C1 do [plano SDD](../planejamento/RECONSTRUCAO_SDD.md). Escopo deste incremento: formato de rascunho administrativo e validação pura compartilhada; não publica painel, endpoint, convite ou autorização administrativa.

Fontes: DRS seção 4.1/4.2, 7.1, RF-008 (M), RN-012/RN-022 e RNF-002/003/007/008/011; refinamento explícito da responsável em 12/11: login distinto do nome/email, convite de primeiro acesso, unidades autorizadas no cadastro. A classificação técnica deste recorte não altera a prioridade nem declara RF-008 atendido.

## Campos e compatibilidade

O contrato [admin-users.ts](../../packages/contracts/src/admin-users.ts) exporta `AdminUserSave` e `validateAdminUserSave`. Uma validação bem-sucedida produz uma cópia normalizada do rascunho; não comprova existência, unicidade, permissão, entrega de email ou conclusão de primeiro acesso.

| Campo | Contrato do rascunho | Origem / limite |
| --- | --- | --- |
| login | Normalizado pelo mesmo `normalizeLogin` do acesso atual; 3–40 caracteres ASCII, primeira letra/número, depois letras/números/ponto/hífen/sublinhado | Compatibilidade com UX-003/A; unicidade e resolução persistida ainda dependem do backend |
| nome | Nome de identificação, trim, obrigatório, até 200 caracteres, sem controles | Campo solicitado; limite técnico de transporte deste recorte, não regra institucional do DRS |
| email | Trim/lowercase, até 254 caracteres; sintaxe conservadora ASCII, local até 64 e domínio com ponto | Email único do RF-008. Não verifica posse nem envio; endereços internacionalizados/entre aspas precisam de revisão se necessários |
| perfil | Um dos oito códigos existentes na migration inicial | ADMIN, GESTOR_CENTRAL, GESTOR_UNIDADE, NUTRICIONISTA, ESTOQUISTA, COZINHA, ATENDIMENTO_SOCIAL, AUDITOR; código não concede capacidades |
| unidades | Uma ou mais strings bigint positivas, distintas e exatas | RN-012; sem curinga, sem IDs numéricos com risco de perda de precisão. Existência/status e escopo do operador são verificações futuras no servidor |
| status | ATIVO, INATIVO ou BLOQUEADO | RF-008; desejado no rascunho. Não autoriza ativação antes dos controles de identidade/primeiro acesso |
| revisao | Null para intenção de criação; bigint positivo em texto para intenção de alteração | Controle técnico otimista. No servidor, criação/edição serão operações explícitas: null não poderá converter edição em criação |
| motivo | 3–500 caracteres após trim, sem controles | Rastreabilidade RN-022; tamanho é contrato técnico, sem copiar email/senha para auditoria |

O objeto exige exatamente esses campos. Senha/hash, ID Auth, permissões livres, user_metadata e service_role são rejeitados como campos adicionais. Erros devolvem apenas campo/mensagem, sem ecoar dados submetidos. A lista de unidades é copiada para não alterar o rascunho original. Aprovação sintática de um perfil ADMIN **não é** autorização para atribuí-lo.

## Integração seguinte e fronteiras

1. **C2 — domínio/identidade:** especificar e implementar login único persistido, revisão e trilha administrativa, capacidades distintas de consulta/gestão/ciclo de vida e RLS/grants. Ensaiar com identidades sintéticas; preservar conta pessoal, senha, vínculos e permissões atuais. Não inserir endereços pessoais em migrations. O diretório privado atual continua atendendo o login até migração validada, sem lookup público.
2. **C3 — autorização antes da escrita:** autenticar ator, conferir capacidade atual, perfil permitido, unidades existentes/ativas e elegibilidade da alteração, revalidando dentro da transação. Concorrência, revogação com token emitido, autogestão e proteção do último administrador precisam de contrato/testes antes da escrita. Não inferir poderes operacionais do perfil ADMIN. Este incremento não fixa regras de promoção ou de abrangência central sem essa revisão.
3. **C3 — provisionamento Auth:** adaptador privilegiado isolado, operações fixas, autorização independente e atual, retomada/compensação. Nenhuma chave administrativa no Worker comum ou na View. Email/login já existente deve gerar conciliação, sem reset/promoção automáticos. Não gravar senha no domínio. Convite/recuperação respeitam envio geral de email adiado; validação sintática de email não remove essa pendência.
4. **C4 — painel:** aproveitar shell e Style Guide sem alterar HTML mestre. Especificar listagem com busca/status/ordenação/paginação/CSV e formulário com login, nome, email, perfil e unidades permitidas. Estados: carregando, vazio, negado, erro por campo, duplicidade, revisão em conflito, prévia/motivo, salvando e retorno recuperável. Mudança de status exige confirmação; histórico impede exclusão indevida. Não há tela nova publicada neste recorte.
5. **Integração D1:** exercitar jornada sintética e controles de acesso restrito antes de habilitar gestão privilegiada real. Subdomínio/rede privada, bloqueio de signup, política de senha no servidor, tentativas e inatividade continuam em ADM-001/SEC-001; não são supridos pelo DTO.

Decisões técnicas de tamanho/formato acima são explícitas e revisáveis; decisões institucionais não são inferidas. O código compartilhado pode ser reutilizado por View e Controller futuros, mas o banco/serviço precisam impor suas próprias invariantes. Não usar validação no navegador como barreira de segurança.

## Rastreabilidade e verificação

| Fonte | Artefato neste recorte | Evidência / limite |
| --- | --- | --- |
| RF-008 + DOM-002 | Campos separados, oito perfis e três estados | Testes de rascunho; não cria conta nem altera acesso |
| RN-012 / RNF-002 | Vínculos não vazios, únicos e bigint exato | Testes negativos de formato; isolamento efetivo depende da autorização/RLS futura |
| RN-022 / RNF-008 | Motivo/revisão explícitos | Não grava eventos de auditoria neste recorte |
| RNF-003 / RNF-007 | Objeto estrito, sem senha/metadados livres e erro sem dados submetidos | Testes de campos indevidos; não equivale a revisão completa de segurança |

Verificações locais executadas em 16/11/2026: seis testes novos de contrato aprovados; `npm run check` com saída zero (lint, tipos, 102 testes API aprovados, configurações 31/32 e estoque 50/57 no PGlite, três de legado e três de provisionamento, builds/dry-run). As oito omissões locais são de concorrência com duas conexões e dependem dos jobs de PostgreSQL nativo do CI. O build mantém o aviso existente de chunk maior que 500 kB. Navegador não foi repetido localmente, pois não houve alteração de View; o workflow do PR executa a suíte completa. CI e integração serão registrados na discussão vinculada ao commit, sem antecipar seus resultados.

Não há migration, alteração no banco conectado, chamada Auth Admin, deploy ou mudança de UI a validar neste recorte. Issues #19/#31 permanecem abertas; contratos preparados não encerram RF-008 nem demonstram painel funcional.
