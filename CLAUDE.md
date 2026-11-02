# Marinho Gestão

Sistema de gestão da Marinho Locações: locadora familiar de equipamentos para obra em Cajueiro (AL). Monorepo com Bun workspaces, Turborepo e Biome.

## Comandos

```bash
bun install
bun run dev:web        # front em http://localhost:3001, com o mock por padrão
bun run check-types    # tipos de todos os pacotes
bun run check          # Biome, com correção automática
bun run test           # Vitest: domain, api (unidade) e cenários contra o mock
bun run test:server    # cenários, uploads e tarefas contra o Postgres real (sobe o postgres-test na 5433)
bun run e2e            # Playwright: fluxos, qualidade e regressão visual contra o backend real
bun run e2e:mock       # só os fluxos, com o mock e sem servidor
bun run e2e:visual     # captura das 40 telas e relatório lado a lado com o design
bun run e2e:update     # linhas de base da regressão visual, dentro da imagem do Playwright (Docker)
bun run jobs           # agendador das tarefas (expirar orçamentos, limpar uploads, apagar documentos, backup)
bun run job <nome>     # roda uma tarefa uma vez: expire-quotes, cleanup-uploads, purge-customer-documents, backup-database
VITE_DATA_SOURCE=http VITE_SERVER_URL=https://api.marinholocacoes.com bun run build   # o build de produção do web recusa o mock
bun run db:generate    # gera enums.prisma a partir do domain e o cliente Prisma
```

## Arquitetura

```
packages/
  contract/    contrato oRPC + schemas Zod: fonte da verdade da API
  domain/      regras de negócio puras, sem I/O; quem chama passa o `now`
  read-model/  registros planos + projeções que montam as respostas; seed (catálogo e demo)
  scenarios/   defineScenarios(harness): fluxos do contrato, rodam no mock e no servidor
  db/          schema Prisma por módulo, migrations, seeds, createPrismaClient
  auth/        Better Auth (username + admin)
  api/         implement(contract): routers, services, storage (R2 e memória)
  ui/          primitivos shadcn (Base UI) + tokens da marca
apps/server/   Hono: /api/auth/*, /rpc, /health, /api-reference (só fora de produção)
apps/e2e/      Playwright: fluxos, qualidade, captura visual e regressão; scripts do MinIO e do relatório
apps/web/src/
  data/
    client.ts   escolhe a fonte e exporta `client` e `orpc`
    http/       link HTTP real
    mock/       backend simulado: implement(contract) + store + seed
    auth/       AuthGateway: mock ou better-auth
    uploads/    UploadService: presigned URL (real) ou IndexedDB (mock)
  features/     telas, componentes e formulários por módulo
  components/   shell, StatusChip, Money, campos de formulário
  routes/       rotas finas: só validam a URL e montam a tela
```

Regras que valem sempre:

- Telas usam só `orpc.*`, `authGateway` e `uploadService`. Importar `data/mock`, `data/http` ou `better-auth` fora de `src/data` é erro de lint.
- Regra de negócio vai em `packages/domain`, com teste. Montagem de resposta (views, agenda, painel, caixa) vai em `packages/read-model`. O mock e o backend usam as mesmas funções.
- Cada mutation declara o que invalida em `data/invalidation.ts`.
- `CONFLICT`, `INVALID_TRANSITION` e `PRECONDITION_FAILED` são tratados na própria tela. O resto vira toast global em `lib/query-client.ts`.
- Papéis e permissões ficam em `packages/domain/src/permissions.ts`. Menu, rotas, mock e servidor (`requirePermission`) usam a mesma tabela.
- Login é por nome de usuário. O e-mail interno (`<usuario>@marinho.local`) existe só no modelo: não entra no contrato nem na interface.
- Lançamentos nunca são editados nem apagados: erro se corrige com `ledger.reverse`. Totais passam por `ledgerTotals` e `signedAmountCents`, para o estorno abater o lançamento original.
- Toda mutation de dinheiro recebe `idempotencyKey`. No front, use `useIdempotencyKey()`, uma chave por formulário. No mock e no servidor, envolva o trabalho em `once()`.

