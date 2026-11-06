# Arquitetura MVC em monorepo — ERP Restaurantes Populares de Joinville

**Estado:** arquitetura deliberada pela responsável do projeto em 05/11/2026; implantação, layout físico e componentes ainda não foram validados por testes. Complementa o [documento principal](../PROJETO.md). Não substitui o [DRS v1.3](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md) nem o [Style Guide](../wireframe/Style%20Guide%20Restaurante%20Popular.html).

## 1. Contexto e decisões

- **Monorepo:** um único repositório Git, pipelines coordenados, dependências explícitas e módulos isolados.
- **MVC:** Model–View–Controller para o sistema web, com camadas de Serviço (casos de uso) e Repositório (persistência) internas ao Model/Backend, evitando controllers com regras de negócio ou SQL.
- **Execução:** frontend React/Vite e API Cloudflare Workers; PostgreSQL e Auth gerenciados por Supabase. **Nenhum serviço VPS/Docker é requisito de produção.**
- **Estratégia de reconstrução:** `legacy/` é acervo histórico; os novos pacotes e todos os schemas serão implementados do zero a partir dos requisitos, sem importar ou estender o protótipo. Ver [plano SDD](../planejamento/RECONSTRUCAO_SDD.md).
- **Fontes de produto imutáveis por padrão:** DRS e Style Guide; mudanças de comportamento ou telas dependem de decisão e aprovação explícitas.

## 2. Diagrama-alvo

