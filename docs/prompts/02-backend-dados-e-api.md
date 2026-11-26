# Prompt 02 — Backend: banco, regras e API (implementar o contrato)

> **Rode só depois que todas as fases do prompt 01 (e o 01a) estiverem concluídas:** o contrato precisa estar estável.
> Antes de começar, leia nesta ordem: `docs/decisoes/` (todos os ADRs), `CLAUDE.md`, `docs/arquitetura-front.md`, `packages/contract`, `packages/domain` e o mock em `apps/web/src/data/mock`.
> O mock é a **especificação de comportamento**: o servidor tem que responder igual a ele. Quando os dois divergirem, quem decide é o contrato e os ADRs. Corrija o lado errado e registre a correção no resumo final.
> Trabalhe em fases (seção 9), rode as verificações de cada fase e faça um commit ao fim de cada uma.

## 1. Objetivo

Implementar o backend real que atende ao `contract`, com Postgres via Prisma, Better Auth e uploads no Cloudflare R2. No fim, o front deve funcionar com `VITE_DATA_SOURCE=http` **sem nenhuma mudança nas telas**.

Fora de escopo neste prompt (fica para o 03): tarefas agendadas, backup, deploy, VPS e CI.

## 2. Onde fica cada coisa

| Pacote | Responsabilidade |
| --- | --- |
| `packages/db` | Schema do Prisma (pasta `prisma/schema/`, um arquivo por módulo), migrations, seeds e o `createPrismaClient`. |
| `packages/auth` | Configuração do Better Auth (ADR 0011). |
| `packages/api` | Implementação do contrato: `implement(contract)`, um router por módulo em `src/routers/`, os services em `src/services/`, os middlewares e o adaptador de storage. Remova o `appRouter` de exemplo (`healthCheck` e `privateData`). |
| `apps/server` | Hono: monta o Better Auth em `/api/auth/*` e o `RPCHandler` em `/rpc`, cria o contexto e lê o ambiente (varlock). |
| `packages/domain` | Já existe. O backend **reaproveita** as regras daqui e não duplica nenhuma. Se uma regra estiver só no mock, mova-a para `domain` e faça o mock usar também. |

Camadas (ADR 0009):
- O router valida e chama o service.
- O service abre uma transação quando precisa, aplica as regras de `domain`, usa o Prisma direto e grava o `Event`.
- **Não crie camada de repository.**
- Os services recebem `{ db, storage, clock, actor }` por parâmetro, para poderem ser testados.

## 3. Banco de dados (Prisma 7 + Postgres 18)

### 3.1 Convenções

- Chave primária: `id String @id @default(dbgenerated("uuidv7()")) @db.Uuid`. A função `uuidv7()` é nativa do Postgres 18 (ADR 0005). As tabelas do Better Auth continuam com os IDs que ele gera.
- Dinheiro: `Int` em centavos, com o nome terminando em `Cents` (ADR 0003). Valores ainda não definidos pelo negócio ficam `Int?`.
- Datas: `DateTime @db.Timestamptz(3)`.
- `archivedAt DateTime?` nas entidades com histórico (ADR 0006).
- Enums do Prisma para status e categorias, com os mesmos valores do contrato. A fonte é `packages/domain/src/enums.ts`. Não crie listas paralelas.
- Nomes de modelo em inglês e no singular. Use `@@map` para nomes de tabela em snake_case.

### 3.2 Modelo

Derive os campos do contrato, do documento de requisitos e do mock. O mínimo é:

- **Equipamento**
  - `EquipmentType`: nome, apelidos (`String[]`), categoria, `dailyPriceCents?`, `depositCents?`, folga em horas, acessórios, itens do checklist (tabela `ChecklistItem`, ordenada) e EPI recomendado.
  - `Unit`: `code` único (MAR-001), tipo, marca, modelo, série, voltagem, dono, status, localização, datas de compra e de entrada, `purchaseCents?` e `replacementCents?`.
  - `UnitPhoto` (com `fileKey` e ângulo) e `KnownDamage` (com a foto).
  - `Lot` (andaime e carrocinha): total, em manutenção, baixadas, preço por peça por dia e caução por peça.