## Trocar mock por backend real

`VITE_DATA_SOURCE` é `mock` (padrão) ou `http`. Em `http`, `VITE_SERVER_URL` é obrigatória.

```bash
VITE_DATA_SOURCE=http VITE_SERVER_URL=http://localhost:3000 bun run dev:web
```

Nenhuma tela muda. O valor é resolvido em tempo de build (`define` em `vite.config.ts`), então o mock não entra no bundle em modo `http`. O `vite build` de produção falha se `VITE_DATA_SOURCE` não for `http`; o `check-types` do web usa `--mode check`, que aceita o mock. Como subir o servidor está na seção "Backend".

## Adicionar um procedimento

1. **Contrato:** declare input, output e erros em `packages/contract/src/modules/<modulo>.ts`.
2. **Domain:** coloque a regra nova em `packages/domain`, com teste.
3. **Resposta:** se a saída for montada a partir dos dados, escreva a projeção em `packages/read-model`.
4. **Mock:** implemente em `apps/web/src/data/mock/handlers/<modulo>.ts`, com `requirePermission`. O TypeScript acusa se o mock sair do contrato.
5. **Servidor:** service em `packages/api/src/services/<modulo>.ts` e router em `routers/<modulo>.ts`, com `.use(requirePermission(...))`. Se precisar de coluna nova, schema em `packages/db/prisma/schema/<modulo>.prisma` e `prisma migrate dev`.
6. **Invalidação:** se for mutation, liste os módulos afetados em `data/invalidation.ts`.
7. **Tela:** use `orpc.<modulo>.<procedimento>.queryOptions()` ou `.mutationOptions()`.
8. **Teste:** cubra o fluxo em `packages/scenarios/src/index.ts`. Ele roda no mock (`bun run test`) e no servidor (`bun run test:server`). Se o procedimento tiver permissão restrita, inclua-o em `restrictedCalls()`.

## Convenções

- Código e identificadores em inglês. Interface e rotas em pt-BR.
- Dinheiro sempre em centavos inteiros (`amountCents`). Na tela, use `money()` ou `<Money />`.
- A caução fica na conta `DEPOSIT` e nunca entra no CSV do contador. Só a parte retida gera entrada em `CASH`.
- Datas em ISO 8601 com fuso. O fuso de negócio é `America/Maceio`; formate com `lib/format.ts`.
- IDs internos são `string`. Códigos de negócio são campos próprios: `LOC-0001`, `MAR-001`, `OS-001`.
- Valor que o negócio não definiu é `null` no schema e aparece como "a definir" (`<ToDefine />` ou `<Money />`). Não invente valores.
- Sem `any`. Tipos vêm do contrato (`z.infer`). Formulários usam TanStack Form com os schemas Zod do contrato.
- Filtros, abas e busca ficam na URL, validados com Zod.
- Tipografia da marca: `type-title`, `type-condensed` e `type-brand`. Não use prefixo `text-` em utilitários novos: o `tailwind-merge` os confunde com cor de texto e descarta classes.
- Status nunca depende só da cor: use `<StatusChip />`, que sempre mostra o texto.
- Alvos de toque com pelo menos 44 px. Contraste mínimo de 4,5:1. `#B4532A` em texto pequeno só sobre creme, nunca sobre areia.

## Backend

### Subir localmente

```bash
bun run db:start                  # Postgres 18 (POSTGRES_PORT=5434 bun run db:start se a 5432 estiver ocupada)
bun run db:migrate                # aplica as migrations no banco de apps/server/.env
bun run db:seed:demo              # dados de exemplo do mock, relativos a hoje; usuários com senha marinho123
bun run storage:start             # MinIO (Silo) na 9000, com os buckets marinho-dev e CORS
bun run dev:server                # API em http://localhost:3000
VITE_DATA_SOURCE=http VITE_SERVER_URL=http://localhost:3000 bun run dev:web
```

