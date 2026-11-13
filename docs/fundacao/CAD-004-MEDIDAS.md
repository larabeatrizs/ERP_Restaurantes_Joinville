# CAD-004 — Unidades de medida

**Estado em 11/11/2026:** especificação do próximo recorte D1, [issue #29](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/29), após CAD-003. Ainda sem implantação deste recorte.

**Continuidade em 13/11/2026:** responsável confirmou catálogo compartilhado em [DOM-002](../decisoes/DOM-002-AJUSTES-12-11.md). PR #32/UX-003 integrado; branch deste recorte atualizada com a main, preservando login por usuário, seleção de unidade, Início e pesquisa/CSV de saldos. Nova verificação integrada em andamento; migration e publicação de medidas ainda não aplicadas neste ponto do registro.

Fontes: DRS RF-001/seção 7.1, RN-001/002/003/012/019/022, RNF-002/003/008/009/010/011/015; [dicionário](../dados/DICIONARIO.md) e [plano](../planejamento/RECONSTRUCAO_SDD.md). Reusar shell/componentes do Style Guide sem alterar o HTML mestre; não há frame de medida nomeado no inventário visual.

## Contrato

- Cadastro global: sigla obrigatória até 12 caracteres, descrição obrigatória até 200, grandeza MASSA/VOLUME/CONTAGEM e fator_base string decimal positivo com até 12 inteiros/6 decimais ou null. Limites técnicos já usados pelo schema. Descrição única normalizada ignorando caixa/acentos/espaços; não acrescentar unicidade de sigla ausente do DRS/modelo.
- Status inicial ATIVO; edição comum não recebe status. Revisão bigint string por migration aditiva. PRODUTO_LER consulta; MEDIDA_EDITAR inclui/edita; MEDIDA_CICLO_VIDA ativa/inativa/exclui. ADMIN de acompanhamento permanece intocado. Fixture separada habilita somente perfis sintéticos já conferidos, com estoquista I sem X e gestor I/X.
- Inativos não aparecem em novas seleções. Qualquer produto vinculado, inclusive inativo ou de outra unidade, impede exclusão. Confirmar status/exclusão e explicar bloqueio sem revelar dados/unidades alheios.
- GET/POST `/api/unidades/{id}/medidas`, PATCH/DELETE `/{medidaId}`, POST `/{medidaId}/status`, GET `/exportar`. Query q/status/ordem/offset estrita, busca normalizada em descrição ou sigla, ordem por descrição/ID, páginas de 50. DTO inclui campos editáveis, id/revisao/status/pode_excluir; listagem inclui total/capacidades. PATCH acrescenta revisão; status aceita revisão/status, DELETE só revisão.
- CSV UTF-8/BOM com os mesmos filtros/ordem e todos resultados até 10000; acima recusar com 413 sem truncar. Proteger fórmulas, aspas e quebras de linha. Não exportar auditoria ou identidade Auth.
- Corpo JSON estrito de até 64 KiB; sem sessão 401, unidade indisponível 404, capacidade negada 403, duplicidade/vínculo 409, revisão antiga 412, campos inválidos 422. Mensagens por campo sanitizadas, sem SQL interno.

## Integração e limites de RN-019

MeasurePanel/MeasureApi → Controller/Service/Repository próprios → RPC estreita com wrapper invoker e executor privado restrito já existente. Sem API genérica de tabelas, DML direto, chave administrativa no runtime ou imports do legado. Escrita e auditoria antes/depois atômicas; locks compatíveis com os SHARE já usados ao cadastrar/vincular produto; revalidar autorização após espera e depois de escrita que possa aguardar índice único.

A edição de metadados segue o CRUD do DRS e é auditada; não troca o ID da unidade-base do produto, não reinterpreta nem recalcula quantidade histórica. RN-019 permite converter apenas na mesma grandeza; null não fornece fator de conversão. Este recorte cadastra os metadados, **sem introduzir conversão automática de lançamentos**: o recebimento atual recebe quantidade na unidade-base do produto. Produto_conversao, snapshot do fator no documento e arredondamento das futuras importações/apresentações devem ser especificados no fluxo consumidor antes de integrá-lo; não presumir que grandeza/fator bastam para converter uma embalagem específica. O cadastro não comprova esse motor implementado.

## Verificação e entrega

Banco: zero/negativo/null/precisão e JSON estritos, unicidade normalizada, revisão, status/seleção, vínculo global/exclusão, rollback de auditoria, DML negado e duas conexões para revogação/concorrência. Verificar que produtos, lotes/movimentos/saldos e permissões pessoais não mudam. API/SDK: Auth antes da RPC, DTO sem propriedades internas, IDs/fatores textuais e CSV seguro. UI: busca/edição/reabertura, validação por campo/412 preservando entrada, consulta sem escrita, I distinto de X, confirmações, navegação/descarte, 360/768/1280 e CSV.

Após CI aprovado: preflight/histórico/grants/advisor, aplicar somente a migration nova, publicar no mesmo Worker e executar jornada sintética real API/UI/nova sessão. Guardar capturas/resultados sanitizados, sem senha/email/UUID Auth/token. Conta pessoal não é fixture. Registrar testes executados e limites reais antes de integrar PR/main/branch ativa.

Retorno por desativação das novas rotas/RPC, preservando medidas/auditoria; sem DROP/reset. AMB-001 permanece congelada; skeleton em UX-002 para depois. RF-004/fornecedores é o próximo recorte. Não encerrar issues ou declarar aceite institucional por inferência.
