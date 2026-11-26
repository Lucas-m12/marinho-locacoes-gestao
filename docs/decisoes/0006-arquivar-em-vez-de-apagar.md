# 0006 · Arquivar em vez de apagar

- Status: Aceita
- Data: 01/11/2026

## Contexto

Clientes, unidades e tipos têm histórico financeiro e de locações.

## Decisão

- Registros com histórico ganham `archivedAt` em vez de serem apagados.
- Exclusão de verdade só para orçamento em rascunho e para upload nunca confirmado.

## Consequências

- Listas filtram `archivedAt is null` por padrão.