`apps/server/.env` precisa de `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ caracteres), `BETTER_AUTH_URL`, `CORS_ORIGIN` e `R2_*` (veja `docs/operacao/r2.md`). Para usar o MinIO local: `R2_ENDPOINT=http://localhost:9000`, `R2_ACCOUNT_ID=minio`, `R2_ACCESS_KEY_ID=minioadmin`, `R2_SECRET_ACCESS_KEY=minioadmin-secret` e `R2_BUCKET=marinho-dev`. A chave secreta não pode ser igual ao Access Key ID: ele vai em toda URL assinada e o varlock bloquearia a resposta. Para produção, `db:seed` carrega o catálogo real, as configurações e os três usuários com as senhas de `SEED_PASSWORD_LUCAS`, `SEED_PASSWORD_ATENDIMENTO` e `SEED_PASSWORD_EQUIPAMENTOS`, passadas no comando. Rodar de novo não duplica nada. `db:seed:demo` apaga os dados e recusa `NODE_ENV=production`.

### Camadas

- **Router** (`packages/api/src/routers`): valida pelo contrato, aplica `requirePermission` e chama o service. Toda chamada exige sessão e, antes, expira os orçamentos com sinal vencido.
- **Service** (`packages/api/src/services`): recebe `{ db, storage, clock, actor }`. Abre a transação quando precisa, aplica `domain`, usa o Prisma direto e grava `Event` na mesma transação. Sem repository.
- **Leitura**: `loadSnapshot(db, escopo)` carrega só o recorte necessário e monta os registros de `read-model`; a resposta sai das mesmas projeções do mock. Pagamentos e caução em mãos são derivados do caixa, nunca colunas.
- **Relógio**: use `deps.clock()`, nunca `new Date()` direto num service. Os testes fixam a data.

### Regras que o banco garante junto com os services

- Reserva de unidade: `EXCLUDE` em `rental_item` (`unit_id`, período até `blocked_until` = devolução + folga) quando `holds_calendar`. O `23P01` vira `CONFLICT` (`isExclusionViolation`). Mude `holds_calendar` a cada mudança de status (`syncCalendar`).
- Lote (andaime, carrocinha): `lockLots` (`FOR UPDATE`, em ordem) antes de conferir a quantidade.
- Códigos `LOC`, `OS` e `MAR`: `nextCodeFromCounter` dentro da transação que cria o registro.
- `ledger_entry` tem trigger que recusa `UPDATE` e `DELETE`. `reversal_of_id` é único.
- Idempotência: `once(db, actor, procedimento, chave, run)` insere a chave primeiro; repetição devolve a resposta guardada.
- Arquivos: mutations com `fileKey` passam por `requireUsableFile` (upload concluído, do próprio usuário, com a finalidade certa).

### Testes do servidor

`bun run test:server` sobe o `postgres-test` (porta 5433, `tmpfs`), aplica as migrations e roda `packages/api/src/*.server.test.ts` e `apps/server/src/**/*.server.test.ts` (tarefas). A seed de demonstração é recarregada antes de cada teste. Outra URL: `TEST_DATABASE_URL`.

Enums do Prisma vêm de `packages/domain/src/enums.ts`: depois de mudar um enum, rode `bun run db:generate` e crie a migration. Um teste acusa se `enums.prisma` sair de sincronia.

### Tarefas agendadas

`apps/server/src/jobs`: processo separado (`dist/jobs.mjs` na imagem) com `croner` no fuso de Maceió. A lógica fica nos services de `packages/api` (`expireStaleQuotes`, `deleteStalePendingUploads`, `purgeExpiredCustomerDocuments`) e a regra de prazo em `packages/domain/src/retention.ts`. Cada tarefa é idempotente, loga início e fim em JSON e grava `Event` (entidade `Job`, ator Sistema) quando muda algo; o backup grava sempre.

## Testes E2E e visuais