- **Clientes:** `Customer`, com o tipo e os campos da seção 7 do prompt 01, `blockedAt` e `blockedReason`. `CustomerDocument` com `fileKey`.
- **Locação**
  - `Rental`: `code` único (LOC-0001), cliente, status, endereço da obra e link do pino, modalidade de entrega, início e fim previstos e reais, `depositDeadlineAt` (prazo do sinal), `deliveryFeeCents?`, `discountCents`, `discountReason`, `priceFrozenAt` e observações.
  - `RentalItem`: unidade **ou** lote com quantidade; `dailyPriceCents` e `depositCents` congelados; `startsAt`, `blockedUntil` (devolução + folga) e `holdsCalendar Boolean`.
- **Vistoria:** `Inspection` (saída ou volta, por item da locação), `InspectionAnswer`, `InspectionMedia` e `Occurrence` (tipo, valor sugerido e decisão).
- **Dinheiro:** `LedgerEntry` (ADR 0004): conta `CASH` ou `DEPOSIT`, direção, categoria, `amountCents`, forma, data, `rentalId?`, `unitId?`, `reversalOfId?` e motivo. **Nunca há update nem delete nessa tabela.**
- **Outros:** `MaintenanceOrder` (`code` OS-001), `LostDemand`, `Settings` (uma linha só) e `DeliveryFee` (por município).
- **Infraestrutura:** `Counter` (nome e valor), `Event` (ator, ação, entidade, `entityId`, `payload Json`, `createdAt`), `Upload` (`fileKey`, finalidade, tipo, tamanho, status `PENDING` ou `COMPLETED`, quem enviou, datas) e `IdempotencyKey` (chave única, usuário, procedimento e resposta em `Json`).

### 3.3 SQL próprio nas migrations

Gere a migration com `prisma migrate dev --create-only` e acrescente:

```sql
create extension if not exists btree_gist;

alter table rental_item add constraint rental_item_unit_no_overlap
  exclude using gist (unit_id with =, tstzrange(starts_at, blocked_until, '[)') with &&)
  where (unit_id is not null and holds_calendar);

alter table ledger_entry add constraint ledger_entry_amount_positive check (amount_cents > 0);
alter table rental_item add constraint rental_item_unit_xor_lot
  check ((unit_id is null) <> (lot_id is null));
```

Ajuste os nomes de tabela e coluna ao schema real. Documente no topo do arquivo `.sql` por que cada constraint existe.

### 3.4 Regras que o banco e os services garantem juntos (ADR 0008)

- **`holdsCalendar`** é `true` nos status `AWAITING_DEPOSIT`, `CONFIRMED`, `SEPARATED` e `ON_SITE`, e o service atualiza o valor a cada mudança de status.
- **Sinal vencido:** antes de qualquer reserva, prorrogação ou consulta de disponibilidade, o service roda, na mesma transação, `expireStaleQuotes(now)`. Ela muda para `EXPIRED`, com `holdsCalendar = false`, os orçamentos `AWAITING_DEPOSIT` com `depositDeadlineAt < now`. Assim a agenda nunca mostra como ocupado o que já venceu.
- **Conflito de unidade:** capture o erro da `EXCLUDE constraint` (Postgres `23P01`) e devolva o erro `CONFLICT` do contrato, com as unidades em conflito em `data`. Para preencher os dados, consulte quais itens cruzam o período.
- **Lote (andaime):** numa transação interativa, `SELECT … FROM lot WHERE id = $1 FOR UPDATE`, some as quantidades dos itens ativos que cruzam o período (usando `availableLotQuantity` do `domain`) e só então grave.
- **Códigos sequenciais:** `UPDATE counter SET value = value + 1 WHERE name = $1 RETURNING value`, dentro da transação que cria o registro.
- **Idempotência:** toda mutation de dinheiro recebe `idempotencyKey`. Na transação, insira a chave primeiro. Se ela já existir para o mesmo usuário e procedimento, devolva a resposta guardada sem executar de novo.
- **Estorno:** cria um `LedgerEntry` inverso com `reversalOfId`. Estornar algo já estornado ou um estorno devolve `PRECONDITION_FAILED`.
- **Caução:** só a retenção gera uma entrada `CASH` (categoria de caução retida), além do lançamento em `DEPOSIT`.
- **Preço congelado:** quando o primeiro pagamento de sinal entra, os itens guardam preço e caução, e `priceFrozenAt` é preenchido. Depois disso, mudar a tabela não altera a locação.
- **Saldos e indicadores** (painel, dinheiro, "quanto rendeu", situação do cliente) são **sempre calculados** com consultas agregadas e as funções de `domain`. Nunca são colunas.
- **Event:** toda mutation grava um evento na mesma transação. O histórico das telas vem daqui.

