# Arquitetura do front e o que o backend precisa implementar

O front fala com o backend só pelo contrato em `packages/contract`. Hoje quem responde é o mock (`apps/web/src/data/mock`), que roda no navegador. O backend real implementa o mesmo contrato, e nenhuma tela muda.

```
tela → orpc.* (TanStack Query) → client
                                   ├─ mock: createRouterClient(mockRouter)
                                   └─ http: RPCLink → VITE_SERVER_URL/rpc
```

`data/client.ts` escolhe a fonte com `VITE_DATA_SOURCE`, resolvida em tempo de build. Em `http`, nenhum código do mock entra no bundle.

## Upload por presigned URL

O fluxo é o mesmo no mock e no real. As telas só chamam `uploadService.upload(file, { purpose, onProgress })`.

```
tela            UploadService            backend              bucket privado
 │ upload(file)      │                      │                       │
 │──────────────────▶│ reduz foto e valida  │                       │
 │                   │ requestUpload ──────▶│                       │
 │                   │◀─ fileKey, uploadUrl │                       │
 │                   │ PUT uploadUrl ───────┼──────────────────────▶│
 │   onProgress ◀────│                      │                       │
 │                   │ completeUpload ─────▶│ confere o objeto      │
 │◀── FileRef ───────│◀──── FileRef ────────│                       │
 │ mutation da tela com fileKey ───────────▶│ grava o vínculo       │
 │ getUrl(fileKey) ────────────────────────▶│ URL temporária        │
```

1. **Preparar (`data/uploads/prepare.ts`):** foto com lado maior de até 2000 px, JPEG com qualidade 0,85 e até 10 MB depois de reduzir. Vídeo até 50 MB e 30 s. Documento até 10 MB, imagem ou PDF.
2. **Pedir a URL:** `uploads.requestUpload({ purpose, fileName, contentType, sizeBytes })` devolve `{ fileKey, uploadUrl, method: "PUT", headers, expiresAt }`.
3. **Enviar:** `PUT` direto para `uploadUrl`, com os `headers` recebidos e sem passar pelo backend. Usa `XMLHttpRequest` para ter progresso.
4. **Confirmar:** `uploads.completeUpload({ fileKey })` devolve o `FileRef`. A mutation da tela (por exemplo `inspections.attachMedia`) recebe o `fileKey`.
5. **Exibir:** `files.getDownloadUrl({ fileKey })` devolve uma URL temporária, guardada em cache até `expiresAt`. O bucket é privado porque documentos de clientes são dados pessoais.

No mock, `uploadUrl` é `mock-upload://<fileKey>`. O `UploadService` reconhece o esquema e grava o blob no IndexedDB (`idb-keyval`), e `getDownloadUrl` devolve um `URL.createObjectURL`. Em celular, a tela usa `capture="environment"` para abrir a câmera direto. Uma falha mostra "Tentar de novo", e o checklist não conclui com upload em andamento.

## Autenticação

`AuthGateway` (`getSession`, `signIn({ username, password, rememberMe })`, `signOut`) tem duas implementações: mock e `better-auth/react`. Em `http`:

- `signIn` chama `authClient.signIn.username`, então o servidor precisa dos plugins `username` e `admin`. O cliente já usa `usernameClient()` e `adminClient()`.
- `getSession` chama `authClient.getSession()` e depois `session.me`, então **`session.me` precisa devolver `user.username` e `user.role`**.
- O cookie e o `CORS_ORIGIN` precisam aceitar a origem do front, porque o `RPCLink` usa `credentials: "include"`.
- Sessão de 90 dias. Sem cadastro público e sem recuperação de senha por e-mail: quem redefine é a gestão.
- O e-mail interno (`<usuario>@marinho.local`) existe só porque o Better Auth exige. Não aparece no contrato nem na interface.

## Idempotência

`rentals.recordPayment`, `deposits.*`, `ledger.create` e `ledger.reverse` recebem `idempotencyKey`. O front gera uma chave por formulário (`useIdempotencyKey`): toque duplo e nova tentativa depois de uma falha mandam a mesma chave, e a chave só muda depois de um sucesso.

Se a chave já existir para o mesmo usuário e procedimento, devolva a resposta guardada sem executar de novo. Tentativa que falhou não consome a chave.

## Erros que as telas esperam

| Código | Quando | `data` |
| --- | --- | --- |
| `UNAUTHORIZED` | Sem sessão. O front manda para `/entrar` | |
| `FORBIDDEN` | Papel sem permissão | |
| `NOT_FOUND` | Registro inexistente | `{ resource, id }` |
| `CONFLICT` | Período ocupado | `{ conflicts: [...] }` com código, locação, `freeFrom` e quantidades |
| `INVALID_TRANSITION` | Status não permite a ação | `{ entity, from, to, allowed }` |
| `PRECONDITION_FAILED` | Falta algo | `{ reason, codes }`; `reason` é `PreconditionReason` |