`apps/e2e` (Playwright 1.64, `workers: 1`). O `webServer` sobe `postgres-test` e o MinIO no Docker (pule com `E2E_SKIP_DOCKER=1` quando já existirem), cria o bucket `marinho-e2e` com CORS, aplica as migrations, roda o servidor na 3100 com `E2E_TEST_HOOKS=1` e faz build + preview do web na 3101 em `http` (3102 no `e2e:mock`).

- **Ganchos de teste:** com `E2E_TEST_HOOKS=1` o servidor usa um relógio controlável e expõe `POST /__test/reset { now }` (apaga as tabelas de negócio, mantém usuários e sessões, recarrega o seed e grava os arquivos de exemplo no storage) e `POST /__test/clock { now }`. Com `NODE_ENV=production` o servidor não sobe. Nunca use essas rotas fora do E2E.
- **Instante de referência:** segunda, 02/11/2026, 07:30 (`REFERENCE_NOW`). O navegador fica parado nele com `context.clock.setFixedTime`; o fixture `clock` avança servidor e navegador juntos.
- **Projetos:** `desktop` 1440×900, `tablet` 834×1194 (toque) e `celular` 390×844 (mobile), todos com `deviceScaleFactor: 1`, `pt-BR` e `America/Maceio`.
- **Fixtures** (`support/test.ts`): reset antes de cada arquivo; guardas que reprovam o teste com erro no console, `pageerror`, resposta 5xx ou requisição para fora de localhost (4xx esperados de regra de negócio não contam); `as("atendimento")` troca o `storageState`; `openContext` abre outra sessão com relógio e guardas; `needsServer(motivo)` pula no mock.
- **Seletores:** por papel e texto acessível. Se um elemento não tem nome ou papel, corrija a tela (é acessibilidade), não o teste.
- **Pastas:** `tests/fluxos` (fluxos por papel), `tests/qualidade` (axe, rolagem horizontal, alvos de 44 px, menu certo e estados vazio, carregando e erro das 14 telas), `tests/visual/captura.spec.ts` (só com `e2e:visual`) e `tests/visual/regressao.spec.ts` (`toHaveScreenshot`, linhas de base em `tests/visual/__screenshots__`).
- **Telas e estados de referência:** `support/screens.ts` e `support/visual.ts`. A captura e a regressão usam o mesmo estado; 04 cancela a LOC-0033 antes, porque a referência mostra a tela montando essa locação.
- **Relatório visual:** `bun run e2e:visual` grava `apps/e2e/visual-output/index.html` (Design, App e Diferença, da maior diferença para a menor). Diferenças que ficam vão em `docs/design/diferencas-aceitas.md`, com motivo.
- **Linhas de base:** dependem do sistema operacional. Gere sempre com `bun run e2e:update`, que roda na imagem `mcr.microsoft.com/playwright:v<versão>-noble` (a versão sai do `@playwright/test` instalado); para só conferir, sem regravar, use `E2E_UPDATE=none bun run e2e:update`. Fora do Linux, `bun run e2e` pula a regressão (force com `E2E_VISUAL_REGRESSION=1`).
- **Fora do CI:** o E2E roda só localmente. O CI e o deploy rodam apenas os testes unitários e de integração.

## Produção

- `apps/server/Dockerfile`: imagem única para `server`, `jobs` e `migrate` (tem o Prisma CLI e o `pg_dump` 18). Roda como `bun`.
- `deploy/`: compose de produção, `Caddyfile`, `.env.example`, `deploy.sh` (deploy e rollback na VPS) e `bootstrap-vps.sh`.
- `.github/workflows`: `ci.yml` em todo push; `deploy.yml` depois do CI verde na `main` (imagem no GHCR, API na VPS, front com Alchemy no stage `prod`).
- Variáveis do servidor: só segredos ficam sensíveis no `.env.schema`. O varlock bloqueia respostas que contenham valores sensíveis, e as URLs assinadas do R2 levam o Account ID, o bucket e o Access Key ID.
- Roteiros: `docs/operacao/` (`primeiro-deploy.md`, `rotina.md`, `backup-e-restauracao.md`, `r2.md`).