## 4. Autenticação (ADR 0011)

Em `packages/auth`:

```ts
betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true },
  plugins: [username(), admin({ defaultRole: "ATTENDANT", adminRoles: ["MANAGER"] })],
  advanced: { defaultCookieAttributes: { sameSite: "lax", secure: env.NODE_ENV === "production", httpOnly: true } },
  trustedOrigins: [env.CORS_ORIGIN],
})
```

Confira as opções na versão instalada do Better Auth (skills em `.agents/skills/better-auth-*`). Depois:
- Rode `bun run auth:generate` para atualizar `auth.prisma`.
- Os papéis são `MANAGER`, `ATTENDANT` e `EQUIPMENT`.
- `users.create`, `users.setRole` e `users.setPassword` usam a API do plugin `admin` no servidor (`auth.api.*`). O e-mail interno é gerado como `<usuario>@marinho.local`.
- O middleware `requireRole(...roles)` do oRPC lê `context.session.user.role`. As permissões vêm de `packages/domain/src/permissions.ts`, as mesmas que o mock usa.
- No front, `AuthGateway` real: `createAuthClient` com `usernameClient()` e `adminClient()`.

## 5. Uploads com R2 (ADR 0012)

- Interface `ObjectStorage { presignPut(key, contentType, expiresIn); presignGet(key, expiresIn); head(key); delete(key) }`, com duas implementações:
  - `R2Storage`, usando `aws4fetch` (`AwsClient` com `service: "s3"`, `region: "auto"`, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET>/<key>` e `signQuery: true`);
  - `MemoryStorage`, só para testes.
- `uploads.requestUpload`: valida finalidade, tipo e tamanho (limites do ADR) e gera a chave `<finalidade>/<aaaa>/<mm>/<uuid>.<ext>`. Cria o `Upload` como `PENDING` e devolve `{ fileKey, uploadUrl, method: "PUT", headers: { "Content-Type": … }, expiresAt }`, com validade de 10 min.
- `uploads.completeUpload`: faz `head` no objeto e confere se o tamanho e o tipo batem com o pedido. Se não baterem, apaga o objeto e devolve `PRECONDITION_FAILED`. Se baterem, marca `COMPLETED`.
- As mutations que recebem `fileKey` (fotos, documentos, mídia do checklist, comprovante) só aceitam upload `COMPLETED` do próprio usuário e com a finalidade certa.
- `files.getDownloadUrl`: confere se o usuário pode ver o arquivo (documento de cliente só para `MANAGER` e `ATTENDANT`) e devolve uma URL de leitura válida por 10 min.
- Novas variáveis no `apps/server/.env.schema`, todas `@sensitive`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`. Para desenvolvimento, use um bucket separado (`marinho-dev`).
- Documente em `docs/operacao/r2.md` a regra de CORS do bucket (`PUT` e `GET` a partir de `http://localhost:3001` e `https://sistema.marinholocacoes.com`, com o header `Content-Type`). Não configure o bucket por código.

## 6. Servidor (`apps/server`)

- Contexto do oRPC: `{ db, storage, clock: () => new Date(), session }`. O `clock` é injetável nos testes.
- Mantenha o `RPCHandler` em `/rpc`. A referência OpenAPI em `/api-reference` fica **só em desenvolvimento**.
- `GET /health` responde `{ ok: true }` depois de checar o banco com um `select 1`.
- Logs em JSON (um por requisição, com id da requisição, procedimento, usuário e duração), sem dados pessoais nem conteúdo de documentos.
- Erros inesperados: registre no log e devolva `INTERNAL_SERVER_ERROR` genérico, sem stack trace para o cliente.
- `ledger.exportCsv` é gerado no servidor no formato definido no 01a.

## 7. Seeds

- `bun run db:seed`: **dados reais para produção.**
  - Os 17 tipos e unidades do catálogo, com as diárias, e os três sem preço como `null`. A tabela está na seção 8 do prompt 01.
  - Lotes: andaime com 20 peças a R$ 2 por peça por dia; carrocinha com 1, a R$ 80.
  - `Settings` com folga de 12 h e prazo do sinal de 24 h.
  - `DeliveryFee` com os 11 municípios e as taxas `null`.
  - Os três usuários, com as senhas lidas de `SEED_PASSWORD_LUCAS`, `SEED_PASSWORD_ATENDIMENTO` e `SEED_PASSWORD_EQUIPAMENTOS`, que nunca vão para o repositório.
  - O seed é idempotente: rodar duas vezes não duplica nada.
- `bun run db:seed:demo`: **só para desenvolvimento**, recusa rodar com `NODE_ENV=production`. Os mesmos dados de exemplo do mock, relativos a hoje. Reaproveite a seed do mock movendo-a para um pacote compartilhado, para não manter duas.

## 8. Testes (ADR 0015)

- **Cenários do contrato:** se os testes de fluxo do mock estiverem presos ao mock, extraia-os para `packages/scenarios`, que exporta `defineScenarios(makeClient)`. A mesma suíte roda contra:
  1. o mock (`createRouterClient` do mock);
  2. o servidor real (`createRouterClient(appRouter, { context })`, com Postgres de verdade).
- Postgres de teste: um serviço `postgres-test` no `docker-compose.yml` (porta 5433, `tmpfs`, sem volume) e um script que roda as migrations e limpa as tabelas entre os testes.
- Cenários obrigatórios, além dos que já existem:
  - reserva dupla da mesma unidade recusada, **inclusive com duas requisições em paralelo** (`Promise.all`);
  - duas reservas de andaime em paralelo que juntas passam do total: só uma passa;
  - sinal vencido libera a agenda para outra reserva;
  - idempotência: a mesma chave duas vezes gera um lançamento só;
  - estorno anula o saldo, e estornar de novo falha;
  - retenção de caução lança em `DEPOSIT` e em `CASH`;
  - concluir manutenção lança a despesa e muda o status da unidade;
  - transição inválida de status devolve `INVALID_TRANSITION`;
  - papel sem permissão recebe `FORBIDDEN`, para cada procedimento restrito;
  - `completeUpload` com tamanho diferente do pedido é recusado (`MemoryStorage`).
- Teste de unidade para o mapeamento do erro `23P01` para `CONFLICT`.

## 9. Ordem de trabalho

1. **Schema e migrations:** schema completo, SQL próprio e `db:seed` real. Valide com `prisma migrate reset` num banco local limpo.
2. **Auth e servidor:** Better Auth configurado, contexto, `requireRole`, `/health` e `session.me`. O front com `VITE_DATA_SOURCE=http` já entra.
3. **Equipamento, clientes e configurações:** services e routers de `equipment`, `customers`, `settings`, `users` e `availability`.
4. **Locações:** `rentals`, demanda perdida, códigos, preço congelado, conflitos, lotes e expiração.
5. **Operação e dinheiro:** `inspections`, `deposits`, `ledger` (estorno, idempotência e CSV), `maintenance` e `dashboard`.
6. **Uploads:** `ObjectStorage`, R2 e `files`.
7. **Paridade:** suíte de cenários verde contra o mock e contra o servidor; `db:seed:demo`. Depois, percorra todas as telas com `VITE_DATA_SOURCE=http` nas três larguras, se houver navegador, e corrija as divergências.

Em todas as fases: `bun run check-types`, `bun run check`, os testes e um commit (`feat(api): …`, `feat(db): …`).

## 10. Resumo final

Escreva um resumo com:
- o que foi implementado;
- as divergências encontradas entre o mock e o servidor, e qual lado foi corrigido;
- as variáveis de ambiente novas;
- os comandos para subir tudo localmente: `db:start`, `db:migrate`, `db:seed:demo`, `dev` e `VITE_DATA_SOURCE=http`;
- o que ficou para o prompt 03.

Atualize o `CLAUDE.md` com a seção "Backend".