As mensagens em pt-BR ficam no front (`lib/labels.ts`). Se criar um `reason` novo, inclua a mensagem lá.

## O que implementar, por procedimento

Permissões vêm de `packages/domain/src/permissions.ts`. Regras puras vêm de `packages/domain`. Use as duas no backend, sem reescrever. A implementação de referência de cada procedimento está em `apps/web/src/data/mock/handlers/`, e os fluxos esperados estão em `mock-flows.test.ts`.

### session, users

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `session.me` | sessão | Devolve usuário com `username`, `role` e `expiresAt` |
| `users.list` | `users:manage` | Nome, usuário e papel. Sem senha e sem e-mail |
| `users.create` | `users:manage` | Plugin `admin`. Usuário repetido dá `DUPLICATE`. Gera o e-mail interno `<usuario>@marinho.local`. Não há cadastro público |
| `users.setRole` | `users:manage` | Plugin `admin` |
| `users.setPassword` | `users:manage` | Plugin `admin`. O front gera ou recebe a senha e a mostra uma vez |

### dashboard

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `dashboard.today` | sessão | Atrasos (com a próxima reserva em risco), saem e voltam hoje, contagem por status, andaime livre e sinais pendentes. Sem valores em dinheiro |
| `dashboard.summary` | `money:read` | Entrou, saiu, resultado e caução em mãos no período. Só conta a conta `CASH` |

### availability

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `availability.search` | sessão | `query` casa código, nome e apelidos, sem acento, com "ou" e vírgula como alternativas. Usa `isUnitAvailable` e `availableLotQuantity` com a folga do tipo |
| `availability.calendar` | sessão | Uma linha por unidade e por lote, com o estado de cada dia. Lote traz peças livres por dia, sem somar a folga |

Reservas que ocupam a agenda são as locações em `holdsBooking(status)`. Item já devolvido não ocupa. Locação atrasada ocupa até `now`.

### equipment

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `equipment.listTypes`, `listLots` | sessão | Lote traz `freeToday`, `reservedToday` e `nextBooking` |
| `equipment.listUnits` | `units:read` | Filtra por `status` e `q`. `counts` ignora o filtro de status. `location` é derivado |
| `equipment.getUnit` | `units:read` | Detalhe com fotos, danos, transições válidas e `stats` só de locações devolvidas ou encerradas |
| `equipment.createType`, `updateType`, `createUnit`, `updateUnit`, `updateLot` | `catalog:manage` | Código `MAR` vem de `nextCode`. Editar a diária na unidade muda o tipo |
| `equipment.changeUnitStatus` | `units:operate` | Valida com `unitStatusMachine`. Exige motivo em Bloqueado, Danificado e Aposentado. Sair de manutenção ou inspeção fecha a ordem aberta |
| `equipment.addUnitPhoto`, `addKnownDamage` | `units:operate` | Dano conhecido aparece nos checklists seguintes |

### customers

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `customers.list` | `customers:read` | Filtra por `q` e `segment`. Traz `tier`, `stats`, `lastRental`, `missingDocuments` e `counts` |
| `customers.get` | `customers:read` | Soma documentos e locações |
| `customers.create`, `update`, `addDocument` | `customers:write` | Situação é calculada por `customerTier`. Só `blockedManually` é manual |

`stats.openBalanceCents` conta só locações já entregues. O saldo a cobrar na entrega não entra.

### rentals

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `rentals.list`, `get`, `copyQuoteText` | `rentals:read` | Abertas: atrasadas, na obra e depois por saída. "Atrasada" é derivada, nunca gravada |
| `rentals.createQuote` | `rentals:sell` | Recusa tipo sem preço. Com `send: true`, faz tudo de forma atômica: se houver conflito, nada é criado |
| `rentals.sendQuote` | `rentals:sell` | `QUOTE → AWAITING_DEPOSIT`, segura as unidades e define `signalDueAt` |
| `rentals.recordPayment` | `money:write` | Idempotente. Lança no caixa. `SIGNAL` congela os preços dos itens |
| `rentals.confirm` | `rentals:sell` | Exige sinal registrado |
| `rentals.markSeparated` | `rentals:separate` | Unidades vão para Separado |
| `rentals.previewExtend`, `extend` | `rentals:sell` | Confere a agenda sem contar a própria locação e recalcula o total |
| `rentals.cancel` | `rentals:sell` | Exige motivo e devolve unidades separadas para Disponível |
| `rentals.close` | `rentals:close` | Exige caução em mãos zerada |
| `rentals.recordLostDemand` | `lostDemand:write` | Registra o pedido não atendido |
| `rentals.listLostDemand` | `rentals:read` | Registros e grupos por item e motivo |

Antes do sinal, os preços acompanham a tabela. Orçamento `AWAITING_DEPOSIT` com prazo vencido e sem sinal vira `EXPIRED` e libera a agenda. Isso é calculado na leitura e não depende de tarefa agendada. **A recusa de reserva dupla precisa ser garantida no banco** com `EXCLUDE constraint`, incluindo a folga.

