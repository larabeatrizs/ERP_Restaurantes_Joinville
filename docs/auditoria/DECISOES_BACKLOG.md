# Decisões e recortes derivados — FND-000

Os responsáveis abaixo são **papéis propostos**, não nomeações ou aprovações já recebidas. Lara, como responsável do projeto, confirma quem assume cada papel. O registro de uma pendência não exige resolvê-la integralmente nesta auditoria; exige dono, impacto e próximo passo verificáveis.

| Código | Decisão aberta | Papel responsável proposto | Evidência/condição para decidir |
| --- | --- | --- | --- |
| ARQ-001 | Toolchain, linguagem, runtime e produto de hospedagem frontend | Liderança técnica, confirmação da responsável do projeto | Ensaio local de build web/API e contrato de dependências; não reutilizar legado |
| DATA-001 | Na fase B, refazer do zero o modelo conceitual, lógico e físico a partir do DRS; divisões por unidade e acesso transacional | Responsável por dados + liderança técnica | Matriz RF/RN/RNF/CA, inventário comparativo e teste planejado de concorrência; SQL/schema anterior apenas históricos; implementação na C2 |
| SEC-001 | Vínculo identidade/perfil/unidade, provisionamento e revogação | Responsável de segurança + responsável do projeto | Matriz da seção 4 conferida contra PDF; cenários permitidos/negados e sessão |
| OPS-001 | Staging, custos, região, backup, retenção e restauração | Responsável do projeto/orçamento + operação; encarregado municipal para privacidade | Proposta com custos e limites; compatibilidade com RPO 24h/RTO 4h e retenção do DRS; aceite pertinente antes de dados reais |
| UX-001 | Estados e jornadas sem referência explícita | Responsável de UX + nutricionista/gestor validador | Inspeção dos frames, inventário de lacunas e proposta pontual sem mudar Style Guide |
| MET-001 | Ratificação de SDD como prática principal | Responsável do projeto | Decisão registrada antes da primeira issue funcional; TDD/BDD complementares |
| DOM-001 | Conflitos de transferência, doação, saída e alocação de RF-037 | Responsável do produto + nutricionista/gestor | Resolver discrepâncias 1–5 do relatório, preservando histórico e IDs |

## Recortes preparados para futuras issues SDD

Cada recorte deve usar o template de issue para acrescentar cenários, contratos e plano de testes específicos. Estas linhas não representam issues já abertas e não substituem o backlog GitHub.

| Recorte/fase | Depende de | Escopo e critério observável de saída |
| --- | --- | --- |
| SPEC-001 / B | FND-000, decisões acima pertinentes | Consolidar matriz e contratos da fundação, estados/permissões e cenários. Sem ambiguidades críticas para o recorte que será implementado |
| MONO-001 / C1 | SPEC-001, ARQ-001 | apps/web, apps/api, packages/contracts, versões/lockfile, env de exemplo e comandos. Instalação limpa e builds reproduzíveis sem imports de legacy |
| CICD-001 / C1 | MONO-001 | Checks de PR para lint/tipos/testes/build e proteção de main conforme capacidade da conta. Demonstrar sucesso e falha bloqueante; deploy somente no escopo autorizado |
| DB-001 / C2 | DATA-001, SEC-001, SPEC-001, ambiente isolado definido | Migrations novas e seeds sintéticos; banco vazio reconstruído e sem drift. Nada de reset do projeto conectado |
| SEC-002 / C2 | DB-001, SEC-001 | Auth, perfis/unidades, grants e policies. Testes negam acesso entre unidades, autoaprovação e usuário inativo, conforme contrato aprovado |
| API-001 / C3 | MONO-001, contratos B; integração depende DB-001/SEC-002 | Estrutura MVC, validação e erros; repositórios e transações. Testes de serviço, integração e concorrência necessários ao primeiro fluxo |
| WEB-001 / C4 | MONO-001, UX-001, contratos B | Shell/login/componentes/telas do recorte extraídos da referência; estados acessíveis e comparação visual. Integração real depende API/Auth |
| E2E-001 / integração C | CICD-001, API-001, WEB-001, SEC-002, staging autorizado | Login → operação autorizada persistida → consulta → tentativa negada → auditoria; resultados vinculados ao commit |
| OPS-002 / gate C | OPS-001, staging, CI | Demonstrar logs/alertas e restauração de backup em ambiente isolado; registrar tempo e recuperação observados |

Ordem operacional: auditoria → decisões/especificação B → workspace/CI → dados/segurança/API/View conforme contratos estáveis → integração e recuperação. Não é preciso terminar todos os módulos para validar a fundação. As entregas funcionais seguem a seção 15.2 do DRS, com RF-037 e conflitos registrados para decisão.
