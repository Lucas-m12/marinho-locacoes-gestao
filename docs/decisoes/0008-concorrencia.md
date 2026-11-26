# 0008 · Reserva sem conflito e idempotência

- Status: Aceita
- Data: 01/11/2026

## Contexto

Duas pessoas podem reservar a mesma unidade ao mesmo tempo, e no 4G é comum tocar duas vezes no mesmo botão.

## Decisão

- Unidades com código: `EXCLUDE constraint` no Postgres (`btree_gist`) sobre `(unitId, tstzrange(startsAt, blockedUntil))`, valendo para as locações ativas. `blockedUntil` = devolução prevista + folga do tipo. Entra como SQL na migration do Prisma (`migrate dev --create-only`).
- Lotes (andaime, carrocinha): a reserva roda numa transação que faz `SELECT … FOR UPDATE` na linha do lote, confere a soma das quantidades no período e só então grava.
- Mutations de dinheiro (pagamento, caução, lançamento, estorno) aceitam uma chave de idempotência gerada pelo front. Repetir a chave devolve o mesmo resultado, sem lançar de novo.

## Consequências

- Conflito volta como erro `RENTAL_PERIOD_CONFLICT`, com as unidades em conflito nos dados.
