# Estimativa inicial — 09/11/2026

Solicitada pela responsável durante INT-003. Faixas de planejamento a partir do estado atual, não prazo contratado ou cronograma aprovado. Não há velocidade medida de entrega dos módulos de negócio.

| Marco | Faixa inicial | Alcance |
| --- | --- | --- |
| Entrega 1 pronta para iniciar validação/piloto RP1 | 6–10 semanas | Cadastros/carga inicial, entrada/saída/aprovação/perdas, saldo/lotes, relatórios/alertas básicos, controles de acesso/auditoria e recuperação aplicáveis à D1 |
| Entrega 1 com piloto acompanhado e ajustes | 8–12 semanas | Inclui duas semanas em paralelo às planilhas, conforme DRS 15.4, quando autorizadas as condições operacionais |
| Três entregas funcionais e preparação final para operação | 16–24 semanas no total | D2 planejamento/rastreabilidade e D3 gestão/atendimento, integração, validação, treinamento e preparação operacional final |

Premissas: uma pessoa técnica com dedicação próxima de integral, apoiada por IA; responsável/equipe validando em poucos dias; escopo do DRS estável; acessos disponíveis; ausência de bloqueios externos prolongados. IA auxilia a implementação, mas não elimina revisão, integração, teste ou aceite. Com dedicação parcial ou demora em decisões, o calendário deve ser ampliado.

Situação atual: identidade/configurações e primeira jornada integrada real demonstradas, com Worker/View locais conectados ao Supabase hospedado. Ainda não há aplicação publicada na Cloudflare nem jornadas de produtos/entradas/saídas/estoque completas. Configurações funcionando não equivale a saldo operacional confiável. O banco integral e os demais módulos continuam em construção.

O piloto indicado não antecipa liberação de produção: durante a construção o staging é compartilhado, dados reais exigem os gates de segurança/privacidade/recuperação e autorização, e AMB-001 permanece congelada até o encerramento funcional. Separação dos ambientes, limpeza planejada, backup/restauração, responsáveis e aceite final são condições de entrada oficial em operação; não estão dispensadas pela estimativa.

Base: [DRS 15.2 e 15.4](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md), [plano SDD](RECONSTRUCAO_SDD.md) e [ADR-002](../decisoes/ADR-002-STAGING-COMPARTILHADO.md). D1/D2/D3 mantêm conteúdo e critérios do DRS; a tabela não altera prioridades ou transfere requisitos por inferência. Datas de aceite/contratação/privacidade externas ainda não estão garantidas.

Recalibrar após duas jornadas de negócio completas, por exemplo cadastro de produto e entrada/saída com lote, usando esforço efetivo, retrabalho e tempo de validação observados. A [INT-003](../fundacao/INT-003-JORNADA-REAL.md) mostra por que integração real pode revelar diferenças de permissão que os laboratórios iniciais não reproduziam.
