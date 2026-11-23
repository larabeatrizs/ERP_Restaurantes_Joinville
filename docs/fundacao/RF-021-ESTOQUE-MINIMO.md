# RF-021 — Posição e estoque mínimo

[Issue #74](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/74). RF-021, RN-004, RN-012, RN-013, RNF-015 e destaque visual do CA-012.

Em **Saldo → Consultar estoque mínimo**, a prévia reúne os produtos ativos vinculados à unidade e soma suas posições por produto com precisão decimal. Produto sem posição tem saldo zero. O destaque vermelho com ícone e texto aparece quando o saldo está no mínimo ou abaixo dele. A coluna **Falta para o mínimo** apresenta a diferença positiva, com zero na igualdade ou acima. A tabela detalhada em Saldo continua oferecendo lote, local e validade.

A View obtém catálogo e posições pelas APIs de leitura autorizadas da unidade. São duas consultas, com a paginação de catálogo já usada nos relatórios. Falha em qualquer consulta impede a prévia. O navegador exercita soma decimal, igualdade e ausência de posições com transporte simulado. O envio de alertas do CA-012 pertence ao RF-029.