~~~text
                Monorepo GitHub
      ┌──────────────────────────────────────┐
      │ apps/web  (React + Vite)             │
      │   VIEW: telas, componentes, estados  │
      │   ↓ HTTPS com identidade do usuário  │
      │ apps/api  (Cloudflare Worker)        │
      │   CONTROLLER: rotas/validação HTTP   │
      │   ↓                                  │
      │   SERVICE: casos de uso/autorizações │
      │   ↓                                  │
      │   MODEL: entidades/regras/invariantes│
      │   ↓                                  │
      │   REPOSITORY: interface de dados     │
      │   ↓ HTTPS/RPC conforme decisão      │
      │ Supabase PostgreSQL                  │
      │   tabelas, constraints, RLS, funções │
      │                                      │
      │ packages/*: contratos e utilitários  │
      │ supabase/migrations: esquema version.│
      └──────────────────────────────────────┘

      Supabase Auth  ← autenticação do usuário
      GitHub Actions → testes e deployments
      Cloudflare     → hospedagem web e API
~~~

O browser não acessa credenciais privilegiadas. Um cliente Supabase com chave publicável pode autenticar, mas a presença dessa chave não constitui autorização: o JWT, as políticas RLS e permissões por unidade devem impedir operações indevidas. Integrações Supabase via cliente HTTPS/RPC ou conexão direta serão comparadas antes da fundação; não existe decisão de driver/ORM nesta etapa.

## 3. Estrutura alvo (proposta, ainda não migrada)

~~~text
ERP_Restaurantes_Joinville/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── views/          # páginas associadas ao Style Guide
│   │   │   ├── components/     # elementos reutilizáveis da View
│   │   │   ├── routes/         # navegação e guards de UX (não segurança)
│   │   │   ├── hooks/
│   │   │   └── lib/            # cliente HTTP, auth, formatadores
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── controllers/    # validação de entrada e formato HTTP
│       │   ├── routes/         # registro de endpoints
│       │   ├── services/       # orquestração dos casos de uso
│       │   ├── models/         # entidades e invariantes
│       │   ├── repositories/   # contratos/adaptadores Supabase
│       │   ├── middlewares/    # auth, autorização, tratamento de erros
│       │   └── index.ts       # entrypoint Worker (proposto)
│       └── package.json
├── packages/
│   └── contracts/              # tipos públicos e esquemas compartilhados
├── supabase/
│   ├── migrations/             # histórico de schema versionado
│   └── seed.sql                # somente dados sintéticos, quando criado
├── tests/
│   └── e2e/
├── docs/
│   ├── PROJETO.md
│   ├── arquitetura/
│   ├── requisitos/
│   └── wireframe/
├── .github/workflows/
└── package.json               # workspaces, após decisão de toolchain
~~~

**Estado após o arquivamento:** `legacy/frontend/`, `legacy/backend/`, `legacy/database/init.sql`, `legacy/escr/` e `legacy/docker-compose.yml` contêm o protótipo anterior. A estrutura `apps/*` ainda não existe e será criada **como implementação nova**, sem migrar `escr/App.jsx` nem importar módulos legados. O banco atual requer inventário e decisão de migração antes de qualquer alteração. O histórico do Git preserva a origem dos arquivos.

## 4. Responsabilidade das camadas

| Camada | Faz | Não faz |
| --- | --- | --- |
| View (`apps/web`) | Renderiza telas e estados aprovados, acessibilidade, formulários, mensagens, chama API com identidade | Executa SQL, decide acesso efetivo, guarda secrets administrativos |
| Controller (`apps/api`) | Recebe requests, valida formato, autentica, chama serviço, padroniza respostas/status | Implementa transações ou regras de estoque |
| Service (`apps/api`) | Orquestra operações (entrada, aprovação, FEFO/PVPS, inventário), checa permissões de caso de uso | Depende de componentes React ou de detalhes HTTP |
| Model (`apps/api`) | Entidades, invariantes, cálculos e estados aprovados no DRS | Contém UI ou credenciais |
| Repository (`apps/api`) | Persiste/consulta dados com contratos explícitos | Inventa regra de negócio ou contorna RLS |
| PostgreSQL/Supabase | FK/check/unique, RLS, atomicidade, auditoria e procedimentos transacionais necessários | Confia em dados vindos do navegador sem validação |

**Contrato de dependências:** View → API HTTP; Controller → Service → Model/Repository. Persistência e autorização no banco reforçam os limites dos serviços; contratos de `packages/contracts` não devem importar bibliotecas privadas de Worker ou chaves do Supabase.

## 5. Exemplo conceitual de fluxo de estoque

~~~text
View "Saída diária"
  → POST /api/saidas (Controller)
    → autenticar / validar unidade e perfil
    → registrar saída (Service)
      → aplicar regras do DRS (Model)
      → transação atômica no banco (Repository/RPC)
         → reservar/baixa conforme aprovação RN-011
         → bloquear saldo negativo RN-008
         → registrar auditoria RN-022
    → resposta HTTP
  → View mostra resultado/erro conforme contrato aprovado
~~~

O fluxo acima é uma **intenção arquitetural**, não afirma que `POST /api/saidas` existe ou que a reserva/baixa já foi implementada. A política exata da requisição rápida, aprovação posterior e segregação segue as revisões do DRS v1.3; o desenho transacional será especificado e testado antes do código de negócio.

## 6. Decisões complementares ainda necessárias

1. **Auth e autorização:** vínculo `auth.users` ↔ perfil ↔ unidade, política de convite/inativação, isolamento de dados e cenário de administrador.
2. **Schemas e migrations novos:** recriar os objetos necessários a partir do DRS em um banco de teste isolado; reconciliar tabelas existentes sem executar `legacy/database/init.sql` cegamente sobre o projeto conectado ou derrubar dados sem autorização.
3. **Operações atômicas:** escolher HTTPS/RPC Supabase versus conexão direta gerenciada para estoque, com ensaio de concorrência e justificativa de runtime/custo.
4. **Toolchain do monorepo:** gerenciador de pacotes (npm workspaces proposto), linguagem TypeScript em novas camadas, versões, test runner e lockfile único.
5. **Cloudflare:** produto de hospedagem da View e deploy da API, URLs e rotas, compatibilidade real do Express atual e CORS.
6. **Ambientes e operação:** staging, produção, secrets, CI/CD, RPO/RTO/backup, região de dados e responsabilização institucional.
7. **UI:** mapear telas e estados do Style Guide e seus critérios visuais, sem redesign automático.

## 7. Verificações e condições de aceite da arquitetura

- Mapa `RF/RN/RNF/CA → View/Controller/Service/Model/Repository/SQL → teste` disponível e revisado antes das issues funcionais.
- Builds `web` e `api` reproduzíveis e independentes; bloqueio de dependências cruzadas indevidas.
- Testes negativos de papel/unidade/RLS e de impossibilidade de aprovar próprio lançamento.
- Testes de concorrência em estoque e auditoria sem acesso privilegiado no browser.
- Capturas visuais comparadas com o Style Guide e exceções documentadas.
- CI e deploy de staging vinculados ao mesmo commit; smoke tests, logs e recuperação comprovados.
- Custos, privacidade e liberação institucional aprovados antes da produção.

**FND_READY = não atendido.** Esta documentação não aprova recursos cobráveis, execução de migrations, deploy, acesso aos dados nem alterações de UI.

## 8. Referências técnicas para conferir na fundação

- [Cloudflare — React](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare — Express em Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)
- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — ambientes e migrações](https://supabase.com/docs/guides/deployment/managing-environments)
- [DRS](../requisitos/Requisitos_Software_Restaurantes_Populares_Joinville.md)
- [Documento principal](../PROJETO.md)