### inspections

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `inspections.get` | `inspections:run` | Cria na primeira leitura, com os itens do checklist e os danos conhecidos preenchidos. Na volta, traz o que foi registrado na saída |
| `inspections.saveItem`, `attachMedia` | `inspections:run` | Recusa com `CHECKLIST_ALREADY_DONE` se já concluído |
| `inspections.complete` | `inspections:run` | Veja abaixo. Precisa ser transacional |

- **Saída:** exige todos os itens e o termo. Unidade vai de Separado para Alugado. Saldo e caução informados entram no dinheiro. A locação vai para `ON_SITE` quando todos os itens saírem.
- **Volta:** `detectDivergences` gera uma ocorrência por divergência, usando a decisão enviada. Sem decisão, fica em disputa. Unidade vai para Em inspeção e depois para `outcome`. `IN_MAINTENANCE` abre uma ordem de serviço. A locação vai para `RETURNED` quando todos os itens voltarem.
- Atraso vira ocorrência `LATE` quando `lateFee` é enviado. Ocorrência `CHARGE` soma no saldo. Ocorrência `DISPUTE` deixa o cliente em Atenção.

### deposits

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `deposits.recordReceived`, `recordRefund` | `money:write` | Idempotentes. Movimentam só a conta `DEPOSIT`. Devolução acima do que está em mãos dá `INSUFFICIENT_DEPOSIT` |
| `deposits.recordRetention` | `money:write` | Idempotente. Exige motivo. Lança saída na conta `DEPOSIT` e entrada na `CASH`, ligadas entre si, e abate cobranças em aberto |

### ledger

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `ledger.list`, `byCategory`, `depositSummary` | `money:read` | `byCategory` só conta `CASH` |
| `ledger.create` | `money:write` | Idempotente. Sempre na conta `CASH` |
| `ledger.reverse` | `money:write` | Idempotente. Veja abaixo |
| `ledger.exportCsv` | `money:read` | `{ month: "AAAA-MM" }` devolve `{ fileName, content }`. Use `ledgerCsv` de `packages/domain`. Só a conta `CASH` entra |
| `ledger.receivables` | `money:read` | Saldos, cobranças e atraso sugerido, este marcado `provisional` e fora de `totalCents` |

**Estorno.** Lançamentos nunca são editados nem apagados. `ledger.reverse({ entryId, reason, idempotencyKey })` cria um lançamento inverso com `reversalOfId`, na mesma conta e categoria:

- Estornar algo já estornado ou um estorno devolve `PRECONDITION_FAILED` (`ALREADY_REVERSED`, `IS_REVERSAL`).
- Totais usam `ledgerTotals` e `signedAmountCents`: o estorno de uma entrada abate "entrou", sem somar em "saiu".
- Lançamento de pagamento marca o pagamento como estornado, e o saldo da locação volta. Sinal estornado volta a exigir sinal.
- Lançamento de caução ajusta a caução da locação. Caução recebida já devolvida não pode ser estornada (`INSUFFICIENT_DEPOSIT`).
- Retenção tem dois lançamentos, um em cada conta. Estornar qualquer um desfaz os dois.
- Manutenção volta a contar o valor como não lançado na ordem.

### maintenance

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `maintenance.list` | `maintenance:read` | Ordens, contagens e gasto em 30 dias |
| `maintenance.open` | `maintenance:write` | Unidade vai para Em manutenção e fecha ordens abertas dela |
| `maintenance.complete` | `maintenance:write` | Lança no caixa só a diferença entre o custo final e o já lançado na ordem. Muda o status da unidade |

### settings

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `settings.get` | sessão | Preços, taxas, sinal, prazo e textos das regras provisórias |
| `settings.update` | `settings:manage` | Mudar preço não altera locação com sinal |

### uploads, files

| Procedimento | Permissão | Comportamento |
| --- | --- | --- |
| `uploads.requestUpload` | sessão | Valida `purpose`, tipo e tamanho, gera o `fileKey` e a URL assinada |
| `uploads.completeUpload` | sessão | Confere o objeto no bucket. Se faltar, `UPLOAD_MISSING` |
| `files.getDownloadUrl` | sessão | URL temporária. Restrinja por `purpose` e papel: `CUSTOMER_DOCUMENT` é dado pessoal |

## Ligar o backend

1. Em `packages/api`, implemente o contrato com `implement(contract)` de `@orpc/server`. O TypeScript acusa o que faltar.
2. Exponha em `/rpc` com `RPCHandler`.
3. Crie os endpoints de presigned URL, com CORS no bucket liberando `PUT` da origem do front.
4. Configure `session.me` e o papel do usuário no Better Auth.
5. Defina `VITE_DATA_SOURCE=http` e `VITE_SERVER_URL` no build do front.
6. Porte os cenários de `mock-flows.test.ts` para os testes do backend, para garantir o mesmo comportamento.
