# Mapa do Style Guide — FND-000

Fonte preservada: [HTML original](../wireframe/Style%20Guide%20Restaurante%20Popular.html). Evidência: template do contêiner, `script[type="__bundler/template"]`, lido estaticamente. Os documentos internos estão em um manifest base64/gzip. **Listar frames não equivale a renderizar as telas.**

| Referência | Frame ID | Dimensão declarada | Requisitos relacionados (proposta) |
| --- | --- | --- | --- |
| Style Guide | 3b2371d0-d9af-459c-b5b5-dcb140a46a3f | 1280 × 5200 | RNF-001/009/015; tokens e componentes a extrair |
| 1 · Login | df09813c-ac68-49a9-aa79-b23471db2ddc | 1280 × 760 | RF-008, RNF-003 |
| 2 · Painel | 56411896-dd1d-44de-bd7f-44a744059407 | 1280 × 900 | RF-028/029 |
| 3 · Produtos | 0c47ccad-8fcb-4953-9c9b-00d5fa3b5d17 | 1280 × 900 | RF-003, padrão CRUD seção 7.1 |
| 4 · Cadastro de produto | 7d60a865-2a2e-48ee-94e6-c4e50e5ceb4e | 1280 × 960 | RF-003, RN-003/013/019/026 |
| 5 · Entrada de materiais | 261da535-c329-4d27-832d-9ff64b449fd6 | 1280 × 1000 | RF-012, CA-005/020/026 |
| 6 · Aprovações | 5209cf3e-7c8e-4488-a03f-08bafd22e105 | 1280 × 900 | RF-013/015/016, RN-009/011; tipos exatos a conferir |
| 7 · Cardápio | 39145094-df52-4d63-b7b7-e3e0e767f3ee | 1280 × 960 | RF-009/010/031/032; cobertura interna a conferir |

## Cobertura que ainda não está comprovada

Para cada tela, inspecionar estados de carregamento, vazio, erro de rede, erro por campo, sucesso, sessão expirada, acesso negado e troca de unidade. No CRUD, conferir busca/filtros/paginação e confirmação de inativação/exclusão. Em entrada, verificar compra versus doação, recusa, validade, nota duplicada, rascunho/confirmada/estornada. Em aprovação, distinguir prévia versus conferência posterior, autoaprovação negada e contestação. Em cardápio, conferir calendário, refeições permitidas, rascunho/publicado/encerrado e versões.

Esses estados são **não comprovados nesta leitura**, não necessariamente ausentes do HTML. Não desenhar substitutos antes da inspeção.

Não há frames nomeados para unidades de medida/categorias/fornecedores, usuários/unidades, ficha técnica, importação, saída rápida em celular, perda, inventário, transferência, comensais, caixa, cotações, relatórios, auditoria ou amostras. Registrar a lacuna de cobertura visual; ausência de frame não retira o requisito do escopo.

## Critério da próxima revisão visual

Novo fluxo solicitado pela responsável: [painel de configurações CONFIG-001](../fundacao/CONFIG-001.md), especificado com reaproveitamento dos componentes do Style Guide. Não foi identificado frame Configurações no inventário; a especificação nova não altera o HTML mestre nem comprova comparação visual ou implementação.

Abrir o HTML original em navegador, registrar capturas por frame e resolução, extrair tokens sem alterar o arquivo, conferir foco/teclado/rótulos/contraste e documentar diferenças. Dimensões fixas de frames não comprovam responsividade em 768 px ou 360 px. A comparação com a implementação ocorrerá quando existir nova View. Evidências devem indicar data, arquivo/commit e limitações.
